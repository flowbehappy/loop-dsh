import {loopCatalogDisplayName} from './loop-catalog-display.ts'
import type {
  InputTriggerCandidate,
  InputTriggerPick,
  ReferenceCodec,
} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import {
  asLoopSkillRuntimeError,
  loopSkillError,
  withLocalizedLoopSkillMessage,
  type LoopSkillFailureFormatter,
  type LoopSkillRuntimeError,
} from './loop-skill-errors.ts'

export interface LoopSkillCatalogEntry {
  readonly skillId: string
  readonly librarySlug?: string
  readonly libraryName: string
  readonly libraryDescription?: string
  readonly name: string
  readonly description?: string
  readonly path: string
  readonly versionId?: string
  readonly commitSha?: string
  readonly sourceRevision: string
}

export interface LoopSkillReference {
  readonly version: 1
  readonly sessionId: string
  readonly skillId: string
  readonly path: string
  readonly versionId?: string
  readonly commitSha?: string
  readonly sourceRevision: string
  readonly name: string
  readonly displayName: string
  readonly librarySlug?: string
  readonly libraryName: string
}

const MAX_REFERENCE_BYTES = 16 << 10
const MAX_ENCODED_REFERENCE_CHARS = Math.ceil(MAX_REFERENCE_BYTES / 3) * 4
const MAX_PATH_RUNES = 1024
const MAX_PATH_SEGMENTS = 64

export function loopSkillDisplayName(entry: LoopSkillCatalogEntry): string {
  return loopCatalogDisplayName(entry.name)
}

export function loopSkillCandidateName(entry: LoopSkillCatalogEntry): string {
  const slug = entry.name
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 42) || 'skill'
  const hash = stableHash([
    entry.skillId,
    entry.path,
    entry.versionId ?? '',
    entry.commitSha ?? '',
    entry.sourceRevision,
  ].join('\0'))
  return `loop-skill-${slug}-${hash}`
}

export function referenceForLoopSkill(
  sessionId: string,
  entry: LoopSkillCatalogEntry,
): LoopSkillReference {
  const handle = exactHandle(entry.versionId, entry.commitSha)
  if (handle === null) {
    throw loopSkillError(
      'loop-skill/invalid-version-handle',
      'The Loop Skill catalog returned an invalid exact content handle.',
    )
  }
  return {
    version: 1,
    sessionId,
    skillId: entry.skillId,
    path: normalizePath(entry.path),
    ...handle,
    sourceRevision: entry.sourceRevision,
    name: loopSkillCandidateName(entry),
    displayName: loopSkillDisplayName(entry),
    ...(entry.librarySlug === undefined || entry.librarySlug === ''
      ? {}
      : {librarySlug: entry.librarySlug}),
    libraryName: entry.libraryName,
  }
}

export function encodeLoopSkillReference(reference: LoopSkillReference): string {
  const normalized = normalizeReference(reference)
  if (normalized instanceof Error) throw normalized
  const payload = JSON.stringify(normalized)
  if (new TextEncoder().encode(payload).byteLength > MAX_REFERENCE_BYTES) {
    throw loopSkillError('loop-skill/reference-too-large', 'Loop Skill reference is oversized')
  }
  const bytes = new TextEncoder().encode(payload)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `<loop-skill-ref>${btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')}</loop-skill-ref>`
}

export function decodeLoopSkillReference(value: string): LoopSkillReference | null {
  const decoded = decodeLoopSkillReferenceResult(value)
  return decoded instanceof Error ? null : decoded
}

export function decodeLoopSkillReferenceResult(
  value: string,
): LoopSkillReference | LoopSkillRuntimeError {
  const match = /^<loop-skill-ref>([A-Za-z0-9_-]+)<\/loop-skill-ref>$/u.exec(value)
  if (match === null) {
    return loopSkillError('loop-skill/invalid-reference', 'Loop Skill reference is invalid')
  }
  if (match[1]!.length > MAX_ENCODED_REFERENCE_CHARS) {
    return loopSkillError('loop-skill/reference-too-large', 'Loop Skill reference is oversized')
  }
  try {
    const base64 = match[1]!.replace(/-/gu, '+').replace(/_/gu, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return loopSkillError('loop-skill/invalid-reference', 'Loop Skill reference is invalid')
    }
    return normalizeReference(parsed)
  } catch {
    return loopSkillError('loop-skill/invalid-reference', 'Loop Skill reference is invalid')
  }
}

export function loopSkillCandidate(
  sessionId: string,
  entry: LoopSkillCatalogEntry,
  duplicateName: boolean,
): InputTriggerCandidate {
  const reference = referenceForLoopSkill(sessionId, entry)
  return {
    name: reference.displayName,
    label: reference.displayName,
    description: [
      entry.description,
      entry.libraryName !== entry.name ? entry.libraryName : undefined,
    ].filter(Boolean).join(' · ') || entry.libraryDescription || entry.libraryName,
    hint: duplicateName ? `${entry.libraryName} · ${entry.path}` : undefined,
    value: JSON.stringify(reference),
  }
}

export function loopSkillCodec(
  sessionId: string,
  formatFailure: LoopSkillFailureFormatter,
): ReferenceCodec {
  const localized = (error: LoopSkillRuntimeError): LoopSkillRuntimeError =>
    withLocalizedLoopSkillMessage(error, formatFailure)
  return {
    clipboardText: value => {
      const reference = decodeLoopSkillReference(value)
      return reference === null || reference.sessionId !== sessionId
        ? ''
        : `/${reference.name}`
    },
    serialize: async (value, signal) => {
      signal.throwIfAborted()
      const decoded = decodeLoopSkillReferenceResult(value)
      if (decoded instanceof Error) {
        throw localized(decoded)
      }
      if (decoded.sessionId !== sessionId) {
        const error = loopSkillError(
          'loop-skill/session-mismatch',
          'This Loop Skill reference belongs to another Session.',
        )
        throw localized(error)
      }
      try {
        return encodeLoopSkillReference(decoded)
      } catch (error) {
        throw localized(asLoopSkillRuntimeError(error, 'loop-skill/invalid-reference'))
      }
    },
  }
}

export function pickedLoopSkill(
  pick: InputTriggerPick,
  sessionId: string,
): ReturnType<NonNullable<import('@deepseek-ai/dsh-client-ui-input-trigger/client').InputTriggerSource['onPick']>> | undefined {
  if (pick.action !== 'pick' || typeof pick.candidate.value !== 'string') return undefined
  let reference: LoopSkillReference
  try {
    const parsed = JSON.parse(pick.candidate.value) as unknown
    const normalized = normalizeReference(parsed)
    if (normalized instanceof Error || normalized.sessionId !== sessionId) return undefined
    reference = normalized
  } catch {
    return undefined
  }
  const ref = encodeLoopSkillReference(reference)
  return {
    insert: {
      source: 'loop-skills',
      ref,
      label: reference.displayName,
      appearance: 'skill',
      clipboardText: `/${reference.name}`,
    },
  }
}

function normalizeReference(value: unknown): LoopSkillReference | LoopSkillRuntimeError {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return loopSkillError('loop-skill/invalid-reference', 'Loop Skill reference is invalid')
  }
  const raw = value as Record<string, unknown>
  if (raw.version !== 1 ||
      typeof raw.sessionId !== 'string' || raw.sessionId === '' ||
      typeof raw.skillId !== 'string' || raw.skillId === '' ||
      typeof raw.sourceRevision !== 'string' || raw.sourceRevision === '' ||
      typeof raw.name !== 'string' || raw.name === '' ||
      typeof raw.displayName !== 'string' || raw.displayName === '' ||
      typeof raw.libraryName !== 'string' || raw.libraryName === '') {
    return loopSkillError('loop-skill/invalid-reference', 'Loop Skill reference is invalid')
  }
  const handle = exactHandle(
    typeof raw.versionId === 'string' ? raw.versionId : undefined,
    typeof raw.commitSha === 'string' ? raw.commitSha : undefined,
  )
  if (handle === null) {
    return loopSkillError(
      'loop-skill/invalid-version-handle',
      'Loop Skill reference has an invalid exact content handle',
    )
  }
  let normalizedPath: string
  try {
    normalizedPath = normalizePath(typeof raw.path === 'string' ? raw.path : '')
  } catch (error) {
    return error instanceof Error
      ? error as LoopSkillRuntimeError
      : loopSkillError('loop-skill/unsupported-path', 'Loop Skill path is unsupported')
  }
  return {
    version: 1,
    sessionId: raw.sessionId,
    skillId: raw.skillId,
    path: normalizedPath,
    ...handle,
    sourceRevision: raw.sourceRevision,
    name: raw.name,
    displayName: raw.displayName,
    libraryName: raw.libraryName,
    ...(typeof raw.librarySlug === 'string' && raw.librarySlug !== ''
      ? {librarySlug: raw.librarySlug}
      : {}),
  }
}

function exactHandle(
  versionIdValue: string | undefined,
  commitSHAValue: string | undefined,
): Pick<LoopSkillReference, 'versionId' | 'commitSha'> | null {
  const versionId = versionIdValue?.trim() ?? ''
  const commitSha = commitSHAValue?.trim() ?? ''
  if (commitSha !== '') {
    if (versionId !== '' && versionId !== `git:${commitSha}`) return null
    return {commitSha}
  }
  if (versionId.startsWith('git:')) {
    const legacyCommit = versionId.slice('git:'.length)
    return legacyCommit === '' ? null : {commitSha: legacyCommit}
  }
  return versionId === '' ? null : {versionId}
}

function normalizePath(raw: string): string {
  const value = raw.trim()
  if (value === '' || Array.from(value).length > MAX_PATH_RUNES ||
      value.includes('\0') || value.includes('\\')) {
    throw loopSkillError('loop-skill/unsupported-path', 'Loop Skill path is unsupported')
  }
  const parts = value.split('/')
  if (parts.length > MAX_PATH_SEGMENTS) {
    throw loopSkillError('loop-skill/unsupported-path', 'Loop Skill path is unsupported')
  }
  const cleaned = parts.map(part => part.trim())
  if (cleaned.some(part => part === '' || part === '.' || part === '..')) {
    throw loopSkillError('loop-skill/unsupported-path', 'Loop Skill path is unsupported')
  }
  return cleaned.join('/')
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export const __testing = {stableHash}

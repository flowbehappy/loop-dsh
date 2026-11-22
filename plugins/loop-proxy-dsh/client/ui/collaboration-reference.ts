/** Stable, inert references and hashes used by the native Loop collaborator source. */

export interface CollaborationReference {
  readonly version: 1
  readonly sessionId: string
  readonly targetId: string
  readonly targetType: 'agent' | 'human'
  readonly stableRef: string
  readonly displayName: string
  readonly bindingRevision: string
}

const REFERENCE_PREFIX = 'loop-collab:v1:'
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

function decodeBase64(value: string): string {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  return new TextDecoder().decode(
    Uint8Array.from(binary, character => character.charCodeAt(0)),
  )
}

export function encodeCollaborationReference(reference: CollaborationReference): string {
  return REFERENCE_PREFIX + encodeBase64(JSON.stringify(reference))
}

export function decodeCollaborationReference(value: string): CollaborationReference | null {
  if (!value.startsWith(REFERENCE_PREFIX)) return null
  try {
    const parsed = JSON.parse(decodeBase64(value.slice(REFERENCE_PREFIX.length))) as Partial<CollaborationReference>
    if (parsed.version !== 1 ||
        typeof parsed.sessionId !== 'string' || !ID.test(parsed.sessionId) ||
        typeof parsed.targetId !== 'string' || !ID.test(parsed.targetId) ||
        (parsed.targetType !== 'agent' && parsed.targetType !== 'human') ||
        typeof parsed.stableRef !== 'string' || parsed.stableRef === '' || parsed.stableRef.length > 512 ||
        typeof parsed.displayName !== 'string' || parsed.displayName.trim() === '' || parsed.displayName.length > 255 ||
        typeof parsed.bindingRevision !== 'string' || parsed.bindingRevision === '' || parsed.bindingRevision.length > 200) {
      return null
    }
    return {
      version: 1,
      sessionId: parsed.sessionId,
      targetId: parsed.targetId,
      targetType: parsed.targetType,
      stableRef: parsed.stableRef,
      displayName: parsed.displayName,
      bindingRevision: parsed.bindingRevision,
    }
  } catch {
    return null
  }
}

function xmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/**
 * Model-visible reference text. It identifies the stable target but grants
 * nothing; activation remains Host/Proxy-owned.
 */
export function serializeCollaborationReference(reference: CollaborationReference): string {
  return `<loop-collaboration type="${reference.targetType}" target="${xmlAttribute(reference.targetId)}" ref="${xmlAttribute(reference.stableRef)}">${xmlAttribute(reference.displayName)}</loop-collaboration>`
}

export async function collaborationDigest(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`
}

export function collaborationRequestId(prefix: string): string {
  const suffix = globalThis.crypto.randomUUID().replaceAll('-', '')
  return `${prefix}_${suffix}`
}

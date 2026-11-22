/** Trusted routing handshake between the native Loop page and the DSH client. */

export const GLOBAL_WORKSPACE_BRIDGE_CHANNEL = 'loop.global-page.v2'

export type LoopLocale = 'en' | 'zh-CN' | 'zh-TW' | 'ja'

export interface GlobalWorkspaceSelection {
  readonly workspaceId: string
  readonly workspaceName: string
  readonly principalId?: string
  readonly authEpoch?: string
}

interface BridgeInit {
  readonly channel: typeof GLOBAL_WORKSPACE_BRIDGE_CHANNEL
  readonly type: 'init'
  readonly nonce: string
  readonly revision: string
  readonly path: string
  readonly locale: LoopLocale
}

interface BridgeReady {
  readonly channel: typeof GLOBAL_WORKSPACE_BRIDGE_CHANNEL
  readonly type: 'ready'
}

interface BridgeWorkspace extends GlobalWorkspaceSelection {
  readonly channel: typeof GLOBAL_WORKSPACE_BRIDGE_CHANNEL
  readonly type: 'workspace'
  readonly nonce: string
  readonly revision: string
}

interface BridgeNavigate {
  readonly channel: typeof GLOBAL_WORKSPACE_BRIDGE_CHANNEL
  readonly type: 'navigate'
  readonly nonce: string
  readonly revision: string
  readonly path: string
}

interface BridgeLocale {
  readonly channel: typeof GLOBAL_WORKSPACE_BRIDGE_CHANNEL
  readonly type: 'locale'
  readonly nonce: string
  readonly revision: string
  readonly locale: LoopLocale
}

interface BridgeRoute {
  readonly channel: typeof GLOBAL_WORKSPACE_BRIDGE_CHANNEL
  readonly type: 'route'
  readonly nonce: string
  readonly revision: string
  readonly path: string
}

const WORKSPACE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u
const NONCE = /^[A-Za-z0-9_-]{16,128}$/u
const REVISION = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function sanitizedLoopPagePath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const path = value.trim()
  if (path.length === 0 || path.length > 2048 ||
      !path.startsWith('/') || path.startsWith('//') ||
      path.includes('\\') || Array.from(path).some(character => {
        const code = character.charCodeAt(0)
        return code < 32 || code === 127
      })) {
    return null
  }
  return path
}

export function normalizedLoopLocale(value: unknown): LoopLocale | null {
  if (typeof value !== 'string') return null
  const locale = value.trim().toLowerCase()
  if (locale === 'en' || locale.startsWith('en-')) return 'en'
  if (locale === 'ja' || locale.startsWith('ja-')) return 'ja'
  if (locale.startsWith('zh')) {
    return locale.startsWith('zh-tw') ||
      locale.startsWith('zh-hk') ||
      locale.startsWith('zh-mo') ||
      locale.startsWith('zh-hant')
      ? 'zh-TW'
      : 'zh-CN'
  }
  return null
}

export function bindLocaleForHarness(value: unknown): 'zh' | 'en' | undefined {
  const locale = normalizedLoopLocale(value)
  if (locale === 'en') return 'en'
  if (locale === 'zh-CN' || locale === 'zh-TW') return 'zh'
  return undefined
}

export function globalWorkspaceBridgeInit(
  nonce: string,
  revision: string,
  path: string,
  locale: LoopLocale,
): BridgeInit {
  return {
    channel: GLOBAL_WORKSPACE_BRIDGE_CHANNEL,
    type: 'init',
    nonce,
    revision,
    path,
    locale,
  }
}

export function globalWorkspaceBridgeNavigate(
  nonce: string,
  revision: string,
  path: string,
): BridgeNavigate {
  return {
    channel: GLOBAL_WORKSPACE_BRIDGE_CHANNEL,
    type: 'navigate',
    nonce,
    revision,
    path,
  }
}

export function globalWorkspaceBridgeLocale(
  nonce: string,
  revision: string,
  locale: LoopLocale,
): BridgeLocale {
  return {
    channel: GLOBAL_WORKSPACE_BRIDGE_CHANNEL,
    type: 'locale',
    nonce,
    revision,
    locale,
  }
}

export function isGlobalWorkspaceBridgeReady(
  event: Pick<MessageEvent, 'origin' | 'source' | 'data'>,
  expected: { readonly origin: string; readonly source: Window | null },
): boolean {
  if (event.origin !== expected.origin ||
      expected.source === null ||
      event.source !== expected.source) {
    return false
  }
  const value = record(event.data)
  return value?.channel === GLOBAL_WORKSPACE_BRIDGE_CHANNEL && value.type === 'ready'
}

export function newGlobalWorkspaceBridgeNonce(): string {
  const random = globalThis.crypto
  if (typeof random.randomUUID === 'function') return random.randomUUID().replaceAll('-', '')
  const bytes = new Uint8Array(16)
  random.getRandomValues(bytes)
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
}

export function readGlobalWorkspaceBridgeSelection(
  event: Pick<MessageEvent, 'origin' | 'source' | 'data'>,
  expected: {
    readonly origin: string
    readonly source: Window | null
    readonly nonce: string
    readonly revision: string
  },
): GlobalWorkspaceSelection | null {
  if (event.origin !== expected.origin ||
      expected.source === null ||
      event.source !== expected.source) {
    return null
  }
  const value = record(event.data)
  if (value === null ||
      value.channel !== GLOBAL_WORKSPACE_BRIDGE_CHANNEL ||
      value.type !== 'workspace' ||
      value.nonce !== expected.nonce ||
      value.revision !== expected.revision ||
      typeof value.workspaceId !== 'string' ||
      !WORKSPACE_ID.test(value.workspaceId) ||
      typeof value.workspaceName !== 'string') {
    return null
  }
  const workspaceName = value.workspaceName.trim()
  if (workspaceName === '' || workspaceName.length > 255) return null
  const principalId = value.principalId
  const authEpoch = value.authEpoch
  if (
    (principalId === undefined) !== (authEpoch === undefined) ||
    (principalId !== undefined && (
      typeof principalId !== 'string' ||
      !WORKSPACE_ID.test(principalId)
    )) ||
    (authEpoch !== undefined && (
      typeof authEpoch !== 'string' ||
      !REVISION.test(authEpoch)
    ))
  ) {
    return null
  }
  const workspace = {
    workspaceId: value.workspaceId,
    workspaceName,
  }
  if (principalId === undefined) return workspace
  if (authEpoch === undefined) return null
  return {...workspace, principalId, authEpoch}
}

export function readGlobalWorkspaceBridgeWorkspaceCleared(
  event: Pick<MessageEvent, 'origin' | 'source' | 'data'>,
  expected: {
    readonly origin: string
    readonly source: Window | null
    readonly nonce: string
    readonly revision: string
  },
): boolean {
  if (event.origin !== expected.origin ||
      expected.source === null ||
      event.source !== expected.source) {
    return false
  }
  const value = record(event.data)
  return value !== null &&
    value.channel === GLOBAL_WORKSPACE_BRIDGE_CHANNEL &&
    value.type === 'workspace-cleared' &&
    value.nonce === expected.nonce &&
    value.revision === expected.revision
}

export function readGlobalWorkspaceBridgeRoute(
  event: Pick<MessageEvent, 'origin' | 'source' | 'data'>,
  expected: {
    readonly origin: string
    readonly source: Window | null
    readonly nonce: string
    readonly revision: string
  },
): string | null {
  if (event.origin !== expected.origin ||
      expected.source === null ||
      event.source !== expected.source) {
    return null
  }
  const value = record(event.data)
  if (value === null ||
      value.channel !== GLOBAL_WORKSPACE_BRIDGE_CHANNEL ||
      value.type !== 'route' ||
      value.nonce !== expected.nonce ||
      value.revision !== expected.revision) {
    return null
  }
  return sanitizedLoopPagePath(value.path)
}

export function isGlobalWorkspaceBridgeNonce(value: string): boolean {
  return NONCE.test(value)
}

export function isGlobalWorkspaceBridgeRevision(value: string): boolean {
  return REVISION.test(value)
}

export type {
  BridgeInit as GlobalWorkspaceBridgeInit,
  BridgeLocale as GlobalWorkspaceBridgeLocaleMessage,
  BridgeNavigate as GlobalWorkspaceBridgeNavigate,
  BridgeReady as GlobalWorkspaceBridgeReady,
  BridgeRoute as GlobalWorkspaceBridgeRoute,
  BridgeWorkspace as GlobalWorkspaceBridgeMessage,
}

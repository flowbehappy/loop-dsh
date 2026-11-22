/** Loop modules exposed through native Harness navigation. */

import type { LoopKey } from './locales.ts'
import { sanitizedLoopPagePath } from './global-workspace-bridge.ts'

/** Shadow the supplier account page at the same public cell while mounted. */
export const LOOP_SETTINGS_ID = 'account'
export const LOOP_DEFAULT_PATH = '/tasks/views/related-to-me'
export const LOOP_PROJECTS_PANEL_ID = 'loop-projects'

export interface LoopModule {
  readonly id: string
  readonly path: string
  readonly label: LoopKey
  readonly placement: 'sidebar' | 'more'
}

export const LOOP_MODULES = Object.freeze([
  { id: 'loop-inbox', path: '/inbox', label: 'module.inbox', placement: 'more' },
  { id: 'loop-contacts', path: '/contacts', label: 'module.contacts', placement: 'more' },
  { id: 'loop-tasks', path: LOOP_DEFAULT_PATH, label: 'module.tasks', placement: 'sidebar' },
  { id: LOOP_PROJECTS_PANEL_ID, path: '/projects', label: 'module.projects', placement: 'more' },
  { id: 'loop-workflows', path: '/workflows/schedules', label: 'module.workflows', placement: 'more' },
  { id: 'loop-knowledge', path: '/kb', label: 'module.knowledge', placement: 'more' },
  { id: 'loop-drive', path: '/drives', label: 'module.drive', placement: 'more' },
  { id: 'loop-dataspaces', path: '/dataspaces', label: 'module.dataspaces', placement: 'more' },
  { id: 'loop-capabilities', path: '/exports/roles', label: 'module.capabilities', placement: 'more' },
  { id: 'loop-connectors', path: '/connectors', label: 'module.connectors', placement: 'more' },
]) satisfies readonly LoopModule[]

const byId = new Map(LOOP_MODULES.map(module => [module.id, module]))

export function loopModuleForPanel(panelId: string | null): LoopModule | null {
  return panelId === null ? null : byId.get(panelId) ?? null
}

function hasSegment(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`) ||
    path.startsWith(`${prefix}?`) || path.startsWith(`${prefix}#`)
}

/**
 * Resolve the owning native panel for the Loop page's current route. Detail
 * routes remain inside the same module so parent navigation never destroys
 * the page or reverts the user's in-app location.
 */
export function loopPanelForPath(rawPath: string): string | null {
  const path = (rawPath.split(/[?#]/u, 1)[0] ?? rawPath)
    .replace(/^\/w\/[^/]+(?=\/|$)/u, '')
  if (hasSegment(path, '/workflows') ||
      hasSegment(path, '/automations') ||
      hasSegment(path, '/settings/automations') ||
      path.startsWith('/inbox/workflow-runs/')) {
    return 'loop-workflows'
  }
  if (hasSegment(path, '/contacts') || hasSegment(path, '/machines')) {
    return 'loop-contacts'
  }
  if (hasSegment(path, '/projects') || hasSegment(path, '/start-work')) {
    return LOOP_PROJECTS_PANEL_ID
  }
  if (path.startsWith('/inbox/tasks/') ||
      /^\/channels\/[^/]+\/tasks(?:\/|$)/u.test(path)) {
    return 'loop-tasks'
  }
  if (hasSegment(path, '/inbox')) return 'loop-inbox'
  if (hasSegment(path, '/connectors')) return 'loop-connectors'
  if (hasSegment(path, '/tasks')) {
    return 'loop-tasks'
  }
  if (hasSegment(path, '/kb')) return 'loop-knowledge'
  if (hasSegment(path, '/drives') || hasSegment(path, '/files')) {
    return 'loop-drive'
  }
  if (hasSegment(path, '/dataspaces') || hasSegment(path, '/dashboards')) {
    return 'loop-dataspaces'
  }
  if (hasSegment(path, '/capabilities') ||
      hasSegment(path, '/exports/skills') ||
      hasSegment(path, '/exports/roles') ||
      hasSegment(path, '/settings/agent-skills') ||
      hasSegment(path, '/settings/agent-roles')) {
    return 'loop-capabilities'
  }
  return null
}

/** Resolve public resource links against the configured installation, never the DSH origin. */
export function loopResourceLink(
  href: string,
  serverUrl: string | null,
): { readonly panelId: string; readonly path: string } | null {
  if (serverUrl === null || !/^https?:\/\//iu.test(href) ||
      /[\\\u0000-\u0020\u007f]/u.test(href)) return null
  let url: URL
  let server: URL
  try {
    url = new URL(href)
    server = new URL(serverUrl)
  } catch {
    return null
  }
  if (!['https:', 'http:'].includes(server.protocol) ||
      url.origin !== server.origin || url.username !== '' || url.password !== '' ||
      server.username !== '' || server.password !== '' || server.search !== '' || server.hash !== '') return null
  const basePath = server.pathname.replace(/\/+$/u, '')
  if (basePath !== '' && !url.pathname.startsWith(`${basePath}/`)) return null
  const path = sanitizedLoopPagePath(`${url.pathname.slice(basePath.length)}${url.search}${url.hash}`)
  if (path === null) return null
  const panelId = loopPanelForPath(path)
  return panelId === null ? null : {panelId, path}
}

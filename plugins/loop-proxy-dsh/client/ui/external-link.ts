/** Open a validated external URL through the host's browser handoff. */

import type { LoopLocale } from './global-workspace-bridge.ts'

export interface ExternalLinkHost {
  readonly protocol: string
  open(url: string, target: string): {opener: unknown} | null
}

export interface ExternalLinkWindow {
  opener: unknown
  readonly location: {
    replace(url: string): void
  }
  close(): void
}

export interface PendingExternalLink {
  open(url: string): boolean
  close(): void
}

function validatedExternalUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
    || parsed.username !== ''
    || parsed.password !== '') return null
  return parsed.href
}

/**
 * Desktop deliberately denies the in-app window after handing an HTTP(S) URL
 * to the operating system, so its null `window.open` result is successful.
 * @param url - Host-provided login, page, or documentation URL.
 * @param host - Browser location protocol and window-open operation.
 * @returns whether the host accepted the external handoff.
 */
export function openExternal(url: string, host: ExternalLinkHost): boolean {
  const target = validatedExternalUrl(url)
  if (target === null) return false
  const opened = host.open(target, '_blank')
  if (opened !== null) opened.opener = null
  return host.protocol === 'dsh-app:' || opened !== null
}

/**
 * Navigate a window opened during the originating user gesture.
 * @param url - Host-provided external URL.
 * @param target - window already opened by the click.
 * @returns whether the prepared window was navigated.
 */
export function openExternalInWindow(url: string, target: ExternalLinkWindow): boolean {
  const validated = validatedExternalUrl(url)
  if (validated === null) return false
  target.opener = null
  target.location.replace(validated)
  return true
}

/**
 * Carry the current language into an isolated Loop login/page tab without
 * changing its destination path or the browser's persisted language choice.
 * @param url - Host-provided HTTP(S) handoff URL.
 * @param locale - Current normalized Harness locale.
 * @returns the annotated URL, or null when the URL is unsafe.
 */
export function externalUrlWithLocale(url: string, locale: LoopLocale): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
    || parsed.username !== ''
    || parsed.password !== '') return null
  if (parsed.pathname.replace(/\/+$/u, '').endsWith('/external-host/page-login')) {
    const fragment = new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : '')
    fragment.set('locale', locale)
    parsed.hash = fragment.toString()
  } else {
    parsed.searchParams.set('locale', locale)
  }
  return parsed.href
}

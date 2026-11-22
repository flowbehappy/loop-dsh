/** Open the existing More → Sign in dialog once after the native welcome. */
import {useEffect, useRef, type ReactNode} from 'react'
import type {HostObservable, InjectFace, PropsRuntime} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {GlobalPageState} from './global-page-controller.ts'
import {LOOP_LAUNCHER_PRIORITY} from './loop-launcher.ts'

export interface LoopOnboardingInjected {
  readonly openLoopModule: () => void
  readonly hooks: {readonly globalPage: HostObservable<GlobalPageState>}
}
export type LoopOnboardingGateProps = PropsRuntime<'settings.onboarding'> & InjectFace<LoopOnboardingInjected>
export type LoopDesktopOnboardingProps = PropsRuntime<'shell.overlay'> & InjectFace<LoopOnboardingInjected>

const LOGIN_OFFERED_KEY = 'loop-proxy.login-offered.v1'
// Storage can be unavailable in private or restricted hosts. Still offer only once
// during this renderer's lifetime; this flag contains no account or auth state.
let offeredInRenderer = false
function claimFirstLoginOffer(): boolean {
  if (offeredInRenderer) return false
  offeredInRenderer = true
  try {
    if (globalThis.localStorage.getItem(LOGIN_OFFERED_KEY) === '1') return false
    globalThis.localStorage.setItem(LOGIN_OFFERED_KEY, '1')
  } catch { /* Keep the menu usable even when browser storage is unavailable. */ }
  return true
}

function useFirstLoginOffer({useGlobalPage, openLoopModule}: InjectFace<LoopOnboardingInjected>, complete?: () => void): void {
  const page = useGlobalPage(value => value)
  const completed = useRef(false)
  useEffect(() => {
    if (completed.current || page.screen === 'idle' || page.screen === 'loading') return
    completed.current = true
    const first = claimFirstLoginOffer()
    complete?.()
    if (first && page.connection?.state !== 'signed_in') openLoopModule()
  }, [page.screen, page.connection?.state, complete, openLoopModule])
}

/** The Web coordinator completes immediately; the shared login dialog owns UI. */
export function LoopOnboardingGate(props: LoopOnboardingGateProps): ReactNode {
  useFirstLoginOffer(props, props.complete)
  return null
}

/** Desktop mounts its shell only after DSH's native welcome has finished. */
export function LoopDesktopOnboarding(props: LoopDesktopOnboardingProps): ReactNode {
  useFirstLoginOffer(props)
  return null
}

export function LoopWelcomeNoticeSuppressor({complete}: PropsRuntime<'settings.onboarding'>): ReactNode {
  useEffect(() => { complete() }, [complete])
  return null
}

export const LOOP_ONBOARDING_ID = 'deepseek-official'
export const LOOP_ONBOARDING_PRIORITY = LOOP_LAUNCHER_PRIORITY
export const LOOP_DESKTOP_ONBOARDING_ID = 'desktop-onboarding'
export const LOOP_DESKTOP_ONBOARDING_PRIORITY = LOOP_LAUNCHER_PRIORITY
export type LoopDesktopOnboardingInjected = LoopOnboardingInjected

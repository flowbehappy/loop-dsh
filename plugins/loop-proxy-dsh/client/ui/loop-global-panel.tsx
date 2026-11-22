import type { AccountConnectionState } from './account-connection-controller.ts'
/** Workspace-independent persistent Loop host and matching sidebar glyph. */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  Button,
  IconLoadingOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { GlobalPageActions, GlobalPageState } from './global-page-controller.ts'
import { failureText } from './failure-text.ts'
import type { NS } from './locales.ts'
import { loopModuleForPanel } from './loop-navigation.ts'
import type { SharedDataState } from './shared-data-runtime.ts'
import css from './loop-ui.module.css'

export interface LoopGlobalHostInjected {
  readonly authorizePages?: () => void
  readonly retryLogin: () => void
  readonly recoverLogin: () => void
  readonly cancelRecovery: () => void
  readonly actions: GlobalPageActions
  readonly attachWorkspacePage: (frame: Window, pageUrl: string) => void
  readonly hooks: {
    readonly accountConnection: HostObservable<AccountConnectionState>
    readonly globalPage: HostObservable<GlobalPageState>
    readonly sharedData: HostObservable<SharedDataState>
  }
}

export type LoopGlobalPanelProps =
  PropsRuntime<'main'>
  & PropsLocale<typeof NS>

/**
 * Keyed main-panel anchor. The live iframe is owned by `LoopGlobalHost` in the
 * persistent shell overlay seat so panel switches do not destroy its browsing
 * context.
 */
export function LoopGlobalPanel(_props: LoopGlobalPanelProps): ReactNode {
  return null
}

export type LoopGlobalHostProps =
  PropsRuntime<'shell.overlay'>
  & PropsLocale<typeof NS>
  & InjectFace<LoopGlobalHostInjected>

interface HostBounds {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

function findCenterColumn(frame: HTMLElement): HTMLElement | null {
  const mainSlot = frame.querySelector<HTMLElement>('[data-slot="main"]')
  let candidate = mainSlot
  while (candidate !== null && candidate.parentElement !== frame) {
    candidate = candidate.parentElement
  }
  return candidate ?? Array.from(frame.children).find((child, index): child is HTMLElement =>
    index === 1 && child instanceof HTMLElement) ?? null
}

export function LoopPageFrame({
  state,
  attachWorkspacePage,
  title,
  active = true,
}: {
  readonly state: GlobalPageState
  readonly attachWorkspacePage: (frame: Window, pageUrl: string) => void
  readonly title: string
  readonly active?: boolean
}): ReactNode {
  const frame = useRef<HTMLIFrameElement>(null)
  const attach = (): void => {
    if (!active || state.screen !== 'ready' || state.page === null) return
    const contentWindow = frame.current?.contentWindow
    if (contentWindow !== null && contentWindow !== undefined) {
      attachWorkspacePage(contentWindow, state.page.url)
    }
  }
  useEffect(() => {
    if (!active || state.screen !== 'ready' || state.page === null) return
    const contentWindow = frame.current?.contentWindow
    if (contentWindow !== null && contentWindow !== undefined) {
      attachWorkspacePage(contentWindow, state.page.url)
    }
  }, [active, state.frameKey, state.page, attachWorkspacePage])
  if (state.screen !== 'ready' || state.page === null) return null
  return (
    <iframe
      ref={frame}
      key={`${state.frameKey}:${state.page.url}`}
      className={css.globalFrame}
      src={state.page.url}
      title={title}
      referrerPolicy="no-referrer"
      // Shared editing, media and sharing capabilities for every Loop module.
      // Keep delegation on the configured origin; browser consent still applies.
      allow="clipboard-read 'src'; clipboard-write 'src'; fullscreen 'src'; autoplay 'src'; picture-in-picture 'src'; web-share 'src'"
      sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-storage-access-by-user-activation"
      onLoad={attach}
    />
  )
}

/**
 * Permanently mounts the configured Loop application once the global panel is
 * selected. Hiding the host preserves iframe route, form drafts, and navigation
 * history; no URL, Cookie, or token is copied into controller state.
 */
export function LoopGlobalHost({
  useAccountConnection,
  authorizePages,
  retryLogin,
  recoverLogin,
  cancelRecovery,
  useGlobalPage,
  useSharedData,
  usePanelInfo,
  actions,
  attachWorkspacePage,
  t,
}: LoopGlobalHostProps): ReactNode {
  const connection = useAccountConnection(value => value)
  const host = useRef<HTMLDivElement>(null)
  const state = useGlobalPage(value => value)
  const sharedData = useSharedData(value => value)
  const activePanelId = usePanelInfo(info => info.activePanelId)
  const active = loopModuleForPanel(activePanelId) !== null
  const [bounds, setBounds] = useState<HostBounds | null>(null)

  useEffect(() => {
    if (active && activePanelId !== null) actions.openModule(activePanelId)
  }, [active, activePanelId, actions])

  useLayoutEffect(() => {
    if (!active) host.current?.setAttribute('inert', '')
    else host.current?.removeAttribute('inert')
  }, [active])

  useLayoutEffect(() => {
    const root = host.current
    const overlay = root?.closest<HTMLElement>('[data-shell-overlay]')
    if (root === null || overlay === null || overlay === undefined) return
    const layer: HTMLElement = overlay
    const frameCandidate = layer.parentElement
    if (frameCandidate === null) return
    const frame: HTMLElement = frameCandidate

    const measure = (): void => {
      const center = findCenterColumn(frame)
      if (center === null) return
      const overlayRect = layer.getBoundingClientRect()
      const centerRect = center.getBoundingClientRect()
      const next = {
        left: centerRect.left - overlayRect.left,
        top: centerRect.top - overlayRect.top,
        width: centerRect.width,
        height: centerRect.height,
      }
      setBounds(current => current !== null &&
        current.left === next.left &&
        current.top === next.top &&
        current.width === next.width &&
        current.height === next.height
        ? current
        : next)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    const center = findCenterColumn(frame)
    if (center !== null) observer.observe(center)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const style: CSSProperties | undefined = bounds === null
    ? undefined
    : {
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      }
  const sharedDataMessage =
    !active || state.screen !== 'ready' || state.page === null
      ? null
      : sharedData.phase === 'waiting'
        ? t('global.dataWaiting')
        : sharedData.phase === 'resyncing'
          ? t('global.dataReconnecting')
          : sharedData.phase === 'unavailable'
            ? t('global.dataUnavailable')
            : sharedData.data?.connection.phase === 'reconnecting'
              ? t('global.connectionReconnecting')
              : sharedData.data?.connection.phase === 'disconnected'
                ? t('global.connectionDisconnected')
                : null

  return (
    <div
      ref={host}
      className={css.globalHost}
      style={style}
      data-loop-global-host=""
      data-active={active ? 'true' : undefined}
      aria-hidden={active ? undefined : true}
    >
      <LoopPageFrame
        state={state}
        attachWorkspacePage={attachWorkspacePage}
        title={t('global.aria')}
        active={active}
      />
      {state.workspaceError !== null && (
        <div className={css.globalWorkspaceNotice} role="alert">
          {t('global.workspaceError')}
        </div>
      )}
      {active && connection.phase === 'error' && (
        <div className={css.globalConnectionStatus} role="alert">
          <span>{connection.error?.code === 'loop/no-models' ? t('onboarding.noModels') : failureText(t, connection.error ?? {code: 'loop/transport', message: ''})}</span>
          <Button variant="outline" onClick={connection.error?.code === 'loop-host/credential-unavailable' ? recoverLogin : retryLogin}>
            {t(connection.error?.code === 'loop-host/credential-unavailable' ? 'onboarding.recoverLogin' : 'global.retry')}
          </Button>
        </div>
      )}
      {active && connection.phase === 'recovering' && <div className={css.globalConnectionStatus} role="status">
        <span>{t('onboarding.recoveringLogin')}</span>
        <Button variant="outline" onClick={cancelRecovery}>{t('dialog.cancel')}</Button>
      </div>}
      {sharedDataMessage !== null && connection.phase === 'idle' && (
        <div className={css.globalConnectionStatus}>
          <span role="status">{sharedDataMessage}</span>
          {sharedData.phase === 'unavailable' && (
            <Button
              className={css.globalConnectionAction}
              variant="outline"
              onClick={actions.reconnect}
            >
              {t('global.reconnect')}
            </Button>
          )}
        </div>
      )}

      {active && state.connection?.state === 'signing_out' && (
        <div className={css.globalStatus} role="status">{t('login.signingOut')}</div>
      )}

      {active && state.connection?.deviceOnly && state.connection.state==='signed_in' && state.serverUrl &&
        <div className={css.globalStatus}><p>{t('login.personalPage')}</p><Button variant="primary" disabled={connection.phase === 'waiting'} onClick={authorizePages ?? retryLogin}>
          {t(connection.phase === 'connecting' ? 'settings.modelsAuthOpen' : 'login.authorizePages')}
        </Button></div>}
      {active && !state.connection?.deviceOnly && state.connection?.state !== 'signing_out' && (state.screen === 'setup' || (state.screen === 'ready' && state.page === null)) && (
        <div className={css.globalError}>
          <h2>{t('onboarding.loginLoop')}</h2>
          <p className={css.hint}>{t('login.description')}</p>
          <Button variant="primary" onClick={retryLogin}>{t('onboarding.loginLoop')}</Button>
        </div>
      )}

      {active && (state.screen === 'idle' || state.screen === 'loading') && (
        <div className={css.globalStatus} role="status" aria-label={t('global.loading')}>
          <IconLoadingOutlineRegular className={css.spinner} size={20} />
        </div>
      )}

      {active && state.screen === 'error' && (
        <div className={css.globalError} role="alert">
          <p>{t('global.error')}</p>
          {state.error !== null && <p className={css.hint}>{failureText(t, state.error)}</p>}
          <div className={css.serverActions}>
            <Button variant="outline" onClick={actions.reconnect}>{t('global.retry')}</Button>
          </div>
        </div>
      )}
    </div>
  )
}

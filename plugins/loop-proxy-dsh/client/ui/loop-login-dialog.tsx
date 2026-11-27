/** One account entry point, backed by the existing server and authorization owners. */
import {useId, useState, useEffect, type ReactNode} from 'react'
import {Button, Input, Modal} from '@deepseek-ai/dsh-client-ui-primitives'
import type {HostObservable, InjectFace, PropsLocale, PropsRuntime} from '@deepseek-ai/dsh-client-ui-slots'
import type {AccountConnectionState} from './account-connection-controller.ts'
import {accountDisplayLabel, normalizedLoopServerUrl, type GlobalPageActions, type GlobalPageState} from './global-page-controller.ts'
import type {LoginDialogController, LoginDialogState} from './login-dialog-controller.ts'
import type {ModelUiState} from './model-controller.ts'
import type {ProjectSyncUiState} from './project-sync-controller.ts'
import type {SharedDataState} from './shared-data-runtime.ts'
import type {LoopKey, NS} from './locales.ts'
import {failureText} from './failure-text.ts'
import {LoopBrandMark} from './loop-brand.ts'
import css from './loop-ui.module.css'

export interface LoopLoginDialogInjected {
  readonly dialog: Pick<LoginDialogController, 'close' | 'login' | 'logout' | 'authorizePages'>
  readonly pageActions: GlobalPageActions
  readonly hooks: {
    readonly loginDialog: HostObservable<LoginDialogState>
    readonly globalPage: HostObservable<GlobalPageState>
    readonly projectSync: HostObservable<ProjectSyncUiState>
    readonly accountConnection: HostObservable<AccountConnectionState>
    readonly models: HostObservable<ModelUiState>
    readonly sharedData: HostObservable<SharedDataState>
  }
}

export type LoopLoginDialogProps = PropsRuntime<'shell.overlay'> & PropsLocale<typeof NS> & InjectFace<LoopLoginDialogInjected>

export function LoopLoginDialog({useLoginDialog, useGlobalPage, useProjectSync, useAccountConnection,
  useModels, useSharedData, dialog, pageActions, t}: LoopLoginDialogProps): ReactNode {
  const state = useLoginDialog(value => value)
  const page = useGlobalPage(value => value)
  const sync = useProjectSync(value => value)
  const connection = useAccountConnection(value => value)
  const serverId = useId()
  const hintId = useId()
  const [method,setMethod]=useState<"browser"|"token">("browser")
  const [token,setToken]=useState("")
  const tokenId=useId()
  useEffect(()=>{if(!state.open){setToken("");setMethod("browser")}},[state.open])
  if (!state.open) return null

  const loading = page.serverUrl === null && (page.screen === 'idle' || page.screen === 'loading')
  const busy = state.busy || page.serverBusy || sync.busy !== null
  const signedIn = page.connection?.state === 'signed_in'
  const showLogin = !signedIn && !sync.disconnecting && page.connection?.state !== 'signing_out'
  const accountLabel = signedIn ? accountDisplayLabel(page.connection) : ''
  const canSignOut = signedIn || Boolean(page.connection?.accountPrincipal) || sync.disconnecting
  const authenticating = ['waiting', 'connecting', 'recovering'].includes(connection.phase)
  const canRecover = connection.error?.code === 'loop-host/credential-unavailable' && page.serverUrl !== null &&
    normalizedLoopServerUrl(page.serverDraft)?.replace(/\/+$/u, '') === normalizedLoopServerUrl(page.serverUrl)?.replace(/\/+$/u, '')
  const error = page.serverError ?? (sync.disconnecting ? sync.error : null) ?? connection.error
  const status: LoopKey = sync.disconnecting ? 'login.signingOut'
    : loading ? 'login.checking'
      : authenticating ? 'login.signingIn'
        : page.connection?.state === 'unavailable' ? 'login.statusUnavailable'
          : signedIn ? 'login.signedIn' : page.connection?.state === 'needs_auth'
            ? page.connection.reason === 'refresh_outcome_unknown' ? 'login.refreshUncertain' : 'login.expired' : 'login.signedOut'
  const logoutLabel: LoopKey = sync.disconnecting
    ? sync.challenge !== null
      ? sync.challengeOpened ? 'settings.disconnectCheck' : 'settings.disconnectConfirm'
      : 'settings.disconnectFinish'
    : 'login.logout'

  return <Modal open title={t('login.title')} closeLabel={t('dialog.close')} className={css.loginDialog as string} onClose={dialog.close}>
    <form className={css.loginForm} noValidate onSubmit={event => {
      event.preventDefault()
      if (!showLogin) return
      if (method === 'token') {
        void dialog.login(token.trim())
        setToken('')
      } else {
        void dialog.login()
      }
    }}>
      <div className={css.loginIntro}>
        <span className={css.loginBrand}><LoopBrandMark size={32} /></span>
        {showLogin && <p>{t('login.description')}</p>}
      </div>
      {showLogin && <>
        <div role="tablist" aria-label={t("login.method")} className={css.loginTabs}>
          {(["browser","token"] as const).map(item=><button key={item} role="tab" type="button" id={tokenId+item}
            aria-selected={method===item} aria-controls={tokenId+"panel"} disabled={busy || authenticating}
            onKeyDown={event=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(event.key)){
              event.preventDefault();const next=event.key==="Home"?"browser":event.key==="End"?"token":item==="browser"?"token":"browser";
              setToken("");setMethod(next);document.getElementById(tokenId+next)?.focus()
            }}} tabIndex={method===item?0:-1} onClick={()=>{setToken("");setMethod(item)}}>{item==="browser"?t("login.browser"):"Access Token"}</button>)}
        </div>
        <div role="tabpanel" id={tokenId+"panel"} aria-labelledby={tokenId+method} className={css.loginField}>
          <label htmlFor={serverId}>{t('global.serverLabel')}</label>
          <Input id={serverId} type="url" autoComplete="url" spellCheck={false}
            value={page.serverDraft} placeholder={t('global.serverPlaceholder')}
            disabled={busy || loading}
            aria-describedby={hintId} aria-invalid={page.serverError?.code === 'loop/server-url-invalid'}
            onChange={event => { setToken(""); pageActions.changeServerUrl(event.currentTarget.value) }} />
          <span id={hintId} className={css.hint}>{t('login.rememberServer')}</span>
          {method==="token" && <><label htmlFor={tokenId}>Access Token</label>
            <Input id={tokenId} type="password" autoComplete="off" spellCheck={false} value={token}
              disabled={busy || authenticating} onChange={event=>setToken(event.currentTarget.value)} />
            <span className={css.hint}>{t("login.tokenHint")}</span></>}
        </div>
      </>}
      <div className={css.loginStatus} role="status" aria-live="polite"
        data-connected={status === 'login.signedIn'}>
        <span className={css.loginStatusDot} aria-hidden="true" />
        <div>
          <strong>{t(status)}</strong>
          {accountLabel !== '' && <span>{accountLabel}</span>}
          {signedIn && page.connection?.deviceOnly && <span>{t('login.personalPage')}</span>}
          {signedIn && page.serverUrl !== null && <span className={css.loginCurrentServer}>{page.serverUrl}</span>}
        </div>
      </div>
      {sync.disconnecting && sync.challenge !== null && <p className={css.hint}>{t('login.logoutPending')}</p>}
      {error !== null && <p className={error.code === 'loop/no-models' ? css.warning : css.error} role="alert">
        {error.code === 'loop/no-models' ? t('onboarding.noModels') : failureText(t, error)}
      </p>}
      <div className={css.loginActions}>
        <Button type="button" variant="outline" disabled={busy || loading || !canSignOut} onClick={dialog.logout}>
          {t(logoutLabel)}
        </Button>
        {showLogin && <Button type="submit" variant="primary" disabled={busy || loading || (method === 'token' && (authenticating || !token.trim())) || page.serverDraft.trim() === ''}>
          {t(state.busy || page.serverBusy ? 'global.serverSaving'
            : canRecover ? 'onboarding.recoverLogin' : 'launcher.signIn')}
        </Button>}
        {signedIn && page.connection?.deviceOnly && !sync.disconnecting && <Button type="button" variant="primary"
          disabled={busy || authenticating} onClick={dialog.authorizePages}>
          {t('login.authorizePages')}
        </Button>}
      </div>
      {signedIn && !sync.disconnecting && <p className={css.hint}>{t('login.logoutHint')}</p>}
    </form>
  </Modal>
}

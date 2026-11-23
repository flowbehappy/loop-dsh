import {afterEach, expect, it, vi} from 'vitest'
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {createElement, useSyncExternalStore} from 'react'
import {LoginDialogController} from '../login-dialog-controller.ts'
import {LoopGlobalPageController} from '../global-page-controller.ts'
import {AccountConnectionController} from '../account-connection-controller.ts'
import {LoopProjectSyncController} from '../project-sync-controller.ts'
import {INITIAL_MODEL_STATE, type LoopModelController} from '../model-controller.ts'
import {createSnapshotStore, type ObservableSnapshot} from '../store.ts'
import {LoopLoginDialog} from '../loop-login-dialog.tsx'
import {LoopSettings} from '../loop-settings.tsx'
import {en} from '../locales.ts'
import type {LoopHostClient} from '../types.ts'

const disposers: Array<() => void> = []
afterEach(() => { cleanup(); disposers.splice(0).forEach(dispose => dispose()); vi.restoreAllMocks() })
const success = <T,>(value: T) => ({ok: true as const, value})
const pageSession = {url: 'https://loop.test/login'}
function setup(configured = true) {
  let server = configured ? 'https://loop.test' : null
  const remote = {
    globalServerStatus: vi.fn(async () => success({serverUrl: server, serverRevision: server ? 'rev_a' : ''})),
    globalPage: vi.fn(async () => success(pageSession)),
    configureGlobalServer: vi.fn(async ({serverUrl}: {serverUrl: string}) => {
      server = serverUrl
      return success({serverUrl, serverRevision: 'rev_b', page: {url: serverUrl + 'login'}})
    }),
    projectSyncSettings: vi.fn(async () => success({state: 'needs_auth', canDisconnect: false, serverUrl: server, projects: []})),
    disconnectAccount: vi.fn(async () => success({state: 'signed_out'})),
    connectAccount: vi.fn(async () => success({state: 'needs_auth', challenge: {id: 'new', loginUrl: 'https://loop.test/oauth/host/authorize'}})),
  }
  const page = new LoopGlobalPageController(remote as unknown as LoopHostClient)
  const models = {store: createSnapshotStore(INITIAL_MODEL_STATE), open: vi.fn(async () => {}), actions: {select: vi.fn()}}
  const account = new AccountConnectionController(remote as unknown as LoopHostClient, page, models as unknown as LoopModelController, () => 'en', () => true)
  const sync = new LoopProjectSyncController({remote: remote as unknown as LoopHostClient, openExternal: vi.fn(() => true)})
  const openLoop = vi.fn()
  const dialog = new LoginDialogController(page, account, sync, models as unknown as LoopModelController, openLoop)
  const start = vi.spyOn(account, 'start')
  disposers.push(() => { dialog.dispose(); account.dispose(); sync.dispose(); page.dispose() })
  const hook = <T,>(store: ObservableSnapshot<T>) => (select: (value: T) => unknown) => select(useSyncExternalStore(store.subscribe, store.getSnapshot))
  const props = {dialog, pageActions: page.actions, useLoginDialog: hook(dialog.store), useGlobalPage: hook(page.store),
    useProjectSync: hook(sync.store), useAccountConnection: hook(account.store), useModels: hook(models.store),
    useSharedData: hook(page.sharedData.store), t: (key: keyof typeof en) => en[key]}
  return {remote, page, account, sync, dialog, openLoop, start, props}
}
async function open(h: ReturnType<typeof setup>) {
  h.dialog.open()
  await waitFor(() => expect(['ready', 'setup']).toContain(h.page.store.getSnapshot().screen))
  await waitFor(() => expect(h.sync.store.getSnapshot().busy).toBeNull())
}

it('always shows the remembered server, status and both actions before any login', async () => {
  const h = setup()
  await open(h)
  render(createElement(LoopLoginDialog, h.props as never))
  expect((screen.getByRole('textbox', {name: en['global.serverLabel']}) as HTMLInputElement).value).toBe('https://loop.test')
  expect(screen.getByRole('status').textContent).toContain(en['login.signedOut'])
  expect((screen.getByRole('button', {name: en['login.logout']}) as HTMLButtonElement).disabled).toBe(true)
  expect(h.openLoop).not.toHaveBeenCalled()
  expect(h.start).not.toHaveBeenCalled()
  expect(h.remote.configureGlobalServer).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', {name: en['launcher.signIn']}))
  await waitFor(() => expect(h.start).toHaveBeenCalledOnce())
  expect(h.openLoop).not.toHaveBeenCalled()
  expect(h.remote.configureGlobalServer).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).not.toBeNull()
})

it('first use validates the address without changing server or starting login on invalid input', async () => {
  const h = setup(false)
  await open(h)
  render(createElement(LoopLoginDialog, h.props as never))
  expect((screen.getByRole('button', {name: en['launcher.signIn']}) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(screen.getByRole('textbox'), {target: {value: 'https://user:secret@loop.test'}})
  fireEvent.click(screen.getByRole('button', {name: en['launcher.signIn']}))
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  expect(h.remote.configureGlobalServer).not.toHaveBeenCalled()
  expect(h.start).not.toHaveBeenCalled()
})

it('saves a new server through Host before login and remembers the committed address on reopening', async () => {
  const h = setup(false)
  await open(h)
  h.page.changeServerUrl(' https://new.loop.test ')
  await h.dialog.login()
  expect(h.remote.configureGlobalServer).toHaveBeenCalledWith({serverUrl: 'https://new.loop.test/'}, expect.any(AbortSignal))
  expect(h.start).toHaveBeenCalledOnce()
  h.dialog.open()
  expect(h.page.store.getSnapshot().serverDraft).toBe('https://new.loop.test/')
  h.dialog.close()
  h.page.changeServerUrl('https://unsaved.test')
  h.dialog.open()
  expect(h.page.store.getSnapshot().serverDraft).toBe('https://new.loop.test/')
})

it('failed server probe keeps the previous page, typed address and open dialog, without logging in', async () => {
  const h = setup()
  await open(h)
  h.remote.configureGlobalServer.mockResolvedValue({ok: false, error: {code: 'loop/transport', message: ''}} as never)
  h.page.changeServerUrl('https://offline.test')
  await h.dialog.login()
  expect(h.page.store.getSnapshot()).toMatchObject({serverUrl: 'https://loop.test', serverDraft: 'https://offline.test', page: pageSession})
  expect(h.dialog.store.getSnapshot()).toEqual({open: true, busy: false})
  expect(h.start).not.toHaveBeenCalled()
})

it('coalesces rapid login clicks and never navigates after closing while a server probe is pending', async () => {
  const h = setup()
  await open(h)
  let resolve!: (value: never) => void
  h.remote.configureGlobalServer.mockImplementation(() => new Promise(r => { resolve = r }))
  h.page.changeServerUrl('https://new.loop.test')
  const first = h.dialog.login()
  await h.dialog.login()
  expect(h.remote.configureGlobalServer).toHaveBeenCalledOnce()
  h.dialog.close()
  resolve(success({serverUrl: 'https://new.loop.test', serverRevision: 'rev_b', page: pageSession}) as never)
  await first
  expect(h.openLoop).not.toHaveBeenCalled()
  expect(h.start).not.toHaveBeenCalled()
})

it('signs out the active server, not an unsubmitted address, and retains the remembered server', async () => {
  const h = setup()
  await open(h)
  h.page.changeServerUrl('https://unsubmitted.test')
  h.dialog.logout()
  await waitFor(() => expect(h.remote.disconnectAccount).toHaveBeenCalledOnce())
  expect(h.remote.configureGlobalServer).not.toHaveBeenCalled()
  expect(h.account.store.getSnapshot().phase).toBe('idle')
  expect(h.page.store.getSnapshot().serverUrl).toBe('https://loop.test')
})

it('leaves workspace repair to the Host without a manual control', async () => {
  const h = setup()
  const settings = {state:'ready', canReconnectWorkspaceBindings:true, projects:[]}
  h.remote.projectSyncSettings.mockResolvedValue(success(settings) as never)
  h.remote.globalServerStatus.mockResolvedValue(success({serverUrl:'https://loop.test',serverRevision:'rev_a',connection:{state:'signed_in',accountPrincipal:'human',grantId:'grant_a'}}) as never)
  const syncProjects = vi.fn(async () => success({...settings, updated:1, imported:0, skipped:0}))
  Object.assign(h.remote, {syncProjects})
  await open(h)
  render(createElement(LoopLoginDialog, h.props as never))
  expect(syncProjects).not.toHaveBeenCalled()
  expect(screen.queryByText('Repair workspace connections')).toBeNull()
})

it('pending sign-out blocks server changes and login, but exposes the existing confirmation action', async () => {
  const h = setup()
  await open(h)
  h.remote.disconnectAccount.mockResolvedValue(success({state: 'needs_confirmation', challenge: {id: 'exit', loginUrl: 'https://loop.test/confirm', expiresAt: '2099-01-01'}}) as never)
  h.dialog.logout()
  await waitFor(() => expect(h.sync.store.getSnapshot().challenge).not.toBeNull())
  render(createElement(LoopLoginDialog, h.props as never))
  expect((screen.getByRole('textbox') as HTMLInputElement).disabled).toBe(true)
  expect((screen.getByRole('button', {name: en['launcher.signIn']}) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', {name: en['settings.disconnectConfirm']}))
  expect(h.sync.store.getSnapshot().challengeOpened).toBe(true)
  await h.dialog.login()
  expect(h.start).not.toHaveBeenCalled()
})

it('reopening while sign-out runs does not abort it or replace it with a status read', async () => {
  const h = setup()
  await open(h)
  h.remote.disconnectAccount.mockImplementation(() => new Promise(() => {}))
  h.dialog.logout()
  const reads = h.remote.projectSyncSettings.mock.calls.length
  h.dialog.close()
  h.dialog.open()
  expect(h.remote.projectSyncSettings).toHaveBeenCalledTimes(reads)
  expect(h.sync.store.getSnapshot().busy).toBe('disconnect')
})

it('settings defaults to live uploads and saves the explicit history preference without login', async () => {
  const remote = {
    getSyncPreferences: vi.fn(async () => success({uploadDisconnectedHistory: false})),
    setSyncPreferences: vi.fn(async (value: {uploadDisconnectedHistory: boolean}) => success(value)),
  }
  render(createElement(LoopSettings, {remote: remote as unknown as LoopHostClient,
    t: (key: keyof typeof en) => en[key]} as never))
  const checkbox = screen.getByRole('checkbox') as HTMLInputElement
  await waitFor(() => expect(checkbox.disabled).toBe(false))
  expect(checkbox.checked).toBe(false)
  fireEvent.click(checkbox)
  await waitFor(() => expect(checkbox.checked).toBe(true))
  expect(remote.setSyncPreferences).toHaveBeenCalledWith({uploadDisconnectedHistory: true})
})

it('settings keeps the confirmed value when saving fails', async () => {
  const remote = {
    getSyncPreferences: vi.fn(async () => success({uploadDisconnectedHistory: false})),
    setSyncPreferences: vi.fn(async () => { throw new Error('disk unavailable') }),
  }
  render(createElement(LoopSettings, {remote: remote as unknown as LoopHostClient,
    t: (key: keyof typeof en) => en[key]} as never))
  const checkbox = screen.getByRole('checkbox') as HTMLInputElement
  await waitFor(() => expect(checkbox.disabled).toBe(false))
  fireEvent.click(checkbox)
  await screen.findByRole('alert')
  expect(checkbox.checked).toBe(false)
})

it('uses only the Host login status despite stale page and background sync failures', async () => {
  const h = setup()
  await open(h)
  h.page.store.set({...h.page.store.getSnapshot(), connection: {state: 'signed_in'}})
  h.page.sharedData.disconnect('authorization-required')
  h.sync.store.set({...h.sync.store.getSnapshot(), error: {code: 'loop/transport', message: 'Background sync delayed'}})
  render(createElement(LoopLoginDialog, h.props as never))
  expect(screen.getByRole('status').textContent).toContain(en['login.signedIn'])
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.keyDown(document, {key: 'Escape'})
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(h.start).not.toHaveBeenCalled()
})

it('requests credential recovery only on an explicit click for the same saved server', async () => {
  for (const changed of [false, true]) {
    const h = setup()
    await open(h)
    h.account.store.set({phase: 'error', error: {code: 'loop-host/credential-unavailable', message: ''}})
    const recover = vi.spyOn(h.account, 'recover')
    if (changed) h.page.changeServerUrl('https://new.loop.test')
    expect(recover).not.toHaveBeenCalled()
    await h.dialog.login()
    expect(recover).toHaveBeenCalledTimes(changed ? 0 : 1)
    expect(h.start).toHaveBeenCalledTimes(changed ? 1 : 0)
  }
})

it.each(['needs_auth', 'unavailable'] as const)('allows signing out a retained account when status is %s', async state => {
  const h = setup()
  await open(h)
  h.page.store.set({...h.page.store.getSnapshot(), connection: {state, accountPrincipal: 'usr_retained'}})
  render(createElement(LoopLoginDialog, h.props as never))
  const logout = screen.getByRole('button', {name: en['login.logout']}) as HTMLButtonElement
  expect(logout.disabled).toBe(false)
  fireEvent.click(logout)
  await waitFor(() => expect(h.remote.disconnectAccount).toHaveBeenCalledOnce())
})

it('clears token drafts and sends a personal assistant token only to the committed server', async () => {
  const h=setup()
  h.remote.connectAccount.mockResolvedValue(success({state:'connected',accountPrincipal:'owner'}) as never)
  await open(h)
  render(createElement(LoopLoginDialog,h.props as never))
  const tab=screen.getByRole('tab',{name:'Access Token'})
  fireEvent.click(tab)
  const input=()=>document.querySelector<HTMLInputElement>('input[type=password]')!
  const token='loop_dsh_'+'a'.repeat(43)
  fireEvent.change(input(),{target:{value:token}})
  fireEvent.click(screen.getByRole('tab',{name:'Browser'}))
  fireEvent.click(tab)
  expect(input().value).toBe('')
  fireEvent.change(input(),{target:{value:token}})
  fireEvent.click(screen.getByRole('button',{name:'Sign in'}))
  await waitFor(()=>expect(h.remote.connectAccount).toHaveBeenCalledWith(
    {expectedServerRevision:'rev_a',locale:'en',accessToken:token},expect.any(AbortSignal)))
  expect(input().value).toBe('')
  expect(h.remote.connectAccount).toHaveBeenCalledTimes(1)
})

it('explains an uncertain renewal without labeling it as an expired session', async () => {
  const h=setup()
  h.remote.globalServerStatus.mockResolvedValue(success({serverUrl:'https://loop.test',serverRevision:'rev_a',connection:{state:'needs_auth',reason:'refresh_outcome_unknown'}}) as never)
  await open(h)
  render(createElement(LoopLoginDialog,h.props as never))
  expect(screen.getByRole('status').textContent).toContain(en['login.refreshUncertain'])
  expect(screen.getByRole('status').textContent).not.toContain(en['login.expired'])
})

// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest'
import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import {createElement} from 'react'
import {LoopGlobalHost} from '../loop-global-panel.tsx'
import {INITIAL_GLOBAL_PAGE_STATE} from '../global-page-controller.ts'
import {INITIAL_SHARED_DATA_STATE} from '../shared-data-runtime.ts'
import {en} from '../locales.ts'
import {hostFeedbackUrl, openHostFeedback} from '../host-feedback.ts'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('routes missing-server setup through the same login dialog', () => {
  const state = {...INITIAL_GLOBAL_PAGE_STATE, screen: 'setup', serverDraft: 'http://localhost:25431'}
  const actions = {openModule: vi.fn(), saveServer: vi.fn(), changeServerUrl: vi.fn()}
  const retryLogin = vi.fn()
  render(createElement(LoopGlobalHost, {
    useAccountConnection: (select: (value: unknown) => unknown) => select({phase: 'idle', error: null}),
    retryLogin,
    useGlobalPage: (select: (value: unknown) => unknown) => select(state),
    useSharedData: (select: (value: unknown) => unknown) => select(INITIAL_SHARED_DATA_STATE),
    usePanelInfo: (select: (value: unknown) => unknown) => select({activePanelId: 'loop-projects'}),
    actions,
    attachWorkspacePage: vi.fn(),
    t: (key: keyof typeof en) => en[key],
  } as never))
  expect(screen.queryByRole('textbox')).toBeNull()
  fireEvent.click(screen.getByRole('button', {name: en['onboarding.loginLoop']}))
  expect(retryLogin).toHaveBeenCalledOnce()
  expect(actions.saveServer).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', {name: en['launcher.settings']})).toBeNull()
})

it('opens the host feedback form, preserving a configured destination without an account ID', () => {
  const configured = hostFeedbackUrl({contactFormUrl: 'https://feedback.example/form?form=custom&prefill_uid=stale'})
  expect(new URL(configured).searchParams.get('form')).toBe('custom')
  expect(new URL(configured).searchParams.has('prefill_uid')).toBe(false)
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  openHostFeedback()
  expect(open).toHaveBeenCalledWith(hostFeedbackUrl(undefined), '_blank', 'noopener,noreferrer')
  expect(hostFeedbackUrl({contactFormUrl:'javascript:alert(1)'})).toBe(hostFeedbackUrl(undefined))
})

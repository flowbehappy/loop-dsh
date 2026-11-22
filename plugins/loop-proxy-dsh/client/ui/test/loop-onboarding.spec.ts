// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {cleanup, render, screen} from '@testing-library/react'
import {createElement} from 'react'

beforeEach(() => {
 const values = new Map<string, string>()
 vi.stubGlobal('localStorage', {getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: (key: string, value: string) => { values.set(key, value) }})
 vi.resetModules()
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function props() {
 return {complete: vi.fn(), openLoopModule: vi.fn(),
  useGlobalPage: (select: (value: unknown) => unknown) => select({screen: 'ready', connection: {state: 'signed_out'}})}
}
for (const name of ['LoopOnboardingGate', 'LoopDesktopOnboarding'] as const) {
 it(`${name} opens the menu login once and never renders a second welcome`, async () => {
  const component = (await import('../loop-onboarding.tsx'))[name]
  const value = props()
  const view = render(createElement(component, value as never))
  expect(value.openLoopModule).toHaveBeenCalledOnce()
  expect(screen.queryByRole('dialog')).toBeNull()
  if (name === 'LoopOnboardingGate') expect(value.complete).toHaveBeenCalledOnce()
  view.unmount()
  render(createElement(component, value as never))
  expect(value.openLoopModule).toHaveBeenCalledOnce()
  cleanup()
  // A fresh renderer sees the durable presentation flag, even while signed out.
  vi.resetModules()
  const restarted = (await import('../loop-onboarding.tsx'))[name]
  render(createElement(restarted, value as never))
  expect(value.openLoopModule).toHaveBeenCalledOnce()
 })
 it(`${name} waits for the persisted connection and skips an existing login`, async () => {
  const component = (await import('../loop-onboarding.tsx'))[name]
  const value = props()
  let page = {screen: 'loading', connection: {state: 'signed_out'}}
  value.useGlobalPage = select => select(page)
  const view = render(createElement(component, value as never))
  expect(value.openLoopModule).not.toHaveBeenCalled()
  page = {screen: 'ready', connection: {state: 'signed_in'}}
  view.rerender(createElement(component, value as never))
  expect(value.openLoopModule).not.toHaveBeenCalled()
  page = {screen: 'ready', connection: {state: 'signed_out'}}
  view.rerender(createElement(component, value as never))
  expect(value.openLoopModule).not.toHaveBeenCalled()
 })
}
it('still opens login once when browser storage is unavailable', async () => {
 vi.mocked(localStorage.getItem).mockImplementation(() => { throw new Error('blocked') })
 const {LoopDesktopOnboarding} = await import('../loop-onboarding.tsx')
 const value = props()
 const view = render(createElement(LoopDesktopOnboarding, value as never))
 expect(value.openLoopModule).toHaveBeenCalledOnce()
 view.unmount()
 render(createElement(LoopDesktopOnboarding, value as never))
 expect(value.openLoopModule).toHaveBeenCalledOnce()
})

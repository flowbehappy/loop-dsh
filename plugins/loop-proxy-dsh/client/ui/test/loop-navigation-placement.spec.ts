// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'
import { createElement, useSyncExternalStore } from 'react'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { LoopBottomMenu } from '../loop-bottom-menu.tsx'
import { en } from '../locales.ts'
import {
  LOOP_PROJECTS_PANEL_ID,
} from '../loop-navigation.ts'
import { LoopMoreMenu } from '../loop-panels.tsx'
import { LoopSettingsAccess } from '../settings-access.ts'
import { INITIAL_GLOBAL_PAGE_STATE, LoopGlobalPageController } from '../global-page-controller.ts'
import { createSnapshotStore } from '../store.ts'
import type { LoopHostClient } from '../types.ts'

function translate(key: keyof typeof en): string {
  return en[key]
}

function observable<T>(value: T): HostObservable<T> {
  return {
    getSnapshot: () => value,
    subscribe: () => () => {},
  }
}

function hookFor<T>(source: HostObservable<T>) {
  return (selector: (value: T) => unknown) => useSyncExternalStore(
    source.subscribe,
    () => selector(source.getSnapshot()),
  )
}

function bottomMenuProps() {
  return {
    signIn: vi.fn(),
    useGlobalPage: hookFor(observable(INITIAL_GLOBAL_PAGE_STATE)),
    contactUs: vi.fn(),
    openSettings: vi.fn(),
    settingsAccess: new LoopSettingsAccess(),
    wide: true,
    settingsOpen: false,
    settingsShortcut: {keys: ['⌘', ',']},
    t: translate,
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Super Agent navigation placement', () => {
  it('opens immediately and keeps exactly the native three menu entries in order', () => {
    const props = bottomMenuProps()
    render(createElement(LoopBottomMenu, props as never))
    fireEvent.click(screen.getByRole('button', {name: en['launcher.open']}))
    expect(screen.getAllByRole('menuitem').map(row => row.textContent)).toEqual([
      'Settings⌘,', 'Feedback', 'Sign in',
    ])
    expect(props.signIn).not.toHaveBeenCalled()
    expect(props.openSettings).not.toHaveBeenCalled()
    expect(props.contactUs).not.toHaveBeenCalled()
  })

  it.each([
    ['launcher.settings', 'openSettings'],
    ['launcher.feedback', 'contactUs'],
    ['launcher.signIn', 'signIn'],
  ] as const)('routes %s to its owner and closes the menu', (label, action) => {
    const props = bottomMenuProps()
    render(createElement(LoopBottomMenu, props as never))
    fireEvent.click(screen.getByRole('button', {name: en['launcher.open']}))
    fireEvent.click(screen.getByRole('menuitem', {name: en[label]}))
    expect(props[action]).toHaveBeenCalledOnce()
    for (const other of ['signIn', 'contactUs', 'openSettings'] as const) {
      if (other !== action) expect(props[other]).not.toHaveBeenCalled()
    }
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('shows the signed-in account and workspace in the same menu entry', () => {
    const props = bottomMenuProps()
    const page = createSnapshotStore(INITIAL_GLOBAL_PAGE_STATE)
    function Launcher() {
      return createElement(LoopBottomMenu, {...props, useGlobalPage: hookFor(page)} as never)
    }
    render(createElement(Launcher))
    const trigger = screen.getByRole('button', {name: en['launcher.open']})
    fireEvent.click(trigger)
    expect(screen.getByRole('menuitem', {name: en['launcher.signIn']})).toBeTruthy()

    act(() => page.set({...INITIAL_GLOBAL_PAGE_STATE, connection: {
      state: 'signed_in', accountName: 'Lin', workspaceName: 'Team Space',
    }}))
    expect(screen.queryByRole('menuitem', {name: en['launcher.signIn']})).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', {name: 'Lin · Team Space'}))
    expect(props.signIn).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()

    act(() => page.set({...INITIAL_GLOBAL_PAGE_STATE, connection: {state: 'signed_out'}}))
    fireEvent.click(trigger)
    expect(screen.getByRole('menuitem', {name: en['launcher.signIn']})).toBeTruthy()
  })

  it('supports repeated opening, Escape and the collapsed sidebar', () => {
    const props = {...bottomMenuProps(), wide: false}
    render(createElement(LoopBottomMenu, props as never))
    const trigger = screen.getByRole('button', {name: en['launcher.open']})
    expect(trigger.textContent).toBe('')
    for (let attempt = 0; attempt < 3; attempt++) {
      fireEvent.click(trigger)
      expect(screen.getAllByRole('menuitem')).toHaveLength(3)
      fireEvent.keyDown(screen.getByRole('menu'), {key: 'Escape'})
      expect(screen.queryByRole('menu')).toBeNull()
    }
  })

  it('opens every secondary Loop module even when it has no resident sidebar entry', () => {
    const onDismiss = vi.fn()
    const onOpen = vi.fn()
    const openModule = vi.fn()
    render(createElement(LoopMoreMenu, {
      usePanelInfo: hookFor(observable({activePanelId: LOOP_PROJECTS_PANEL_ID})),
      onOpen,
      openModule,
      onDismiss,
      onPinnedChange: vi.fn(),
      entries: [],
      t: translate,
    } as never))

    const destinations = [
      ['module.inbox', 'loop-inbox'],
      ['module.contacts', 'loop-contacts'],
      ['module.projects', LOOP_PROJECTS_PANEL_ID],
      ['module.workflows', 'loop-workflows'],
      ['module.knowledge', 'loop-knowledge'],
      ['module.drive', 'loop-drive'],
      ['module.dataspaces', 'loop-dataspaces'],
      ['module.capabilities', 'loop-capabilities'],
      ['module.connectors', 'loop-connectors'],
    ] as const
    expect(screen.getAllByRole('menuitem').map(row => row.textContent)).toEqual(
      destinations.map(([key]) => en[key]),
    )
    expect(onOpen).not.toHaveBeenCalled()
    expect(openModule).not.toHaveBeenCalled()
    expect(onDismiss).not.toHaveBeenCalled()
    expect(screen.queryByRole('menuitem', {name: en['module.tasks']})).toBeNull()

    for (const [key, panelId] of destinations) {
      fireEvent.click(screen.getByRole('menuitem', {name: en[key]}))
      expect(openModule).toHaveBeenCalledExactlyOnceWith(
        panelId, panelId === LOOP_PROJECTS_PANEL_ID ? 'home' : 'resume',
      )
      expect(onOpen).not.toHaveBeenCalled()
      expect(onDismiss).toHaveBeenCalledOnce()
      expect(onDismiss.mock.invocationCallOrder[0]).toBeLessThan(openModule.mock.invocationCallOrder[0])
      openModule.mockClear()
      onDismiss.mockClear()
    }
  })

  it('returns from a project detail to the workspace list and allows selecting another project', async () => {
    const origin = 'https://loop.test'
    const url = origin + '/external-host/page-login'
    const controller = new LoopGlobalPageController({
      globalServerStatus: async () => ({ok: true, value: {serverUrl: origin, serverRevision: 'rev-1'}}),
      globalPage: async () => ({ok: true, value: {url}}),
    } as unknown as LoopHostClient)
    try {
      await controller.open()
      const postMessage = vi.fn()
      const frame = {postMessage} as unknown as Window
      controller.attachWorkspacePage(frame, url)
      const init = postMessage.mock.calls[0][0]
      const selectProject = (path: string) => window.dispatchEvent(new MessageEvent('message', {
        origin, source: frame,
        data: {channel: init.channel, nonce: init.nonce, revision: init.revision, type: 'route', path},
      }))
      const projects = '/w/wsp_current/projects'
      const firstDetail = projects + '/prj_a/tasks?tab=mine'
      selectProject(firstDetail)
      const frameKey = controller.store.getSnapshot().frameKey
      render(createElement(LoopMoreMenu, {
        usePanelInfo: hookFor(observable({activePanelId: LOOP_PROJECTS_PANEL_ID})),
        onDismiss: vi.fn(),
        openModule: controller.openModule.bind(controller),
        t: translate,
      } as never))
      expect(controller.store.getSnapshot().activePath).toBe(firstDetail)
      fireEvent.click(screen.getByRole('menuitem', {name: en['module.projects']}))
      expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({type: 'navigate', path: projects}), origin)
      expect(controller.store.getSnapshot().activePath).toBe(projects)
      selectProject(projects + '/prj_b')
      await controller.openModule('loop-knowledge')
      await controller.openModule(LOOP_PROJECTS_PANEL_ID)
      expect(controller.store.getSnapshot()).toMatchObject({activePath: projects + '/prj_b', frameKey})
    } finally {
      controller.dispose()
    }
  })
})

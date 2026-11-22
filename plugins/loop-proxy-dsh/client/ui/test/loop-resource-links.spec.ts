import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { MarkdownDelegateProvider, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { LoopGlobalPageController } from '../global-page-controller.ts'
import { registerLoopResourceLinks } from '../loop-resource-links.ts'
import type { LoopHostClient } from '../types.ts'

const origin = 'https://loop.test'
const pageUrl = `${origin}/external-host/page-login`
const disposers: Array<() => void> = []

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  cleanup()
  vi.restoreAllMocks()
})

async function setup() {
  const controller = new LoopGlobalPageController({
    globalServerStatus: async () => ({ok: true, value: {
      serverUrl: origin, serverRevision: 'rev-1',
    }}),
    globalPage: async () => ({ok: true, value: {url: pageUrl}}),
  } as unknown as LoopHostClient)
  await controller.open()
  disposers.push(() => controller.dispose())
  const selectPanel = vi.fn((panelId: string) => { void controller.openModule(panelId) })
  const dispose = registerLoopResourceLinks(document, href => {
    const panelId = controller.openResourceLink(href)
    if (panelId === null) return false
    selectPanel(panelId)
    return true
  })
  disposers.push(dispose)
  return {controller, selectPanel, dispose}
}

function markdown(path: string, openExternalLink = vi.fn()) {
  render(createElement(MarkdownDelegateProvider, {openExternalLink},
    createElement(MarkdownText, {text: `[resource](${origin}${path})`})))
  return {link: screen.getByRole('link', {name: /resource/}), openExternalLink}
}

describe('Loop resource link integration', () => {
  it('opens the exact Markdown document in its panel before the host external-link handler', async () => {
    const {controller, selectPanel} = await setup()
    const postMessage = vi.fn()
    controller.attachWorkspacePage({postMessage} as unknown as Window, pageUrl)
    const page = controller.store.getSnapshot().page
    const frameKey = controller.store.getSnapshot().frameKey
    const path = '/w/ws_1/kb/kb_1/documents/doc_1?mode=read#section-2'
    const {link, openExternalLink} = markdown(path)
    fireEvent.click(link)
    expect(selectPanel).toHaveBeenCalledExactlyOnceWith('loop-knowledge')
    expect(openExternalLink).not.toHaveBeenCalled()
    expect(controller.store.getSnapshot()).toMatchObject({activePath: path, frameKey})
    expect(controller.store.getSnapshot().page).toBe(page)
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      channel: 'loop.global-page.v2', type: 'navigate', path,
      nonce: expect.any(String), revision: 'rev-1',
    }), origin)
    await controller.openModule('loop-tasks')
    await controller.openModule('loop-knowledge')
    expect(controller.store.getSnapshot().activePath).toBe(path)
  })

  it('retains a task destination until the iframe mounts, and supports dynamic native anchors', async () => {
    const {controller, selectPanel} = await setup()
    const path = '/w/ws_1/tasks/by-id/task_1?tab=activity#reply'
    render(createElement('a', {href: origin + path, target: '_blank'}, createElement('span', null, 'task')))
    fireEvent.click(screen.getByText('task'))
    expect(selectPanel).toHaveBeenCalledExactlyOnceWith('loop-tasks')
    const postMessage = vi.fn()
    controller.attachWorkspacePage({postMessage} as unknown as Window, pageUrl)
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({type: 'init', path}), origin)
  })

  it('leaves unknown links and links after plugin disposal to the original host', async () => {
    const {controller, selectPanel, dispose} = await setup()
    const external = vi.fn()
    markdown('/login', external)
    fireEvent.click(screen.getByRole('link'))
    expect(external).toHaveBeenCalledExactlyOnceWith(origin + '/login')
    expect(selectPanel).not.toHaveBeenCalled()
    cleanup()
    dispose()
    const {link} = markdown('/tasks/by-id/task_1', external)
    fireEvent.click(link)
    expect(external).toHaveBeenLastCalledWith(origin + '/tasks/by-id/task_1')
    expect(controller.store.getSnapshot().activePath).toBe('/tasks/views/related-to-me')
  })

  it.each([
    {ctrlKey: true}, {metaKey: true}, {shiftKey: true}, {altKey: true}, {button: 1},
  ])('preserves the browser gesture %j', async gesture => {
    const {selectPanel} = await setup()
    const {link} = markdown('/kb/k/documents/d')
    // Prevent jsdom navigation after observing whether plugin capture consumed it.
    const defaultPrevented: boolean[] = []
    link.addEventListener('click', event => { defaultPrevented.push(event.defaultPrevented); event.preventDefault() })
    fireEvent.click(link, gesture)
    expect(selectPanel).not.toHaveBeenCalled()
    expect(defaultPrevented).toEqual([false])
  })

  it('supports keyboard activation and respects an already cancelled click', async () => {
    const {selectPanel} = await setup()
    const {link, openExternalLink} = markdown('/tasks/by-id/task_1')
    const cancelled = new MouseEvent('click', {bubbles: true, cancelable: true})
    cancelled.preventDefault()
    link.dispatchEvent(cancelled)
    expect(selectPanel).not.toHaveBeenCalled()
    expect(openExternalLink).toHaveBeenCalledOnce()
    openExternalLink.mockClear()
    fireEvent.click(link, {detail: 0})
    expect(selectPanel).toHaveBeenCalledExactlyOnceWith('loop-tasks')
    expect(openExternalLink).not.toHaveBeenCalled()
  })

  it.each([{download: ''}, {target: 'named-window'}])('preserves explicit anchor behavior %j', async attributes => {
    const {selectPanel} = await setup()
    const original = vi.fn(event => event.preventDefault())
    render(createElement('a', {href: origin + '/files/f', ...attributes, onClick: original}, 'file'))
    fireEvent.click(screen.getByRole('link'))
    expect(selectPanel).not.toHaveBeenCalled()
    expect(original).toHaveBeenCalledOnce()
  })

  it('does not consume navigation without a usable current page session', async () => {
    const {controller, selectPanel} = await setup()
    const ready = controller.store.getSnapshot()
    const {link, openExternalLink} = markdown('/kb/k/documents/d')
    for (const state of [
      {...ready, page: null}, {...ready, screen: 'loading' as const},
      {...ready, serverBusy: true}, {...ready, serverRevision: ''},
      {...ready, connection: {state: 'signing_out' as const}},
      {...ready, serverUrl: 'https://other.test'},
    ]) {
      controller.store.set(state)
      fireEvent.click(link)
    }
    expect(selectPanel).not.toHaveBeenCalled()
    expect(openExternalLink).toHaveBeenCalledTimes(6)
  })
})

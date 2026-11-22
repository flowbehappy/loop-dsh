// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest'
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {createElement, Fragment, useSyncExternalStore} from 'react'
import {CollaborationDock, CollaborationOverlay} from '../collaboration-dock.tsx'
import type {CollaborationUiState} from '../collaboration-runtime.ts'
import {createSnapshotStore} from '../store.ts'
import {en} from '../locales.ts'

afterEach(() => { cleanup(); document.body.innerHTML = '' })

it('does not label completed task history as ongoing work beside the input', () => {
  const state = {
    screen: 'ready', notice: null,
    status: {state: 'ready', scope: {boardName: 'Product'}, active: [
      {taskId: 'done', state: 'completed'},
      {taskId: 'canceled', state: 'canceled'},
    ]},
  } as unknown as CollaborationUiState
  const store = createSnapshotStore(state)
  render(createElement(CollaborationDock, {
    useCollaboration: (select: (value: CollaborationUiState) => unknown) => useSyncExternalStore(store.subscribe, () => select(store.getSnapshot())),
    runtime: {}, t: (key: keyof typeof en) => en[key],
  } as never))
  expect(screen.getByRole('button', {name: en['collab.status.details']}).textContent).toBe(en['collab.status.ready'])
})

it('keeps optional device setup out of chat status and opens the native Task', async () => {
  const input = document.createElement('textarea')
  document.body.append(input)
  const state: CollaborationUiState = {
    screen: 'ready', error: null, boards: [], boardsRevision: '', selectedBoardId: '',
    shareScope: {scope: 'task-description', resourceRefs: [], expandedAudience: false},
    sharePreview: null, shareTargetNames: [], overlay: 'closed', reference: null,
    busy: null, notice: null, pendingIntent: false,
    continuation: {state: 'idle', taskCount: 0, taskIds: []},
    status: {
      state: 'ready', active: [{taskId: 'task_a', taskTitle: 'Draft review', state: 'running', nextAction: 'wait', taskStatus: 'in_progress'}],
      deliveries: [], scope: {workspaceId: 'workspace'}, worksite: {state: 'needs_enable'},
    } as CollaborationUiState['status'],
  }
  const store = createSnapshotStore(state)
  const runtime = {
    store,
    openDetails: vi.fn(() => store.set({...state, overlay: 'details'})),
    closeOverlay: () => store.set(state),
    openTask: vi.fn(),
  }
  const t = (key: keyof typeof en) => en[key]
  render(createElement(Fragment, null, createElement(CollaborationDock, {
    useCollaboration: (select: (value: CollaborationUiState) => unknown) => useSyncExternalStore(store.subscribe, () => select(store.getSnapshot())),
    runtime, t,
  } as never), createElement(CollaborationOverlay, {runtime, focusComposer: () => input.focus(), t} as never)))
  expect(screen.getByRole('button', {name: en['collab.status.details']}).textContent).toBe(en['collab.status.ready'])
  fireEvent.click(screen.getByRole('button', {name: en['collab.status.details']}))
  await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
  expect(screen.getByText('Draft review')).toBeTruthy()
  expect(screen.getByText(en['collab.dialog.deliveryTitle']).closest('details')?.open).toBe(false)
  fireEvent.click(screen.getByRole('button', {name: en['collab.dialog.openTask']}))
  expect(runtime.openTask).toHaveBeenCalledWith('workspace', 'task_a')
  expect(screen.queryByRole('button', {name: en['collab.dialog.answerInChat']})).toBeNull()

})

it('shows first-message share confirmation without mounting a conversation dock', async () => {
  const state = {
    screen: 'ready', error: null, overlay: 'share', notice: null, busy: null,
    shareScope: {scope: 'task-description', resourceRefs: [], expandedAudience: false},
    sharePreview: {targetIds: ['agt_researcher'], resourceRefs: []}, shareTargetNames: ['Researcher'],
    pendingIntent: true,
  } as unknown as CollaborationUiState
  const store = createSnapshotStore(state)
  const confirmShare = vi.fn(() => store.set({...state, overlay: 'closed'}))
  const runtime = {store, confirmShare, closeOverlay: () => store.set({...state, overlay: 'closed'})}
  render(createElement(CollaborationOverlay, {runtime, focusComposer: () => {}, t: (key: keyof typeof en) => en[key]} as never))
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(screen.getByText('Researcher')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', {name: en['collab.dialog.shareConfirm']}))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(confirmShare).toHaveBeenCalledOnce()
})

it('shows current native Task state independently from acceptance and removes unavailable Task content', async () => {
  const state = {
    screen: 'ready', error: null, overlay: 'details', notice: null, busy: null,
    continuation: {state: 'idle', taskCount: 0, taskIds: []},
    status: {state: 'ready', scope: {workspaceId: 'workspace', boardName: 'Product'}, deliveries: [], active: [
      {taskId: 'native', taskTitle: 'Review evidence', state: 'completed', taskStatus: 'done', taskAvailable: true, acceptanceState: 'accepted', runId: ''},
    ]},
  } as unknown as CollaborationUiState
  const store = createSnapshotStore(state)
  const openTask = vi.fn()
  const runtime = {store, openTask, closeOverlay: vi.fn()}
  render(createElement(CollaborationOverlay, {runtime, focusComposer: () => {}, t: (key: keyof typeof en) => en[key]} as never))
  expect(screen.getByText(en['collab.task.done'])).toBeTruthy()
  expect(screen.getByText(en['collab.task.accepted'])).toBeTruthy()
  expect(screen.queryByRole('button', {name: en['collab.dialog.cancel']})).toBeNull()
  fireEvent.click(screen.getByRole('button', {name: en['collab.dialog.openTask']}))
  expect(openTask).toHaveBeenCalledWith('workspace', 'native')
  const changeTask = (changes: Record<string, unknown>) => {
    const current = store.getSnapshot()
    store.set({...current, status: {...current.status!, active: [{...current.status!.active[0], ...changes}]}})
  }
  await act(async () => changeTask({state: 'accepted', taskStatus: 'todo'}))
  expect(screen.getByText(en['collab.task.todo'])).toBeTruthy()
  expect(screen.queryByText(en['collab.task.done'])).toBeNull()
  await act(async () => changeTask({state: 'blocked', taskAvailable: false}))
  expect(screen.getByText(en['collab.task.unavailable'])).toBeTruthy()
  expect(screen.queryByText('Review evidence')).toBeNull()
  expect(screen.queryByText(en['collab.task.accepted'])).toBeNull()
  expect(screen.queryByRole('button', {name: en['collab.dialog.openTask']})).toBeNull()
})

it('keeps execution and delivery facts distinct from the current Task and exposes a recovery gap', async () => {
  const state = {
    screen: 'ready', error: null, overlay: 'details', notice: null, busy: null,
    continuation: {state: 'idle', taskCount: 0, taskIds: []},
    status: {state: 'ready', active: [
      {taskId: 'legacy', taskTitle: 'Review', runId: 'run_1', state: 'running', taskStatus: 'done', acceptanceState: 'accepted'},
    ], deliveries: [], deliveryGap: {afterEventSeq: 2, retainedFromEventSeq: 8, reason: 'event_history_expired'}},
  } as unknown as CollaborationUiState
  const store = createSnapshotStore(state)
  const t = (key: keyof typeof en, values?: Record<string, string>) => en[key].replace('{status}', values?.status ?? '')
  render(createElement(CollaborationOverlay, {runtime: {store, closeOverlay: vi.fn()}, focusComposer: () => {}, t} as never))
  expect(screen.getByText(en['collab.task.done'])).toBeTruthy()
  expect(screen.getByText(en['collab.task.accepted'])).toBeTruthy()
  expect(screen.queryByText(t('collab.task.execution', {status: en['collab.state.running']}))).toBeNull()
  fireEvent.click(screen.getByText(en['collab.dialog.deliveryTitle']))
  expect(screen.getByText(en['collab.task.deliveryGap'])).toBeTruthy()
})

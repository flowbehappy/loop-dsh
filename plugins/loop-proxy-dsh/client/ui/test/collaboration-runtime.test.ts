import test from 'node:test'
import assert from 'node:assert/strict'
import type {
  CandidateRequest,
  ClientSessionContext,
  InputTriggerSource,
} from '@deepseek-ai/dsh-client-ui-input-trigger/client'

import {
  CollaborationRuntime,
  type CollaborationPendingSubmission,
} from '../collaboration-runtime.ts'
import {
  collaborationDigest,
  encodeCollaborationReference,
} from '../collaboration-reference.ts'
import { LoopUiController } from '../controller.ts'
import type {
  CollaborationDirectoryResult,
  CollaborationStatus,
  LoopHostClient,
} from '../types.ts'

const sessionId = 'ses_alpha'
const workspace = {
  workspaceId: 'wsp_local',
  path: '/tmp/work',
  displayTitle: 'Work',
}
const scope = {
  serverBaseUrl: 'https://loop.test',
  workspaceId: 'wsp_loop',
  workspaceName: 'Team',
  accountId: 'usr_alice',
  installationId: 'ins_1',
  coordinatorAgentId: 'agt_coord',
  coordinatorAgentName: 'Coordinator',
  bindingId: 'cbind_1',
  bindingRevision: 'rev-binding-1',
  bindingEpoch: 'epoch-1',
  projectId: 'prj_1',
  projectName: 'Release',
  boardId: 'brd_1',
  boardName: 'Delivery',
}
const capability = {
  available: true,
  delegable: true,
  notifiable: true,
  conditionalNotify: true,
  respond: true,
  followup: true,
  review: true,
  cancel: true,
}
const status: CollaborationStatus = {
  state: 'ready',
  scope,
  capability,
  subscription: {
    state: 'live',
    subscriptionId: 'sub_1',
    lastEventSeq: 1,
    snapshotRequired: false,
  },
  active: [],
  deliveries: [],
}
const questionWork = {
  taskId: 'tsk_research',
  taskTitle: '国内资料',
  taskRevision: '7',
  runId: 'run_question',
  attempt: 1,
  executionGeneration: 1,
  state: 'waiting',
  nextAction: 'answer-question' as const,
  questionId: 'question_1',
  resultUnknown: false,
}
const resultWork = {
  taskId: 'tsk_research',
  taskTitle: '国内资料',
  taskRevision: '8',
  runId: 'run_result',
  attempt: 1,
  executionGeneration: 1,
  state: 'succeeded',
  nextAction: 'review-result' as const,
  resultUnknown: false,
}
const directory: CollaborationDirectoryResult = {
  entries: [
    {
      targetId: 'agt_research',
      targetType: 'agent',
      displayName: '研究员',
      description: '资料检索',
      stableRef: 'agent:agt_research',
      visible: true,
      notifiable: false,
      delegable: true,
      needsAccess: false,
      capability,
      workspaceName: 'Team',
      projectName: 'Release',
      revision: 'rev-dir-1',
    },
    {
      targetId: 'mem_zhang',
      targetType: 'human',
      displayName: '张三',
      stableRef: 'human:mem_zhang',
      visible: true,
      notifiable: true,
      delegable: false,
      needsAccess: false,
      capability,
      workspaceName: 'Team',
      revision: 'rev-dir-1',
    },
    {
      targetId: 'mem_private',
      targetType: 'human',
      displayName: '受限成员',
      stableRef: 'human:mem_private',
      visible: true,
      notifiable: false,
      delegable: false,
      needsAccess: true,
      capability: { ...capability, available: false },
      revision: 'rev-dir-1',
    },
  ],
  revision: 'rev-dir-1',
  freshness: 'live',
  cacheKey: 'scope:agents-humans',
}

function harness(
  remoteOverrides: Partial<LoopHostClient> = {},
  initialPending: CollaborationPendingSubmission[] = [],
  runtimeOptions: {
    readonly catalogEvents?: (
      sessionId: string,
      signal: AbortSignal,
    ) => AsyncIterable<import('../types.ts').SkillCatalogEventFrame>
    readonly openWorksiteSetup?: (value: NonNullable<CollaborationStatus['scope']>) => void
  } = {},
) {
  let pending: CollaborationPendingSubmission[] = [...initialPending]
  const listeners = new Set<() => void>()
  let source: InputTriggerSource | null = null
  const notifications: string[] = []
  const openedBindings: string[] = []
  const remote = {
    status: async () => ({
      ok: true,
      value: {
        state: 'active',
        revision: 'binding-1',
        workspace,
        loop: {
          serviceBaseUrl: 'https://loop.test',
          workspaceId: 'wsp_loop',
          projectId: 'prj_1',
          defaultChannelId: 'chn_1',
          workspaceName: 'Team',
          projectName: 'Release',
          webUrl: 'https://loop.test/w/wsp_loop/projects/prj_1/tasks',
        },
        agent: { id: 'agt_coord', displayName: 'Coordinator' },
      },
    }),
    collaborationStatus: async () => ({ ok: true, value: status }),
    collaborationDirectory: async () => ({ ok: true, value: directory }),
    prepareCollaborationIntent: async () => ({
      ok: true,
      value: {
        intentRef: 'intent_1',
        payloadDigest: `sha256:${'0'.repeat(64)}`,
        state: 'prepared',
        expiresAt: '2026-11-08T01:05:00Z',
        sharePreview: {
          scope: 'task-description',
          resourceRefs: [],
          targetIds: ['agt_research'],
          firstExpansion: false,
        },
      },
    }),
    cancelCollaborationIntent: async () => ({
      ok: true,
      value: {
        state: 'not-dispatched',
      },
    }),
    bindCollaborationIntent: async () => ({
      ok: true,
      value: {
        intentRef: 'intent_1',
        state: 'bound',
        boundAt: '2026-11-08T01:00:00Z',
      },
    }),
    ...remoteOverrides,
  } as unknown as LoopHostClient
  const sessions = {
    binding: () => ({
      session: {
        getSnapshot: () => ({ pendingSubmissions: pending }),
        subscribe(listener: () => void) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      },
    }),
  }
  const runtime = new CollaborationRuntime({
    remote,
    sessions,
    workspaceForSession: () => workspace,
    openBinding: workspaceRef => openedBindings.push(workspaceRef.workspaceId),
    openLoopProject: () => {},
    ...runtimeOptions,
    openTask: () => true,
    ...runtimeOptions,
  })
  runtime.registerSource({
    registerSource(value) {
      source = value
      return () => {}
    },
  } as never,
  type => type === 'agent' ? 'Loop agents' : 'Loop colleagues',
  failure => failure.message,
  {
    delegate: 'delegate',
    notify: 'notify',
    needsAccess: 'Needs access',
    unavailable: 'No collaboration action is available',
  })
  assert.ok(source)
  const request = (query = ''): CandidateRequest => ({
    query,
    position: 'leading',
    drilled: false,
    signal: new AbortController().signal,
  })
  const clientSession = { sessionId } as unknown as ClientSessionContext
  return {
    runtime,
    remote,
    source: source!,
    request,
    clientSession,
    notifications,
    openedBindings,
    acceptSubmission(next: CollaborationPendingSubmission[]) {
      // Installed 0.2.2 publishes only Host-accepted echoes in this snapshot.
      pending = next
      for (const listener of listeners) listener()
    },
  }
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 40; index += 1) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  assert.fail('condition did not settle')
}

test('React-detached dialog handlers close and open the canonical first-bind flow', async () => {
  const openedBindings: string[] = []
  const firstRunStatus: CollaborationStatus = {
    state: 'needs-auth',
    capability,
    subscription: {
      state: 'stopped',
      subscriptionId: '',
      lastEventSeq: 0,
      snapshotRequired: false,
    },
    active: [],
    deliveries: [],
    reason: 'Loop authorization is required',
  }
  const remote = {
    status: async () => ({
      ok: true,
      value: {
        state: 'needs_auth',
        revision: 'binding-1',
        workspace,
      },
    }),
    beginBind: async () => ({
      ok: true,
      value: {
        state: 'needs_auth',
        binding: {
          state: 'needs_auth',
          revision: 'binding-1',
          workspace,
        },
        challenge: {
          id: 'challenge-first-run',
          loginUrl: 'https://loop.test/login/first-run',
          expiresAt: '2026-11-08T02:00:00Z',
        },
      },
    }),
    collaborationStatus: async () => ({ ok: true, value: firstRunStatus }),
  } as unknown as LoopHostClient
  const controller = new LoopUiController({
    remote,
    openExternal: () => true,
  })
  const runtime = new CollaborationRuntime({
    remote,
    sessions: {
      binding: () => ({
        session: {
          getSnapshot: () => ({ pendingSubmissions: [] }),
          subscribe: () => () => {},
        },
      }),
    },
    workspaceForSession: () => workspace,
    openBinding: (workspaceRef, session) => {
      openedBindings.push(`${workspaceRef.workspaceId}:${session}`)
      void controller.openWorkspace(workspaceRef, 'bind', session)
    },
    openLoopProject: () => {},
    openTask: () => true,
  })
  const sessionRuntime = runtime.forSession(sessionId)

  await sessionRuntime.openDetails()
  const closeFromReact = sessionRuntime.closeOverlay
  closeFromReact()
  assert.equal(sessionRuntime.store.getSnapshot().overlay, 'closed')

  await sessionRuntime.openDetails()
  const connectFromReact = sessionRuntime.openExistingBindingForSession
  connectFromReact()
  assert.equal(sessionRuntime.store.getSnapshot().overlay, 'closed')
  assert.deepEqual(openedBindings, [])

  await waitUntil(() => controller.store.getSnapshot().challengeId !== null)
  assert.deepEqual(openedBindings, [`${workspace.workspaceId}:${sessionId}`])
  assert.equal(controller.store.getSnapshot().screen, 'binding')
  assert.equal(controller.store.getSnapshot().loginUrl, 'https://loop.test/login/first-run')

  const openLoopFromReact = sessionRuntime.openLoopProject
  openLoopFromReact()
  const confirmShareFromReact = sessionRuntime.confirmShare
  assert.doesNotThrow(confirmShareFromReact)
})

test('offline collaboration is visible and its detached reconnect action is not a no-op', async () => {
  const h = harness()
  h.remote.collaborationStatus = async () => {
    throw new Error('offline')
  }
  const sessionRuntime = h.runtime.forSession(sessionId)

  await sessionRuntime.openDetails()

  assert.equal(sessionRuntime.store.getSnapshot().screen, 'error')
  assert.equal(
    sessionRuntime.store.getSnapshot().error?.code,
    'loop-collaboration/server-unavailable',
  )
  const reconnectFromReact = sessionRuntime.openExistingBindingForSession
  reconnectFromReact()
  await waitUntil(() => h.openedBindings.length === 1)
  assert.deepEqual(h.openedBindings, [workspace.workspaceId])
  assert.equal(sessionRuntime.store.getSnapshot().overlay, 'closed')
})

test('worksite status changes arrive through the existing collaboration push without polling', async () => {
  let statusCalls = 0
  let openedWorksite = ''
  const h = harness({
    async collaborationStatus() {
      statusCalls += 1
      return {
        ok: true,
        value: {
          ...status,
          worksite: {state: statusCalls === 1 ? 'connecting' : 'needs_enable'},
        },
      }
    },
    async *collaborationEvents() {
      yield {
        type: 'ready',
        sequence: 0,
        subscription: status.subscription,
        status: {...status, worksite: {state: 'connecting'}},
      }
      await new Promise(resolve => setTimeout(resolve, 0))
      yield {
        type: 'change',
        sequence: 1,
        event: {
          eventId: 'worksite-connected-1',
          kind: 'subscription.changed',
          occurredAt: new Date().toISOString(),
          status: {state: 'changed'},
          worksite: {state: 'needs_enable'},
        },
      }
    },
  }, [], {
    openWorksiteSetup(scope) {
      openedWorksite = `${scope.serverBaseUrl}|${scope.workspaceId}`
    },
  })
  const sessionRuntime = h.runtime.forSession(sessionId)
  await sessionRuntime.openDetails()
  await waitUntil(() => sessionRuntime.store.getSnapshot().status?.worksite?.state === 'needs_enable')
  assert.equal(sessionRuntime.store.getSnapshot().status?.worksite?.state, 'needs_enable')
  sessionRuntime.openWorksiteSetup()
  assert.equal(openedWorksite, 'https://loop.test|wsp_loop')
  sessionRuntime.dispose()
})

test('candidate discovery exposes scoped Agents and colleagues and picking is inert', async () => {
  const h = harness()
  const rows = await h.source.candidates(h.clientSession, h.request(''))
  assert.ok(rows.every(row => row.name === row.label))
  assert.deepEqual(rows.map(row => [row.label, row.section]), [
    ['研究员', 'Loop agents'],
    ['张三', 'Loop colleagues'],
    ['受限成员', 'Loop colleagues'],
  ])

  const outcome = h.source.onPick({
    candidate: rows[0]!,
    session: h.clientSession,
    position: 'leading',
    via: 'menu',
    action: 'pick',
    span: { start: 0, end: 1 },
  })
  assert.ok(outcome !== undefined && outcome !== 'handled' && 'insert' in outcome)
  assert.equal(outcome.insert.source, 'loop-collaboration')
  assert.deepEqual(h.notifications, [])
})

test('Human references remain inert and serialize without a share prompt', async () => {
  const h = harness()
  const runtime = h.runtime.forSession(sessionId)
  await runtime.warm()
  const human = directory.entries[1]!
  const picked = runtime.pickCandidate({
    candidate: {
      name: `loop-collaboration:human:${human.targetId}`,
      label: human.displayName,
      value: runtime.candidateValue(human),
    },
    session: h.clientSession,
    position: 'leading',
    via: 'menu',
    action: 'pick',
    span: {start: 0, end: 1},
  })
  assert.ok(picked !== undefined && picked !== 'handled' && 'insert' in picked)
  assert.deepEqual(h.notifications, [])

  const oldHuman = encodeCollaborationReference({
    version: 1,
    sessionId,
    targetId: human.targetId,
    targetType: 'human',
    stableRef: human.stableRef,
    displayName: human.displayName,
    bindingRevision: scope.bindingRevision,
  })
  const serialized = await runtime.serializeReference(oldHuman, new AbortController().signal)
  assert.ok(serialized.includes('human'))
  assert.notEqual(runtime.store.getSnapshot().overlay, 'share')
  assert.deepEqual(h.notifications, [])
})

test('warm loads separate Agent and colleague pages and a second menu open performs zero remote reads', async () => {
  let statusCalls = 0
  let directoryCalls = 0
  const h = harness({
    collaborationStatus: async () => {
      statusCalls += 1
      return {ok: true, value: status}
    },
    collaborationDirectory: async (_input, _signal) => {
      directoryCalls += 1
      return {ok: true, value: directory}
    },
  })
  h.source.warm?.(h.clientSession)
  await waitUntil(() => directoryCalls === 2)
  assert.equal(statusCalls, 1)
  await h.source.candidates(h.clientSession, h.request(''))
  await h.source.candidates(h.clientSession, h.request(''))
  assert.equal(statusCalls, 1)
  assert.equal(directoryCalls, 2)
})

test('browses all Agents and searches every matching page of each kind', async () => {
  const calls: string[] = []
  const h = harness({
    collaborationDirectory: async input => {
      const kind = input.kinds?.[0]
      const page = Number(input.cursor ?? '1')
      calls.push([kind, input.query, page].join(':'))
      const template = directory.entries[kind === 'agent' ? 0 : 1]!
      return {ok: true, value: {...directory, entries: [{
        ...template, targetId: template.targetId + page, displayName: 'Ada ' + kind + page,
      }], nextCursor: page < 4 ? String(page + 1) : ''}}
    },
  })
  const browse = await h.source.candidates(h.clientSession, h.request(''))
  assert.deepEqual(browse.map(row => row.label), ['Ada agent1', 'Ada agent2', 'Ada agent3', 'Ada agent4', 'Ada human1'])
  calls.length = 0
  const search = await h.source.candidates(h.clientSession, h.request('Ada'))
  assert.equal(search.length, 8)
  assert.deepEqual(calls.sort(), ['agent', 'human'].flatMap(kind =>
    [1, 2, 3, 4].map(page => [kind, 'Ada', page].join(':'))))
  h.runtime.dispose()
})

test('first explicit mention uses the uploaded workspace channel once without a project picker', async () => {
  let bound = false
  let binds = 0
  let reads = 0
  const h = harness({
    status: async () => ({ ok: true, value: {
      state: 'active', revision: 'channel-binding', workspace,
      loop: { serviceBaseUrl: 'https://loop.test', workspaceId: 'wsp_loop', projectId: '',
        defaultChannelId: 'chn_workspace', workspaceName: 'Team', projectName: '', webUrl: 'https://loop.test/channel' },
      agent: { id: 'agt_coord', displayName: 'Coordinator' },
    } }),
    collaborationStatus: async () => ({ ok: true, value: bound
      ? { ...status, scope: { ...scope, projectId: '', projectName: '', boardId: 'chn_workspace' } }
      : { ...status, state: 'unbound', scope: undefined } }),
    collaborationBind: async input => {
      binds += 1
      assert.equal(input.boardId, 'chn_workspace')
      assert.equal(input.workspaceId, 'wsp_loop')
      assert.equal(input.coordinatorAgentId, 'agt_coord')
      assert.equal(input.expectedRevision, undefined)
      bound = true
      return { ok: true, value: status }
    },
    collaborationDirectory: async () => {
      reads += 1
      return { ok: true, value: directory }
    },
  })
  const runtime = h.runtime.forSession(sessionId)
  await runtime.warm()
  assert.equal(binds, 0, 'passive warmup must not create a collaboration binding')
  const [first, concurrent] = await Promise.all([
    runtime.ensureDirectory('', new AbortController().signal),
    runtime.ensureDirectory('', new AbortController().signal),
  ])
  assert.equal(first[0]?.targetId, 'agt_research')
  assert.equal(concurrent[0]?.targetId, 'agt_research')
  await runtime.ensureDirectory('', new AbortController().signal)
  assert.equal(binds, 1)
  assert.equal(reads, 2, 'subsequent mentions reuse the scoped local catalog')
  assert.deepEqual(h.openedBindings, [])
  runtime.dispose()
})

test('an authorized but temporarily offline Agent remains selectable for execution-time recheck', async () => {
  const offlineAgent = {
    ...directory.entries[0]!,
    delegable: false,
    needsAccess: true,
    capability: {...directory.entries[0]!.capability, available: false},
  }
  const h = harness({
    collaborationDirectory: async () => ({
      ok: true,
      value: {...directory, entries: [offlineAgent]},
    }),
  })
  const rows = await h.source.candidates(h.clientSession, h.request(''))
  const outcome = h.source.onPick({
    candidate: rows[0]!,
    session: h.clientSession,
    position: 'leading',
    via: 'menu',
    action: 'pick',
    span: {start: 0, end: 1},
  })
  assert.ok(outcome !== undefined && outcome !== 'handled' && 'insert' in outcome)
  assert.equal(h.runtime.forSession(sessionId).store.getSnapshot().error, null)
})

test('one shared catalog event refreshes the next mention without polling', async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let gateReleased = false
  let catalogDelivered = false
  let statusCalls = 0
  let directoryCalls = 0
  const h = harness({
    collaborationStatus: async () => {
      statusCalls += 1
      return {ok: true, value: status}
    },
    collaborationDirectory: async () => {
      directoryCalls += 1
      return {ok: true, value: {...directory, entries: gateReleased
        ? [{...directory.entries[0]!, displayName: 'New Agent'}]
        : [directory.entries[0]!]}}
    },
  }, [], {
    catalogEvents: async function* () {
      await gate
      yield {
        type: 'change',
        event: {
          eventId: 'directory-event-1',
          kind: 'directory.changed',
          occurredAt: 'now',
          sessionId,
          workspaceId: 'wsp_loop',
          installationId: 'ins_1',
          accountId: 'usr_alice',
          serverBaseUrl: 'https://loop.test',
        },
      }
      catalogDelivered = true
      await new Promise<void>(resolve => setTimeout(resolve, 10))
    },
  })
  h.source.warm?.(h.clientSession)
  await waitUntil(() => directoryCalls === 2)
  gateReleased = true
  release()
  await waitUntil(() => catalogDelivered)
  assert.equal(directoryCalls, 2)
  const rows = await h.source.candidates(h.clientSession, h.request(''))
  assert.ok(rows.some(row => row.name === 'New Agent'))
  h.runtime.dispose()
  assert.equal(statusCalls, 1)
  assert.equal(directoryCalls, 4)
})

test('a stale connection status recovers through the existing workspace channel on the next mention', async () => {
  let reads = 0
  let binds = 0
  const restored = {...status, scope: {...scope, bindingId: 'cbind_new'}}
  const h = harness({
    collaborationStatus: async () => ({ok: true, value: ++reads === 1
      ? {...status, state: 'binding-conflict'}
      : binds === 0 ? {...status, state: 'unbound'} : restored}),
    status: async () => ({ok: true, value: {
      state: 'active', revision: 'binding-1', workspace,
      loop: {serviceBaseUrl: 'https://loop.test', workspaceId: 'wsp_loop',
        workspaceName: 'Team', projectId: '', projectName: '', defaultChannelId: 'chn_local',
        webUrl: 'https://loop.test/channel'},
      agent: {id: 'agt_coord', displayName: 'Coordinator'},
    }}),
    collaborationBind: async input => {
      binds++
      assert.equal(input.boardId, 'chn_local')
      assert.equal(input.coordinatorAgentId, 'agt_coord')
      return {ok: true, value: {scope: restored.scope, capability, subscription: status.subscription}}
    },
  })
  const runtime = h.runtime.forSession(sessionId)
  await runtime.refreshStatus()
  const entries = await runtime.ensureDirectory('', new AbortController().signal)
  assert.ok(entries.some(entry => entry.targetId === 'agt_research'))
  assert.equal(binds, 1)
  assert.equal(runtime.store.getSnapshot().status?.scope?.bindingId, 'cbind_new')
  h.runtime.dispose()
})

test('a replacement binding with the same epoch restarts the Session stream', async () => {
  let current = status
  let streams = 0
  let closed = 0
  const h = harness({
    collaborationStatus: async () => ({ok: true, value: current}),
    collaborationEvents: async function* (_input, signal) {
      streams++
      try {
        await new Promise<void>(resolve => {
          if (signal?.aborted) resolve()
          else signal?.addEventListener('abort', () => resolve(), {once: true})
        })
      } finally { closed++ }
    },
  })
  const runtime = h.runtime.forSession(sessionId)
  await runtime.refreshStatus()
  await waitUntil(() => streams === 1)
  current = {...status, scope: {...scope, bindingId: 'cbind_after_login'}}
  await runtime.refreshStatus(true)
  await waitUntil(() => streams === 2 && closed === 1)
  h.runtime.dispose()
})

test('one failed delivery leaves agent discovery and a new personal task submission available', async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const personal = {...status, scope: {...scope, projectId: '', projectName: ''}}
  const failedDelivery = {deliveryId: 'old-delivery', eventId: 'old-event',
    eventKind: 'collaboration.task_message', sessionId, taskId: 'old-task',
    state: 'binding-conflict' as const, payloadHash: 'sha256:old', receivedAt: 'now'}
  let delivered = false
  const h = harness({
    collaborationStatus: async () => ({ok: true, value: delivered
      ? {...personal, state: 'degraded', deliveries: [failedDelivery]} : personal}),
    collaborationEvents: async function* (_input, signal) {
      await gate
      delivered = true
      yield {type: 'change', sequence: 1, event: {
        eventId: 'failed-old-task', kind: 'delivery.changed', occurredAt: 'now',
        delivery: failedDelivery,
      }}
      await new Promise<void>(resolve => signal?.addEventListener('abort', () => resolve(), {once: true}))
    },
  })
  const runtime = h.runtime.forSession(sessionId)
  await runtime.ensureDirectory('', new AbortController().signal)
  release()
  await waitUntil(() => runtime.store.getSnapshot().status?.deliveries.length === 1)
  assert.equal(runtime.store.getSnapshot().status?.state, 'degraded')
  assert.equal(runtime.store.getSnapshot().status?.deliveries[0]?.state, 'binding-conflict')
  const entries = await runtime.ensureDirectory('', new AbortController().signal)
  assert.ok(entries.some(entry => entry.targetId === 'agt_research'))
  const pick = runtime.pickCandidate({candidate: {name: entries[0]!.displayName,
    value: runtime.candidateValue(entries[0]!)}, session: h.clientSession,
    position: 'leading', via: 'menu', action: 'pick', span: {start: 0, end: 1}})
  assert.ok(pick && pick !== 'handled' && 'insert' in pick)
  const serialized = await runtime.serializeReference(pick.insert.ref, new AbortController().signal)
  assert.match(serialized, /agt_research/)
  assert.equal(runtime.store.getSnapshot().status?.deliveries[0]?.state, 'binding-conflict')
  h.runtime.dispose()
})

test('share confirmation resolves the original serializer and binds one pending submission', async () => {
  const calls: unknown[] = []
  const pending: CollaborationPendingSubmission[] = []
  const h = harness({
    prepareCollaborationIntent: async input => {
      calls.push(['prepare', input])
      return {
        ok: true,
        value: {
          intentRef: 'intent_1',
          payloadDigest: input.payloadDigest,
          state: 'prepared',
          expiresAt: '2026-11-08T01:05:00Z',
          sharePreview: {
            scope: 'task-description',
            resourceRefs: [],
            targetIds: ['agt_research'],
            firstExpansion: false,
          },
        },
      }
    },
    cancelCollaborationIntent: async input => {
      calls.push(['cancelIntent', input])
      return {
        ok: true,
        value: {
          state: 'not-dispatched',
        },
      }
    },
    bindCollaborationIntent: async input => {
      calls.push(['bind', input])
      return {
        ok: true,
        value: {
          intentRef: input.intentRef,
          state: 'bound',
          boundAt: '2026-11-08T01:00:00Z',
        },
      }
    },
  })
  const rows = await h.source.candidates(h.clientSession, h.request(''))
  const outcome = h.source.onPick({
    candidate: rows[0]!,
    session: h.clientSession,
    position: 'leading',
    via: 'menu',
    action: 'pick',
    span: { start: 0, end: 1 },
  })
  assert.ok(outcome !== undefined && outcome !== 'handled' && 'insert' in outcome)
  const serialization = h.source.codec!.serialize(outcome.insert.ref, new AbortController().signal)
  await waitUntil(() => h.runtime.forSession(sessionId).store.getSnapshot().overlay === 'share')
  assert.deepEqual(calls.map(call => (call as unknown[])[0]), ['prepare'])
  h.runtime.forSession(sessionId).confirmShare()
  assert.equal(h.runtime.forSession(sessionId).store.getSnapshot().overlay, 'closed')
  const serialized = await serialization
  assert.match(serialized, /<loop-collaboration/u)
  assert.equal(h.runtime.forSession(sessionId).store.getSnapshot().pendingIntent, true)

  const text = `请 ${serialized} 收集资料`
  pending.push({ requestId: 'request_1', text })
  h.acceptSubmission(pending)
  for (let index = 0; index < 20; index += 1) {
    if (calls.some(call => (call as unknown[])[0] === 'bind')) break
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  assert.deepEqual(
    calls.map(call => (call as unknown[])[0]),
    ['prepare', 'cancelIntent', 'prepare', 'bind'],
  )
  const bind = calls.find(call => (call as unknown[])[0] === 'bind')?.[1] as Record<string, unknown>
  assert.equal(bind.requestId, 'request_1')
  assert.equal(bind.acceptedSerializedText, text)
  assert.match(String(bind.payloadDigest), /^sha256:[a-f0-9]{64}$/u)
  assert.equal(h.runtime.forSession(sessionId).store.getSnapshot().pendingIntent, false)
})

for (const active of [[], [questionWork], [resultWork]]) {
  test(`ordinary submissions never prepare continuation with ${active[0]?.state ?? 'no'} work`, async () => {
    let continuationCalls = 0
    const h = harness({bindCollaborationContinuation: async () => {
      continuationCalls++
      throw new Error('ordinary messages must not contact continuation service')
    }})
    h.remote.collaborationStatus = async () => ({ok: true, value: {...status, active}})
    const runtime = h.runtime.forSession(sessionId)
    await runtime.refreshStatus()
    h.acceptSubmission([{requestId: 'ordinary', text: '今晚吃什么？'}, {requestId: 'followup', text: '把刚才的诗改短一点'}])
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(continuationCalls, 0)
    assert.equal(runtime.store.getSnapshot().continuation.state, 'idle')
  })
}

test('first expanded audience uses the local review state even when Host flags are absent or inverted', async () => {
  let prepares = 0
  const h = harness({
    prepareCollaborationIntent: async input => {
      prepares += 1
      return {
        ok: true,
        value: {
          intentRef: `intent_${prepares}`,
          payloadDigest: input.payloadDigest,
          state: 'prepared',
          expiresAt: '2026-11-08T01:05:00Z',
          sharePreview: {
            scope: input.shareScope.scope,
            resourceRefs: input.shareScope.resourceRefs,
            targetIds: input.references.map(target => target.targetId),
            firstExpansion: input.shareScope.expandedAudience,
          },
        },
      }
    },
  })
  const rows = await h.source.candidates(h.clientSession, h.request(''))
  const outcome = h.source.onPick({
    candidate: rows[0]!,
    session: h.clientSession,
    position: 'leading',
    via: 'menu',
    action: 'pick',
    span: { start: 0, end: 1 },
  })
  assert.ok(outcome !== undefined && outcome !== 'handled' && 'insert' in outcome)
  const serialization = h.source.codec!.serialize(outcome.insert.ref, new AbortController().signal)
  await waitUntil(() => h.runtime.forSession(sessionId).store.getSnapshot().overlay === 'share')
  assert.equal(h.runtime.forSession(sessionId).store.getSnapshot().overlay, 'share')
  assert.deepEqual(
    h.runtime.forSession(sessionId).store.getSnapshot().shareTargetNames,
    ['研究员'],
  )
  h.runtime.forSession(sessionId).confirmShare()
  assert.equal(h.runtime.forSession(sessionId).store.getSnapshot().shareScope.expandedAudience, true)
  await serialization
  assert.equal(prepares, 1)
})

test('a failed placeholder cancel is visible and never binds the accepted message', async () => {
  let binds = 0
  const h = harness({
    cancelCollaborationIntent: async () => ({
      ok: false,
      error: {
        code: 'loop-collaboration/proxy-offline',
        message: 'offline',
      },
    }),
    bindCollaborationIntent: async input => {
      binds += 1
      return {
        ok: true,
        value: {
          intentRef: input.intentRef,
          state: 'bound',
          boundAt: '2026-11-08T01:00:00Z',
        },
      }
    },
  })
  const rows = await h.source.candidates(h.clientSession, h.request(''))
  const outcome = h.source.onPick({
    candidate: rows[0]!,
    session: h.clientSession,
    position: 'leading',
    via: 'menu',
    action: 'pick',
    span: { start: 0, end: 1 },
  })
  assert.ok(outcome !== undefined && outcome !== 'handled' && 'insert' in outcome)
  const serialization = h.source.codec!.serialize(outcome.insert.ref, new AbortController().signal)
  await waitUntil(() => h.runtime.forSession(sessionId).store.getSnapshot().overlay === 'share')
  h.runtime.forSession(sessionId).confirmShare()
  const serialized = await serialization
  h.acceptSubmission([{ requestId: 'request_1', text: `请 ${serialized} 收集资料` }])
  for (let index = 0; index < 20 && h.runtime.forSession(sessionId).store.getSnapshot().error === null; index += 1) {
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  assert.equal(binds, 0)
  assert.equal(
    h.runtime.forSession(sessionId).store.getSnapshot().error?.code,
    'loop-collaboration/proxy-offline',
  )
  h.remote.cancelCollaborationIntent = async () => ({
    ok: true,
    value: { state: 'not-dispatched' },
  })
  await h.runtime.forSession(sessionId).reconcile()
  assert.equal(binds, 1)
})

test('a stale binding reference fails explicitly before preparing an intent', async () => {
  const h = harness()
  const rows = await h.source.candidates(h.clientSession, h.request(''))
  const outcome = h.source.onPick({
    candidate: rows[0]!,
    session: h.clientSession,
    position: 'leading',
    via: 'menu',
    action: 'pick',
    span: { start: 0, end: 1 },
  })
  assert.ok(outcome !== undefined && outcome !== 'handled' && 'insert' in outcome)
  h.remote.collaborationStatus = async () => ({
    ok: true,
    value: {
      ...status,
      scope: { ...scope, bindingRevision: 'rev-binding-2' },
    },
  })
  await assert.rejects(
    h.source.codec!.serialize(outcome.insert.ref, new AbortController().signal),
    /board changed/u,
  )
})

test('binding ignores a stale pre-bind status response and keeps the confirmed scope', async () => {
  let resolveStale:
    | ((result: Awaited<ReturnType<NonNullable<LoopHostClient['collaborationStatus']>>>) => void)
    | undefined
  const h = harness({
    collaborationBoards: async () => ({
      ok: true,
      value: {
        boards: [{
          boardId: 'brd_1',
          boardName: 'Delivery',
          projectId: 'prj_1',
          projectName: 'Release',
          revision: 'boards-1',
          capability,
        }],
        revision: 'boards-1',
      },
    }),
    collaborationBind: async () => ({
      ok: true,
      value: { scope, capability, subscription: status.subscription },
    }),
  })
  const runtime = h.runtime.forSession(sessionId)
  await runtime.refreshStatus()
  await runtime.loadBoards()
  h.remote.collaborationStatus = async () =>
    await new Promise(resolve => { resolveStale = resolve })

  const oldStatus = runtime.refreshStatus()
  while (resolveStale === undefined) await new Promise(resolve => setTimeout(resolve, 0))
  h.remote.collaborationStatus = async () => ({
    ok: true,
    value: { ...status, scope: { ...scope, bindingRevision: 'rev-binding-2' } },
  })
  await runtime.bindBoard('brd_1')
  const rows = await h.source.candidates(h.clientSession, h.request(''))
  const outcome = h.source.onPick({
    candidate: rows[0]!,
    session: h.clientSession,
    position: 'leading',
    via: 'menu',
    action: 'pick',
    span: { start: 0, end: 1 },
  })
  assert.ok(outcome !== undefined && outcome !== 'handled' && 'insert' in outcome)
  const serialization = h.source.codec!.serialize(outcome.insert.ref, new AbortController().signal)
  await waitUntil(() => runtime.store.getSnapshot().overlay === 'share')
  runtime.confirmShare()
  assert.equal(runtime.store.getSnapshot().shareScope.expandedAudience, true)
  await serialization

  resolveStale({ ok: true, value: status })
  await oldStatus
  assert.equal(runtime.store.getSnapshot().status?.scope?.bindingRevision, 'rev-binding-2')
  assert.equal(runtime.store.getSnapshot().shareScope.expandedAudience, true)
})

test('binding a board uses Loop’s decision even when the picker shows unavailable', async () => {
  let binds = 0
  const h = harness({
    collaborationBoards: async () => ({
      ok: true,
      value: {
        boards: [{
          boardId: 'brd_unavailable',
          boardName: 'Unavailable board',
          projectId: 'prj_1',
          projectName: 'Release',
          revision: '1',
          capability: {
            ...capability,
            available: false,
            delegable: false,
            reason: 'execution_adapter_unavailable',
          },
        }],
        revision: 'boards:1',
      },
    }),
    collaborationBind: async () => {
      binds += 1
      return { ok: false, error: { code: 'loop-collaboration/permission-denied', message: 'Denied by Loop' } }
    },
  })
  const runtime = h.runtime.forSession(sessionId)
  await runtime.loadBoards()
  await runtime.bindBoard('brd_unavailable')

  assert.equal(binds, 1)
  assert.equal(runtime.store.getSnapshot().error?.code, 'loop-collaboration/permission-denied')
})

test('unbound v4 project binding can load and bind the Host-mapped server board shape', async () => {
  const bindInputs: Array<Record<string, unknown>> = []
  let statusCalls = 0
  const h = harness({
    collaborationBoards: async () => ({
      ok: true,
      value: {
        boards: [{
          boardId: 'chn_qa_collab',
          boardName: 'QA Harness Collaboration Board',
          projectId: 'prj_qa',
          projectName: 'QA Harness Collaboration',
          revision: '1',
          capability: {
            available: true,
            delegable: false,
            notifiable: true,
            conditionalNotify: true,
            respond: false,
            followup: false,
            review: false,
            cancel: false,
            reason: 'execution_adapter_unavailable',
          },
        }],
        revision: 'boards:1794126000000000000',
      },
    }),
    collaborationBind: async input => {
      bindInputs.push(input as unknown as Record<string, unknown>)
      return {
        ok: true,
        value: {
          scope: { ...scope, boardId: 'chn_qa_collab', boardName: 'QA Harness Collaboration Board' },
          capability: { ...capability, delegable: false },
          subscription: status.subscription,
        },
      }
    },
  })
  h.remote.collaborationStatus = async () => {
    statusCalls += 1
    if (statusCalls === 1) {
      return {
        ok: true,
        value: {
          ...status,
          state: 'unbound',
          scope: {
            ...scope,
            accountId: '',
            coordinatorAgentId: '',
            bindingId: '',
            bindingRevision: '',
            bindingEpoch: '',
            projectId: undefined,
            projectName: undefined,
            boardId: undefined,
            boardName: undefined,
          },
        },
      }
    }
    return {
      ok: true,
      value: {
        ...status,
        scope: {
          ...scope,
          boardId: 'chn_qa_collab',
          boardName: 'QA Harness Collaboration Board',
        },
      },
    }
  }
  const runtime = h.runtime.forSession(sessionId)
  await runtime.refreshStatus()

  assert.equal(runtime.store.getSnapshot().status?.state, 'unbound')
  await runtime.loadBoards()
  assert.deepEqual(
    runtime.store.getSnapshot().boards.map(board => [
      board.boardId,
      board.boardName,
      board.capability.available,
      board.capability.notifiable,
    ]),
    [['chn_qa_collab', 'QA Harness Collaboration Board', true, true]],
  )

  await runtime.bindBoard('chn_qa_collab')

  assert.equal(bindInputs.length, 1)
  assert.equal(bindInputs[0]?.workspaceId, scope.workspaceId)
  assert.equal(bindInputs[0]?.coordinatorAgentId, 'agt_coord')
  assert.equal(bindInputs[0]?.boardId, 'chn_qa_collab')
  assert.equal(bindInputs[0]?.expectedRevision, 'boards:1794126000000000000')
  assert.equal(runtime.store.getSnapshot().status?.scope?.boardName, 'QA Harness Collaboration Board')
})

test('a rejected board submission leaves the picker open with a visible classified error', async () => {
  const h = harness({
    collaborationBoards: async () => ({
      ok: true,
      value: {
        boards: [{
          boardId: 'chn_qa_collab',
          boardName: 'QA Harness Collaboration Board',
          projectId: 'prj_qa',
          projectName: 'QA Harness Collaboration',
          revision: '1',
          capability,
        }],
        revision: 'boards:1',
      },
    }),
    collaborationBind: async () => ({
      ok: false,
      error: {
        code: 'loop-host/conflict',
        message: 'Loop workspace changed during binding',
      },
    }),
  })
  const runtime = h.runtime.forSession(sessionId)
  await runtime.loadBoards()
  await runtime.bindBoard('chn_qa_collab')

  assert.equal(runtime.store.getSnapshot().overlay, 'boards')
  assert.equal(runtime.store.getSnapshot().screen, 'error')
  assert.equal(runtime.store.getSnapshot().error?.code, 'loop-host/conflict')
})

test('failed board load preserves share scope, retries to empty, then restores real choices', async () => {
  let attempt = 0
  const h = harness({
    collaborationBoards: async () => {
      attempt += 1
      if (attempt === 1) {
        throw new Error('transport unavailable')
      }
      if (attempt === 2) {
        return {
          ok: true,
          value: {
            boards: [],
            revision: 'boards:empty',
          },
        }
      }
      return {
        ok: true,
        value: {
          boards: [{
            boardId: 'chn_qa_collab',
            boardName: 'QA Harness Collaboration Board',
            projectId: 'prj_qa',
            projectName: 'QA Harness Collaboration',
            revision: '1',
            capability,
          }],
          revision: 'boards:choices',
        },
      }
    },
  })
  const runtime = h.runtime.forSession(sessionId)
  runtime.setShareScope('selected-resources')

  await runtime.loadBoards()
  assert.equal(runtime.store.getSnapshot().screen, 'error')
  assert.equal(runtime.store.getSnapshot().shareScope.scope, 'selected-resources')

  await runtime.loadBoards()
  assert.equal(runtime.store.getSnapshot().error, null)
  assert.equal(runtime.store.getSnapshot().boards.length, 0)
  assert.equal(runtime.store.getSnapshot().shareScope.scope, 'selected-resources')

  await runtime.loadBoards()
  assert.equal(runtime.store.getSnapshot().error, null)
  assert.equal(runtime.store.getSnapshot().boards[0]?.boardId, 'chn_qa_collab')
  assert.equal(runtime.store.getSnapshot().shareScope.scope, 'selected-resources')
})

test('cancelling share review rejects the original serializer and cancels only the preview intent', async () => {
  let prepares = 0
  const cancelled: string[] = []
  const h = harness({
    prepareCollaborationIntent: async input => {
      prepares += 1
      return {
        ok: true,
        value: {
          intentRef: 'intent_cancel',
          payloadDigest: input.payloadDigest,
          state: 'prepared',
          expiresAt: '2026-11-08T01:05:00Z',
          sharePreview: {
            scope: input.shareScope.scope,
            resourceRefs: input.shareScope.resourceRefs,
            targetIds: input.references.map(target => target.targetId),
            firstExpansion: false,
          },
        },
      }
    },
    cancelCollaborationIntent: async input => {
      cancelled.push(input.intentRef)
      return {ok: true, value: {state: 'not-dispatched'}}
    },
  })
  const rows = await h.source.candidates(h.clientSession, h.request(''))
  const outcome = h.source.onPick({
    candidate: rows[0]!,
    session: h.clientSession,
    position: 'leading',
    via: 'menu',
    action: 'pick',
    span: {start: 0, end: 1},
  })
  assert.ok(outcome !== undefined && outcome !== 'handled' && 'insert' in outcome)
  const serialization = h.source.codec!.serialize(outcome.insert.ref, new AbortController().signal)
  await waitUntil(() => h.runtime.forSession(sessionId).store.getSnapshot().overlay === 'share')
  h.runtime.forSession(sessionId).closeOverlay()
  await assert.rejects(serialization, /cancelled/u)
  assert.equal(prepares, 1)
  assert.deepEqual(cancelled, ['intent_cancel'])
  assert.equal(h.runtime.forSession(sessionId).store.getSnapshot().pendingIntent, false)
  assert.equal(h.runtime.forSession(sessionId).store.getSnapshot().error, null)
  assert.notEqual(h.runtime.forSession(sessionId).store.getSnapshot().screen, 'error')
})

test('one share confirmation covers every target in the original multi-target submission', async () => {
  const preparedTargets: string[][] = []
  const twoAgents: CollaborationDirectoryResult = {
    ...directory,
    entries: [
      directory.entries[0]!,
      {
        ...directory.entries[0]!,
        targetId: 'agt_writer',
        displayName: '写作者',
        stableRef: 'agent:agt_writer',
      },
    ],
  }
  const h = harness({
    collaborationDirectory: async () => ({ok: true, value: twoAgents}),
    prepareCollaborationIntent: async input => {
      preparedTargets.push(input.references.map(target => target.targetId))
      return {
        ok: true,
        value: {
          intentRef: 'intent_multi',
          payloadDigest: input.payloadDigest,
          state: 'prepared',
          expiresAt: '2026-11-08T01:05:00Z',
          sharePreview: {
            scope: input.shareScope.scope,
            resourceRefs: input.shareScope.resourceRefs,
            targetIds: input.references.map(target => target.targetId),
            firstExpansion: false,
          },
        },
      }
    },
  })
  const rows = await h.source.candidates(h.clientSession, h.request(''))
  const outcomes = rows.slice(0, 2).map(row => h.source.onPick({
    candidate: row,
    session: h.clientSession,
    position: 'leading',
    via: 'menu',
    action: 'pick',
    span: {start: 0, end: 1},
  }))
  assert.ok(outcomes.every(outcome =>
    outcome !== undefined && outcome !== 'handled' && 'insert' in outcome))
  const refs = outcomes.map(outcome =>
    outcome !== undefined && outcome !== 'handled' && 'insert' in outcome ? outcome.insert.ref : '')
  const serializations = refs.map(ref =>
    h.source.codec!.serialize(ref, new AbortController().signal))
  await waitUntil(() => h.runtime.forSession(sessionId).store.getSnapshot().overlay === 'share')
  assert.equal(preparedTargets.length, 1)
  assert.deepEqual(preparedTargets[0], ['agt_research', 'agt_writer'])
  assert.deepEqual(
    h.runtime.forSession(sessionId).store.getSnapshot().shareTargetNames,
    ['研究员', '写作者'],
  )
  h.runtime.forSession(sessionId).confirmShare()
  const serialized = await Promise.all(serializations)
  assert.equal(serialized.length, 2)
  assert.ok(serialized.every(value => /<loop-collaboration/u.test(value)))
})

 test('personal task submission keeps the original message without a scope popup', async () => {
  const h = harness({collaborationStatus: async () => ({ok: true, value: {
    ...status, scope: {...scope, projectId: '', projectName: ''},
  }})})
  const runtime = h.runtime.forSession(sessionId)
  const entries = await runtime.ensureDirectory('', new AbortController().signal)
  const pick = runtime.pickCandidate({candidate: {name: entries[0]!.displayName, value: runtime.candidateValue(entries[0]!)}, session: h.clientSession, position: 'leading', via: 'menu', action: 'pick', span: {start: 0, end: 1}})
  assert.ok(pick && pick !== 'handled' && 'insert' in pick)
  const serialized = await runtime.serializeReference(pick.insert.ref, new AbortController().signal)
  assert.ok(serialized.includes('agt_research'))
  assert.equal(runtime.store.getSnapshot().overlay, 'closed')
  h.runtime.dispose()
 })

test('confirmed Host-managed submission never waits for a Client bind callback', async () => {
  const calls: string[] = []
  const shares: boolean[] = []
  const h = harness({
    prepareCollaborationIntent: async input => {
      calls.push('prepare')
      shares.push(input.shareScope.expandedAudience)
      return {ok: true, value: {
        intentRef: `intent_${calls.length}`, payloadDigest: input.payloadDigest,
        state: 'prepared', activationOwner: input.activateOnClaim ? 'host' : 'client',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        sharePreview: {scope: input.shareScope.scope, resourceRefs: [], targetIds: ['agt_research'], firstExpansion: true},
      }}
    },
    cancelCollaborationIntent: async () => { calls.push('cancel'); return {ok: true, value: {state: 'not-dispatched'}} },
    bindCollaborationIntent: async () => { throw new Error('Client must not bind Host-managed input') },
  })
  const rows = await h.source.candidates(h.clientSession, h.request(''))
  const outcome = h.source.onPick({candidate: rows[0]!, session: h.clientSession, position: 'leading', via: 'menu', action: 'pick', span: {start: 0, end: 1}})
  assert.ok(outcome !== undefined && outcome !== 'handled' && 'insert' in outcome)
  const serialization = h.source.codec!.serialize(outcome.insert.ref, new AbortController().signal)
  const runtime = h.runtime.forSession(sessionId)
  await waitUntil(() => runtime.store.getSnapshot().overlay === 'share')
  assert.deepEqual(shares, [false])
  runtime.confirmShare()
  const text = await serialization
  assert.deepEqual(shares, [false, true])
  assert.deepEqual(calls, ['prepare', 'cancel', 'prepare'])
  h.acceptSubmission([{requestId: 'host_owned', text: `${text} do the work`}])
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(calls, ['prepare', 'cancel', 'prepare'])
  assert.equal(runtime.store.getSnapshot().pendingIntent, true)
  await assert.rejects(h.source.codec!.serialize(outcome.insert.ref, new AbortController().signal), /still being linked/)
  h.runtime.dispose()
})

for (const state of ['failed', 'activated'] as const) {
  test(`Host ${state} event releases the composer even when its acceptance echo was missed`, async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const h = harness({
      collaborationStatus: async () => ({ok: true, value: {...status, scope: {...scope, projectId: '', projectName: ''}}}),
      prepareCollaborationIntent: async input => ({ok: true, value: {
        intentRef: 'source_ref', payloadDigest: input.payloadDigest, state: 'prepared', activationOwner: 'host',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        sharePreview: {scope: input.shareScope.scope, resourceRefs: [], targetIds: ['agt_research'], firstExpansion: false},
      }}),
      collaborationEvents: async function* (_request, signal) {
        await gate
        yield {type: 'change', sequence: 1, event: {
          eventId: `intent_${state}`, kind: 'intent.changed', occurredAt: 'now',
          intent: {intentRef: 'exact_ref', sourceIntentRef: 'source_ref', state, reason: 'Request failed'},
        }}
        await new Promise<void>(resolve => {
          if (signal?.aborted) resolve()
          else signal?.addEventListener('abort', () => resolve(), {once: true})
        })
      },
    })
    const rows = await h.source.candidates(h.clientSession, h.request(''))
    const outcome = h.source.onPick({candidate: rows[0]!, session: h.clientSession, position: 'leading', via: 'menu', action: 'pick', span: {start: 0, end: 1}})
    assert.ok(outcome !== undefined && outcome !== 'handled' && 'insert' in outcome)
    await h.source.codec!.serialize(outcome.insert.ref, new AbortController().signal)
    const runtime = h.runtime.forSession(sessionId)
    assert.equal(runtime.store.getSnapshot().pendingIntent, true)
    release()
    await waitUntil(() => !runtime.store.getSnapshot().pendingIntent)
    assert.equal(runtime.store.getSnapshot().error?.message ?? null, state === 'failed' ? 'Request failed' : null)
    await h.source.codec!.serialize(outcome.insert.ref, new AbortController().signal)
    h.runtime.dispose()
  })
}

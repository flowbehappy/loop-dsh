import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {CollaborationService} from '../backend/collaboration.ts'
import {LoopCollaborationRuntime} from '../host-collaboration.mjs'

// Exercise the actions emitted by the Host rather than duplicating its target list in the input.
test('natural-language prepareTargets activates a native intent only for the selected participants', async t => {
  const root = await mkdtemp(join(tmpdir(), 'loop-prepared-targets-'))
  t.after(() => rm(root, {recursive: true, force: true}))
  const session = {id: 'session-test'}, context = {defaultChannelId: 'channel-test', loopWorkspaceId: 'workspace-test', agent: {id: 'agent-self'}, projectId: ''}
  const requests = []
  const api = {
    tokens: {credential: async () => ({principal_id: 'account-test', workspace_id: context.loopWorkspaceId})},
    async request(area, method, path, body) {
      assert.equal(area, 'workspace'); assert.equal(method, 'POST')
      if (path === '/collaboration/binding') return {binding: {bindingId: 'binding-test', bindingEpoch: 1n, status: 'active', agentId: context.agent.id, agentMemberId: 'member-self', boardId: body.boardId, sourceSessionId: body.sourceSessionId}}
      assert.equal(path, '/collaboration/intents'); requests.push(body)
      return {userIntentId: 'intent-test'}
    },
  }
  const service = new CollaborationService(api, {server: 'https://loop.invalid'}, {device: async () => ({bindingId: 'device-test'})}, root, 'installation-test')
  const listeners = new Map(), ctx = {
    sessions: {get: id => id === session.id ? session : undefined, flush: async () => true},
    sessionProjections: {register() {}, stateOf() {}}, systemPrompt: {}, on: (name, fn) => listeners.set(name, fn),
  }
  const actions = {
    collaborationDirectory: async ({query}) => ({entries: [{targetId: query, memberId: query, agentId: `agent-${query}`, targetType: 'agent', visible: true, capability: {delegable: true}}]}),
    collaborationStatus: service.status.bind(service),
    collaborationBind: service.bind.bind(service),
    collaborationPrepareIntent: service.prepareIntent.bind(service),
    collaborationBindIntent: service.bindIntent.bind(service),
    collaborationActivateIntent: service.activateIntent.bind(service),
  }
  const runtime = new LoopCollaborationRuntime({ctx, actions: () => actions,
    withSessionContext: (_id, _signal, fn) => fn(context, [], async () => ({
      channelId: context.defaultChannelId, members: targetIds.map(memberId => ({memberId})), hasMore: false,
    })),
  })
  const message = {role: 'user', id: 'message-test', source: {kind: 'user', rpcId: 'request-test'}, content: [{type: 'text', text: 'Assign each chosen agent a review.'}]}
  const targetIds = ['member-one', 'member-two']
  await assert.rejects(runtime.prepareTargets(session.id, {targetIds}), {code: 'loop-collaboration/intent-not-accepted'})
  await listeners.get('agent/pre-step')({agent: {session}, messages: [message]}, async () => ({kind: 'enter', messages: [message]}))
  listeners.get('session/event')(session, {type: 'user/message', seq: 1, data: message})
  assert.equal((await runtime.prepareTargets(session.id, {targetIds})).state, 'ready')
  assert.equal(requests.length, 1)
  const [intent] = requests
  assert.deepEqual(intent.targetIds, targetIds)
  assert.deepEqual(intent.allowedActions, ['cancel', 'dispatch', 'end-management', 'followup', 'inspect', 'review'])
  assert.equal(intent.sourceRequestId, message.source.rpcId); assert.equal(intent.sourceEventId, message.id)
  assert.equal(intent.shareScope.visibility, 'task_participants'); assert.deepEqual(intent.resourceRefs, [])
})

test('native intent preparation still rejects unknown target actions before accessing a binding', async () => {
  const service = new CollaborationService({}, {}, {}, '/unused', 'installation-test')
  const payloadText = 'Review this', payloadDigest = 'sha256:' + createHash('sha256').update(payloadText).digest('hex')
  await assert.rejects(service.prepareIntent({sessionId: 'session-test', payloadText, payloadDigest,
    targets: [{targetId: 'member-test', targetType: 'agent', intendedActions: ['cancel', 'unknown-action']}] }), {code: 'loop-host/invalid-request'})
})

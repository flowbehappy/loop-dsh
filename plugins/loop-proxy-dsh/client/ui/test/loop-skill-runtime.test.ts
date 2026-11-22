import test from 'node:test'
import assert from 'node:assert/strict'
import type {
  CandidateRequest,
  ClientSessionContext,
  InputTriggerSource,
} from '@deepseek-ai/dsh-client-ui-input-trigger/client'

import {LoopSkillRuntime} from '../loop-skill-runtime.ts'
import {
  decodeLoopSkillReference,
  decodeLoopSkillReferenceResult,
} from '../loop-skill-reference.ts'
import {LoopSkillRuntimeError} from '../loop-skill-errors.ts'
import type {LoopHostClient} from '../types.ts'

const session = {sessionId: 'ses_1'} as unknown as ClientSessionContext
const workspace = {workspaceId: 'wsp_local', path: '/tmp/work', displayTitle: 'Work'}

function request(query = ''): CandidateRequest {
  return {
    query,
    position: 'leading',
    drilled: false,
    signal: new AbortController().signal,
  }
}

function fixture(entries = [
  {
    skillId: 'skl_a',
    librarySlug: 'library-a',
    libraryName: 'Library A',
    name: 'review',
    description: 'Review work',
    path: 'a/review/SKILL.md',
    versionId: 'ctv_a',
    sourceRevision: 'skill:a',
  },
  {
    skillId: 'skl_b',
    librarySlug: 'library-b',
    libraryName: 'Library B',
    name: 'review',
    description: 'Review work',
    path: 'b/review/SKILL.md',
    versionId: 'ctv_b',
    sourceRevision: 'skill:b',
  },
]) {
  let catalogCalls = 0
  let source: InputTriggerSource | null = null
  const remote = {
    skillCatalog: async () => {
      catalogCalls += 1
      return {
        ok: true,
        value: {
          scope: {
            installationId: 'ins_1',
            accountId: 'usr_1',
            serverBaseUrl: 'https://loop.test',
            workspaceId: 'wsp_loop',
            hostWorkspaceId: 'wsp_local',
            sessionId: 'ses_1',
            catalog: 'skills',
            bindingRevision: 'binding:1',
            agentId: 'agt_1',
            identityFingerprint: 'scope:1',
          },
          data: {items: entries, revision: 'catalog:1', hasMore: false, truncated: false},
        },
      }
    },
  } as unknown as LoopHostClient
  const runtime = new LoopSkillRuntime({
    remote,
    workspaceForSession: () => workspace,
    formatFailure: failure => failure.message,
    showFailure: () => {},
  })
  runtime.registerSource({
    registerSource(value) {
      source = value
      return () => {}
    },
  } as never, 'Loop · Skills')
  assert.ok(source)
  return {runtime, source: source!, calls: () => catalogCalls}
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 30; index += 1) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  assert.fail('condition did not settle')
}

test('warm preloads one bounded page and later menu opens stay local', async () => {
  const h = fixture()
  h.source.warm?.(session)
  await waitUntil(() => h.calls() === 1)
  const first = await h.source.candidates(session, request(''))
  const second = await h.source.candidates(session, request(''))
  assert.equal(h.calls(), 1)
  assert.deepEqual(first.map(row => row.label), ['Loop · review', 'Loop · review'])
  assert.deepEqual(second, first)
  assert.match(first[0]!.description!, /Library A/u)
  assert.match(first[1]!.description!, /Library B/u)
  assert.match(first[0]!.hint!, /Library A · a\/review\/SKILL\.md/u)
  assert.match(first[1]!.hint!, /Library B · b\/review\/SKILL\.md/u)
})

test('Loop prefix searches stay local and duplicate display names retain distinct references', async () => {
  const h = fixture()
  const all = await h.source.candidates(session, request(''))
  for (const query of ['Loop', 'loop review', 'Loop · review', 'REVIEW']) {
    const rows = await h.source.candidates(session, request(query))
    assert.deepEqual(rows, all)
    assert.ok(rows.every(row => row.name === row.label))
  }
  const references = all.map(row => JSON.parse(row.value!))
  assert.deepEqual(references.map(ref => ref.skillId), ['skl_a', 'skl_b'])
  assert.notEqual(references[0].name, references[1].name)
  assert.equal(h.calls(), 1)
})

test('picking and serializing a Loop Skill never executes it', async () => {
  const h = fixture()
  h.source.warm?.(session)
  await waitUntil(() => h.calls() === 1)
  const rows = await h.source.candidates(session, request(''))
  const outcome = h.source.onPick({
    candidate: rows[0]!,
    session,
    position: 'leading',
    via: 'menu',
    action: 'pick',
    span: {start: 0, end: 1},
  })
  assert.ok(outcome !== undefined && outcome !== 'handled' && 'insert' in outcome)
  const serialized = await h.source.codec!.serialize(outcome.insert.ref, new AbortController().signal)
  const reference = decodeLoopSkillReference(serialized)
  assert.equal(reference?.skillId, 'skl_a')
  assert.equal(reference?.versionId, 'ctv_a')
  assert.equal(h.calls(), 1)
})

test('legacy catalog selection serializes only the exact commit handle', async () => {
  const h = fixture([{
    skillId: 'skl_legacy',
    librarySlug: 'legacy-library',
    libraryName: 'Legacy Library',
    name: 'legacy',
    description: 'Legacy work',
    path: 'skills/legacy/SKILL.md',
    versionId: 'git:abc123',
    commitSha: 'abc123',
    sourceRevision: 'skill:legacy',
  }])
  h.source.warm?.(session)
  await waitUntil(() => h.calls() === 1)
  const rows = await h.source.candidates(session, request(''))
  const outcome = h.source.onPick({
    candidate: rows[0]!,
    session,
    position: 'leading',
    via: 'menu',
    action: 'pick',
    span: {start: 0, end: 1},
  })
  assert.ok(outcome !== undefined && outcome !== 'handled' && 'insert' in outcome)
  const reference = decodeLoopSkillReference(outcome.insert.ref)
  assert.equal(reference?.commitSha, 'abc123')
  assert.equal(reference?.versionId, undefined)
})

test('malformed version handles and unsupported paths use stable reference errors', () => {
  const mismatched = `<loop-skill-ref>${Buffer.from(JSON.stringify({
    version: 1,
    sessionId: 'ses_1',
    skillId: 'skl_a',
    path: 'review/SKILL.md',
    versionId: 'ctv_a',
    commitSha: 'abc123',
    sourceRevision: 'skill:a',
    name: 'loop-skill-a',
    displayName: 'Loop · A',
    libraryName: 'Library A',
  })).toString('base64url')}</loop-skill-ref>`
  const badHandle = decodeLoopSkillReferenceResult(mismatched)
  assert.ok(badHandle instanceof LoopSkillRuntimeError)
  assert.equal(badHandle.code, 'loop-skill/invalid-version-handle')

  const unsafePath = `<loop-skill-ref>${Buffer.from(JSON.stringify({
    version: 1,
    sessionId: 'ses_1',
    skillId: 'skl_a',
    path: '../SKILL.md',
    versionId: 'ctv_a',
    sourceRevision: 'skill:a',
    name: 'loop-skill-a',
    displayName: 'Loop · A',
    libraryName: 'Library A',
  })).toString('base64url')}</loop-skill-ref>`
  const badPath = decodeLoopSkillReferenceResult(unsafePath)
  assert.ok(badPath instanceof LoopSkillRuntimeError)
  assert.equal(badPath.code, 'loop-skill/unsupported-path')
})

test('prewarm is silent and an explicit menu request reports missing capability', async () => {
  const failures: Error[] = []
  const runtime = new LoopSkillRuntime({
    remote: {} as unknown as LoopHostClient,
    workspaceForSession: () => workspace,
    formatFailure: failure => failure.message,
    showFailure: error => failures.push(error),
  })
  let source: InputTriggerSource | null = null
  runtime.registerSource({
    registerSource(value) {
      source = value
      return () => {}
    },
  } as never, 'Loop · Skills')
  assert.ok(source)
  source.warm?.(session)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(failures.length, 0)
  await assert.rejects(source.candidates(session, request()), /needs an update/)
  assert.ok(failures[0] instanceof LoopSkillRuntimeError)
  assert.equal(failures[0].code, 'loop-host/capability-unsupported')
  runtime.dispose()
})

test('local search is deterministic and an empty catalog stays empty', async () => {
  const populated = fixture()
  populated.source.warm?.(session)
  await waitUntil(() => populated.calls() === 1)
  const rows = await populated.source.candidates(session, request('library b'))
  assert.equal(rows.length, 1)
  assert.match(rows[0]!.description!, /Library B/u)

  const empty = fixture([])
  empty.source.warm?.(session)
  await waitUntil(() => empty.calls() === 1)
  assert.deepEqual(await empty.source.candidates(session, request('')), [])
})

test('normal Skill invalidation preserves the trusted catalog identity', async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const remote = {
    skillCatalog: async () => ({
      ok: true,
      value: {
        scope: {
          installationId: 'ins_1', accountId: 'usr_1', serverBaseUrl: 'https://loop.test',
          workspaceId: 'wsp_loop', hostWorkspaceId: 'wsp_local', sessionId: 'ses_1',
          catalog: 'skills', bindingRevision: 'binding:1', projectId: 'prj_1',
          agentId: 'agt_1', identityFingerprint: 'scope:1',
        },
        data: {
          items: [{
            skillId: 'skl_a', libraryName: 'Library A', name: 'review',
            path: 'review/SKILL.md', versionId: 'ctv_a', sourceRevision: 'skill:a',
          }],
          revision: 'catalog:1', hasMore: false, truncated: false,
        },
      },
    }),
    skillCatalogEvents: async function* () {
      await gate
      yield {
        type: 'change',
        event: {
          eventId: 'evt_1', kind: 'catalog.changed', occurredAt: 'now',
          sessionId: 'ses_1', workspaceId: 'wsp_loop', hostWorkspaceId: 'wsp_local',
          installationId: 'ins_1', accountId: 'usr_1', serverBaseUrl: 'https://loop.test',
          bindingRevision: 'binding:1', projectId: 'prj_1', agentId: 'agt_1',
          identityFingerprint: 'scope:1', durableEventSeq: 7,
        },
      }
    },
  } as unknown as LoopHostClient
  const runtime = new LoopSkillRuntime({
    remote,
    workspaceForSession: () => workspace,
    formatFailure: failure => failure.message,
    showFailure: () => {},
  })
  let source: InputTriggerSource | null = null
  runtime.registerSource({
    registerSource(value) {
      source = value
      return () => {}
    },
  } as never, 'Loop · Skills')
  assert.ok(source)
  source.warm?.(session)
  await waitUntil(() => {
    const sessions = (runtime as unknown as {
      sessions: Map<string, {cache: {state(): {loaded: boolean}}}>
    }).sessions
    return sessions.get('ses_1')?.cache.state().loaded === true
  })
  release()
  await waitUntil(() => {
    const sessions = (runtime as unknown as {
      sessions: Map<string, {cache: {state(): {dirty: boolean}}}>
    }).sessions
    return sessions.get('ses_1')?.cache.state().dirty === true
  })
  const sessionRuntime = (runtime as unknown as {
    sessions: Map<string, {
      cache: {scopeIdentity(): {workspaceId: string}; state(): {revision: string}}
      resolvedScope: string
    }>
  }).sessions.get('ses_1')!
  assert.equal(sessionRuntime.cache.scopeIdentity().workspaceId, 'wsp_loop')
  assert.equal(sessionRuntime.cache.state().revision, 'catalog:1')
  assert.match(sessionRuntime.resolvedScope, /wsp_loop/u)
  runtime.dispose()
})

test('sessions in one Host workspace share one bounded catalog event stream', async () => {
  let catalogCalls = 0
  let eventStreams = 0
  const remote = {
    skillCatalog: async input => {
      catalogCalls += 1
      return {
        ok: true,
        value: {
          scope: {
            installationId: 'ins_1', accountId: 'usr_1', serverBaseUrl: 'https://loop.test',
            workspaceId: 'wsp_loop', hostWorkspaceId: input.workspaceId, sessionId: input.sessionId,
            catalog: 'skills', bindingRevision: 'binding:1', projectId: 'prj_1',
            agentId: 'agt_1', identityFingerprint: 'scope:1',
          },
          data: {items: [], revision: 'catalog:1', hasMore: false, truncated: false},
        },
      }
    },
    skillCatalogEvents: async function* (_input, signal) {
      eventStreams += 1
      await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), {once: true}))
    },
  } as unknown as LoopHostClient
  const runtime = new LoopSkillRuntime({
    remote,
    workspaceForSession: () => workspace,
    formatFailure: failure => failure.message,
    showFailure: () => {},
  })
  let source: InputTriggerSource | null = null
  runtime.registerSource({
    registerSource(value) {
      source = value
      return () => {}
    },
  } as never, 'Loop · Skills')
  assert.ok(source)
  source.warm?.({sessionId: 'ses_1'} as unknown as ClientSessionContext)
  source.warm?.({sessionId: 'ses_2'} as unknown as ClientSessionContext)
  await waitUntil(() => catalogCalls === 2)
  assert.equal(eventStreams, 1)
  runtime.dispose()
})

test('a revoked catalog subscription invalidates cached candidates', async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const remote = {
    skillCatalog: async input => ({
      ok: true,
      value: {
        scope: {
          installationId: 'ins_1', accountId: 'usr_1', serverBaseUrl: 'https://loop.test',
          workspaceId: 'wsp_loop', hostWorkspaceId: input.workspaceId, sessionId: input.sessionId,
          catalog: 'skills', bindingRevision: 'binding:1', projectId: 'prj_1',
          agentId: 'agt_1', identityFingerprint: 'scope:1',
        },
        data: {items: [], revision: 'catalog:1', hasMore: false, truncated: false},
      },
    }),
    skillCatalogEvents: async function* () {
      await gate
      yield {
        type: 'change',
        event: {
          eventId: 'revoked-1', kind: 'subscription.changed', occurredAt: 'now',
          sessionId: 'ses_1', workspaceId: 'wsp_loop', installationId: 'ins_1',
          accountId: 'usr_1', serverBaseUrl: 'https://loop.test',
          status: {state: 'revoked', snapshotRequired: true},
        },
      }
      await new Promise<void>(resolve => setTimeout(resolve, 10))
    },
  } as unknown as LoopHostClient
  const runtime = new LoopSkillRuntime({
    remote,
    workspaceForSession: () => workspace,
    formatFailure: failure => failure.message,
    showFailure: () => {},
  })
  let source: InputTriggerSource | null = null
  runtime.registerSource({
    registerSource(value) {
      source = value
      return () => {}
    },
  } as never, 'Loop · Skills')
  assert.ok(source)
  source.warm?.(session)
  await waitUntil(() => {
    const sessions = (runtime as unknown as {
      sessions: Map<string, {cache: {state(): {loaded: boolean}}}>
    }).sessions
    return sessions.get('ses_1')?.cache.state().loaded === true
  })
  release()
  await waitUntil(() => {
    const sessions = (runtime as unknown as {
      sessions: Map<string, {cache: {state(): {dirty: boolean}}}>
    }).sessions
    return sessions.get('ses_1')?.cache.state().dirty === true
  })
  runtime.dispose()
})


test('a closed shared catalog stream releases readers and can be reopened', async () => {
  let streams = 0
  let close!: () => void
  const remote = {
    skillCatalogEvents: async function* () {
      streams += 1
      yield {type: 'hello'}
      await new Promise<void>(resolve => { close = resolve })
    },
  } as unknown as LoopHostClient
  const runtime = new LoopSkillRuntime({
    remote, workspaceForSession: () => workspace,
    formatFailure: failure => failure.message, showFailure: () => {},
  })
  const signal = new AbortController().signal
  const first = runtime.catalogEvents('ses_1', signal)[Symbol.asyncIterator]()
  assert.equal((await first.next()).done, false)
  const pending = first.next()
  close()
  assert.equal((await pending).done, true)
  const second = runtime.catalogEvents('ses_2', signal)[Symbol.asyncIterator]()
  assert.equal((await second.next()).done, false)
  assert.equal(streams, 2)
  close()
  assert.equal((await second.next()).done, true)
  runtime.dispose()
})

test('cancelled menu searches do not report Skill failures', async () => {
  const failures: Error[] = []
  let source: InputTriggerSource | null = null
  const runtime = new LoopSkillRuntime({
    remote: {skillCatalog: async (_request: unknown, signal: AbortSignal) => {
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {once: true})
      })
    }} as unknown as LoopHostClient,
    workspaceForSession: () => workspace,
    formatFailure: failure => failure.message,
    showFailure: error => failures.push(error),
  })
  runtime.registerSource({registerSource(value: InputTriggerSource) {source = value; return () => {}}} as never, 'Loop')
  assert.ok(source)
  const controller = new AbortController()
  const result = source.candidates(session, {...request(), signal: controller.signal})
  controller.abort()
  assert.deepEqual(await result, [])
  assert.deepEqual(failures, [])
  runtime.dispose()
})

test('partial Loop display prefix finds remote Skills without changing name filtering', async () => {
  const f = fixture()
  try {
    for (const query of ['l', 'lo', 'loo', 'LOO', 'Loop', 'loop']) {
      assert.equal((await f.source.candidates(session, request(query))).length, 2, `/${query}`)
    }
    assert.equal((await f.source.candidates(session, request('REVIEW'))).length, 2)
    assert.equal((await f.source.candidates(session, request('loop:review'))).length, 2)
    assert.equal((await f.source.candidates(session, request('unrelated'))).length, 0)
    assert.equal(f.calls(), 1)
  } finally {
    f.runtime.dispose()
  }
})

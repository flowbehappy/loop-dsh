import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  CandidateRequest,
  ClientSessionContext,
  InputTriggerSource,
} from '@deepseek-ai/dsh-client-ui-input-trigger/client'

import {LoopSkillRuntime} from '../loop-skill-runtime.ts'
import type {LoopHostClient} from '../types.ts'
// @ts-expect-error the Host implementation is exercised as a runtime module in this flow test.
import {LoopSkillRuntime as HostLoopSkillRuntime} from '../../../host-loop-skills.mjs'

const session = {sessionId: 'ses_legacy'} as unknown as ClientSessionContext
const workspace = {workspaceId: 'wsp_local', path: '/tmp/work', displayTitle: 'Work'}
const exactCommit = 'abc123'

function request(): CandidateRequest {
  return {
    query: '',
    position: 'leading',
    drilled: false,
    signal: new AbortController().signal,
  }
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 40; index += 1) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  assert.fail('condition did not settle')
}

test('legacy catalog selection reaches Host pre-step with its exact commit handle', async () => {
  let catalogCalls = 0
  const failures: Error[] = []
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
            sessionId: 'ses_legacy',
            catalog: 'skills',
            bindingRevision: 'binding:1',
            agentId: 'agt_1',
            identityFingerprint: 'scope:1',
          },
          data: {
            items: [{
              skillId: 'skl_legacy',
              libraryName: 'Legacy Library',
              name: 'legacy',
              description: 'Legacy work',
              path: 'skills/legacy/SKILL.md',
              versionId: `git:${exactCommit}`,
              commitSha: exactCommit,
              sourceRevision: 'skill:legacy',
            }],
            revision: 'catalog:legacy',
            hasMore: false,
            truncated: false,
          },
        },
      }
    },
  } as unknown as LoopHostClient
  const client = new LoopSkillRuntime({
    remote,
    workspaceForSession: () => workspace,
    formatFailure: failure => failure.message,
    showFailure: error => failures.push(error),
  })
  let source: InputTriggerSource | null = null
  client.registerSource({
    registerSource(value) {
      source = value
      return () => {}
    },
  } as never, 'Loop · Skills')
  assert.ok(source)
  source.warm?.(session)
  await waitUntil(() => catalogCalls === 1)
  const candidates = await source.candidates(session, request())
  assert.equal(candidates.length, 1)
  const picked = source.onPick({
    candidate: candidates[0]!,
    session,
    position: 'leading',
    via: 'menu',
    action: 'pick',
    span: {start: 0, end: 1},
  })
  assert.ok(picked !== undefined && picked !== 'handled' && 'insert' in picked)

  const contentCalls: Array<Record<string, unknown>> = []
  const actions = {
    async skillContent(input: Record<string, unknown>) {
      contentCalls.push(input)
      const content = '# Legacy Skill\nUse the exact repository snapshot.'
      return {
        data: {
          skillId: input.skillId,
          path: input.path,
          versionId: `git:${exactCommit}`,
          commitSha: '',
          content,
          contentBase64: '',
          contentSha256: 'sha256:test',
          sizeBytes: Buffer.byteLength(content, 'utf8'),
          offset: 0,
          nextOffset: Buffer.byteLength(content, 'utf8'),
          hasMore: false,
        },
      }
    },
  }
  const host = new HostLoopSkillRuntime(
    {workspaceRegistry: {list: () => [{
      id: 'wsp_local',
      sessionIds: ['ses_legacy'],
    }]}},
    {
      actions,
      getActions: () => actions,
      skillSupport: {
        createUserMessage: (value: unknown) => value,
        renderSkillContent: (value: {content: string; resourceBase: {description: string}}) =>
          `${value.resourceBase.description}\n${value.content}`,
      },
    },
  )
  const injected = await host.injectClaimedUserSkills(
    {session: {id: 'ses_legacy'}},
    [{
      id: 'user-message',
      source: {kind: 'user'},
      content: [{type: 'text', text: `Use ${picked.insert.ref}`}],
    }],
    {kind: 'enter', messages: []},
    new AbortController().signal,
  )

  assert.deepEqual(failures, [])
  assert.equal(contentCalls.length, 1)
  assert.equal(contentCalls[0]!.expectedCommitSha, exactCommit)
  assert.equal(contentCalls[0]!.expectedVersionId, undefined)
  assert.equal(injected.messages.length, 1)
  assert.equal(injected.messages[0].source.kind, 'skill-invocation')
  assert.match(injected.messages[0].content[0].text, /existing bash tool/u)
  assert.ok(injected.messages[0].content[0].text.includes(
    'loop-proxy call skill.content {"skillId":"skl_legacy","path":"<relative-path>","expectedCommitSha":"abc123"}',
  ))

  client.dispose()
  host.dispose()
})

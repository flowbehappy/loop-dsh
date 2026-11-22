import {loopSkillCodec} from '../loop-skill-reference.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import type {
  CandidateRequest,
  ClientSessionContext,
  InputTriggerSource,
} from '@deepseek-ai/dsh-client-ui-input-trigger/client'

import {skillCatalogFailureText} from '../failure-text.ts'
import {LoopSkillRuntimeError} from '../loop-skill-errors.ts'
import {LoopSkillRuntime} from '../loop-skill-runtime.ts'
import {en, ja, zh, zhTW} from '../locales.ts'
import type {LoopHostClient, RemoteFailure} from '../types.ts'

const session = {sessionId: 'ses_localization'} as unknown as ClientSessionContext
const workspace = {workspaceId: 'wsp_local', path: '/tmp/work', displayTitle: 'Work'}

function translator(dictionary: Record<string, string>) {
  return ((key: string) => dictionary[key] ?? key) as unknown as Parameters<
    typeof skillCatalogFailureText
  >[0]
}

function localizedFormatter(dictionary: Record<string, string>) {
  const t = translator(dictionary)
  return (failure: RemoteFailure): string => skillCatalogFailureText(t, failure)
}

function encodedReference(value: Record<string, unknown>): string {
  return `<loop-skill-ref>${Buffer.from(JSON.stringify(value)).toString('base64url')}</loop-skill-ref>`
}

function reference(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    sessionId: 'ses_localization',
    skillId: 'skl_localization',
    path: 'skills/review/SKILL.md',
    versionId: 'ctv_exact',
    sourceRevision: 'skill:revision',
    name: 'loop-skill-localization',
    displayName: 'Loop · Localization',
    libraryName: 'Localization Library',
    ...overrides,
  }
}

async function rejection(promise: Promise<unknown>): Promise<LoopSkillRuntimeError> {
  try {
    await promise
    assert.fail('expected a rejected serializer error')
  } catch (error) {
    assert.ok(error instanceof LoopSkillRuntimeError)
    return error
  }
}

test('serializer rejections carry localized messages without duplicate notices', async () => {
  let locale = en as Record<string, string>
  const failures: Error[] = []
  const runtime = new LoopSkillRuntime({
    remote: {} as LoopHostClient,
    workspaceForSession: id => id === "ses_inactive" ? undefined : workspace,
    formatFailure: failure => localizedFormatter(locale)(failure),
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
  const signal = new AbortController().signal

  const cases: Array<{
    readonly name: string
    readonly value: string
    readonly code: string
  }> = [
    {
      name: 'invalid-reference',
      value: 'not-a-reference',
      code: 'loop-skill/invalid-reference',
    },
    {
      name: 'invalid-version-handle',
      value: encodedReference(reference({versionId: 'ctv_exact', commitSha: 'different'})),
      code: 'loop-skill/invalid-version-handle',
    },
    {
      name: 'reference-too-large',
      value: encodedReference(reference({libraryName: 'x'.repeat(17_000)})),
      code: 'loop-skill/reference-too-large',
    },
    {
      name: 'unsupported-path',
      value: encodedReference(reference({path: '../SKILL.md'})),
      code: 'loop-skill/unsupported-path',
    },
    {
      name: 'inactive-session',
      value: encodedReference(reference({sessionId: 'ses_inactive'})),
      code: 'loop-skill/session-inactive',
    },
  ]

  for (const dictionary of [en, zh, zhTW, ja]) {
    locale = dictionary
    for (const item of cases) {
      const error = await rejection(source.codec!.serialize(item.value, signal))
      assert.equal(error.code, item.code, item.name)
      assert.equal(
        error.message,
        skillCatalogFailureText(translator(dictionary), {code: item.code, message: ''}),
        item.name,
      )
    }
  }
  assert.equal(failures.length, 0, 'the DSH composer owns serializer failure presentation')

  const codec = loopSkillCodec('ses_localization', failure => localizedFormatter(locale)(failure))
  for (const dictionary of [en, zh, zhTW, ja]) {
    locale = dictionary
    const mismatch = await rejection(codec.serialize(
      encodedReference(reference({sessionId: 'ses_other'})),
      signal,
    ))
    assert.equal(mismatch.code, 'loop-skill/session-mismatch')
    assert.equal(
      mismatch.message,
      skillCatalogFailureText(translator(dictionary), {
        code: 'loop-skill/session-mismatch',
        message: '',
      }),
    )
  }
  assert.equal(failures.length, 0)

  runtime.dispose()
})

test('candidate rejections notify once with an already localized message', async () => {
  const scenarios: Array<{
    readonly label: string
    readonly catalog: () => Promise<never>
    readonly code: string
  }> = [
    {
      label: 'known remote failure',
      catalog: async () => {
        throw Object.assign(new Error('raw backend URL https://loop.invalid'), {
          code: 'loop-host/backend-unavailable',
        })
      },
      code: 'loop-host/backend-unavailable',
    },
    {
      label: 'generic remote failure',
      catalog: async () => {
        throw new Error('raw backend detail')
      },
      code: 'loop-skill/internal',
    },
  ]

  for (const dictionary of [en, zh, zhTW, ja]) {
    for (const scenario of scenarios) {
      const failures: Error[] = []
      const runtime = new LoopSkillRuntime({
        remote: {skillCatalog: scenario.catalog} as unknown as LoopHostClient,
        workspaceForSession: () => workspace,
        formatFailure: localizedFormatter(dictionary),
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
      const error = await rejection(source.candidates(session, request()))
      const expected = skillCatalogFailureText(translator(dictionary), {
        code: scenario.code,
        message: '',
      })
      assert.equal(error.code, scenario.code, scenario.label)
      assert.equal(error.message, expected, scenario.label)
      assert.equal(failures.length, 1, scenario.label)
      assert.equal(failures[0]!.message, expected, scenario.label)
      assert.doesNotMatch(failures[0]!.message, /raw backend|https:\/\//u, scenario.label)
      runtime.dispose()
    }
  }
})

test('workspace failures stay silent during warmup and localize explicit requests', async () => {
  for (const dictionary of [en, zh, zhTW, ja]) {
    const failures: Error[] = []
    const runtime = new LoopSkillRuntime({
      remote: {} as LoopHostClient,
      workspaceForSession: () => undefined,
      formatFailure: localizedFormatter(dictionary),
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
    assert.doesNotThrow(() => source.warm?.(session))
    assert.equal(failures.length, 0)
    await assert.rejects(source.candidates(session, request()))
    assert.equal(failures.length, 1)
    assert.equal((failures[0] as LoopSkillRuntimeError).code, 'loop-host/workspace-required')
    assert.equal(
      failures[0]!.message,
      skillCatalogFailureText(translator(dictionary), {
        code: 'loop-host/workspace-required',
        message: '',
      }),
    )
    runtime.dispose()
  }
})

function request(): CandidateRequest {
  return {
    query: '',
    position: 'leading',
    drilled: false,
    signal: new AbortController().signal,
  }
}

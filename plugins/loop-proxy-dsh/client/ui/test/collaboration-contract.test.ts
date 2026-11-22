import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import remote from '../../../remote.mjs'

const bundle = readFileSync(new URL('../../../client.js', import.meta.url), 'utf8')
const packageJSON = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
) as { dsh?: { client?: { inject?: string[] } } }
const clientEntry = readFileSync(new URL('../../index.ts', import.meta.url), 'utf8')

test('client uses the published collaboration Host method names', () => {
  for (const name of [
    'collaborationStatus',
    'collaborationBoards',
    'collaborationBind',
    'collaborationDirectory',
    'prepareCollaborationIntent',
    'bindCollaborationIntent',
    'cancelCollaborationIntent',
    'collaborationReconcile',
    'collaborationEvents',
  ]) {
    assert.ok(
      Object.hasOwn(remote.methods, `loopHost/${name}`),
      `missing Host method ${name}`,
    )
    assert.match(bundle, new RegExp(name, 'u'))
  }
  assert.doesNotMatch(bundle, /collaborationPrepareIntent|collaborationBindIntent/u)
})

test('generated client keeps native composer and pending-submission integration', () => {
  assert.match(bundle, /registerSource/u)
  assert.match(bundle, /pendingSubmissions/u)
  assert.match(bundle, /bindCollaborationContinuation/u)
  assert.match(bundle, /continuation-unavailable/u)
  assert.match(bundle, /name: "conversation\.composer\.dock"/u)
  assert.match(bundle, /Share review was cancelled/u)
  assert.doesNotMatch(bundle, /share-preview-required/u)
})

test('package composition declares the bundled services used by the client', () => {
  const inject = packageJSON.dsh?.client?.inject ?? []
  for (const dependency of [
    '@deepseek-ai/dsh-api-session-controller',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-ui-input-trigger',
    '@deepseek-ai/dsh-client-locale',
  ]) {
    assert.ok(inject.includes(dependency), `missing client composition dependency ${dependency}`)
  }
  assert.match(clientEntry, /'sessions'/u)
  assert.match(clientEntry, /'inputTriggers'/u)
})

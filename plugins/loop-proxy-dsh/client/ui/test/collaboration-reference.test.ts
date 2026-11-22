import test from 'node:test'
import assert from 'node:assert/strict'

import {
  collaborationDigest,
  collaborationRequestId,
  decodeCollaborationReference,
  encodeCollaborationReference,
  serializeCollaborationReference,
} from '../collaboration-reference.ts'

const reference = {
  version: 1,
  sessionId: 'ses_alpha',
  targetId: 'agt_research',
  targetType: 'agent',
  stableRef: 'agent:agt_research',
  displayName: '研究员',
  bindingRevision: 'rev-1',
} as const

test('reference round-trips stable IDs and localized labels without secrets', () => {
  const encoded = encodeCollaborationReference(reference)
  assert.deepEqual(decodeCollaborationReference(encoded), reference)
  assert.equal(decodeCollaborationReference('@wrong'), null)
  assert.equal(decodeCollaborationReference('loop-collab:v1:not-base64!'), null)
})

test('model serialization is escaped and carries no authority claim', () => {
  assert.equal(
    serializeCollaborationReference({
      ...reference,
      stableRef: 'agent&target',
      displayName: '<Research>',
    }),
    '<loop-collaboration type="agent" target="agt_research" ref="agent&amp;target">&lt;Research&gt;</loop-collaboration>',
  )
})

test('digest and request IDs match the Host contract', async () => {
  assert.match(
    await collaborationDigest('你好 Loop'),
    /^sha256:[a-f0-9]{64}$/u,
  )
  assert.match(
    collaborationRequestId('bind'),
    /^bind_[A-Za-z0-9][A-Za-z0-9_.:]{0,199}$/u,
  )
})

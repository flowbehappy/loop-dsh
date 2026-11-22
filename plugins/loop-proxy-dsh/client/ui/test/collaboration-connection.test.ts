import test from 'node:test'
import assert from 'node:assert/strict'

import {
  boardPickerPresentation,
  collaborationAccountName,
  collaborationConnectionAction,
  worksiteCollapsedStatus,
} from '../collaboration-connection.ts'
import type { CollaborationStatus } from '../types.ts'

function status(state: CollaborationStatus['state']): CollaborationStatus {
  return {
    state,
    capability: {
      available: false,
      delegable: false,
      notifiable: false,
      conditionalNotify: false,
      respond: false,
      followup: false,
      review: false,
      cancel: false,
    },
    subscription: {
      state: 'stopped',
      subscriptionId: '',
      lastEventSeq: 0,
      snapshotRequired: false,
    },
    active: [],
    deliveries: [],
  }
}

test('first-run actions are truthful for unauthorized, empty, bound, and recovery states', () => {
  assert.deepEqual(collaborationConnectionAction(status('needs-auth'), 'ready'), {
    label: 'collab.dialog.connectSignIn',
    target: 'canonical',
    disabled: false,
  })
  assert.deepEqual(collaborationConnectionAction(status('unbound'), 'ready'), {
    label: 'collab.dialog.chooseBoardAction',
    target: 'boards',
    disabled: false,
  })
  assert.deepEqual(collaborationConnectionAction(status('needs-board'), 'ready'), {
    label: 'collab.dialog.chooseBoardAction',
    target: 'boards',
    disabled: false,
  })
  assert.equal(
    collaborationConnectionAction(status('target-unavailable'), 'ready').label,
    'collab.dialog.repairConnection',
  )
  assert.equal(
    collaborationConnectionAction(status('revoked'), 'ready').label,
    'collab.dialog.repairConnection',
  )
})

test('loading disables the action and an offline status keeps an explicit reconnect route', () => {
  assert.deepEqual(collaborationConnectionAction(null, 'loading'), {
    label: 'collab.dialog.openConnection',
    target: 'canonical',
    disabled: true,
  })
  assert.deepEqual(collaborationConnectionAction(null, 'error'), {
    label: 'collab.dialog.openConnection',
    target: 'canonical',
    disabled: false,
  })
})

test('missing Human account display uses a safe label rather than the Agent or raw account id', () => {
  assert.equal(
    collaborationAccountName(
      { accountName: '' },
      'Account name unavailable',
    ),
    'Account name unavailable',
  )
  assert.equal(
    collaborationAccountName(
      { accountName: 'QA Owner' },
      'Account name unavailable',
    ),
    'QA Owner',
  )
})

test('board picker presentation keeps failed loads distinct from a successful empty result', () => {
  assert.equal(boardPickerPresentation({ busy: 'boards', error: null, boards: [] }), 'loading')
  assert.equal(
    boardPickerPresentation({ busy: null, error: { code: 'offline' }, boards: [] }),
    'error',
  )
  assert.equal(boardPickerPresentation({ busy: null, error: null, boards: [] }), 'empty')
  assert.equal(
    boardPickerPresentation({ busy: null, error: null, boards: [{ boardId: 'board' }] }),
    'choices',
  )
})

test('collapsed worksite attention covers actionable failures without hiding healthy connection', () => {
  assert.equal(worksiteCollapsedStatus('needs_enable'), 'needs_enable')
  assert.equal(worksiteCollapsedStatus('registration_conflict'), 'attention')
  assert.equal(worksiteCollapsedStatus('state_changed'), 'attention')
  assert.equal(worksiteCollapsedStatus('blocked'), 'attention')
  assert.equal(worksiteCollapsedStatus('offline'), 'attention')
  assert.equal(worksiteCollapsedStatus('connecting'), null)
  assert.equal(worksiteCollapsedStatus('connected'), null)
  assert.equal(worksiteCollapsedStatus('stopped'), null)
  assert.equal(worksiteCollapsedStatus(undefined), null)
})

import assert from 'node:assert/strict'
import test from 'node:test'

import { showTargetSelection } from '../selection.ts'

test('zero Projects after sign-in keep the creation surface available', () => {
  assert.equal(showTargetSelection({
    projects: [],
    challengeId: 'challenge-project',
    agents: [{ agentId: 'agent-release', displayName: 'Release Agent' }],
  }), true)
})

test('an unconsumed login challenge keeps the sign-in surface', () => {
  assert.equal(showTargetSelection({
    projects: [],
    challengeId: null,
    agents: [],
  }), false)
})

test('project choices remain visible even if the Agent projection is empty', () => {
  assert.equal(showTargetSelection({
    projects: [{
      workspaceId: 'loop-workspace',
      workspaceName: 'Loop',
      projectId: 'project-release',
      projectName: 'Release',
      role: 'view',
    }],
    challengeId: 'challenge-project',
    agents: [],
  }), true)
})

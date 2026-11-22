import test from 'node:test'
import assert from 'node:assert/strict'

import {formatModelDisplayName} from '../model-display-name.ts'
import type {LoopModelDescriptor} from '../types.ts'

const zhLabels = {
  'settings.modelsSourcePersonal': '个人',
  'settings.modelsSourceOrganization': '组织',
  'settings.modelsSourceLoopHosted': 'Loop 托管',
} as const

function descriptor(overrides: Partial<LoopModelDescriptor>): LoopModelDescriptor {
  return {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    source: 'loop_proxy',
    providerId: 'opvd_org',
    providerName: 'DeepSeek',
    wireApi: 'openai-completions',
    ...overrides,
  }
}

test('Settings localizes a personal-only picker label through the existing locale table', () => {
  const model = descriptor({
    source: 'loop_personal',
    providerId: 'ump_profile',
    name: 'DeepSeek V4 Pro · Personal · DeepSeek',
  })
  assert.equal(
    formatModelDisplayName(model, key => zhLabels[key]),
    'DeepSeek V4 Pro · 个人 · DeepSeek',
  )
})

test('Settings localizes colliding organization and hosted labels', () => {
  assert.equal(formatModelDisplayName(descriptor({
    name: 'Shared Model · Organization · DeepSeek',
  }), key => zhLabels[key]), 'Shared Model · 组织 · DeepSeek')
  assert.equal(formatModelDisplayName(descriptor({
    source: 'loop_hosted',
    providerId: '',
    providerName: '',
    name: 'Shared Model · Loop hosted',
  }), key => zhLabels[key]), 'Shared Model · Loop 托管')
})

test('Settings leaves a non-colliding organization picker label unchanged', () => {
  assert.equal(
    formatModelDisplayName(descriptor({name: 'Organization model'}), key => zhLabels[key]),
    'Organization model',
  )
})

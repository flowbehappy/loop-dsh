import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LOOP_DEFAULT_PATH,
  LOOP_MODULES,
  loopModuleForPanel,
  loopPanelForPath,
  loopResourceLink,
} from '../loop-navigation.ts'

test('keeps only Tasks in the sidebar and moves the other Loop modules to More', () => {
  assert.equal(new Set(LOOP_MODULES.map(module => module.id)).size, LOOP_MODULES.length)
  assert.deepEqual(
    LOOP_MODULES.filter(module => module.placement === 'sidebar').map(module => module.id),
    ['loop-tasks'],
  )
  assert.deepEqual(
    LOOP_MODULES.filter(module => module.placement === 'more').map(module => module.id),
    [
      'loop-inbox',
      'loop-contacts',
      'loop-projects',
      'loop-workflows',
      'loop-knowledge',
      'loop-drive',
      'loop-dataspaces',
      'loop-capabilities',
      'loop-connectors',
    ],
  )
  assert.equal(loopModuleForPanel('loop')?.id, undefined)
  assert.equal(loopModuleForPanel('loop-tasks')?.path, LOOP_DEFAULT_PATH)
  for (const module of LOOP_MODULES) assert.equal(loopPanelForPath(module.path), module.id)
  assert.equal(loopModuleForPanel('loop-contacts')?.path, '/contacts')
  assert.equal(loopModuleForPanel('loop-workflows')?.path, '/workflows/schedules')
  assert.equal(loopModuleForPanel('loop-capabilities')?.path, '/exports/roles')
})

test('keeps detail and nested routes in their owning native module', () => {
  assert.equal(
    loopPanelForPath('/tasks/by-id/tsk_1?tab=activity'),
    'loop-tasks',
  )
  assert.equal(
    loopPanelForPath('/channels/chn_1/tasks/42'),
    'loop-tasks',
  )
  assert.equal(
    loopPanelForPath('/inbox/tasks/chn_1/42'),
    'loop-tasks',
  )
  assert.equal(
    loopPanelForPath('/inbox/workflow-runs/wri_1'),
    'loop-workflows',
  )
  assert.equal(loopPanelForPath('/kb/kb_1?view=files'), 'loop-knowledge')
  assert.equal(loopPanelForPath('/drives/drv_1/files'), 'loop-drive')
  assert.equal(loopPanelForPath('/dataspaces/ds_1'), 'loop-dataspaces')
  assert.equal(loopPanelForPath('/capabilities/skills/skill_1'), 'loop-capabilities')
  assert.equal(loopPanelForPath('/w/wsp_1/exports/skills/skill_1'), 'loop-capabilities')
  assert.equal(loopPanelForPath('/exports/roles?tab=skills'), 'loop-capabilities')
  assert.equal(loopPanelForPath('/settings/agent-roles'), 'loop-capabilities')
  assert.equal(loopPanelForPath('/settings/agent-skills'), 'loop-capabilities')
  assert.equal(loopPanelForPath('/contacts/members'), 'loop-contacts')
  assert.equal(loopPanelForPath('/machines/mac_1'), 'loop-contacts')
  assert.equal(loopPanelForPath('/inbox/service-accounts/sa_1'), 'loop-inbox')
  assert.equal(loopPanelForPath('/w/wsp_other/projects/proj_1/tasks'), 'loop-projects')
  assert.equal(loopPanelForPath('/projects'), 'loop-projects')
  assert.equal(loopPanelForPath('/projects/prj_1'), 'loop-projects')
  assert.equal(loopPanelForPath('/projects/prj_1/tasks'), 'loop-projects')
  assert.equal(loopPanelForPath('/automations/automations'), 'loop-workflows')
})

test('unknown transitional routes do not steal sidebar selection', () => {
  assert.equal(loopPanelForPath('/workspaces'), null)
  assert.equal(loopPanelForPath('/login'), null)
  assert.equal(loopPanelForPath('/new-session'), null)
})

test('resolves resource URLs using the shared module map and preserves the full destination', () => {
  for (const [path, panelId] of [
    ['/w/ws_1/kb/kb_1/documents/doc_1?view=edit#heading', 'loop-knowledge'],
    ['/w/ws_1/tasks/by-id/task_1?tab=activity#reply', 'loop-tasks'],
    ['/inbox/dm/member_1', 'loop-inbox'],
    ['/connectors/example?view=installed', 'loop-connectors'],
    ['/inbox/tasks/ch_1/42', 'loop-tasks'],
    ['/projects/prj_1/tasks', 'loop-projects'],
    ['/drives/drv_1/files?path=a%2Fb', 'loop-drive'],
    ['/dataspaces/ds_1', 'loop-dataspaces'],
    ['/exports/skills/skill_1', 'loop-capabilities'],
    ['/contacts/members/member_1', 'loop-contacts'],
    ['/workflows/wf_1', 'loop-workflows'],
  ]) {
    assert.deepEqual(loopResourceLink(`https://loop.test${path}`, 'https://loop.test/'), {panelId, path})
    assert.deepEqual(loopResourceLink(`https://loop.test/tenant/loop${path}`, 'https://loop.test/tenant/loop/'), {panelId, path})
  }
  assert.deepEqual(loopResourceLink('http://localhost:5173/kb/k', 'http://localhost:5173'), {
    panelId: 'loop-knowledge', path: '/kb/k',
  })
})

test('does not claim another origin, ambiguous URL, non-resource route or neighboring installation', () => {
  for (const href of [
    'https://loop.test.evil/kb/k', 'https://other.test/kb/k',
    'https://loop.test:444/kb/k', 'http://loop.test/kb/k',
    'https://user:secret@loop.test/kb/k', '//loop.test/kb/k', '/kb/k',
    'javascript:alert(1)', 'https://loop.test/lo\\gin', 'https://loop.test/kb/k\n',
    'https://loop.test/login', 'https://loop.test/api/v1/files/id/download',
    'https://loop.test/external-host/page-login#token=secret',
    'https://loop.test/kb/../login', 'https://loop.test/kb/%2e%2e/login',
    'https://loop.test/kb-other/k', 'https://loop.test//kb/k',
  ]) assert.equal(loopResourceLink(href, 'https://loop.test'), null, href)
  assert.equal(loopResourceLink('https://loop.test/kb/k', null), null)
  assert.equal(loopResourceLink('https://loop.test/loop-other/kb/k', 'https://loop.test/loop'), null)
  assert.equal(loopResourceLink('https://loop.test/kb/k', 'https://loop.test/loop'), null)
  assert.equal(loopResourceLink('https://loop.test/loop//kb/k', 'https://loop.test/loop'), null)
})

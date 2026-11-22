import test from 'node:test'
import assert from 'node:assert/strict'
import { en } from '../locales.ts'
import type { BindingView, WorkspaceRef } from '../types.ts'
import { buildWorkspaceMenu } from '../workspace-menu.ts'

const WORKSPACE: WorkspaceRef = {
  workspaceId: 'workspace-a',
  path: '/synthetic/a',
  displayTitle: 'tidb-release',
}

const t = (key: keyof typeof en, values?: Record<string, string | number>): string => {
  let value: string = en[key]
  for (const [name, replacement] of Object.entries(values ?? {})) {
    value = value.replaceAll(`{${name}}`, String(replacement))
  }
  return value
}

function active(): BindingView {
  return {
    state: 'active',
    revision: 'revision-2',
    workspace: WORKSPACE,
    loop: {
      serviceBaseUrl: 'https://loop.synthetic.test',
      workspaceId: 'loop-workspace',
      projectId: 'project-release',
      defaultChannelId: 'channel-conversation',
      workspaceName: '研发团队',
      projectName: 'TiDB 9.0 发布',
      webUrl: 'https://loop.synthetic.test/projects/project-release',
    },
    account: { displayName: '小林' },
    agent: { id: 'agent-release', displayName: '发布助手' },
  }
}

test('workspace menu exposes active project actions without raw ids or commands', () => {
  const modes: string[] = []
  const opened: Array<{ projectId: string; serviceBaseUrl: string }> = []
  const rows = buildWorkspaceMenu(WORKSPACE, { ok: true, value: active() }, t, {
    open: (_target, mode) => { modes.push(mode) },
    openProject: target => { opened.push(target) },
  })
  assert.equal(rows[0]?.label, 'Loop project: 研发团队 / TiDB 9.0 发布')
  assert.deepEqual(rows.map(row => row.label), [
    'Loop project: 研发团队 / TiDB 9.0 发布',
    'Open Loop project',
    'View project connection',
    'Switch project',
    'Unlink project',
  ])
  assert.doesNotMatch(rows.map(row => row.label).join(' '), /workspace-a|project-release|revision-2|loop-proxy/)
  assert.doesNotMatch(rows.map(row => row.label).join(' '), /channel|频道/i)
  assert.equal(rows.some(row => row.label === 'View Loop project'), false)
  rows[1]?.run?.()
  rows[2]?.run?.()
  rows[3]?.run?.()
  rows[4]?.run?.()
  assert.deepEqual(opened, [{
    projectId: 'project-release',
    loopWorkspaceId: 'loop-workspace',
    serviceBaseUrl: 'https://loop.synthetic.test',
  }])
  assert.deepEqual(modes, ['inspect', 'switch', 'unbind'])
})

test('unbound workspace uses the workspace-title menu as the primary entry', () => {
  const rows = buildWorkspaceMenu(WORKSPACE, {
    ok: true,
    value: { ...active(), state: 'unbound', loop: undefined },
  }, t, { open: () => {}, openProject: () => {} })
  assert.deepEqual(rows.map(row => row.label), ['Connect Loop project…'])
})

test('status failure remains recoverable and uses the captured workspace', () => {
  let captured: WorkspaceRef | undefined
  const rows = buildWorkspaceMenu(WORKSPACE, {
    ok: false,
    error: { code: 'loop/offline', message: 'offline' },
  }, t, { open: target => { captured = target }, openProject: () => {} })
  rows[0]?.run?.()
  assert.equal(rows[0]?.label, 'Loop connection unavailable…')
  assert.deepEqual(captured, WORKSPACE)
})

test('a non-current workspace uses only its captured target and creates no Session prerequisite', () => {
  const captured: WorkspaceRef[] = []
  const target: WorkspaceRef = {
    workspaceId: 'workspace-b',
    path: '/synthetic/b',
    displayTitle: 'tidb-regression',
  }
  const rows = buildWorkspaceMenu(target, {
    ok: true,
    value: {
      ...active(),
      workspace: target,
      loop: {
        ...active().loop!,
        projectId: 'project-regression',
        projectName: '回归测试',
      },
    },
  }, t, {
    open: workspace => { captured.push(workspace) },
    openProject: () => {},
  })
  rows.find(row => row.id === 'inspect')?.run?.()
  assert.deepEqual(captured, [target])
  assert.equal(rows.some(row => row.id === 'channel'), false)
})

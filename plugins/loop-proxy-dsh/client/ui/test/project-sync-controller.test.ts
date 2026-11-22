import test from 'node:test'
import assert from 'node:assert/strict'
import { LoopProjectSyncController } from '../project-sync-controller.ts'
import type {
  LoopHostClient,
  ProjectSyncSettings,
} from '../types.ts'

const settings: ProjectSyncSettings = {
  enabled: true,
  defaultRoot: '/Loop',
  serverUrl: 'https://loop.synthetic.test/',
  loopWorkspaceId: 'loop-ws-alpha',
  state: 'needs_auth',
  projects: [],
}

function remote(overrides: Partial<LoopHostClient> = {}): LoopHostClient {
  return {
    status: async () => { throw new Error('not used') },
    beginBind: async () => { throw new Error('not used') },
    completeBind: async () => { throw new Error('not used') },
    unbind: async () => { throw new Error('not used') },
    sessionContext: async () => { throw new Error('not used') },
    syncStatus: async () => { throw new Error('not used') },
    setSync: async () => { throw new Error('not used') },
    ...overrides,
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 50; index += 1) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  assert.fail('condition did not settle')
}

test('reads upload authorization without requesting a challenge or syncing', async () => {
  let syncCalls = 0
  const controller = new LoopProjectSyncController({
    remote: remote({
      projectSyncSettings: async () => ({ ok: true, value: settings }),
      syncProjects: async () => {
        syncCalls += 1
        throw new Error('must not sync')
      },
    }),
    openExternal: () => true,
  })

  await controller.open()

  assert.equal(syncCalls, 0)
  assert.equal(controller.store.getSnapshot().screen, 'ready')
  assert.equal(controller.store.getSnapshot().settings?.enabled, true)
  assert.equal(controller.store.getSnapshot().settings?.state, 'needs_auth')
  assert.equal(controller.store.getSnapshot().challenge, null)
})

test('explicit connect obtains one sign-in challenge without changing local workspaces', async () => {
  let setCalls = 0
  let syncCalls = 0
  const controller = new LoopProjectSyncController({
    remote: remote({
      projectSyncSettings: async () => ({ ok: true, value: settings }),
      setProjectSyncSettings: async () => {
        setCalls += 1
        throw new Error('connect must not persist settings')
      },
      syncProjects: async () => {
        syncCalls += 1
        return {
          ok: true,
          value: {
            ...settings,
            imported: 0,
            updated: 0,
            skipped: 0,
            challenge: {
              id: 'connect-challenge',
              loginUrl: 'https://loop.synthetic.test/connect',
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
          },
        }
      },
    }),
    openExternal: () => true,
  })

  await controller.open()
  assert.equal(syncCalls, 0)
  controller.actions.connect()
  await waitFor(() => controller.store.getSnapshot().challenge !== null)

  assert.equal(setCalls, 0)
  assert.equal(syncCalls, 1)
  assert.equal(controller.store.getSnapshot().challenge?.id, 'connect-challenge')
})

test('authorization shows one challenge and continues with the same sync action', async t => {
  const opened: string[] = []
  let syncCalls = 0
  const controller = new LoopProjectSyncController({
    remote: remote({
      projectSyncSettings: async () => ({
        ok: true,
        value: { ...settings, enabled: true, state: 'needs_auth' },
      }),
      syncProjects: async () => {
        syncCalls += 1
        return {
          ok: true,
          value: {
            ...settings,
            enabled: true,
            state: 'needs_auth',
            imported: 0,
            updated: 0,
            skipped: 0,
            challenge: {
              id: 'challenge-1',
              loginUrl: 'https://loop.synthetic.test/login',
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
          },
        }
      },
    }),
    openExternal: url => {
      opened.push(url)
      return true
    },
  })

  await controller.open()
  controller.actions.refresh()
  await waitFor(() => controller.store.getSnapshot().challenge !== null)
  assert.equal(controller.store.getSnapshot().challenge?.id, 'challenge-1')
  t.after(() => controller.dispose())
  controller.actions.openChallenge()
  assert.deepEqual(opened, ['https://loop.synthetic.test/login'])
  assert.equal(controller.store.getSnapshot().challengeOpened, true)
  controller.actions.continueAfterAuth()
  await waitFor(() => syncCalls === 2)
  assert.equal(syncCalls, 2)
})

test('a completed sign-in refreshes the module login once; ordinary refresh preserves its page', async () => {
  let authorized = 0
  const controller = new LoopProjectSyncController({
    remote: remote({
      projectSyncSettings: async () => ({ok:true,value:settings}),
      syncProjects: async () => ({ok:true,value:{...settings,state:'ready',projects:[],imported:1,updated:0,skipped:0}}),
    }),
    openExternal: () => true,
    onAuthorized: () => { authorized += 1 },
  })
  await controller.open()
  controller.actions.refresh()
  await waitFor(() => controller.store.getSnapshot().busy === null)
  assert.equal(authorized,1)
  controller.actions.refresh()
  await waitFor(() => controller.store.getSnapshot().busy === null)
  assert.equal(authorized,1)
})

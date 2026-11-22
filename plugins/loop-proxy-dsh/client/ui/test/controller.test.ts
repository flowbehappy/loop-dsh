import test from 'node:test'
import assert from 'node:assert/strict'
import { LoopUiController } from '../controller.ts'
import type {
  BindingView,
  BeginBindResult,
  LoopHostClient,
  RemoteResult,
  SyncState,
  WorkspaceRef,
} from '../types.ts'

const WORKSPACE_A: WorkspaceRef = {
  workspaceId: 'workspace-a',
  path: '/synthetic/a',
  displayTitle: 'tidb-release',
}

const WORKSPACE_B: WorkspaceRef = {
  workspaceId: 'workspace-b',
  path: '/synthetic/b',
  displayTitle: 'tidb-regression',
}

function activeBinding(workspace: WorkspaceRef = WORKSPACE_A): BindingView {
  return {
    state: 'active',
    revision: 'revision-2',
    workspace,
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

function remote(overrides: Partial<LoopHostClient> = {}): LoopHostClient {
  return {
    status: async () => ({ ok: true, value: activeBinding() }),
    beginBind: async () => ({ ok: true, value: { state: 'active', binding: activeBinding() } }),
    completeBind: async () => ({ ok: true, value: { binding: activeBinding() } }),
    unbind: async () => ({
      ok: true,
      value: { binding: { ...activeBinding(), state: 'unbound', loop: undefined } },
    }),
    sessionContext: async input => ({
      ok: true,
      value: {
        sessionId: input.sessionId,
        state: 'inherited',
        bindingRevision: 'revision-2',
        projectId: 'project-release',
        defaultChannelId: 'channel-conversation',
      },
    }),
    syncStatus: async () => ({
      ok: true,
      value: {
        state: 'off',
        pending: 0,
        historyPartial: false,
      },
    }),
    setSync: async input => ({
      ok: true,
      value: {
        sync: {
          state: input.enabled ? 'on' : 'off',
          pending: input.enabled ? 3 : 0,
          historyPartial: false,
          ...(input.enabled
            ? { destination: { channelId: 'channel-conversation', topicId: 'topic-release' } }
            : {}),
        },
      },
    }),
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

async function waitForAsync(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.fail('condition did not settle')
}

test('first binding stores only the Host login challenge and opens it on a user gesture', async () => {
  const opened: string[] = []
  const begin: BeginBindResult = {
    state: 'needs_auth',
    binding: { ...activeBinding(), state: 'needs_auth', loop: undefined },
    challenge: {
      id: 'challenge-auth',
      loginUrl: 'https://loop.synthetic.test/login/challenge',
      expiresAt: '2026-11-07T12:00:00Z',
    },
  }
  const controller = new LoopUiController({
    remote: remote({
      status: async () => ({
        ok: true,
        value: { ...activeBinding(), state: 'unbound', loop: undefined },
      }),
      beginBind: async () => ({ ok: true, value: begin }),
    }),
    openExternal: url => {
      opened.push(url)
      return true
    },
  })
  await controller.openWorkspace(WORKSPACE_A, 'bind')
  assert.equal(controller.store.getSnapshot().screen, 'binding')
  assert.equal(controller.store.getSnapshot().loginOpened, false)
  assert.equal(opened.length, 0)
  controller.actions.openLogin()
  assert.deepEqual(opened, ['https://loop.synthetic.test/login/challenge'])
  assert.equal(controller.store.getSnapshot().loginOpened, true)
})

test('needs-auth status starts the Host login challenge during first bind', async () => {
  let beginCalls = 0
  const controller = new LoopUiController({
    remote: remote({
      status: async () => ({
        ok: true,
        value: { ...activeBinding(), state: 'needs_auth', loop: undefined },
      }),
      beginBind: async () => {
        beginCalls += 1
        return {
          ok: true,
          value: {
            state: 'needs_auth',
            binding: { ...activeBinding(), state: 'needs_auth', loop: undefined },
            challenge: {
              id: 'challenge-first-bind',
              loginUrl: 'https://loop.synthetic.test/login/first-bind',
              expiresAt: '2026-11-07T12:00:00Z',
            },
          },
        }
      },
    }),
    openExternal: () => true,
  })

  await controller.openWorkspace(WORKSPACE_A, 'bind')

  assert.equal(beginCalls, 1)
  assert.equal(controller.store.getSnapshot().screen, 'binding')
  assert.equal(controller.store.getSnapshot().challengeId, 'challenge-first-bind')
  assert.equal(
    controller.store.getSnapshot().loginUrl,
    'https://loop.synthetic.test/login/first-bind',
  )
  assert.equal(controller.store.getSnapshot().error, null)
})

test('inspect starts the binding challenge when status has no login URL', async () => {
  let beginCalls = 0
  const controller = new LoopUiController({
    remote: remote({
      status: async () => ({
        ok: true,
        value: { ...activeBinding(), state: 'needs_auth', loop: undefined },
      }),
      beginBind: async () => {
        beginCalls += 1
        return {
          ok: true,
          value: {
            state: 'needs_auth',
            binding: { ...activeBinding(), state: 'needs_auth', loop: undefined },
            challenge: {
              id: 'challenge-open-login',
              loginUrl: 'https://loop.synthetic.test/login/open',
              expiresAt: '2026-11-07T12:00:00Z',
            },
          },
        }
      },
    }),
    openExternal: () => true,
  })

  await controller.openWorkspace(WORKSPACE_A, 'inspect')
  assert.equal(beginCalls, 1)
  assert.equal(
    controller.store.getSnapshot().loginUrl,
    'https://loop.synthetic.test/login/open',
  )
  assert.equal(controller.store.getSnapshot().error, null)
})

test('active binding still asks Host for an explicit switch flow', async () => {
  const modes: Array<'bind' | 'switch' | undefined> = []
  const controller = new LoopUiController({
    remote: remote({
      beginBind: async input => {
        modes.push(input.mode)
        return {
          ok: true,
          value: {
            state: 'select_target',
            binding: activeBinding(),
            challenge: {
              id: 'challenge-switch',
              loginUrl: 'https://loop.synthetic.test/login/switch',
              expiresAt: '2026-11-07T12:00:00Z',
            },
            projects: [{
              workspaceId: 'loop-workspace',
              workspaceName: '研发团队',
              projectId: 'project-regression',
              projectName: '回归测试',
              role: 'edit',
            }],
            agents: [{ agentId: 'agent-release', displayName: '发布助手' }],
          },
        }
      },
    }),
    openExternal: () => true,
  })
  await controller.openWorkspace(WORKSPACE_A, 'switch')
  assert.deepEqual(modes, ['switch'])
  assert.equal(controller.store.getSnapshot().selectedProjectId, 'project-regression')
})

test('project switch completes against the previously shown binding revision', async () => {
  let completed: {
    readonly challengeId: string
    readonly projectId: string
    readonly agentId: string
    readonly expectedRevision?: string
  } | undefined
  const controller = new LoopUiController({
    remote: remote({
      beginBind: async () => ({
        ok: true,
        value: {
          state: 'select_target',
          binding: activeBinding(),
          challenge: {
            id: 'challenge-switch',
            loginUrl: 'https://loop.synthetic.test/login/switch',
            expiresAt: '2026-11-07T12:00:00Z',
          },
          projects: [{
            workspaceId: 'loop-workspace',
            workspaceName: '研发团队',
            projectId: 'project-regression',
            projectName: '回归测试',
            role: 'edit',
          }],
          agents: [{ agentId: 'agent-release', displayName: '发布助手' }],
        },
      }),
      completeBind: async input => {
        completed = input
        return { ok: true, value: { binding: activeBinding() } }
      },
    }),
    openExternal: () => true,
  })
  await controller.openWorkspace(WORKSPACE_A, 'switch')
  await controller.completeBind()
  assert.deepEqual(completed && {
    challengeId: completed.challengeId,
    projectId: completed.projectId,
    agentId: completed.agentId,
    expectedRevision: completed.expectedRevision,
  }, {
    challengeId: 'challenge-switch',
    projectId: 'project-regression',
    agentId: 'agent-release',
    expectedRevision: 'revision-2',
  })
})

test('sync toggle applies only the Host-returned durable state', async () => {
  let rejectWrite = true
  const controller = new LoopUiController({
    remote: remote({
      setSync: async input => {
        if (rejectWrite) {
          return { ok: false, error: { code: 'loop/sync-conflict', message: 'retry later' } }
        }
        return {
          ok: true,
          value: {
            sync: {
              state: input.enabled ? 'on' : 'off',
              destination: { channelId: 'channel-conversation', topicId: 'topic-release' },
              pending: 0,
              historyPartial: false,
              lastReceipt: { sourceSequence: 41, acceptedAt: '2026-11-07T12:00:00Z' },
            },
          },
        }
      },
    }),
    openExternal: () => true,
  })
  await controller.openWorkspace(WORKSPACE_A, 'inspect', 'session-synthetic')
  await waitFor(() => controller.store.getSnapshot().sync !== null)
  assert.equal(controller.store.getSnapshot().sync?.state, 'off')
  await controller.toggleSync(true)
  assert.equal(controller.store.getSnapshot().sync?.state, 'off')
  assert.equal(controller.store.getSnapshot().syncError?.code, 'loop/sync-conflict')
  rejectWrite = false
  await controller.toggleSync(true)
  assert.equal(controller.store.getSnapshot().sync?.state, 'on')
  assert.equal(controller.store.getSnapshot().sync?.lastReceipt?.sourceSequence, 41)
})

test('one sync authorization click opens the browser and resumes the original Session intent', async () => {
  const opened: string[] = []
  const calls: Array<{sessionId: string; enabled: boolean}> = []
  let closed = 0
  let authorized = false
  const challenge = {
    id: 'sync-challenge',
    loginUrl: 'https://loop.synthetic.test/oauth/authorize?scope=loop.host_sync',
    expiresAt: '2026-11-07T12:00:00Z',
  }
  const controller = new LoopUiController({
    remote: remote({
      syncStatus: async () => ({
        ok: true,
        value: { state: 'needs_auth', pending: 0, historyPartial: false },
      }),
      setSync: async input => {
        calls.push({ sessionId: input.sessionId, enabled: input.enabled })
        if (!input.enabled) {
          return {
            ok: true,
            value: { sync: { state: 'off', pending: 0, historyPartial: false } },
          }
        }
        return {
          ok: true,
          value: {
            sync: authorized
              ? {
                  state: 'on',
                  pending: 0,
                  historyPartial: false,
                  destination: { channelId: 'channel-conversation' },
                }
              : {
                  state: 'needs_auth',
                  pending: 0,
                  historyPartial: false,
                  challenge,
                },
          },
        }
      },
    }),
    openExternal: () => false,
    prepareExternal: () => ({
      open: url => {
        opened.push(url)
        return true
      },
      close: () => { closed += 1 },
    }),
    syncPollIntervalMs: 5,
  })
  await controller.openWorkspace(WORKSPACE_A, 'inspect', 'session-synthetic')
  await waitFor(() => controller.store.getSnapshot().sync !== null)
  await controller.authorizeSync()
  assert.equal(controller.store.getSnapshot().sync?.state, 'needs_auth')
  assert.equal(controller.store.getSnapshot().sync?.challenge?.id, challenge.id)
  assert.deepEqual(opened, [challenge.loginUrl])
  assert.equal(controller.store.getSnapshot().syncLoginOpened, true)
  assert.equal(calls.length, 1)
  assert.equal(closed, 0)
  authorized = true
  await waitForAsync(() => controller.store.getSnapshot().sync?.state === 'on')
  assert.ok(calls.length >= 2)
  assert.ok(calls.every(call => (
    call.sessionId === 'session-synthetic' && call.enabled === true
  )))
  assert.equal(controller.store.getSnapshot().syncLoginOpened, false)
})

for (const stopDuringRefresh of [false, true]) {
  test(`sync consent survives a concurrent status refresh; explicit stop=${stopDuringRefresh}`, async t => {
    const challenge = {
      id: 'sync-refresh-race', loginUrl: 'https://loop.synthetic.test/authorize',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }
    let finishRefresh!: (value: RemoteResult<SyncState>) => void
    let authorized = false
    const writes: boolean[] = []
    const controller = new LoopUiController({
      remote: remote({
        syncStatus: async () => ({ok: true, value: {state: 'needs_auth', pending: 0, historyPartial: false}}),
        retrySync: () => new Promise(resolve => { finishRefresh = resolve }),
        setSync: async input => {
          writes.push(input.enabled)
          return {ok: true, value: {sync: !input.enabled || authorized
            ? {state: input.enabled ? 'on' : 'off', pending: 0, historyPartial: false}
            : {state: 'needs_auth', pending: 0, historyPartial: false, challenge}}}
        },
      }),
      openExternal: () => true,
      prepareExternal: () => ({open: () => true, close: () => {}}),
      syncPollIntervalMs: 5,
    })
    t.after(() => controller.dispose())
    await controller.openWorkspace(WORKSPACE_A, 'inspect', 'session-refresh')
    await waitFor(() => controller.store.getSnapshot().sync !== null)
    await controller.authorizeSync()
    const refresh = controller.refreshSync()
    await waitFor(() => finishRefresh !== undefined)
    // Keep the independent status read busy across the authorization poll tick.
    await new Promise(resolve => setTimeout(resolve, 20))
    authorized = true
    finishRefresh({ok: true, value: {state: 'off', pending: 0, historyPartial: false}})
    await refresh
    if (stopDuringRefresh) {
      await controller.toggleSync(false)
      const stoppedWrites = writes.length
      await new Promise(resolve => setTimeout(resolve, 30))
      assert.equal(controller.store.getSnapshot().sync?.state, 'off')
      assert.equal(writes.length, stoppedWrites)
    } else {
      await waitForAsync(() => controller.store.getSnapshot().sync?.state === 'on')
      assert.equal(controller.store.getSnapshot().syncLoginOpened, false)
      assert.deepEqual(writes, [true, true])
    }
  })
}

test('an existing sync challenge opens synchronously without another Host write', async () => {
  const opened: string[] = []
  const challenge = {
    id: 'sync-challenge-existing',
    loginUrl: 'https://loop.synthetic.test/oauth/authorize?scope=loop.host_sync',
    expiresAt: '2026-11-07T12:00:00Z',
  }
  let writes = 0
  const controller = new LoopUiController({
    remote: remote({
      syncStatus: async () => ({
        ok: true,
        value: { state: 'needs_auth', pending: 0, historyPartial: false, challenge },
      }),
      setSync: async () => {
        writes += 1
        throw new Error('must not write an existing challenge')
      },
    }),
    openExternal: url => {
      opened.push(url)
      return true
    },
    syncPollIntervalMs: 60_000,
  })
  await controller.openWorkspace(WORKSPACE_A, 'inspect', 'session-synthetic')
  await waitFor(() => controller.store.getSnapshot().sync?.challenge !== undefined)
  await controller.authorizeSync()
  assert.deepEqual(opened, [challenge.loginUrl])
  assert.equal(writes, 0)
  controller.dispose()
})

test('closing sync while the Host request is pending closes the click-owned browser window', async () => {
  let resolveSet!: (value: Awaited<ReturnType<NonNullable<LoopHostClient['setSync']>>>) => void
  let closed = 0
  const opened: string[] = []
  const controller = new LoopUiController({
    remote: remote({
      syncStatus: async () => ({
        ok: true,
        value: { state: 'needs_auth', pending: 0, historyPartial: false },
      }),
      setSync: async () => await new Promise(resolve => { resolveSet = resolve }),
    }),
    openExternal: () => false,
    prepareExternal: () => ({
      open: url => {
        opened.push(url)
        return true
      },
      close: () => { closed += 1 },
    }),
  })
  await controller.openWorkspace(WORKSPACE_A, 'inspect', 'session-synthetic')
  await waitFor(() => controller.store.getSnapshot().sync?.state === 'needs_auth')
  const authorization = controller.authorizeSync()
  while (resolveSet === undefined) await new Promise(resolve => setTimeout(resolve, 0))
  controller.actions.close()
  resolveSet({
    ok: true,
    value: {
      sync: {
        state: 'needs_auth',
        pending: 0,
        historyPartial: false,
        challenge: {
          id: 'late-challenge',
          loginUrl: 'https://loop.synthetic.test/oauth/authorize',
          expiresAt: '2026-11-07T12:00:00Z',
        },
      },
    },
  })
  await authorization
  assert.equal(closed, 1)
  assert.deepEqual(opened, [])
})

test('denied sync authorization stays off and never claims local success', async () => {
  let closed = 0
  const controller = new LoopUiController({
    remote: remote({
      syncStatus: async () => ({
        ok: true,
        value: { state: 'needs_auth', pending: 0, historyPartial: false },
      }),
      setSync: async () => ({
        ok: true,
        value: {
          sync: {
            state: 'needs_auth',
            pending: 0,
            historyPartial: false,
            reason: 'Authorization was not granted',
          },
        },
      }),
    }),
    openExternal: () => true,
    prepareExternal: () => ({
      open: () => true,
      close: () => { closed += 1 },
    }),
  })
  await controller.openWorkspace(WORKSPACE_A, 'inspect', 'session-synthetic')
  await waitFor(() => controller.store.getSnapshot().sync !== null)
  await controller.authorizeSync()
  assert.equal(controller.store.getSnapshot().sync?.state, 'needs_auth')
  assert.equal(controller.store.getSnapshot().sync?.reason, 'Authorization was not granted')
  assert.equal(controller.store.getSnapshot().syncError, null)
  assert.equal(closed, 1)
})

test('unbind uses the active binding revision and requires explicit mode', async () => {
  let expectedRevision = ''
  const controller = new LoopUiController({
    remote: remote({
      unbind: async input => {
        expectedRevision = input.expectedRevision
        return { ok: true, value: { binding: { ...activeBinding(), state: 'unbound', loop: undefined } } }
      },
    }),
    openExternal: () => true,
  })
  await controller.openWorkspace(WORKSPACE_A, 'unbind')
  assert.equal(controller.store.getSnapshot().confirmUnbind, true)
  await controller.unbind()
  assert.equal(expectedRevision, 'revision-2')
  assert.equal(controller.store.getSnapshot().binding?.state, 'unbound')
})

test('expired Disconnect page exposes same-Human login without creating an Agent grant', async () => {
  let beginCalls = 0
  let opened = ''
  const recoveryModes: (string | undefined)[] = []
  const controller = new LoopUiController({
    remote: remote({
      unbind: async input => {
        recoveryModes.push(input.recoveryMode)
        return {
          ok: false,
          error: {
            code: 'loop-host/disconnect-auth-required',
            message: 'page expired',
            details: {
              challenge: {
                id: 'disconnect-reauth',
                loginUrl: 'https://loop.synthetic.test/external-host/disconnect#challenge=c&state=s',
                expiresAt: '2026-11-09T12:00:00Z',
                recoveryMode: 'human_confirmed',
              },
            },
          },
        }
      },
      beginBind: async () => {
        beginCalls += 1
        return {
          ok: true,
          value: {
            state: 'needs_auth',
            binding: activeBinding(),
            challenge: {
              id: 'disconnect-reauth',
              loginUrl: 'https://loop.synthetic.test/login/disconnect',
              expiresAt: '2026-11-09T12:00:00Z',
            },
          },
        }
      },
    }),
    openExternal: url => {
      opened = url
      return true
    },
  })
  await controller.openWorkspace(WORKSPACE_A, 'unbind')
  await controller.unbind()
  assert.equal(beginCalls, 0)
  assert.equal(controller.store.getSnapshot().screen, 'active')
  assert.equal(
    controller.store.getSnapshot().disconnectChallenge?.id,
    'disconnect-reauth',
  )
  assert.equal(
    controller.store.getSnapshot().error,
    null,
  )
  controller.actions.openDisconnectLogin()
  assert.equal(
    opened,
    'https://loop.synthetic.test/external-host/disconnect#challenge=c&state=s',
  )
  assert.equal(controller.store.getSnapshot().disconnectLoginOpened, true)
  controller.actions.checkDisconnect()
  await waitFor(() => recoveryModes.length === 2)
  assert.deepEqual(recoveryModes, [undefined, 'human_confirmed'])
})

test('a stale status response cannot replace a newer captured workspace', async () => {
  let releaseA: ((result: RemoteResult<BindingView>) => void) | undefined
  const statusA = new Promise<RemoteResult<BindingView>>(resolve => { releaseA = resolve })
  const controller = new LoopUiController({
    remote: remote({
      status: input => input.workspaceId === WORKSPACE_A.workspaceId
        ? statusA
        : Promise.resolve({ ok: true, value: activeBinding(WORKSPACE_B) }),
    }),
    openExternal: () => true,
  })
  const first = controller.openWorkspace(WORKSPACE_A, 'inspect')
  await controller.openWorkspace(WORKSPACE_B, 'inspect')
  releaseA?.({ ok: true, value: activeBinding(WORKSPACE_A) })
  await first
  assert.equal(controller.store.getSnapshot().workspace?.workspaceId, WORKSPACE_B.workspaceId)
  assert.equal(controller.store.getSnapshot().binding?.workspace.workspaceId, WORKSPACE_B.workspaceId)
})

test('project creation selects the Host-returned project without pretending the bind is complete', async () => {
  const controller = new LoopUiController({
    remote: remote({
      status: async () => ({
        ok: true,
        value: { ...activeBinding(), state: 'unbound', loop: undefined },
      }),
      beginBind: async () => ({
        ok: true,
        value: {
          state: 'select_target',
          binding: activeBinding(),
          challenge: {
            id: 'challenge-project',
            loginUrl: 'https://loop.synthetic.test/login/project',
            expiresAt: '2026-11-07T12:00:00Z',
          },
          projects: [],
          agents: [{ agentId: 'agent-release', displayName: '发布助手' }],
        },
      }),
      createProject: async input => {
        assert.equal(input.prefix, 'RELEASE')
        return {
          ok: true,
          value: {
            workspaceId: 'loop-workspace',
            workspaceName: '研发团队',
            projectId: 'project-new',
            projectName: input.name,
            defaultChannelId: 'channel-new',
            role: 'owner',
          },
        }
      },
    }),
    openExternal: () => true,
  })
  await controller.openWorkspace(WORKSPACE_A, 'bind')
  controller.actions.changeNewProjectName('新发布项目')
  controller.actions.changeNewProjectPrefix('release')
  await controller.createProject()
  assert.equal(controller.store.getSnapshot().selectedProjectId, 'project-new')
  assert.equal(controller.store.getSnapshot().screen, 'binding')
  assert.equal(controller.store.getSnapshot().projects.length, 1)
})

test('project creation refuses a missing task prefix before calling the Host', async () => {
  let createCalls = 0
  const controller = new LoopUiController({
    remote: remote({
      status: async () => ({
        ok: true,
        value: { ...activeBinding(), state: 'unbound', loop: undefined },
      }),
      beginBind: async () => ({
        ok: true,
        value: {
          state: 'select_target',
          binding: activeBinding(),
          challenge: {
            id: 'challenge-project',
            loginUrl: 'https://loop.synthetic.test/login/project',
            expiresAt: '2026-11-07T12:00:00Z',
          },
          projects: [],
          agents: [{ agentId: 'agent-release', displayName: '发布助手' }],
        },
      }),
      createProject: async () => {
        createCalls += 1
        throw new Error('createProject must not be called without a prefix')
      },
    }),
    openExternal: () => true,
  })
  await controller.openWorkspace(WORKSPACE_A, 'bind')
  controller.actions.changeNewProjectName('新发布项目')
  await controller.createProject()
  assert.equal(createCalls, 0)
  assert.equal(controller.store.getSnapshot().error?.code, 'loop/project-prefix-invalid')
})

test('sync status without an inherited Session fails closed', async () => {
  const controller = new LoopUiController({
    remote: remote({
      sessionContext: async input => ({
        ok: true,
        value: {
          sessionId: input.sessionId,
          state: 'blocked',
          bindingRevision: 'revision-2',
          reason: 'Project access changed',
        },
      }),
      syncStatus: async () => ({ ok: true, value: {
        state: 'on',
        pending: 0,
        historyPartial: false,
      } as SyncState }),
    }),
    openExternal: () => true,
  })
  await controller.openWorkspace(WORKSPACE_A, 'inspect', 'session-blocked')
  await waitFor(() => controller.store.getSnapshot().syncError !== null)
  assert.equal(controller.store.getSnapshot().sync, null)
  assert.equal(controller.store.getSnapshot().syncError?.code, 'loop/sync-blocked')
})

test('opening a confirmed binding routes the shared Loop project and closes the overlay', async () => {
  const opened: Array<{ projectId: string; serviceBaseUrl: string }> = []
  const controller = new LoopUiController({
    remote: remote(),
    openExternal: () => true,
    openLoopProject: async target => {
      opened.push(target)
      return true
    },
  })

  await controller.openWorkspace(WORKSPACE_A, 'inspect')
  await controller.openProject()

  assert.deepEqual(opened, [{
    projectId: 'project-release',
    loopWorkspaceId: 'loop-workspace',
    serviceBaseUrl: 'https://loop.synthetic.test',
  }])
  assert.equal(controller.store.getSnapshot().screen, 'closed')
})

test('an unavailable global project target keeps the binding overlay open', async () => {
  const controller = new LoopUiController({
    remote: remote(),
    openExternal: () => true,
    openLoopProject: async () => false,
  })

  await controller.openWorkspace(WORKSPACE_A, 'inspect')
  await controller.openProject()

  assert.equal(controller.store.getSnapshot().screen, 'active')
  assert.equal(controller.store.getSnapshot().error?.code, 'loop/project-target')
})

test('an unbound Workspace never offers the project-open route', async () => {
  let calls = 0
  const controller = new LoopUiController({
    remote: remote({
      status: async () => ({
        ok: true,
        value: { ...activeBinding(), state: 'unbound', loop: undefined },
      }),
    }),
    openExternal: () => true,
    openLoopProject: async () => {
      calls += 1
      return true
    },
  })

  await controller.openWorkspace(WORKSPACE_A, 'inspect')
  await controller.openProject()

  assert.equal(calls, 0)
  assert.equal(controller.store.getSnapshot().screen, 'binding')
})

test('switch selection starts from the current binding rather than the first Project', async () => {
  const controller = new LoopUiController({
    remote: remote({
      beginBind: async () => ({
        ok: true,
        value: {
          state: 'select_target',
          binding: activeBinding(),
          challenge: {
            id: 'challenge-switch',
            loginUrl: 'https://loop.synthetic.test/login/switch',
            expiresAt: '2026-11-07T12:00:00Z',
          },
          projects: [
            {
              workspaceId: 'loop-workspace',
              workspaceName: '研发团队',
              projectId: 'project-other',
              projectName: '另一个项目',
              role: 'edit',
            },
            {
              workspaceId: 'loop-workspace',
              workspaceName: '研发团队',
              projectId: 'project-release',
              projectName: 'TiDB 9.0 发布',
              role: 'manage',
            },
          ],
          agents: [{ agentId: 'agent-release', displayName: '发布助手' }],
        },
      }),
    }),
    openExternal: () => true,
  })

  await controller.openWorkspace(WORKSPACE_A, 'switch')

  assert.equal(controller.store.getSnapshot().selectedProjectId, 'project-release')
  assert.equal(controller.store.getSnapshot().mode, 'switch')
})

test('Workspace-required guidance can close the dialog and open the global Loop page', async () => {
  let opened = 0
  const controller = new LoopUiController({
    remote: remote(),
    openExternal: () => true,
    openLoopModules: () => { opened += 1 },
  })

  await controller.openWorkspace(WORKSPACE_A, 'bind')
  controller.actions.openLoopModules()

  assert.equal(opened, 1)
  assert.equal(controller.store.getSnapshot().screen, 'closed')
})

test('a detached expired-challenge reload action reruns beginBind and keeps the workspace', async () => {
  let beginCalls = 0
  let completeCalls = 0
  let bindLocale: 'zh' | 'en' | undefined = 'zh'
  const beginLocales: Array<'zh' | 'en' | undefined> = []
  const controller = new LoopUiController({
    remote: remote({
      status: async () => ({
        ok: true,
        value: { ...activeBinding(), state: 'unbound', loop: undefined },
      }),
      beginBind: async input => {
        beginCalls += 1
        beginLocales.push(input.locale)
        return {
          ok: true,
          value: {
            state: 'select_target',
            binding: { ...activeBinding(), state: 'unbound', loop: undefined },
            challenge: {
              id: `challenge-${beginCalls}`,
              loginUrl: `https://loop.synthetic.test/login/challenge-${beginCalls}`,
              expiresAt: '2026-11-07T12:00:00Z',
            },
            projects: [{
              workspaceId: 'loop-workspace',
              workspaceName: '研发团队',
              projectId: 'project-release',
              projectName: 'TiDB 9.0 发布',
              role: 'owner',
            }],
            agents: [{ agentId: 'agent-release', displayName: 'QA Coordinator' }],
          },
        }
      },
      completeBind: async () => {
        completeCalls += 1
        return {
          ok: false,
          error: {
            code: 'loop-host/challenge-expired',
            message: 'The setup challenge was consumed',
          },
        }
      },
    }),
    openExternal: () => true,
    beginBindLocale: () => bindLocale,
  })

  await controller.openWorkspace(WORKSPACE_A, 'bind', 'session-local-draft')
  assert.equal(controller.store.getSnapshot().challengeId, 'challenge-1')
  await controller.completeBind()
  assert.equal(
    controller.store.getSnapshot().error?.code,
    'loop-host/challenge-expired',
  )

  const retryFromDetachedReactHandler = controller.actions.connect
  bindLocale = 'en'
  retryFromDetachedReactHandler()
  await waitFor(() =>
    beginCalls === 2 &&
    controller.store.getSnapshot().challengeId === 'challenge-2')

  assert.equal(controller.store.getSnapshot().workspace?.workspaceId, WORKSPACE_A.workspaceId)
  assert.equal(controller.store.getSnapshot().sessionId, 'session-local-draft')
  assert.equal(controller.store.getSnapshot().mode, 'bind')
  assert.equal(controller.store.getSnapshot().error, null)
  assert.equal(controller.store.getSnapshot().projects.length, 1)
  assert.equal(controller.store.getSnapshot().agents[0]?.displayName, 'QA Coordinator')
  assert.equal(completeCalls, 1)
  assert.deepEqual(beginLocales, ['zh', 'en'])
})

test('beginBind omits locale when no Harness provider is configured', async () => {
  let receivedLocale: 'zh' | 'en' | undefined
  const controller = new LoopUiController({
    remote: remote({
      status: async () => ({
        ok: true,
        value: { ...activeBinding(), state: 'unbound', loop: undefined },
      }),
      beginBind: async input => {
        receivedLocale = input.locale
        return {
          ok: true,
          value: {
            state: 'select_target',
            binding: { ...activeBinding(), state: 'unbound', loop: undefined },
            challenge: {
              id: 'challenge-no-locale',
              loginUrl: 'https://loop.synthetic.test/login/no-locale',
              expiresAt: '2026-11-07T12:00:00Z',
            },
            projects: [],
            agents: [],
          },
        }
      },
    }),
    openExternal: () => true,
  })

  await controller.openWorkspace(WORKSPACE_A, 'bind')
  assert.equal(receivedLocale, undefined)
})

test('a detached connection retry action reruns beginBind after a backend failure', async () => {
  let beginCalls = 0
  const controller = new LoopUiController({
    remote: remote({
      status: async () => ({
        ok: false,
        error: {
          code: 'loop-host/backend-unavailable',
          message: 'discovery failed',
        },
      }),
      beginBind: async () => {
        beginCalls += 1
        return { ok: true, value: { state: 'active', binding: activeBinding() } }
      },
    }),
    openExternal: () => true,
  })

  await controller.openWorkspace(WORKSPACE_A, 'inspect')
  assert.equal(
    controller.store.getSnapshot().error?.code,
    'loop-host/backend-unavailable',
  )

  const retryFromDetachedReactHandler = controller.actions.connect
  retryFromDetachedReactHandler()
  await waitFor(() =>
    beginCalls === 1 &&
    controller.store.getSnapshot().screen === 'active')

  assert.equal(controller.store.getSnapshot().workspace?.workspaceId, WORKSPACE_A.workspaceId)
  assert.equal(controller.store.getSnapshot().error, null)
})

test('a detached waiting-for-access action rechecks the captured workspace', async () => {
  let statusCalls = 0
  const controller = new LoopUiController({
    remote: remote({
      status: async () => {
        statusCalls += 1
        if (statusCalls === 1) {
          return {
            ok: false,
            error: {
              code: 'loop-host/waiting-for-access',
              message: 'project access is required',
            },
          }
        }
        return { ok: true, value: activeBinding() }
      },
    }),
    openExternal: () => true,
  })

  await controller.openWorkspace(WORKSPACE_A, 'inspect')
  assert.equal(
    controller.store.getSnapshot().error?.code,
    'loop-host/waiting-for-access',
  )

  const retryFromDetachedReactHandler = controller.actions.retry
  retryFromDetachedReactHandler()
  await waitFor(() =>
    statusCalls === 2 &&
    controller.store.getSnapshot().screen === 'active')

  assert.equal(controller.store.getSnapshot().workspace?.workspaceId, WORKSPACE_A.workspaceId)
  assert.equal(controller.store.getSnapshot().error, null)
})

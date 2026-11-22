// Launched by Loop's TestNativeHumanParityIntegration. No live Host is used.
import assert from 'node:assert/strict'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { NativeHostActions } from '../backend/adapter.ts'
import { HostCredentialStore } from '../backend/credentials.ts'

const {
  NATIVE_PARITY_BASE: base, NATIVE_PARITY_STATE: stateHome, NATIVE_PARITY_USER: user,
  NATIVE_PARITY_WORKSPACE: workspace, NATIVE_PARITY_PROJECT: project,
  NATIVE_PARITY_OTHER_PROJECT: otherProject, NATIVE_PARITY_BROWSER: browser,
} = process.env

test('native Human OAuth and management action agree with the real Loop API', { timeout: 20_000 }, async t => {
  assert.match(base, /^http:\/\/127\.0\.0\.1:[1-9][0-9]*$/u, 'fixture requires a local httptest origin')
  assert.ok(stateHome && user && workspace && project && otherProject && browser, 'run from the Go parity fixture')
  const installation = 'fixture-installation'
  const archive = 'project.archive'
  const allowedActions = [archive]
  const resourceConstraints = ['project:' + project]
  const resource = base + '/api/v1/workspaces/' + workspace + '/external/human'
  const accounts = new Map()
  let pending = Promise.resolve()
  const provider = {
    readRecord: async key => structuredClone(accounts.get(key)),
    modifyRecord(key, mutate) {
      const done = pending.then(async () => {
        const next = await mutate(structuredClone(accounts.get(key)))
        if (next !== undefined) accounts.set(key, structuredClone(next))
        return structuredClone(accounts.get(key))
      })
      pending = done.catch(() => {})
      return done
    },
  }
  const agent = new HostCredentialStore(provider, base, workspace, installation)
  const human = new HostCredentialStore(provider, base, workspace, installation, { account: user, connection: 'business' })
  const agentToken = 'fixture-agent-access'
  const grantId = 'fixture-agent-grant'
  await agent.publish({
    version: 1, principal_id: user, workspace_id: workspace,
    client_id: 'fixture-agent-client', token_endpoint: base + '/api/v1/auth/oauth/token',
    resource: agent.resource, grant_id: grantId, scope: 'loop.host offline_access',
    access_token: agentToken, refresh_token: 'fixture-agent-refresh',
    access_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  })
  const wire = []
  const loopFetch = (url, options) => {
    assert.equal(new URL(url).origin, base)
    return fetch(url, { ...options, redirect: 'error', signal: options?.signal ?? AbortSignal.timeout(3000) })
  }
  const adapter = new NativeHostActions({
    stateHome, serviceBaseUrl: base, loopWorkspaceId: workspace, installationId: installation,
    pageOrigin: base, syncProfile: 'native-parity', accountPrincipal: user, authorizationSettings: false,
  }, {
    provider,
    fetch: async (raw, init) => {
      const url = new URL(raw)
      assert.equal(url.origin, base)
      const token = new Headers(init?.headers).get('Authorization')
      // Real native owner gate, with only its Agent verification dependency stubbed.
      if (url.pathname === '/api/v1/auth/external-host/session') {
        assert.equal(init.method, 'POST')
        assert.equal(token, 'Bearer ' + agentToken)
        assert.equal(JSON.parse(init.body).installationId, installation)
        return Response.json({ principalId: user, workspaceId: workspace, grantId })
      }
      assert.notEqual(token, 'Bearer ' + agentToken, 'never send the Agent token to a Human endpoint')
      assert.equal(init.redirect, 'error')
      const response = await loopFetch(url, init)
      wire.push([init?.method ?? 'GET', url.pathname, response.status])
      return response
    },
  })
  t.after(() => adapter.dispose())
  const args = { accountPrincipal: user, loopWorkspaceId: workspace, workspaceId: 'fixture-local-space', sessionId: 'fixture-local-session' }
  const request = (action, payload = {}) => adapter.request(action, { ...args, ...payload })
  assert.equal((await request('humanStatus')).state, 'needs_auth')
  const { challenge } = await request('beginHumanLogin', { allowedActions, resourceConstraints, manage: true })
  const login = new URL(challenge.loginUrl)
  const q = login.searchParams
  assert.equal(login.origin, base)
  assert.equal(login.pathname, '/api/v1/auth/oauth/human/authorize')
  assert.equal(q.get('resource'), resource)
  assert.equal(q.get('code_challenge_method'), 'S256')
  assert.equal(q.get('scope'), 'loop.human_access loop.human_write loop.human_manage offline_access')
  const headers = { Accept: 'application/json', Authorization: 'Bearer ' + browser }
  const inspect = await loopFetch(login, { headers })
  assert.equal(inspect.status, 200, 'real consent inspection status')
  const consent = await inspect.json()
  assert.equal(consent.principalKind, 'human')
  assert.equal(consent.human.userId, user)
  assert.equal(consent.resource, resource)
  assert.deepEqual(consent.allowedActions, allowedActions)
  assert.deepEqual(consent.resourceConstraints, resourceConstraints)

  // Synthetic consent driver: the actual issuer creates the code and redirect.
  const authorize = await loopFetch(login.origin + login.pathname, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      responseType: q.get('response_type'), clientId: q.get('client_id'), redirectUri: q.get('redirect_uri'),
      workspaceId: q.get('workspace_id'), resource: q.get('resource'), state: q.get('state'), scope: q.get('scope'),
      codeChallenge: q.get('code_challenge'), codeChallengeMethod: q.get('code_challenge_method'),
      deviceLabel: q.get('device_label'), allowedActions, resourceConstraints,
    }),
  })
  assert.equal(authorize.status, 200, 'real consent submission status')
  const approved = await authorize.json()
  const registered = new URL(q.get('redirect_uri'))
  assert.match(registered.href, /^http:\/\/127\.0\.0\.1:[1-9][0-9]*\/callback$/u)
  const callback = new URL(approved.redirectTo)
  assert.ok(callback.origin === registered.origin && callback.pathname === registered.pathname, 'issuer returns to registered loopback callback')
  assert.ok(callback.searchParams.get('state') === q.get('state'), 'issuer echoes native OAuth state')
  assert.ok(callback.searchParams.has('code'), 'issuer minted an authorization code')
  const callbackResponse = await fetch(callback, { redirect: 'error', signal: AbortSignal.timeout(3000) })
  assert.equal(callbackResponse.status, 200)
  await callbackResponse.text()
  let connected
  for (let i = 0; i < 200; i++) {
    connected = await request('completeHumanLogin', { challengeId: challenge.id })
    if (!connected.challenge) break
    await delay(25)
  }
  assert.equal(connected?.state, 'connected', 'native PKCE exchange and bearer session finish')
  const saved = await human.read()
  assert.equal(saved?.grant_id, approved.grantId)
  assert.equal(saved?.workspace_id, workspace)
  assert.ok(saved.access_token !== agentToken && saved.refresh_token, 'native Human bearer is stored separately')
  assert.equal((await agent.read()).access_token, agentToken)

  assert.deepEqual(await request('humanCatalog'), { actions: [archive] })
  // The native catalog also filters locally. Verify the server independently advertises only the frozen grant.
  const bearer = { Authorization: 'Bearer ' + saved.access_token, Accept: 'application/json' }
  const listing = await loopFetch(resource + '/actions?available=true', { headers: bearer })
  assert.equal(listing.status, 200)
  assert.deepEqual((await listing.json()).actions.map(action => action.id), [archive])
  const description = await request('humanSchema', { name: archive })
  assert.equal(description.id, archive)
  assert.equal(description.readOnly, false)
  assert.ok(description.inputSchema?.properties?.projectId, 'canonical schema carries the Project target')
  await assert.rejects(request('humanAction', { name: archive, arguments: { projectId: project } }), { code: 'loop-host/waiting-for-access' })
  await assert.rejects(request('humanSchema', { name: 'project.restore' }), { code: 'loop-host/waiting-for-access' })
  await assert.rejects(request('humanAction', {
    name: archive, requireReadOnly: false, arguments: { projectId: otherProject },
  }), { code: 'loop-host/human-action-rejected', status: 403 })
  const result = await request('humanAction', { name: archive, requireReadOnly: false, arguments: { projectId: project } })
  assert.equal(result.data?.data?.project?.id, project)
  assert.equal(result.data.data.project.status, 'archived')

  assert.equal((await request('disconnectHuman')).state, 'signed_out')
  assert.equal(await human.read(), undefined)
  assert.equal((await agent.read()).access_token, agentToken)
  const revoked = await loopFetch(resource + '/session', { headers: bearer })
  assert.equal(revoked.status, 401, 'server rejects the previously working Human bearer after disconnect')
  await revoked.body?.cancel()
  assert.ok(wire.some(([m, p, s]) => m === 'POST' && p === '/api/v1/auth/oauth/register' && s === 201), 'native used real dynamic client registration')
  assert.ok(wire.some(([m, p, s]) => m === 'DELETE' && p.endsWith('/external/human/session') && s === 204), 'native received confirmed remote revocation')
})

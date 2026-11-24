import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'

// Run against the isolated Test Hub with a real DSH Host connection. The
// worker uses its own runtime credential. Verify business effects through Loop.
export async function verifyProjectResourceJourney({
  api,
  facade,
  base,
  workspace,
  assistant,
  assistantMember,
  worker,
  workerMember,
  sessionId
}) {
  // This journey deliberately exercises owner consent, not the default grant.
  const initialSettings = '/api/v1/me/personal-assistants/' + workspace
  const initial = (await api('PUT', initialSettings)).assistant
  const {resource: _resource, ...permissions} = initial.permissions
  await api('PUT', initialSettings + '/permissions', {revision: initial.revision, permissions})
  const root = '/api/v1/workspaces/' + workspace
  const project = (
    await api('POST', root + '/projects?envelope=container', {
      name: 'wannnn',
      prefix: 'POEM'
    })
  ).project
  const caller = { workspaceId: 'directory-test', sessionId }
  const query = { type: 'project', name: 'wannnn' }
  const invoke = async (name, args) => {
    try {
      return await facade.agentAction({ ...caller, name, arguments: args })
    } catch (error) {
      throw new Error(
        name + ' ' + JSON.stringify(args) + ' returned ' + error.code,
        { cause: error }
      )
    }
  }
  const authorize = async (name, args, expected) => {
    const preview = await facade.agentAction({
      ...caller,
      name,
      arguments: args,
      delegationArguments: args,
      prepareDelegation: true
    })
    assert.deepEqual(
      [...preview.delegation.resourceConstraints].sort(),
      expected.toSorted()
    )
    const connection = 'business'
    const grant = {
      connection,
      allowedActions: [name],
      resourceConstraints: expected,
      write: preview.delegation.write,
      manage: preview.delegation.manage
    }
    await facade.disconnectHuman({ connection })
    const pending = await facade.beginHumanLogin(grant)
    const url = new URL(pending.challenge.loginUrl),
      q = url.searchParams
    const approved = await api('POST', url.pathname, {
      responseType: 'code',
      clientId: q.get('client_id'),
      redirectUri: q.get('redirect_uri'),
      workspaceId: workspace,
      resource: q.get('resource'),
      state: q.get('state'),
      scope: q.get('scope'),
      codeChallenge: q.get('code_challenge'),
      codeChallengeMethod: 'S256',
      allowedActions: [name],
      resourceConstraints: expected
    })
    const callback = await fetch(approved.redirectTo, { redirect: 'error' })
    assert.equal(callback.status, 200)
    await callback.body?.cancel()
    for (let i = 0; i < 100; i++) {
      if (
        (
          await facade.completeHumanLogin({
            connection,
            challengeId: pending.challenge.id
          })
        ).state === 'connected'
      ) {
        return (input) =>
          facade.humanAction({
            ...caller,
            connection,
            name,
            arguments: input,
            requireReadOnly: !grant.write
          })
      }
      await delay(25)
    }
    assert.fail('Human consent did not complete')
  }

  assert.ok(
    !JSON.stringify(await invoke('project.list', { name: 'wannnn' })).includes(
      project.id
    )
  )
  const lookup = await authorize('resource.lookup', query, [
    'resource-lookup:project/wannnn'
  ])
  assert.deepEqual((await lookup(query)).data.data.groups.project, [
    { id: project.id, name: 'wannnn' }
  ])
  await assert.rejects(lookup({}))
  const settings = '/api/v1/me/personal-assistants/' + workspace
  const current = (await api('PUT', settings)).assistant
  const enabled = await api('PUT', settings + '/permissions', {
    revision: current.revision,
    permissions: { ...current.permissions, resource: ['read'] }
  })
  const seen = []
  let cursor
  do {
    const page = (
      await invoke('resource.lookup', {
        limit: 1,
        ...(cursor ? { cursor } : {})
      })
    ).data.data
    const rows = Object.values(page.groups).flat()
    assert.ok(rows.length <= 1)
    for (const row of rows) {
      assert.deepEqual(Object.keys(row).sort(), ['id', 'name'])
      seen.push(row.id)
    }
    cursor = page.nextCursor
    assert.ok(seen.length < 200)
  } while (cursor)
  assert.equal(seen.filter((id) => id === project.id).length, 1)
  await api('PUT', settings + '/permissions', {
    revision: enabled.revision,
    permissions: current.permissions
  })
  await assert.rejects(invoke('resource.lookup', query))

  const workerToken = await api(
    'POST',
    '/internal/e2e/agents/' + worker.id + '/auth-token'
  )
  const machine = await api('POST', root + '/machines', { name: 'KB fixture' })
  const librarian = await api('POST', root + '/agents', {
    name: 'KB fixture',
    runtime: 'codex',
    machineId: machine.machine.id
  })
  const seed = await api(
    'POST',
    '/internal/e2e/agents/' + librarian.id + '/knowledge-base'
  )
  // The owner's assistant defaults may also select new bases. Exercise project
  // membership on its own by recording the owner's explicit direct selection.
  const directAccess =
    root + '/kb/agents/' + assistant.agentId + '/knowledge-bases/' + seed.id
  const selectDirectly = (selected) =>
    api('PUT', directAccess, { knowledgeBaseId: seed.id, selected })
  await selectDirectly(false)
  await api(
    'PUT',
    root + '/projects/' + project.id + '/resources/knowledge_base/' + seed.id
  )
  const docsURL = base + root + '/agents/' + worker.id + '/runtime/documents'
  const workerDocs = async (method, body) => {
    const response = await fetch(
      docsURL + (method === 'GET' ? '?kbId=' + seed.id : ''),
      {
        method,
        headers: {
          Authorization: 'Bearer ' + workerToken.accessToken,
          'Content-Type': 'application/json'
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      }
    )
    const status = response.status
    await response.body?.cancel()
    return status
  }
  assert.ok([403, 404].includes(await workerDocs('GET')))
  const assistantDocs = () => invoke('kb.doc-list', { kbId: seed.id })
  await assert.rejects(assistantDocs)
  for (const memberId of [assistantMember, workerMember]) {
    const args = { projectId: project.id, memberId, role: 'edit' }
    const grant = await authorize('project.grant-member', args, [
      'project:' + project.id,
      'workspace-member:' + memberId,
      'project-grant-role:edit'
    ])
    await assert.rejects(grant({ ...args, role: 'manage' }))
    const result = await grant(args)
    assert.equal(result.data.data.grant.memberId, memberId)
  }
  assert.ok(
    JSON.stringify(await invoke('project.list', { name: 'wannnn' })).includes(
      project.id
    )
  )
  const tasks = (
    await invoke('task.create', {
      projectId: project.id,
      tasks: [{ title: '写一首诗', assignee: workerMember, wake: false }]
    })
  ).data.data.tasks
  assert.equal(tasks.length, 1)
  assert.equal(tasks[0].assigneeProfile.memberId, workerMember)
  assert.equal(
    (
      await api('POST', root + '/projects/' + project.id + '/tasks/browse', {
        limit: 20
      })
    ).totalCount,
    1
  )
  assert.equal(await workerDocs('GET'), 200)
  const status = await workerDocs('POST', {
    kbId: seed.id,
    title: '写诗任务的工作记录',
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '春雨落窗前' }] }
      ]
    }
  })
  assert.ok(
    [200, 201].includes(status),
    'worker document creation HTTP ' + status
  )
  const saved = await api('GET', root + '/documents?scope=kb:' + seed.id)
  assert.equal(
    saved.filter((doc) => doc.title === '写诗任务的工作记录').length,
    1
  )
  assert.ok(
    JSON.stringify(await assistantDocs()).includes('写诗任务的工作记录')
  )
  const scopeID = tasks[0].taskScopeId
  assert.match(scopeID, /^tsk_/)
  const target = '#' + scopeID
  const note = '诗稿见知识库文档「写诗任务的工作记录」'
  const runtime = base + root + '/agents/' + worker.id + '/runtime'
  const observed = await fetch(
    runtime + '/history?channel=' + encodeURIComponent(target),
    {
      headers: { Authorization: 'Bearer ' + workerToken.accessToken }
    }
  )
  if (!observed.ok)
    assert.fail(
      'worker discussion read HTTP ' +
        observed.status +
        ' ' +
        (await observed.text()).slice(0, 300)
    )
  const beforeReply = await observed.json()
  assert.ok(beforeReply.targetKey)
  const feedback = await fetch(
    base + root + '/agents/' + worker.id + '/runtime/send',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + workerToken.accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target,
        content: note,
        clientMessageId: 'poem-worker-reply',
        freshness: {
          targetKey: beforeReply.targetKey,
          seenUpToSeq: beforeReply.coversThroughSeq ?? 0
        }
      })
    }
  )
  if (!feedback.ok) {
    const failure = await feedback.json()
    assert.fail(
      'worker task feedback HTTP ' +
        feedback.status +
        ' ' +
        JSON.stringify(failure).slice(0, 300)
    )
  }
  await feedback.body?.cancel()
  const args = { target }
  const history = await authorize('message.history', args, ['task:' + scopeID])
  assert.ok(JSON.stringify(await history(args)).includes(note))
  await api(
    'DELETE',
    root + '/projects/' + project.id + '/resources/knowledge_base/' + seed.id
  )
  const [assistantAfterUnlink, workerAfterUnlink] = await Promise.allSettled([
    assistantDocs(),
    workerDocs('GET')
  ])
  assert.equal(
    assistantAfterUnlink.status,
    'rejected',
    'Super Agent can still list project KB documents after unlink'
  )
  assert.equal(workerAfterUnlink.status, 'fulfilled')
  assert.ok(
    [403, 404].includes(workerAfterUnlink.value),
    'worker after unlink HTTP ' + workerAfterUnlink.value
  )
  await api(
    'PUT',
    root + '/projects/' + project.id + '/resources/knowledge_base/' + seed.id
  )
  await api(
    'DELETE',
    root + '/projects/' + project.id + '/grants/' + workerMember
  )
  assert.ok([403, 404].includes(await workerDocs('GET')))
  assert.ok(
    JSON.stringify(await assistantDocs()).includes('写诗任务的工作记录')
  )
  await api(
    'DELETE',
    root + '/projects/' + project.id + '/grants/' + assistantMember
  )
  await assert.rejects(assistantDocs)
  await selectDirectly(true)
  assert.ok(
    JSON.stringify(await assistantDocs()).includes('写诗任务的工作记录')
  )
  await selectDirectly(false)
  await assert.rejects(assistantDocs)
}

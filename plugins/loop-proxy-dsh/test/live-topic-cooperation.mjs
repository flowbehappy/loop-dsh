import assert from 'node:assert/strict'
import { serializeCollaborationReference } from '../client/ui/collaboration-reference.ts'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { setTimeout as delay } from 'node:timers/promises'

// Keep the provider credential in the test process, outside Loop account state.
export async function liveTopicProvider() {
  const key = (await readFile(process.env.LOOP_TEST_MODEL_FILE, 'utf8')).trim()
  const model = process.env.LOOP_TEST_MODEL_NAME || 'deepseek-v4-flash'
  let workerModelTurns = 0
  const request = async (body) => {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(90000),
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ...body, model, thinking: { type: 'disabled' } })
    })
    assert.ok(response.ok, 'DeepSeek HTTP ' + response.status)
    return response
  }
  return {
    get workerModelTurns() {
      return workerModelTurns
    },
    async stream(input, res) {
      const upstream = await request(input)
      res.writeHead(200, {
        'Content-Type': upstream.headers.get('content-type')
      })
      await pipeline(Readable.fromWeb(upstream.body), res)
    },
    async reply(instructions, messages) {
      const response = await request({
        messages: [
          { role: 'system', content: instructions },
          { role: 'user', content: JSON.stringify(messages) }
        ],
        temperature: 0,
        max_tokens: 500
      })
      const text = (await response.json()).choices[0].message.content
      assert.ok(text?.trim())
      workerModelTurns++
      return text
    }
  }
}

async function until(label, read, timeout = 120000) {
  const end = Date.now() + timeout
  do {
    const value = await read()
    if (value) return value
    await delay(250)
  } while (Date.now() < end)
  assert.fail(label)
}

// The editor's Human uses an independent account and accepts a workspace invitation.
async function inviteColleague(api, root, tag) {
  const name = 'editor_' + tag
  const account = await api(
    'POST',
    '/api/v1/auth/register',
    { name, email: name + '@example.com', password: 'Topic-Test-7!' + randomUUID() },
    ''
  )
  const peerAPI = (method, path, body) => api(method, path, body, account.accessToken)
  if (!account.user.emailVerified) {
    const mail = await peerAPI(
      'GET',
      '/internal/e2e/mailbox/latest?kind=verify&email=' + encodeURIComponent(account.user.email)
    )
    await peerAPI('POST', '/api/v1/auth/verify-email', { token: mail.token })
  }
  const invite = await api('POST', root + '/invites', { identifier: account.user.email })
  await peerAPI('POST', '/api/v1/auth/pending-invites/' + invite.inviteId + '/accept')
  return { user: account.user, api: peerAPI }
}

// A new local DSH folder and a new Loop workspace have independent identities.
export async function prepareFreshLoopWorkspace(api, originalWorkspaceId) {
  const original = '/api/v1/workspaces/' + originalWorkspaceId
  const organization = await api('GET', original + '/organization')
  const { machine } = await api('POST', original + '/machines', { name: 'Original studio' })
  const musician = await api('POST', original + '/agents', {
    machineId: machine.id, runtime: 'codex', name: 'wan_imac_ds_001'
  })
  const workspace = await api('POST', '/api/v1/workspaces', {
    organizationId: organization.id, name: 'New music studio', slug: 'studio-' + randomUUID().slice(0, 8)
  })
  assert.notEqual(workspace.id, originalWorkspaceId)
  return { id: workspace.id, oldMusicianId: musician.id }
}

export async function runLiveTopic({
  ctx,
  api,
  base,
  workspace,
  localWorkspace,
  oldMusicianId,
  sessionId,
  provider,
  trace,
  selectedModel
}) {
  const root = '/api/v1/workspaces/' + workspace
  const { assistant } = await api('PUT', '/api/v1/me/personal-assistants/' + workspace)
  const tag = randomUUID().slice(0, 8)
  const channel = await api('POST', root + '/channels', {
    name: 'review-' + tag,
    visibility: 'private'
  })
  const { machine } = await api('POST', root + '/machines', {
    name: 'Topic acceptance'
  })
  const peer = await inviteColleague(api, root, tag)
  const peerMachine = (await peer.api('POST', root + '/machines', { name: 'Editorial desk' })).machine
  async function worker(name, actor = api, hostMachine = machine) {
    const agent = await actor('POST', root + '/agents', {
      machineId: hostMachine.id,
      runtime: 'codex',
      name
    })
    const { accessToken } = await actor('POST', '/internal/e2e/agents/' + agent.id + '/auth-token')
    const runtime = base + root + '/agents/' + agent.id + '/runtime'
    const headers = {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    }
    const history = (target) =>
      fetch(runtime + '/history?channel=' + encodeURIComponent(target), {
        headers
      })
    const send = (body) =>
      fetch(runtime + '/send', {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      })
    return { agent, name, history, send }
  }
  const reviewer = await worker('Proofreader-' + tag),
    editor = await worker('Editor-' + tag),
    guest = await worker('Guest-' + tag, peer.api, peerMachine),
    outsider = await worker('Observer-' + tag)
  await api('POST', root + '/channels/' + channel.id + '/members/batch', {
    members: [assistant.agentId, reviewer.agent.id, editor.agent.id].map((agentId) => ({
      agentId,
      visibility: 'public'
    }))
  })
  await api('POST', root + '/channels/' + channel.id + '/members/batch', { members: [{ userId: peer.user.id }] })
  const memberPath = root + '/channels/' + channel.id + '/members/batch'
  const guestMembership = { members: [{ agentId: guest.agent.id, visibility: 'public' }] }
  await assert.rejects(
    api('POST', memberPath, guestMembership),
    /403/,
    'one owner cannot enroll another owner’s Agent'
  )
  await peer.api('POST', memberPath, guestMembership)
  const directory = async (w, forSession) => {
    const d = await ctx.loopHostActions.collaborationDirectory({
      sessionId: forSession,
      query: w.name,
      kinds: ['agent']
    })
    const e = d.entries.find((x) => x.agentId === w.agent.id)
    assert.ok(e)
    return {
      member: e.memberId,
      mention: serializeCollaborationReference(
        {
          version: 1,
          sessionId: forSession,
          targetType: 'agent',
          targetId: e.targetId,
          stableRef: e.stableRef,
          directoryKey: d.cacheKey,
          displayName: e.displayName
        },
        e.mention
      )
    }
  }
  const a = await directory(reviewer, sessionId),
    b = await directory(editor, sessionId)
  const freshFolder = await mkdtemp(join(dirname(process.cwd()), 'second-studio-'))
  const secondWorkspace = await ctx.workspaceRegistry.create(freshFolder, 'Second studio')
  assert.notEqual(secondWorkspace.id, localWorkspace.id)
  const other = await ctx.sessionController.create({ workspaceId: secondWorkspace.id })
  const beforeEnrollment = await ctx.loopHostActions.collaborationDirectory({
    sessionId: other.sessionId, query: 'wan_imac_ds_001', kinds: ['agent']
  })
  assert.equal(beforeEnrollment.entries.some(entry =>
    entry.agentId === oldMusicianId || entry.displayName === 'wan_imac_ds_001'), false)
  await ctx.sessionController.selectModel({
    sessionId: other.sessionId,
    ...selectedModel
  })
  await ctx.loopHostService.runtime.setSync({
    workspaceId: secondWorkspace.id,
    sessionId: other.sessionId,
    enabled: true
  })
  const receipts = []
  const off = ctx.on('session/event', (s, event) => {
    if (['user/message', 'assistant/message'].includes(event.type))
      receipts.push({
        id: s.id,
        type: event.type,
        text: JSON.stringify(event.data)
      })
  })
  const page = (id) => api('GET', root + '/scopes/' + id + '/messages')
  const taskPage = () => api('GET', root + '/channels/' + channel.id + '/tasks')
  const tasksBefore = (await taskPage()).rows.length
  const parent = '#' + channel.slug
  const label = '校对-' + tag
  const prompt =
    '请在 Loop 的 ' +
    parent +
    ' 频道发起一个「' +
    label +
    '」话题，让 ' +
    a.mention +
    ' 和 ' +
    b.mention +
    ' 讨论怎样把雨夜车站写进一首短诗，直接在同一话题 @ 两位，互相审阅，并把讨论结果带回本对话。请先开话题，再开启该话题的推送订阅。只讨论，不建任务。等作者根据编辑意见修订并给出最终交付号后，再把修订稿和交付号总结到这里。'
  try {
    await trace('prompt real DSH coordinator')
    await ctx.sessionController.prompt(
      {
        sessionId,
        requestId: randomUUID(),
        content: [{ type: 'text', text: prompt }]
      },
      AbortSignal.timeout(20000)
    )
    async function discussion(forSession, workspaceId, excludeRoot) {
      const thread = await until('manager did not open a separate topic in the named channel', async () => {
        const p = await page(channel.id)
        for (const [rootId, row] of Object.entries(p.replyThreadSummaries ?? {})) {
          if (
            rootId !== excludeRoot &&
            p.messages.some((m) => m.id === rootId && m.authorProfile?.principalId === assistant.agentId)
          )
            return { rootId, id: row.threadChannelId }
        }
      })
      const question = await until('discussion did not mention both Agents in the topic', async () => {
        const p = await page(thread.id)
        return p.messages.find((m) => m.content.includes(reviewer.agent.id) && m.content.includes(editor.agent.id))
      })
      const delivery = await api('GET', root + '/messages/' + question.id + '/delivery')
      for (const participant of [reviewer, editor]) {
        const entry = delivery.agents.find((agent) => agent.agentId === participant.agent.id)
        assert.ok(
          entry?.deliveryStatus === 'targeted',
          'Loop did not target ' + participant.name + ' in delivery diagnostics: ' + JSON.stringify(entry)
        )
      }
      const reopened = await ctx.loopHostActions.agentAction({
        workspaceId,
        sessionId: forSession,
        name: 'message.thread-create',
        arguments: { target: parent, messageId: thread.rootId }
      })
      assert.equal(reopened.data.data.threadChannelId, thread.id)
      return { ...thread, question, target: reopened.data.data.target }
    }
    const thread = await discussion(sessionId, localWorkspace.id)
    const { target, question } = thread
    const otherA = await directory(reviewer, other.sessionId),
      otherB = await directory(editor, other.sessionId)
    const secondPrompt =
      '请在 Loop 的 ' +
      parent +
      ' 频道另外新开一个独立话题，讨论白昼灯塔的颜色。不要使用雨夜车站的话题。开启新话题的推送，然后在话题里 @ ' +
      otherA.mention +
      ' 和 ' +
      otherB.mention +
      '。收到编辑给出的灯塔色号，就在本对话告诉我；只讨论。'
    await ctx.sessionController.prompt(
      {
        sessionId: other.sessionId,
        requestId: randomUUID(),
        content: [{ type: 'text', text: secondPrompt }]
      },
      AbortSignal.timeout(20000)
    )
    const sibling = await discussion(other.sessionId, secondWorkspace.id, thread.rootId)
    assert.notEqual(sibling.target, target)
    await trace('worker identities read and respond in topic')
    async function turn(w, instruction, mustRead, marker, replyTarget = target) {
      const response = await w.history(replyTarget)
      assert.ok(response.ok, 'worker history HTTP ' + response.status)
      const history = await response.json()
      const previous = history.messages.find((m) => m.content === mustRead)
      assert.ok(previous, 'worker must first read the exact message from its own topic history')
      const text = await provider.reply(instruction, {
        topic: history.messages.map((m) => ({ author: m.authorProfile?.displayName, content: m.content })),
        messageToReview: previous.content
      })
      assert.ok(text.trim().length >= 6, 'empty substantive reply')
      const body = {
        target: replyTarget,
        content: text.trim() + '\n[' + marker + ']',
        clientMessageId: randomUUID(),
        freshness: {
          targetKey: history.targetKey,
          seenUpToSeq: history.coversThroughSeq ?? 0
        }
      }
      const r = await w.send(body)
      assert.ok(r.ok, 'worker send HTTP ' + r.status)
      await r.body?.cancel()
      return body
    }
    const initial = 'A-' + randomUUID().slice(0, 8),
      review = 'B-' + randomUUID().slice(0, 8),
      final = 'C-' + randomUUID().slice(0, 8)
    const humanNote =
      '编辑部要求：交付的诗中请逐字保留“雨伞”这两个字。[@' +
      guest.name +
      '](/mentions/agent/' +
      guest.agent.id +
      ') 请点评这个意象。'
    await peer.api('POST', root + '/scopes/' + thread.id + '/messages', {
      content: humanNote,
      clientMessageId: randomUUID()
    })
    const humanRows = (await page(thread.id)).messages.filter((m) => m.content === humanNote)
    assert.equal(humanRows.length, 1)
    assert.equal(humanRows[0].authorProfile.principalId, peer.user.id)
    const guestDelivery = await peer.api('GET', root + '/messages/' + humanRows[0].id + '/delivery')
    assert.ok(
      guestDelivery.agents.some((agent) => agent.agentId === guest.agent.id && agent.deliveryStatus === 'targeted')
    )
    const guestReply = await turn(
      guest,
      '请根据同事的建议，用一句话解释雨伞这个意象。',
      humanNote,
      'G-' + randomUUID().slice(0, 8)
    )
    const guestRows = (await page(thread.id)).messages.filter((m) => m.content === guestReply.content)
    assert.equal(guestRows.length, 1)
    assert.equal(guestRows[0].authorProfile.principalId, guest.agent.id)
    const draft = await turn(
      reviewer,
      '你是作者。按编辑部对诗稿的用词要求写两行中文诗。务必逐字使用编辑部点名的词，直接给出诗稿。',
      guestReply.content,
      initial
    )
    assert.ok(draft.content.includes('雨伞'), 'draft must retain the requested literal word: ' + draft.content)
    const color = 'D-' + randomUUID().slice(0, 8)
    const light = await turn(
      editor,
      '你是编辑，读话题，推荐一种灯塔颜色并说明理由。',
      sibling.question.content,
      color,
      sibling.target
    )
    const critique = await turn(
      editor,
      '你是编辑，原样引用作者消息末尾括号内的 A- 稿号，引用诗中一个意象，提出一条具体修改建议。',
      draft.content,
      review
    )
    assert.ok(critique.content.includes(initial), 'editor did not cite ' + initial + ' in ' + critique.content)
    const done = await turn(
      reviewer,
      '你是作者，请原样引用编辑消息末尾括号内的 B- 复核号，然后按编辑意见给出改过的两行，说明两人复核已完成。',
      critique.content,
      `最终交付号：${final}`
    )
    assert.ok(done.content.includes(review), 'author did not cite ' + review + ' in ' + done.content)
    const replay = await reviewer.send(done)
    assert.ok(replay.ok, 'identical retry HTTP ' + replay.status)
    await replay.body?.cancel()
    const rows = (await page(thread.id)).messages
    for (const [message, member] of [
      [draft, a.member],
      [critique, b.member],
      [done, a.member]
    ]) {
      const hits = rows.filter((m) => m.content === message.content)
      assert.equal(hits.length, 1, 'exactly one persisted reply across retries')
      assert.equal(hits[0].authorProfile.memberId, member)
    }
    const denied = await outsider.history(target)
    assert.ok([403, 404].includes(denied.status), 'private topic denies a nonmember, got ' + denied.status)
    await denied.body?.cancel()
    assert.ok(
      !(await page(channel.id)).messages.some((m) => m.content.includes(final)),
      'topic reply leaked into parent channel'
    )
    await trace('verify return to original DSH session')
    await until('original session did not receive the revised draft', async () =>
      receipts.some((r) => r.id === sessionId && r.type === 'user/message' && r.text.includes(final))
    )
    assert.ok(
      !receipts.some((r) => r.id === other.sessionId && [initial, review, final].some((m) => r.text.includes(m)))
    )
    await until('coordinator did not summarize the final review in the original session', async () =>
      receipts.some((r) => r.id === sessionId && r.type === 'assistant/message' && r.text.includes(final))
    )
    await until('second DSH session did not receive its own topic reply', async () =>
      receipts.some((r) => r.id === other.sessionId && r.type === 'user/message' && r.text.includes(color))
    )
    assert.ok(!receipts.some((r) => r.id === sessionId && r.type === 'user/message' && r.text.includes(color)))
    assert.ok(
      !receipts.some((r) => r.id === other.sessionId && r.type === 'user/message' && r.text.includes(final))
    )
    assert.ok(!rows.some((m) => m.content.includes(color)))
    const siblingPage = await page(sibling.id)
    assert.equal(
      siblingPage.messages.filter((m) => m.content === light.content && m.authorProfile.memberId === b.member)
        .length,
      1
    )
    assert.ok(!siblingPage.messages.some((m) => m.content.includes(final)))
    await api('DELETE', root + '/channels/' + channel.id + '/members/agent/' + guest.agent.id)
    const removed = await guest.history(target)
    assert.ok([403, 404].includes(removed.status), 'removed participant still reads the topic: ' + removed.status)
    await removed.body?.cancel()
    assert.equal((await taskPage()).rows.length, tasksBefore)
    const music = await verifySongAssignment({
      ctx,
      api,
      root,
      localWorkspace: secondWorkspace,
      selectedModel,
      worker,
      directory,
      provider,
      receipts,
      trace
    })
    return {
      threadId: thread.id,
      sessionId,
      siblingId: sibling.id,
      workspaceId: workspace,
      localWorkspaceIds: [localWorkspace.id, secondWorkspace.id],
      otherSession: other.sessionId,
      ...music,
      replyCount: 5,
      workerModelTurns: provider.workerModelTurns,
      checks: [
        'topic-mentions',
        'cross-review',
        'cross-owner',
        'retry-once',
        'private-topic',
        'parent-isolation',
        'session-push',
        'discussion-only',
        'coordinator-summary',
        'removed-member',
        'overlapping-topics',
        'fresh-workspaces',
        'default-task',
        'task-feedback'
      ]
    }
  } finally {
    off()
  }
}

async function verifySongAssignment({
  ctx,
  api,
  root,
  localWorkspace,
  selectedModel,
  worker,
  directory,
  provider,
  receipts,
  trace
}) {
  await trace('single-Agent song assignment and task feedback')
  const musicSession = (await ctx.sessionController.create({ workspaceId: localWorkspace.id })).sessionId
  await ctx.sessionController.selectModel({
    sessionId: musicSession,
    ...selectedModel
  })
  await ctx.loopHostService.runtime.setSync({
    workspaceId: localWorkspace.id,
    sessionId: musicSession,
    enabled: true
  })
  const board = await ctx.loopHostService.runtime.withSessionContext(
    musicSession,
    undefined,
    async (c) => c.defaultChannelId
  )
  assert.ok(board)
  const musician = await worker('wan_imac_ds_001')
  await api('POST', root + '/channels/' + board + '/members/batch', {
    members: [{ agentId: musician.agent.id, visibility: 'public' }]
  })
  const selected = await directory(musician, musicSession)
  const boardTasks = () => api('GET', root + '/channels/' + board + '/tasks')
  const before = new Set((await boardTasks()).rows.map((t) => t.id))
  await ctx.sessionController.prompt(
    {
      sessionId: musicSession,
      requestId: randomUUID(),
      content: [{ type: 'text', text: '你让 ' + selected.mention + ' 写首小曲看看。' }]
    },
    AbortSignal.timeout(20000)
  )
  const musicTask = await until('the single-Agent request did not create its task', async () => {
    const added = (await boardTasks()).rows.filter((t) => !before.has(t.id))
    assert.ok(added.length <= 1, 'duplicate song tasks')
    return added[0]
  })
  const detail = (await api('GET', root + '/tasks/' + musicTask.id)).detail.task
  assert.equal(detail.assigneeProfile.memberId, selected.member)
  const scopeId = detail.taskScopeId || musicTask.taskScopeId || musicTask.id
  assert.match(scopeId, /^tsk_/)
  const taskTarget = '#' + scopeId
  const musicHistory = await musician.history(taskTarget)
  assert.ok(musicHistory.ok)
  const history = await musicHistory.json()
  const song = await provider.reply(
    '你是接单的作曲者。根据任务写一段原创的四小节旋律，用数字简谱、节拍和小节线表达。',
    [detail.title, detail.description]
  )
  assert.match(song, /[1-7]/)
  const musicReceipt = 'M-' + randomUUID().slice(0, 8)
  const content = song.trim() + '\n[' + musicReceipt + ']'
  const sent = await musician.send({
    target: taskTarget,
    content,
    clientMessageId: randomUUID(),
    freshness: {
      targetKey: history.targetKey,
      seenUpToSeq: history.coversThroughSeq ?? 0
    }
  })
  assert.ok(sent.ok, 'musician send HTTP ' + sent.status)
  await sent.body?.cancel()
  await until('music feedback did not reach the original assignment Session', async () =>
    receipts.some((r) => r.id === musicSession && r.type === 'user/message' && r.text.includes(musicReceipt))
  )
  const recheck = await musician.history(taskTarget)
  assert.ok(recheck.ok)
  assert.equal((await recheck.json()).messages.filter((m) => m.content === content).length, 1)
  assert.equal((await boardTasks()).rows.filter((t) => !before.has(t.id)).length, 1)
  assert.ok(
    !receipts.some((r) => r.id !== musicSession && r.type === 'user/message' && r.text.includes(musicReceipt))
  )
  return { songTask: musicTask.id, musicSession }
}

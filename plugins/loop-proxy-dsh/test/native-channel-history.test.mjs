import test from 'node:test'
import assert from 'node:assert/strict'
import {createNamedChannelTask, joinNamedChannel, readNamedChannel} from '../backend/actions.ts'
import {LoopError} from '../backend/errors.ts'

const channel = {channelId:'chn_abc', name:'engineering', displayName:'Engineering'}
const request = {channelName:'Engineering',limit:5}
const preview = {
  action:'message.history',write:false,manage:false,workspaceWide:false,
  resourceConstraints:['channel:chn_abc'],
}
const denied = new LoopError('resource_not_granted','Access denied',403)

function fixture({row=channel, error, targetKey=channel.channelId, policy=preview} = {}) {
  const calls = []
  return {
    calls,
    async invoke(action,args) {
      calls.push([action,args])
      if (action === 'workspace.list') return {data:{data:{channels:[row]}}}
      if (error) throw error
      return {data:{data:{targetKey,messages:[]}}}
    },
    async delegationPreview(action,args) {
      calls.push(['preview',args])
      assert.equal(action,'message.history')
      return policy
    },
  }
}

test('empty history must identify the resolved channel and never needs write access',async () => {
  const api = fixture()
  await readNamedChannel(api,request,true)
  assert.deepEqual(api.calls,[
    ['workspace.list',{kind:'channels',channelName:'Engineering',limit:10}],
    ['message.history',{limit:5,target:'#engineering'}],
  ])
  await assert.rejects(readNamedChannel(fixture({targetKey:'chn_other'}),request,true),/does not match/)
  for (const row of [{...channel,channelId:''},{...channel,name:'other',displayName:'Other'}]) {
    const invalid = fixture({row})
    await assert.rejects(readNamedChannel(invalid,request,true),/exact ID/)
    assert.equal(invalid.calls.length,1)
  }
})

test('only a definitive permission denial may prompt for the exact read-only scope',async () => {
  const result = await readNamedChannel(fixture({error:denied}),request,true)
  assert.deepEqual(result.delegationArguments,{target:'channel:chn_abc',limit:5})
  for (const change of [{write:true},{manage:true},{workspaceWide:true},{resourceConstraints:[]},
                       {resourceConstraints:['channel:chn_other']},{resourceConstraints:['channel:chn_abc','channel:chn_other']}]) {
    await assert.rejects(readNamedChannel(fixture({error:denied,policy:{...preview,...change}}),request,true),/read-only authorization/)
  }
  for (const error of [new LoopError('unauthorized','Expired',401),new LoopError('not_found','Missing',404),
                       new LoopError('timeout','Timed out',504),new LoopError(denied.code,'Unknown',403,true)]) {
    const api = fixture({error})
    await assert.rejects(readNamedChannel(api,request,true),e=>e===error)
    assert.equal(api.calls.length,2)
  }
})

test('explicit Human view requests one read grant even when the Agent can read', async () => {
  const api = fixture()
  const result = await readNamedChannel(api,{...request,readAs:'human'},true)
  assert.deepEqual(result.delegationArguments,{limit:5,target:'channel:chn_abc'})
  assert.deepEqual(api.calls.map(([action])=>action),['workspace.list','preview'])
  await assert.rejects(readNamedChannel(fixture(),{...request,readAs:'human'},false),/confirmation/)
})

test('ambiguous channels, invite tokens and uncertain creates never cause another write', async () => {
  const input = {channelName:channel.displayName,tasks:[{title:'Review',assignee:'member_a'}]}
  const writes = []
  const api = {
    async invoke(action,args) {
      if (action === 'workspace.list') return {data:{data:{channels:[channel]}}}
      writes.push([action,args])
      return {data:{data:{channelRef:'#wrong',tasks:[{taskId:'tsk_copy',assigneeProfile:{memberId:'member_a'}}]}}}
    },
  }
  await assert.rejects(createNamedChannelTask(api,input,true), error=>error.outcomeUnknown && /tsk_copy/.test(error.message))
  assert.deepEqual(writes,[['task.create',{board:{kind:'channel',scopeId:channel.channelId},tasks:input.tasks}]])
  const ambiguous = {async invoke(action) {
    assert.equal(action,'workspace.list')
    return {data:{data:{channels:[channel,{...channel,name:'another'}]}}}
  }}
  await assert.rejects(createNamedChannelTask(ambiguous,input,true),/Several channels/)
  await assert.rejects(joinNamedChannel({},'/w/example/channel-invites/secret',()=>assert.fail()),/Human channel invitation/)
})

test('named task delegation preserves board and assignee and requires an exact write grant',async () => {
  const tasks = [{title:'Review',assignee:'member_a'}]
  const policy = {...preview,action:'task.create',write:true}
  const api = {
    async invoke(action) {
      if (action === 'workspace.list') return {data:{data:{channels:[channel]}}}
      throw denied
    },
    async delegationPreview(action,args) {
      assert.equal(action,'task.create')
      assert.deepEqual(args.board,{kind:'channel',scopeId:channel.channelId})
      assert.deepEqual(args.tasks,tasks)
      assert.ok(args.requestId)
      return policy
    },
  }
  const input = {channelName:channel.name,tasks}
  assert.equal((await createNamedChannelTask(api,input,true)).channelLabel,'#engineering')
  policy.workspaceWide = true
  await assert.rejects(createNamedChannelTask(api,input,true),/exact write authorization/)
})

test('a shortened name returns only a verified directory candidate, before reading or requesting access',async () => {
  const entry = {name:'north-team',displayName:'North Team (Monday)'}
  const requests = []
  const api = {async invoke(action,args) {
    assert.equal(action,'workspace.list')
    requests.push(args)
    const channels = args.query ? [entry] : args.channelName === '#north-team' ? [{...entry,channelId:'chn_north'}] : []
    return {data:{data:{channels}}}
  }}
  const result = await readNamedChannel(api,{channelName:'North Team'},true)
  assert.deepEqual(result.error.candidate,{channelId:'chn_north',displayName:entry.displayName,slug:'#north-team'})
  assert.deepEqual(requests.map(row=>row.query || row.channelName),['North Team','North Team','#north-team'])
  for (const page of [{channels:[]},{channels:[entry,entry]},{channels:[entry],hasMore:true},
                      {channels:[{...entry,displayName:'Another group',description:'North Team'}]}]) {
    const api = {async invoke(action,args) {
      assert.equal(action,'workspace.list')
      return {data:{data:args.query ? page : {channels:[]}}}
    }}
    await assert.rejects(readNamedChannel(api,{channelName:'North Team'},true),error=>error.code==='channel_not_found')
  }
  await assert.rejects(readNamedChannel(api,{channelName:'#north'},true),error=>error.code==='channel_not_found')
  assert.equal(requests.at(-1).channelName,'#north')
})

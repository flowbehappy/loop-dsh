import test from 'node:test'
import assert from 'node:assert/strict'
import {readNamedChannel} from '../backend/actions.ts'
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

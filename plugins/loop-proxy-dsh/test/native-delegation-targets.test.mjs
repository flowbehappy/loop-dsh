import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareDelegation} from '../backend/actions.ts'
import {LoopError} from '../backend/errors.ts'

function client({channels=[{channelId:'chn_abc',name:'engineering'}],hasMore=false,policy={}}={}) {
  const calls=[]
  return {calls,
    async invoke(action,args,signal) {
      signal?.throwIfAborted()
      calls.push([action,args])
      assert.equal(action,'workspace.list')
      return {data:{data:{channels,hasMore}}}
    },
    async delegationPreview(action,args,signal) {
      signal?.throwIfAborted()
      calls.push(['preview',action,args])
      return {action,workspaceWide:false,resourceConstraints:['channel:chn_abc'],...policy}
    },
  }
}

test('message actions share one exact channel conversion before consent and execution',async()=>{
  for (const action of ['message.history','message.search','message.send']) {
    const api=client()
    const args={target:'#engineering',content:'#other',query:'#other',clientMessageId:'retry-key'}
    const result=await prepareDelegation(api,action,args)
    assert.deepEqual(result.delegationArguments,{...args,target:'channel:chn_abc'})
    assert.equal(args.target,'#engineering')
    assert.deepEqual(api.calls,[['workspace.list',{kind:'channels',channelName:'#engineering',limit:10}],['preview',action,result.delegationArguments]])
    // The Host's existing consent flow consumes delegationArguments for execution.
    assert.equal(result.delegation.resourceConstraints[0],result.delegationArguments.target)
  }
})

test('task channel and board references reuse lookup without rewriting task contents',async()=>{
  const api=client()
  const tasks=[{title:'#engineering',description:'#other'}]
  const result=await prepareDelegation(api,'task.create',{channel:'#engineering',board:'#engineering',tasks,requestId:'stable'})
  assert.deepEqual(result.delegationArguments,{channel:'chn_abc',board:{kind:'channel',scopeId:'chn_abc'},tasks,requestId:'stable'})
  assert.equal(api.calls.filter(([a])=>a==='workspace.list').length,1)
})

test('stable IDs, DM, reply thread, other domains and schema discovery stay unchanged',async()=>{
  for (const [action,args] of [
    ['message.send',{target:'channel:chn_abc'}],['message.history',{target:'dm:@abcdefghijkl'}],
    ['message.history',{target:'#engineering:12'}],['task.get',{task:'tsk_abc'}],
    ['task.list',{board:{kind:'channel',scopeId:'chn_abc'}}],['channel.get',{channelId:'chn_abc'}],
    ['app.invoke',{input:{target:'#engineering'}}],['kb.search',{query:'#engineering'}],['message.send',undefined],
  ]) {
    const api=client();const result=await prepareDelegation(api,action,args)
    assert.equal(api.calls.length,1)
    assert.equal(api.calls[0][2],args)
    assert.equal(Object.hasOwn(result,'delegationArguments'),false)
  }
})

test('unknown, ambiguous, denied or canceled directory lookup cannot reach consent',async()=>{
  for (const setup of [{channels:[]},{channels:[{channelId:'chn_abc',name:'engineering'},{channelId:'chn_def',name:'engineering'}]},
    {hasMore:true},{channels:[{channelId:'chn_abc',name:'wrong'}]}]) {
    const api=client(setup)
    await assert.rejects(prepareDelegation(api,'message.send',{target:'#engineering'}))
    assert.equal(api.calls.some(([a])=>a==='preview'),false)
  }
  const denied=new LoopError('resource_not_granted','denied',403)
  await assert.rejects(prepareDelegation({async invoke(){throw denied},async delegationPreview(){assert.fail()}},'message.search',{target:'#engineering'}),e=>e===denied)
  await assert.rejects(prepareDelegation(client(),'message.send',{target:'#engineering'},AbortSignal.abort()))
})

test('scope widening or substitution fails closed; retry resolves current directory without cached grants',async()=>{
  for (const policy of [{workspaceWide:true},{resourceConstraints:[]},{resourceConstraints:['channel:chn_other']},{action:'message.send'}]) {
    await assert.rejects(prepareDelegation(client({policy}),'message.history',{target:'#engineering'}),/did not confirm/)
  }
  const api=client();await prepareDelegation(api,'message.history',{target:'#engineering'})
  await prepareDelegation(api,'message.history',{target:'#engineering'})
  assert.equal(api.calls.filter(([a])=>a==='workspace.list').length,2)
})

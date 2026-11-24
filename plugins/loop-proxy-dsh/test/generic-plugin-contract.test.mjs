import test from 'node:test'
import assert from 'node:assert/strict'
import Host from '../host-service.mjs'
import {missingChannelAgents} from '../host-collaboration.mjs'
import {createLoopProxyBridge} from '../host.mjs'
import {HostAPI} from '../backend/host-api.ts'

const sessionId='session-3f1fed97-e5ef-4139-bbe9-3313d387889a'
const message={source:{kind:'user',rpcId:'request'},content:[{type:'text',text:'Give Alex a task; share the document.'}]}
function fixture() {
  const calls=[]
  const host={humanTasks:{current:()=>message,canOffer:()=>true},runtime:{async agentCommand(id,command) {
    calls.push({id,...command}); return {failed:false,output:JSON.stringify({data:{receipt:calls.length}})}
  }}}
  const call=(name,args)=>Host.prototype.agentCommand.call(host,sessionId,{verb:'call',name,input:JSON.stringify(args)},new AbortController().signal)
  return {host,calls,call}
}

test('generic calls preserve arguments and allow independent actions after a rejected action',async()=>{
  const {host,calls,call}=fixture()
  const invoke=host.runtime.agentCommand
  host.runtime.agentCommand=async(id,command)=>command.name==='message.history'
    ? {failed:true,output:JSON.stringify({error:{code:'resource_not_granted'}})}:invoke(id,command)
  assert.equal((await call('message.history',{target:'#first'})).failed,true)
  for(const [name,args] of [
    ['message.search',{target:'#second',query:'report'}],
    ['task.create',{board:'chn_a',tasks:[{title:'Review',assignee:'member_a'}]}],
    ['task.create',{board:'chn_b',tasks:[{title:'Review',assignee:'member_b'}]}],
    ['task.assign',{task:'tsk_a',assignee:'exact_member'}],
    ['message.send',{target:'#team',content:'Please review https://loop.example/w/ws_a/kb/kb_a/documents/doc_a',clientMessageId:'same'}],
    ['future.publish',{opaque:{content:'unchanged'},requestId:'operation-1'}],
  ]) {
    assert.equal((await call(name,args)).failed,false)
    assert.deepEqual(calls.at(-1),{id:sessionId,verb:'call',name,input:JSON.stringify(args)})
  }
})

test('unknown future action uses the same exact consent and execution path',async()=>{
  const {host,call}=fixture()
  const args={resourceId:'resource-1',requestId:'operation-1',content:'verbatim'}
  const preview={action:'future.publish',resourceConstraints:['resource:resource-1'],write:true}
  host.runtime.agentCommand=async()=>({delegation:preview,owner:{accountPrincipal:'owner'},delegationArguments:args})
  let approved=false
  host.humanTasks.offer=async(_id,current,_owner,actual,_description,_signal,input)=>{
    assert.equal(current,message);assert.deepEqual(actual,preview);assert.deepEqual(JSON.parse(input),args)
    approved=true;return {id:'grant',policy:{connection:'business'}}
  }
  host.runtime.humanCommand=async(_id,command,_signal,current,grant)=>{
    assert.equal(approved,true);assert.equal(current(),true);assert.equal(grant.id,'grant')
    assert.deepEqual(JSON.parse(command.input),args);assert.equal(command.name,'future.publish')
    return {failed:false,output:'receipt'}
  }
  assert.equal((await call('future.publish',args)).output,'receipt')
  host.humanTasks.offer=async()=>{throw new Error('declined')}
  host.runtime.humanCommand=()=>assert.fail('declined consent must not execute')
  await assert.rejects(call('future.publish',args),/declined/)
})

test('session 3f1fed97: membership evidence covers Human, Agent and mixed targets',async()=>{
  for(const kinds of [['human'],['agent'],['human','agent']]) {
    const targets=kinds.map((targetType,i)=>({targetType,memberId:'member_'+i}))
    const cursors=[]
    let members=[]
    const read=async cursor=>{cursors.push(cursor);return {channelId:'chn_test',members:cursor?members:[],hasMore:!cursor,nextCursor:'page2'}}
    assert.deepEqual(await missingChannelAgents('chn_test',targets,read,()=>{}),targets)
    assert.deepEqual(cursors,[undefined,'page2'])
    members=targets.map(({memberId})=>({memberId}))
    assert.deepEqual(await missingChannelAgents('chn_test',targets,read,()=>{}),[])
    await assert.rejects(missingChannelAgents('chn_test',targets,async()=>{throw new Error('denied')},()=>{}),/denied/)
  }
})

test('discovery exposes Host tools without reading a procedural guide',async()=>{
  const enabled=[]
  const host={collaboration:{enableTools:(...args)=>enabled.push(args)},canUseAgentActions:()=>true,
    agentCommand:async()=>({failed:false,output:'future.publish'})}
  const bridge=createLoopProxyBridge({on:()=>()=>{},get:()=>host})
  const result=await bridge.execute({name:'bash',agent:{session:{id:sessionId}},signal:new AbortController().signal,
    arguments:{command:'loop-proxy actions future.'}},()=>assert.fail('shell'))
  assert.deepEqual(enabled,[[sessionId,'actions']]);assert.equal(result.value.stdout.text,'future.publish')
  bridge.dispose()
})

test('Host errors keep redacted server evidence on any route and through the tool bridge',async()=>{
  const credential={workspace_id:'ws_1',resource:'https://loop.example/api/v1/workspaces/ws_1/external/agent',access_token:'secret-access',refresh_token:'secret-refresh'}
  const api=new HostAPI({credential:async()=>credential},async()=>new Response(JSON.stringify({error:{code:'membership_missing',message:'member cannot see task secret-access',hint:'Inspect membership',details:{violations:[{path:'assignee',message:'secret-refresh absent'}]},stack:'private'}}),{status:400}))
  const host={canUseAgentActions:()=>true,agentCommand:()=>api.request('workspace','POST','/future/action',{})}
  const bridge=createLoopProxyBridge({on:()=>()=>{},get:()=>host})
  const result=await bridge.execute({name:'bash',agent:{session:{id:sessionId}},signal:new AbortController().signal,
    arguments:{command:'loop-proxy call future.action {}'}},()=>assert.fail('shell'))
  assert.equal(result.value.exitCode,1)
  const {error}=JSON.parse(result.value.stdout.text)
  assert.equal(error.serverCode,'membership_missing');assert.equal(error.status,400);assert.equal(error.outcomeUnknown,false)
  assert.equal(error.hint,'Inspect membership');assert.equal(error.details.violations[0].path,'assignee')
  assert.doesNotMatch(result.value.stdout.text,/secret-access|secret-refresh|private/)
  bridge.dispose()
})

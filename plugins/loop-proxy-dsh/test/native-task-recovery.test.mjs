import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {CollaborationService} from '../backend/collaboration.ts'
import {CollaborationStore} from '../backend/collaboration-store.ts'
import {managementForTask} from '../backend/collaboration-management.ts'

const digest=s=>'sha256:'+createHash('sha256').update(s).digest('hex')
async function fixture(t,count,expired){
  const root=await mkdtemp(join(tmpdir(),'native-task-recovery-')); t.after(()=>rm(root,{recursive:true,force:true}))
  const store=new CollaborationStore(root), calls=[], sessionId='session'
  const ns={serverBaseUrl:'https://test.invalid',installationId:'install',accountId:'account',workspaceId:'workspace',hostSessionId:sessionId,bindingId:'binding',bindingRevision:'1',bindingEpoch:'1',boardId:'board'}
  const service=new CollaborationService({tokens:{credential:async()=>({principal_id:ns.accountId,workspace_id:ns.workspaceId})},async request(area,method,path,body){calls.push({path,body});if(path==='/collaboration/intents')return {userIntentId:'continued'};assert.equal(path,'/collaboration/actions/followup');return {receipt:{taskId:body.taskId,state:'accepted',revision:2}}}}, {server:ns.serverBaseUrl},{},root,ns.installationId)
  await store.transition(ns,ns,{bindingId:'binding',bindingEpoch:1,status:'active'}, {})
  const target=i=>({targetId:'member-'+i,targetType:i%2?'human':'agent',intendedActions:['dispatch','followup']})
  await store.update(ns,state=>{for(let i=0;i<count;i++){
    const ref='intent-'+i,taskId='task-'+i
    state.intents[ref]={sessionId,ref,state:'activated',userIntentId:'user-'+i,acceptedSequence:1,bindingRevision:'1',shareScope:{scope:'task-description'},targets:[target(i)],expiresAt:new Date(Date.now()+(expired?-60000:60000)).toISOString(),updatedAt:new Date().toISOString()}
    state.actions['dispatch-'+i]={phase:'completed',kind:'dispatch',intentRef:ref,request:{target:{targetId:target(i).targetId,kind:target(i).targetType}},receipt:{receipt:{taskId,state:'accepted',revision:1}}}
  }})
  return {store,ns,service,calls,sessionId,prepare:()=>service.prepareIntent({sessionId,bindingRevision:'1',payloadText:'new',payloadDigest:digest('new'),targets:[target(0)]})}
}

test('new selection retains expired Task sources and their closure without occupying pending slots',async t=>{
  const f=await fixture(t,64,true)
  await f.store.update(f.ns,s=>{s.actions.close={phase:'completed',kind:'end-management',intentRef:'intent-1',receipt:{receipt:{taskId:'task-1'}}}})
  assert.equal((await f.prepare()).state,'prepared')
  const state=await f.store.load(f.ns)
  assert.equal(managementForTask(state,'task-0',f.sessionId,'1')?.state,'active')
  assert.equal(managementForTask(state,'task-1',f.sessionId,'1')?.state,'closed')
  await assert.rejects(f.service.action({sessionId:f.sessionId,action:'dispatch',clientRequestId:'late',intentRef:'intent-0',arguments:{task:{title:'late'}}}),{code:'loop-host/intent-expired'})
  assert.deepEqual(f.calls,[])
  await f.store.update(f.ns,s=>{for(let i=0;i<63;i++)s.intents['p-'+i]={state:'prepared',expiresAt:new Date(Date.now()+60000).toISOString()}})
  await assert.rejects(f.prepare(),{code:'loop-host/queue-full'})
})

test('multi-Task continuation follows each exact recorded recipient, not another selected Task',async t=>{
  const f=await fixture(t,3,false), text='Follow up task-0 and task-1', continuationRef='continuation'
  const continuation=await f.service.continuation({sessionId:f.sessionId,continuationRef,requestId:'req',acceptedMessageId:'msg',acceptedSequence:2,acceptedSerializedText:text,payloadDigest:digest(text)})
  assert.deepEqual(continuation.authorizedTaskIds,['task-0','task-1'])
  const follow=(i,extra={})=>f.service.action({sessionId:f.sessionId,continuationRef,action:'followup',clientRequestId:'follow-'+i,arguments:{taskId:'task-'+i,...extra}})
  await assert.rejects(follow(2),{code:'loop-host/conflict'})
  for(const i of [0,1])assert.equal((await follow(i)).receipt.taskId,'task-'+i)
  await assert.rejects(follow(0,{target:{targetId:'member-1',kind:'human'}}),{code:'loop-host/conflict'})
  assert.deepEqual(f.calls.map(r=>r.path),['/collaboration/intents','/collaboration/actions/followup','/collaboration/actions/followup'])
  assert.deepEqual(f.calls.slice(1).map(r=>({...r.body.target})),[{targetId:'member-0',kind:'agent'},{targetId:'member-1',kind:'human'}])
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {HostAPI} from '../backend/host-api.ts'
import {HostIdentity} from '../backend/host-identity.ts'
import {CollaborationService} from '../backend/collaboration.ts'

const origin='https://cold-start.invalid', installation='test-installation', workspace='workspace', sessionId='first-session'
const bindingPath='/collaboration/binding', devicePath='/external-host/binding'
const listPath='/collaboration/actions/list-subscriptions', setPath='/collaboration/actions/set-subscription'
const bindInput={workspaceId:workspace,sessionId,coordinatorAgentId:'manager',boardId:'board'}
const route={bindingId:'route',bindingEpoch:7,status:'active',agentId:'manager',agentMemberId:'member',boardId:'board',sourceSessionId:sessionId,protocolCapabilities:{messageSubscriptions:1}}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})

// Only the HTTP boundary and the credential backing store are synthetic. No
// process-global fetch, login, live account, or filesystem state is shared.
async function fixture(t,{proof=false,respond}={}) {
  const root=await mkdtemp(join(tmpdir(),'cold-collaboration-')); t.after(()=>rm(root,{recursive:true,force:true}))
  let grant={principal_id:'principal',workspace_id:workspace,generation:'one',resource:`${origin}/api/v1/workspaces/${workspace}/external/agent`,scope:'loop.host',access_token:'test-only',...(proof?{device_credential:'test-proof'}:{})}
  const credentials={server:origin,read:async()=>grant,async modify(fn){grant=await fn(grant)??grant;return grant}}
  const records=new Map(),provider={async modifyRecord(key,fn){const next=await fn(records.get(key));if(next!==undefined)records.set(key,next);return records.get(key)},async readRecord(key){return records.get(key)}}
  const calls=[]
  const api=new HostAPI({credential:()=>credentials.read()},async(raw,init)=>{
    const url=new URL(raw),prefix=`/api/v1/workspaces/${workspace}`
    assert.equal(url.origin,origin);assert.ok(url.pathname.startsWith(prefix+'/'))
    const req={method:init.method,path:url.pathname.slice(prefix.length),query:url.searchParams,body:init.body&&JSON.parse(init.body),headers:new Headers(init.headers)}
    calls.push(req)
    return respond(req)
  })
  const identity=new HostIdentity(provider,api,installation,origin)
  return {service:new CollaborationService(api,credentials,identity,root,installation),calls,requests:()=>calls.map(r=>r.method+' '+r.path)}
}

// This order is important: the management tools query status BEFORE binding.
test('fresh Session can inspect without credentials for a device, then explicitly bind and subscribe',async t=>{
  let subscribed
  const f=await fixture(t,{respond:({method,path,headers,body})=>{
    if(method==='GET'&&path===devicePath)return json({binding:null})
    if(method==='POST'&&path===devicePath){assert.ok(headers.has('x-loop-host-installation-proof'));return json({binding:{...body,bindingId:'device',status:'active'}})}
    if(path===bindingPath&&method==='POST'){assert.equal(body.sourceSessionId,sessionId);assert.ok(headers.has('x-loop-super-agent-device'));return json({binding:route})}
    if(path===bindingPath&&method==='GET')return headers.has('x-loop-super-agent-device')?json({binding:route}):json({},401)
    if(path===listPath&&method==='POST'){assert.equal(body.expectedBindingEpoch,7);return json({subscriptions:subscribed?[subscribed]:[],hasMore:false,resolvedScopeId:'topic-scope'})}
    if(path===setPath&&method==='POST'){assert.equal(body.expectedScopeId,'topic-scope');assert.equal(body.expectedRevision,0);subscribed={subscriptionId:'sub',managerMention:'manager-mention',mode:body.mode,target:body.target,scopeId:body.expectedScopeId,revision:1};return json(subscribed)}
    assert.fail('Unexpected simulated request '+method+' '+path)
  }})
  assert.equal((await f.service.status({sessionId})).state,'unbound');assert.deepEqual(f.calls,[])
  await f.service.bind(bindInput)
  assert.equal((await f.service.status({sessionId})).state,'ready')
  const settings=await f.service.action({sessionId,action:'set-subscription',arguments:{target:'#board:topic',mode:'push'},managementSource:{sessionId,messageId:'message',sequence:1,textDigest:'sha256:'+'1'.repeat(64)}})
  assert.equal(settings.managerMention,'manager-mention');assert.equal(settings.mode,'push')
  const page=await f.service.action({sessionId,action:'list-subscriptions',arguments:{limit:20}})
  assert.equal(page.subscriptions[0].subscriptionId,settings.subscriptionId)
  assert.equal((await f.service.status({sessionId:'another-session'})).state,'unbound')
  await assert.rejects(f.service.action({sessionId:'another-session',action:'list-subscriptions',arguments:{}}),{code:'loop-host/not-bound'})
  assert.deepEqual(f.calls.filter(r=>r.method==='POST').map(r=>r.path),[devicePath,bindingPath,listPath,setPath,listPath])
})

test('unbound local Session distinguishes absent device registration from an unauthorized route',async t=>{
  const f=await fixture(t,{proof:true,respond:({path})=>path===bindingPath?json({},401):json({binding:null})})
  assert.equal((await f.service.status({sessionId})).state,'unbound')
  assert.deepEqual(f.requests(),['GET '+bindingPath,'GET '+devicePath])
})

for(const [label,routeStatus,deviceResponse] of [
  ['invalid grant',401,()=>json({},401)],['existing device',401,()=>json({binding:{bindingId:'other',status:'active'}})],
  ['denied collaboration action',403,()=>json({binding:null})],['binding conflict',409,()=>json({binding:null})],
  ['malformed device response',401,()=>json({})],
])test(`fresh Session does not treat ${label} as permission to bind`,async t=>{
  const privateDetail='SYNTHETIC_PRIVATE_RESPONSE_MARKER'
  const f=await fixture(t,{proof:true,respond:({path})=>path===bindingPath?json({error:{message:privateDetail,hint:privateDetail}},routeStatus):deviceResponse()})
  if(routeStatus===403){
    await assert.rejects(f.service.status({sessionId}),error=>{
      assert.equal(error.status,403);assert.equal(error.code,'loop-host/waiting-for-access')
      assert.match(error.message,/HTTP 403; waiting-for-access/)
      assert.ok(![String(error),error.stack,JSON.stringify(error)].some(value=>value.includes(privateDetail)))
      return true
    })
  }else await assert.rejects(f.service.status({sessionId}))
  assert.ok(f.calls.every(r=>r.method==='GET'));assert.equal(f.calls[0].path,bindingPath)
})

test('an existing Session route fails closed on lost device authority; no fresh bind or cross-session adoption',async t=>{
  let lost=false
  const f=await fixture(t,{proof:true,respond:({method,path,query})=>{
    assert.equal(method,'GET');assert.equal(path,bindingPath)
    if(lost){assert.equal(query.get('generation'),'route:7');return json({},401)}
    return json({binding:route})
  }})
  assert.equal((await f.service.status({sessionId})).state,'ready')
  assert.equal((await f.service.status({sessionId:'another-session'})).state,'unbound')
  lost=true;await assert.rejects(f.service.status({sessionId}),{status:401})
  assert.deepEqual(f.requests(),Array(3).fill('GET '+bindingPath))
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {setImmediate} from 'node:timers/promises'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {NativeHostActions} from '../backend/adapter.ts'
import {HumanConnectionService} from '../backend/human.ts'
import {HostCredentialStore} from '../backend/credentials.ts'

const base='https://loop-fixture.invalid/edge'
const issuer=base+'/api/v1/auth/oauth/human', work='/api/v1/workspaces/W/external/'
const resource=base+work+'human', read='task.get', write='task.update', accountPrincipal='user-exact-ID'
const allScopes=['loop.human_access','loop.human_write','loop.human_manage','offline_access']
const active=new AbortController().signal
function fixture(t){
  const seen=[],records=new Map(),grants=new Map(),clients=new Map(),codes=new Map()
  let rejectNextOwner=false, hostActive=true, nextClient=0, badMetadata=false, deleteFails=false, onSchema, invocationError, availableActions
  let pending=Promise.resolve()
  const provider={readRecord:async key=>structuredClone(records.get(key)),modifyRecord(key,mutate){
    const done=pending.then(async()=>{
      const next=await mutate(structuredClone(records.get(key)))
      if(next!==undefined)records.set(key,structuredClone(next))
      return structuredClone(records.get(key))
    });pending=done.catch(()=>{});return done
  }}
  const owner={accountPrincipal,workspaceId:'W',verify:async signal=>{
    if(!hostActive || signal.aborted)throw new Error('fixture owner detached')
  }}
  const fetcher=async (raw,init={})=>{
    const url=new URL(raw), suffix=url.href.slice(base.length), method=init.method??'GET', token=new Headers(init.headers).get('Authorization')
    seen.push({suffix,method,token}); assert.equal(init.redirect,'error')
    assert.match(url.origin,/loop-fixture\.invalid$/)
    if(suffix==='/api/v1/auth/external-host/session'){
      assert.equal(method,'POST')
      const agent=await agentStore.read();assert.equal(token,'Bearer '+agent.access_token)
      assert.equal(JSON.parse(init.body).installationId,'install')
      return Response.json({principalId:agent.principal_id,workspaceId:'W',grantId:agent.grant_id})
    }
    assert.notEqual(token,'Bearer agent-access-fixture')
    if(suffix==='/.'+'well-known/oauth-protected-resource'+work+'human')return Response.json({resource,authorization_servers:[issuer],scopes_supported:allScopes})
    if(suffix==='/.'+'well-known/oauth-authorization-server/api/v1/auth/oauth/human')return Response.json({issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:badMetadata?'https://elsewhere.invalid/token':issuer+'/token',registration_endpoint:base+'/api/v1/auth/oauth/register',scopes_supported:allScopes,code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],authorization_response_iss_parameter_supported:true})
    if(suffix==='/api/v1/auth/oauth/register'){
      const request=JSON.parse(init.body)
      const client='human-client-'+(++nextClient)
      assert.equal(request.token_endpoint_auth_method,'none');assert.equal(request.redirect_uris.length,1)
      clients.set(client,request.redirect_uris[0]);return Response.json({...request,client_id:client}, {status:201})
    }
    if(suffix==='/api/v1/auth/oauth/human/token'){
      assert.equal(init.body.get('resource'),resource)
      const clientId=init.body.get('client_id')
      if(init.body.get('grant_type')==='refresh_token'){
        const found=[...grants.values()].find(g=>g.clientId===clientId && g.refreshToken===init.body.get('refresh_token'))
        if(!found || found.status!=='active')return Response.json({}, {status:400})
        grants.delete('Bearer '+found.accessToken);found.accessToken+='-rotated';found.refreshToken+='-rotated';grants.set('Bearer '+found.accessToken,found)
        return Response.json({access_token:found.accessToken,refresh_token:found.refreshToken,expires_in:3600,token_type:'Bearer',scope:found.scope,resource})
      }
      const code=init.body.get('code'),auth=codes.get(code)
      assert.ok(auth);assert.equal(clients.get(clientId),init.body.get('redirect_uri'));assert.equal(clientId,auth.get('client_id'))
      assert.equal(createHash('sha256').update(init.body.get('code_verifier')).digest('base64url'),auth.get('code_challenge'))
      const grant={principalKind:'human',humanUserId:rejectNextOwner?'unrelated-user':accountPrincipal,workspaceId:'W',grantId:'grant-'+clientId,clientId,resource,scope:auth.get('scope'),status:'active',expiresAt:new Date(Date.now()+3600_000).toISOString(),allowedActions:auth.get('allowed_actions').split(','),resourceConstraints:auth.get('resource_constraints')?.split(',')??[],accessToken:'access-'+code,refreshToken:'refresh-'+code}
      rejectNextOwner=false;grants.set('Bearer '+grant.accessToken,grant)
      return Response.json({access_token:grant.accessToken,refresh_token:grant.refreshToken,expires_in:3600,token_type:'Bearer',scope:grant.scope,resource})
    }
    if(!suffix.startsWith(work+'human/'))assert.fail('unexpected endpoint: '+suffix)
    const grant=grants.get(token)
    if(!grant || grant.status!=='active')return Response.json({}, {status:401})
    if(suffix===work+'human/session'){
      if(method==='DELETE'){
        if(deleteFails)return Response.json({}, {status:503})
        grant.status='revoked';return new Response(null,{status:204})
      }
      const {accessToken,refreshToken,...publicGrant}=grant;return Response.json(publicGrant)
    }
    const path=new URL(url).pathname.split('/').slice(8)
    const available=availableActions??grant.allowedActions
    if(url.searchParams.get('limit'))return Response.json({actions:available.map(id=>({id}))})
    const actionId=decodeURIComponent(method==='GET'?url.pathname.split('/').at(-1):url.pathname.split('/').at(-2))
    if(!available.includes(actionId))return Response.json({error:{code:'action_not_granted'}},{status:403})
    if(method==='GET'){
      await onSchema?.()
      const id=decodeURIComponent(url.pathname.split('/').at(-1))
      return Response.json({id,readOnly:id===read || id==='app.catalog'})
    }
    assert.ok(path.includes('invocations'))
    if(invocationError)return Response.json({error:invocationError},{status:403})
    const input=JSON.parse(init.body)
    if(actionId==='app.invoke' && !grant.resourceConstraints.includes('app-action:'+input.extensionName+'/'+input.action)){
      return Response.json({error:{code:'resource_not_granted'}},{status:403})
    }
    return Response.json({status:'succeeded',actor:'human',input})
  }
  const service=new HumanConnectionService({provider,server:base,installation:'install',fetch:fetcher})
  t.after(()=>service.dispose())
  const businessStore=new HostCredentialStore(provider,base,'W','install',{account:accountPrincipal,connection:'business'})
  const appsStore=new HostCredentialStore(provider,base,'W','install',{account:accountPrincipal,connection:'apps'})
  const agentStore=new HostCredentialStore(provider,base,'W','install')
  const seedAgent=(principal=accountPrincipal,grant='agent-grant')=>agentStore.publish({version:1,principal_id:principal,workspace_id:'W',client_id:'agent-client',token_endpoint:base+'/token',resource:agentStore.resource,grant_id:grant,scope:'loop.host offline_access',access_token:'agent-access-fixture',refresh_token:'agent-refresh-fixture',access_expires_at:new Date(Date.now()+3600_000).toISOString()})
  async function callback(start,wrongState=false,wrongIssuer=false){
    const auth=new URL(start.challenge.loginUrl),code='code-'+auth.searchParams.get('client_id')
    codes.set(code,auth.searchParams)
    const redirect=new URL(auth.searchParams.get('redirect_uri'))
    redirect.searchParams.set('state',wrongState?'wrong':auth.searchParams.get('state'))
    redirect.searchParams.set('code',code)
    redirect.searchParams.set('iss',wrongIssuer?'https://not-the-issuer.invalid':issuer)
    const response=await fetch(redirect);await response.text();return response.status
  }
  const begin=(slot='business',input={allowedActions:[read,write]})=>service.begin(owner,slot,input,active)
  async function finish(start,slot='business'){
    for(let iteration=0;iteration<100;iteration++){
      const reply=await service.complete(owner,slot,start.challenge.id,active)
      if(!reply.challenge)return reply
      await setImmediate()
    }
    assert.fail('fixture OAuth callback did not settle')
  }
  const action=(kind,input,slot='business')=>service.action(owner,slot,kind,input,active)
  return {service,owner,begin,callback,finish,action,grants,seen,records,provider,fetcher,agentStore,businessStore,appsStore,seedAgent,
    setAvailable:actions=>{availableActions=actions}, rejectInvocation:error=>{invocationError=error},
    wrongOwner:()=>{rejectNextOwner=true}, badMetadata:()=>{badMetadata=true}, failDelete:()=>{deleteFails=true}, onSchema:fn=>{onSchema=fn},signOut:()=>{hostActive=false;service.detach()}}
}

test('pending authorization is recoverable for its owner and only in its slot',async t=>{
  const f=fixture(t)
  const start=await f.begin()
  assert.deepEqual(await f.service.status(f.owner,'business',active),start)
  assert.equal((await f.service.status(f.owner,'apps',active)).challenge,undefined)
  f.service.cancel(f.owner,'business',start.challenge.id,active)
  assert.equal((await f.service.status(f.owner,'business',active)).challenge,undefined)
})

test('Human consent verifies PKCE, pins same Human, and routes a separate public ActionClient',async t=>{
  const f=fixture(t);await f.seedAgent()
  assert.equal((await f.service.status(f.owner,'business',active)).state,'needs_auth')
  assert.equal(f.seen.length,0)
  const start=await f.begin('business',{allowedActions:[write,read],manage:true})
  const auth=new URL(start.challenge.loginUrl)
  assert.equal(auth.origin,'https://loop-fixture.invalid')
  assert.equal(auth.searchParams.get('scope'),allScopes.join(' '))
  assert.equal(auth.searchParams.get('resource'),resource)
  assert.equal(auth.searchParams.get('allowed_actions'),[read,write].join(','))
  assert.equal(auth.searchParams.get('code_challenge_method'),'S256')
  assert.equal(auth.searchParams.has('host_installation_id'),false)
  assert.equal((await f.service.complete(f.owner,'business',start.challenge.id,active)).state,'needs_auth')
  assert.equal(await f.callback(start,true),400)
  assert.equal(await f.callback(start),200)
  const connected=await f.finish(start)
  assert.deepEqual(connected,{state:'connected',connection:'business',workspaceId:'W',accountPrincipal})
  assert.notEqual(f.businessStore.key,f.agentStore.key)
  assert.equal((await f.agentStore.read()).access_token,'agent-access-fixture')
  assert.match((await f.businessStore.read()).access_token,/^access-code/)
  assert.deepEqual(await f.action('humanCatalog',{}),{actions:[read,write]})
  assert.equal((await f.action('humanSchema',{name:read})).readOnly,true)
  await assert.rejects(f.action('humanAction',{name:write,arguments:{taskId:'opaque'}}),{code:'loop-host/waiting-for-access'})
  assert.equal(f.seen.filter(r=>r.suffix.endsWith('/invocations')).length,0)
  const result=await f.action('humanAction',{name:write,arguments:{taskId:'opaque'},requireReadOnly:false})
  assert.equal(result.actor,'human');assert.deepEqual(result.input,{taskId:'opaque'})
  assert.equal(f.seen.filter(r=>r.suffix.endsWith('/invocations')).length,1)
  assert.doesNotMatch(JSON.stringify({connected,result}),/access-code|refresh-code|human-client/)
})

test('authorized Human commands use the live catalog and invocation, including actions unknown to the plugin',async t=>{
  const f=fixture(t)
  const start=await f.begin();await f.callback(start);await f.finish(start)
  const name='app.future-operation'
  f.setAvailable([name])
  assert.deepEqual(await f.action('humanCatalog',{}),{actions:[name]})
  assert.equal((await f.action('humanSchema',{name})).id,name)
  const startIndex=f.seen.length
  assert.equal((await f.action('humanAction',{name,arguments:{},requireReadOnly:false})).actor,'human')
  f.setAvailable([])
  await assert.rejects(f.action('humanAction',{name,arguments:{},requireReadOnly:false}),{code:'action_not_granted',status:403})
  assert.deepEqual(f.seen.slice(startIndex).filter(r=>r.suffix.includes('/actions/')).map(r=>r.method),['POST','POST'])
})

test('wrong Human account or issuer never publishes the bearer and no fallback is attempted',async t=>{
  const f=fixture(t);await f.seedAgent();f.wrongOwner()
  const first=await f.begin();assert.equal(await f.callback(first),200)
  await assert.rejects(f.finish(first),{code:'loop-host/needs-auth'})
  assert.equal(await f.businessStore.read(),undefined)
  const next=await f.begin();assert.equal(await f.callback(next,false,true),200)
  await assert.rejects(f.finish(next),{code:'loop-host/backend-invalid'})
  assert.equal(f.seen.filter(r=>r.suffix.endsWith('/human/token')).length,1)
  await assert.rejects(f.action('humanCatalog',{}),{code:'loop-host/needs-auth'})
  assert.equal(f.seen.filter(r=>r.suffix.includes('/external/agent')).length,0)
})

test('a missing Human resource grant explains the required scope without echoing server text',async t=>{
  const f=fixture(t)
  await f.seedAgent()
  const start=await f.begin()
  await f.callback(start)
  await f.finish(start)
  f.rejectInvocation({code:'resource_not_granted',message:'private upstream detail'})
  await assert.rejects(f.action('humanAction',{name:write,arguments:{taskId:'opaque'},requireReadOnly:false}),error=>{
    assert.equal(error.code,'resource_not_granted')
    assert.equal(error.status,403)
    assert.match(error.message,/exact resource locators/)
    assert.doesNotMatch(error.message,/private upstream detail/)
    return true
  })
})

test('separate App slot, exact locator consent, and grant-scoped disconnect',async t=>{
  const f=fixture(t);const first=await f.begin();await f.callback(first);await f.finish(first)
  await assert.rejects(f.action('humanCatalog',{},'apps'),{code:'loop-host/needs-auth'})
  const apps=await f.begin('apps',{allowedActions:['app.catalog','app.invoke'],resourceConstraints:['app:sample','app-action:sample/get-item']})
  assert.equal(new URL(apps.challenge.loginUrl).searchParams.get('resource_constraints'),'app-action:sample/get-item,app:sample')
  await f.callback(apps);await f.finish(apps,'apps')
  assert.notEqual(f.appsStore.key,f.businessStore.key)
  assert.deepEqual(await f.action('humanCatalog',{},'apps'),{actions:['app.catalog','app.invoke']})
  assert.deepEqual(await f.action('humanCatalog',{}),{actions:[read,write]})
  await assert.rejects(f.action('humanAction',{name:'app.invoke',arguments:{extensionName:'sample',action:'other'},requireReadOnly:false},'apps'),{code:'resource_not_granted',status:403})
  assert.equal(f.seen.filter(r=>r.suffix.endsWith('/invocations')).length,1)
  assert.equal((await f.action('humanAction',{name:'app.invoke',arguments:{extensionName:'sample',action:'get-item',input:{}},requireReadOnly:false},'apps')).actor,'human')
  const token=(await f.appsStore.read()).access_token
  const detached=await f.service.disconnect(f.owner,'apps',active)
  assert.equal(detached.state,'signed_out')
  assert.equal(f.grants.get('Bearer '+token).status,'revoked')
  assert.equal(await f.appsStore.read(),undefined)
  assert.equal((await f.service.status(f.owner,'business',active)).state,'connected')
})

test('rejects off-origin discovery and sign-out fences a Human action after schema read',async t=>{
  const bad=fixture(t);bad.badMetadata()
  await assert.rejects(bad.begin(),{code:'loop-host/backend-invalid'})
  assert.equal(bad.seen.some(r=>r.method==='POST'),false)
  const f=fixture(t);const start=await f.begin();await f.callback(start);await f.finish(start)
  f.onSchema(f.signOut)
  await assert.rejects(f.action('humanAction',{name:read}),/cancelled|detached/)
  assert.equal(f.seen.some(r=>r.suffix.endsWith('/invocations')),false)
  assert.equal((await f.service.status(undefined,'business',active)).state,'signed_out')
})

test('Human refresh rotates only its own slot and uncertain DELETE is not reported as disconnected',async t=>{
  const f=fixture(t);await f.seedAgent()
  const start=await f.begin();await f.callback(start);await f.finish(start)
  await f.businessStore.modify(async current=>({...current,access_expires_at:new Date(Date.now()-1000).toISOString()}))
  assert.equal((await f.service.status(f.owner,'business',active)).state,'connected')
  assert.match((await f.businessStore.read()).access_token,/-rotated$/)
  assert.equal((await f.agentStore.read()).access_token,'agent-access-fixture')
  f.failDelete()
  await assert.rejects(f.service.disconnect(f.owner,'business',active),{code:'loop-host/backend-unavailable',outcomeUnknown:true})
  assert.ok(await f.businessStore.read())
})

test('Live bearer revokes even with uncertain rotation; inaccessible grant is detached without claiming remote revoke',async t=>{
  const f=fixture(t);const start=await f.begin();await f.callback(start);await f.finish(start)
  await f.businessStore.modify(async current=>({...current,refresh_state:'unknown'}))
  assert.equal((await f.service.disconnect(f.owner,'business',active)).state,'signed_out')
  assert.equal(f.seen.filter(r=>r.method==='DELETE').length,1)
  const again=await f.begin();await f.callback(again);await f.finish(again)
  const token=(await f.businessStore.read()).access_token
  f.grants.delete('Bearer '+token)
  await assert.rejects(f.service.disconnect(f.owner,'business',active),{code:'loop-host/human-revoke-unconfirmed'})
  assert.equal((await f.service.status(f.owner,'business',active)).state,'needs_auth')
  assert.equal(f.seen.filter(r=>r.method==='DELETE').length,1)
})

test('Native adapter separates local Workspace IDs from Loop identity and does not pin to an Agent grant',async t=>{
  const f=fixture(t);const start=await f.begin();await f.callback(start);await f.finish(start);await f.seedAgent()
  const stateHome=await mkdtemp(join(tmpdir(),'loop-native-human-'))
  t.after(()=>rm(stateHome,{recursive:true,force:true}))
  const adapter=new NativeHostActions({stateHome,serviceBaseUrl:base,loopWorkspaceId:'W',installationId:'install',pageOrigin:'http://127.0.0.1:12211',syncProfile:'fixture',accountPrincipal,authorizationSettings:false},{provider:f.provider,fetch:f.fetcher})
  t.after(()=>adapter.dispose())
  const args={accountPrincipal,loopWorkspaceId:'W',workspaceId:'local-dsh-workspace',sessionId:'local-dsh-session'}
  assert.deepEqual(await adapter.request('humanCatalog',args),{actions:[read,write]})
  await f.seedAgent(accountPrincipal,'other-agent-grant')
  assert.deepEqual(await adapter.request('humanCatalog',args),{actions:[read,write]})
  await assert.rejects(adapter.request('humanCatalog',{...args,loopWorkspaceId:'other'}),{code:'loop-host/needs-auth'})
  await f.seedAgent('different-user','different-agent-grant')
  const humanRequests=f.seen.filter(r=>r.suffix.includes('/external/human')).length
  await assert.rejects(adapter.request('humanCatalog',args),{code:'loop-host/needs-auth'})
  assert.equal(f.seen.filter(r=>r.suffix.includes('/external/human')).length,humanRequests)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {createServer} from 'node:http'
import {once} from 'node:events'
import {Context} from '@deepseek-ai/cordis'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import {HostCredentialStore} from '../backend/credentials.ts'
import {TokenManager} from '../backend/http.ts'
import {HostAPI} from '../backend/host-api.ts'
import {AccountService} from '../backend/account.ts'
import {ModelService} from '../backend/models.ts'

const model = {id:'model',name:'Model',source:'loop_proxy',providerId:'provider',providerName:'Provider',wireApi:'openai-completions'}
const input = {connectionId:'grant',hostSessionId:'session-one',modelId:'model',source:'loop_proxy',wireApi:'openai-completions'}
async function fixture(t, custom = () => false) {
  const home = await mkdtemp(tmpdir() + '/loop-ts-models-')
  const ctx = new Context()
  await ctx.plugin(LocalCredentialProvider,{dshHome:home,watch:false})
  let base, sequence=0
  const calls=[]
  const server=createServer(async(req,res) => {
    try {
      let raw=''; for await (const chunk of req) raw+=chunk
      const call={url:req.url,method:req.method,headers:req.headers,body:raw ? JSON.parse(raw) : undefined}
      calls.push(call)
      if (await custom(call,req,res,{base,sequence})) return
      res.setHeader('Content-Type','application/json')
      if(req.url.endsWith('/models')) res.end(JSON.stringify({connectionId:'grant',workspaceId:'workspace',billingUserId:'principal',models:[model]}))
      else if(req.method==='DELETE') res.writeHead(204).end()
      else if(req.url.endsWith('/sessions') || req.url.endsWith('/refresh')) res.end(JSON.stringify({sessionId:'lease-'+(++sequence),connectionId:'grant',modelId:'model',wireApi:'openai-completions',token:'lease-secret-'+sequence,
        baseURL:base+'/api/v1/external-model/workspaces/workspace/v1',expiresAt:new Date(Date.now()+3600_000).toISOString(),refreshAt:new Date(Date.now()+1800_000).toISOString()}))
      else res.writeHead(404).end('{}')
    } catch(error) {res.writeHead(500).end('{}'); t.diagnostic(error.stack)}
  })
  server.listen(0,'127.0.0.1'); await once(server,'listening')
  base=`http://127.0.0.1:${server.address().port}`
  const store=new HostCredentialStore(ctx.get('credentials'),base,'workspace','installation')
  const credential=await store.publish({version:1,principal_id:'principal',workspace_id:'workspace',client_id:'client',grant_id:'grant',
    token_endpoint:base+'/token',resource:base+'/api/v1/workspaces/workspace/external/agent',scope:'loop.host offline_access',
    access_token:'oauth-secret',refresh_token:'refresh-secret',access_expires_at:new Date(Date.now()+3600_000).toISOString(),host_page_proof:'proof-secret'})
  const api=new HostAPI(new TokenManager(store,credential))
  const models=new ModelService(api,'installation')
  t.after(async()=>{await models.dispose(); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); await ctx.fiber.dispose(); await rm(home,{recursive:true,force:true})})
  return {base,store,credential,api,models,calls}
}

test('model catalog and concurrent lease creation use one control-plane request and keep OAuth private',async t=>{
  const f=await fixture(t)
  const catalog=await f.models.runtimeCatalog()
  assert.deepEqual(catalog.connections[0].models,[model])
  const leases=await Promise.all(Array.from({length:10},()=>f.models.ensureSession(input)))
  assert.ok(leases.every(lease=>lease.localKey===leases[0].localKey))
  assert.equal(f.calls.filter(call=>call.url.endsWith('/sessions')).length,1)
  assert.ok(!JSON.stringify(leases).includes('secret'))
  assert.equal(f.calls.at(-1).headers.authorization,'Bearer oauth-secret')
  assert.deepEqual(f.calls.at(-1).body,{hostInstallationId:'installation',hostSessionId:'session-one',modelId:'model',source:'loop_proxy',wireApi:'openai-completions',purpose:'conversation'})
})

test('model bridge streams data using the lease and removes authority and cookie headers',async t=>{
  let received
  const f=await fixture(t,(call,_req,res)=>{
    if(!call.url.endsWith('/chat/completions')) return false
    received=call
    res.writeHead(200,{'Content-Type':'text/event-stream','Set-Cookie':'secret=value','X-Loop-Internal':'hidden'})
    res.write('data: first\n\n')
    setTimeout(()=>res.end('data: [DONE]\n\n'),30)
    return true
  })
  const lease=await f.models.ensureSession(input)
  const response=await fetch(lease.baseURL+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+lease.localKey,'Content-Type':'application/json',Cookie:'daily=cookie','X-Loop-Agent-Id':'spoofed','X-Loop-Extra':'secret'},body:JSON.stringify({model:'model',messages:[]})})
  assert.equal(response.status,200)
  assert.equal(response.headers.get('set-cookie'),null)
  assert.equal(response.headers.get('x-loop-internal'),null)
  assert.equal(await response.text(),'data: first\n\ndata: [DONE]\n\n')
  assert.equal(received.headers.authorization,'Bearer lease-secret-1')
  assert.equal(received.headers.cookie,undefined)
  assert.equal(received.headers['x-loop-agent-id'],undefined)
  assert.equal(received.headers['x-loop-extra'],undefined)
})

test('bridge rejects invalid keys, wrong wire paths and redirected data requests',async t=>{
  let dataCalls=0
  const f=await fixture(t,(call,_req,res)=>{
    if(!call.url.endsWith('/chat/completions')) return false
    dataCalls++;res.writeHead(302,{location:'http://127.0.0.1:1/stolen'}).end();return true
  })
  const lease=await f.models.ensureSession(input)
  const request=(path,key)=>fetch(lease.baseURL+path,{method:'POST',headers:{Authorization:'Bearer '+key},body:'{}'})
  assert.equal((await request('/chat/completions','wrong')).status,401)
  assert.equal((await request('/messages',lease.localKey)).status,404)
  assert.equal((await request('/chat/completions',lease.localKey)).status,502)
  assert.equal(dataCalls,1)
})

test('a data-plane 401 invalidates the local lease without replaying the model request',async t=>{
  let calls=0
  const f=await fixture(t,(call,_req,res)=>{if(!call.url.endsWith('/chat/completions'))return false;calls++;res.writeHead(401).end('expired');return true})
  const lease=await f.models.ensureSession(input)
  const request=()=>fetch(lease.baseURL+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+lease.localKey},body:'{}'})
  assert.equal((await request()).status,401)
  assert.equal((await request()).status,401)
  assert.equal(calls,1)
  const next=await f.models.ensureSession(input)
  assert.notEqual(next.localKey,lease.localKey)
})

test('closing a Host session fences a concurrently created lease and revokes it',async t=>{
  let entered,release
  const started=new Promise(resolve=>{entered=resolve}),gate=new Promise(resolve=>{release=resolve})
  const f=await fixture(t,async call=>{if(call.url.endsWith('/sessions')){entered();await gate}return false})
  const pending=f.models.ensureSession(input)
  await started
  await f.models.closeHostSession(input.hostSessionId)
  release()
  await assert.rejects(pending,{code:'loop-host/target-unavailable'})
  assert.equal(f.calls.filter(call=>call.method==='DELETE').length,1)
})

test('closing a Host session aborts its live model stream',async t=>{
  const f=await fixture(t,(call,_req,res)=>{if(!call.url.endsWith('/chat/completions'))return false;res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('data: started\n\n');return true})
  const lease=await f.models.ensureSession(input)
  const response=await fetch(lease.baseURL+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+lease.localKey},body:'{}'})
  const reader=response.body.getReader()
  assert.ok((await reader.read()).value.length)
  const ended=assert.rejects(reader.read())
  await f.models.closeHostSession(input.hostSessionId)
  await ended
  assert.equal(f.calls.filter(call=>call.method==='DELETE').length,1)
})

test('model sessions do not cross accounts after credential replacement',async t=>{
  let dataCalls=0
  const f=await fixture(t,(call,_req,res)=>{if(!call.url.endsWith('/chat/completions'))return false;dataCalls++;res.end('{}');return true})
  const lease=await f.models.ensureSession(input)
  await f.store.publish({...f.credential,principal_id:'other'})
  const response=await fetch(lease.baseURL+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+lease.localKey},body:'{}'})
  assert.equal(response.status,502)
  assert.equal(dataCalls,0)
  await assert.rejects(f.models.ensureSession(input),{code:'loop-host/needs-auth'})
})

test('account session checks exact identity and retries one 401 after coordinated refresh',async t=>{
  let inspections=0,rotations=0
  const f=await fixture(t,(call,_req,res)=>{
    // Token requests are form-encoded, so this case uses the injected fetch below.
    if(!call.url.endsWith('/session'))return false
    inspections++
    if(inspections===1){res.writeHead(401).end('{}');return true}
    assert.equal(call.headers.authorization,'Bearer rotated')
    assert.deepEqual(call.body,{workspaceId:'workspace',installationId:'installation',pageOrigin:'http://127.0.0.1:4333',resumeProof:'proof-secret'})
    res.end(JSON.stringify({principalId:'principal',workspaceId:'workspace',grantId:'grant',accountName:'User',pageLaunch:'page-assertion',pageOrigin:'http://127.0.0.1:4333',expiresIn:60}));return true
  })
  const tokens=new TokenManager(f.store,f.credential,{fetch:async()=>{rotations++;return Response.json({access_token:'rotated',refresh_token:'rotated-refresh',token_type:'Bearer',expires_in:3600})}})
  const account=new AccountService(new HostAPI(tokens),'installation','http://127.0.0.1:4333')
  assert.equal((await account.session(true)).pageLaunch,'page-assertion')
  assert.equal(inspections,2);assert.equal(rotations,1)
})

test('account checks reject mismatched grants and model metadata cannot redirect the bridge',async t=>{
  const f=await fixture(t,(call,_req,res)=>{
    if(call.url.endsWith('/session')){res.end(JSON.stringify({principalId:'principal',workspaceId:'workspace',grantId:'other'}));return true}
    if(call.url.endsWith('/sessions')){res.end(JSON.stringify({sessionId:'lease',connectionId:'grant',modelId:'model',wireApi:'openai-completions',token:'secret',baseURL:'https://example.com/v1',expiresAt:new Date(Date.now()+3600_000).toISOString()}));return true}
    return false
  })
  await assert.rejects(new AccountService(f.api,'installation','http://127.0.0.1:4333').status(),{code:'loop-host/needs-auth'})
  await assert.rejects(f.models.ensureSession(input),{code:'loop-host/backend-invalid'})
})

test('the model session limit holds under concurrent distinct-session creation',async t=>{
  const f=await fixture(t,async call=>{if(call.url.endsWith('/sessions'))await new Promise(resolve=>setTimeout(resolve,15));return false})
  await f.models.runtimeCatalog()
  const results=await Promise.allSettled(Array.from({length:70},(_,i)=>f.models.ensureSession({...input,hostSessionId:'session-'+i})))
  assert.equal(results.filter(result=>result.status==='fulfilled').length,64)
  assert.equal(results.filter(result=>result.status==='rejected' && result.reason.code==='loop-host/model-session-limit').length,6)
  assert.equal(f.calls.filter(call=>call.url.endsWith('/sessions')).length,64)
})

test('disposal closes the model listener and active stream without terminating the host',async t=>{
  const f=await fixture(t,(call,_req,res)=>{if(!call.url.endsWith('/chat/completions'))return false;res.writeHead(200);res.write('started');return true})
  const lease=await f.models.ensureSession(input)
  const response=await fetch(lease.baseURL+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+lease.localKey},body:'{}'})
  const reader=response.body.getReader(); await reader.read()
  const rejected=assert.rejects(reader.read())
  await f.models.dispose(); await rejected
  await assert.rejects(fetch(lease.baseURL))
  assert.throws(()=>f.models.ensureSession(input),{code:'loop-host/unavailable'})
})

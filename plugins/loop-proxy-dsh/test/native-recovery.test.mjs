import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {once} from 'node:events'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {Context} from '@deepseek-ai/cordis'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import {HostCredentialStore} from '../backend/credentials.ts'
import {beginHostLogin} from '../backend/oauth.ts'
import {TokenManager} from '../backend/http.ts'

async function fixture(t,exchange,{prefix="",issueStatus,issueCode}={}){
  const root=await mkdtemp(tmpdir()+'/loop-recovery-'),ctx=new Context(),issued=[],exchanges=[]
  await ctx.plugin(LocalCredentialProvider,{dshHome:root,watch:false})
  let base
  const server=createServer(async(req,res)=>{
    assert.equal(req.headers['x-loop-super-agent-device'],'synthetic-device-proof')
    let body='';for await(const chunk of req)body+=chunk
    const input=JSON.parse(body)
    res.setHeader('Content-Type','application/json')
    if(req.url.endsWith('/exchange')){
      exchanges.push(input)
      if(exchange)return exchange({req,res,input,reply})
      return res.end(JSON.stringify(reply))
    }
    assert.equal(req.url,prefix+'/api/v1/auth/external-host/credential-recoveries')
    if(issueStatus){res.writeHead(issueStatus).end(JSON.stringify({error:{code:issueCode}}));return}
    issued.push(input)
    res.end(JSON.stringify({browserUrl:base+'/external-host/page-reauthorize#challenge=synthetic-challenge&state=server-state',expiresAt:new Date(Date.now()+300000).toISOString()}))
  })
  server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}${prefix}`
  const store=new HostCredentialStore(ctx.get('credentials'),base,'workspace','installation')
  const original=await store.publish({version:1,principal_id:'principal',workspace_id:'workspace',client_id:'client',token_endpoint:base+'/token',resource:base+'/api/v1/workspaces/workspace/external/agent',grant_id:'grant',scope:'loop.host offline_access',access_token:'old-access',refresh_token:'old-refresh',access_expires_at:new Date(0).toISOString(),device_credential:'synthetic-device-proof',host_page_proof:'synthetic-page-proof',refresh_state:'unknown',refresh_operation:'lost-rotation',refresh_started_at:0})
  const reply={access_token:'new-access',refresh_token:'new-refresh',token_type:'Bearer',scope:original.scope,resource:original.resource,expires_in:3600}
  const logins=[],providers=[]
  t.after(async()=>{for(const l of logins)l.cancel();await Promise.allSettled(logins.map(l=>l.result));server.closeAllConnections();await new Promise(r=>server.close(r));for(const provider of providers)await provider.fiber.dispose();await ctx.fiber.dispose();await rm(root,{recursive:true,force:true})})
  const begin=async(independent=false)=>{let provider=ctx.get('credentials');if(independent){const other=new Context();await other.plugin(LocalCredentialProvider,{dshHome:root,watch:false});providers.push(other);provider=other.get('credentials')}const login=await beginHostLogin({provider,server:base,installation:'installation',pageOrigin:'http://127.0.0.1:4333',recovery:original});logins.push(login);return login}
  const callback=async(index=issued.length-1,changes={})=>{
    const i=issued[index]
    return fetch(i.callbackUri,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({state:'server-state',host_nonce:i.hostNonce,page_origin:i.pageOrigin,recovery_code:'synthetic-recovery',...changes})})
  }
  return {root,base,store,original,reply,issued,exchanges,begin,callback}
}

test('human-confirmed recovery preserves authority and generation so existing token owners resume',async t=>{
  const f=await fixture(t),tokens=new TokenManager(f.store,f.original)
  const login=await f.begin()
  assert.match(login.authorizationURL,/\/external-host\/page-reauthorize#/)
  const landing=await fetch(f.issued[0].callbackUri)
  assert.equal(landing.headers.get('cache-control'),'no-store')
  assert.match(await landing.text(),/location.hash.slice/)
  assert.equal((await f.callback()).status,200)
  const {credential}=await login.result
  for(const key of ['generation','grant_id','client_id','resource','principal_id','workspace_id','device_credential','host_page_proof'])assert.equal(credential[key],f.original[key])
  assert.equal(credential.refresh_state,undefined)
  assert.equal((await tokens.credential()).access_token,'new-access')
  assert.equal(f.exchanges.length,1)
})

test('recovery rejects wrong callback state, nonce and origin without consuming the valid confirmation',async t=>{
  const f=await fixture(t),login=await f.begin()
  for(const changes of [{state:'wrong'},{host_nonce:'wrong'},{page_origin:'https://wrong.example'},{recovery_code:''}])assert.equal((await f.callback(0,changes)).status,400)
  assert.equal(f.exchanges.length,0)
  assert.equal((await f.callback()).status,200);await login.result
  assert.equal(f.exchanges.length,1)
})

for(const failure of ['lost-response','cancel','wrong-resource','wrong-scope'])test(`recovery ${failure} retains uncertainty and never replays the old refresh token`,async t=>{
  let login
  const f=await fixture(t,({req,res,reply})=>{
    if(failure==='lost-response'){req.socket.destroy();return}
    if(failure==='cancel')login.cancel()
    res.end(JSON.stringify({...reply,...(failure==='wrong-resource'?{resource:'https://other.example'}:failure==='wrong-scope'?{scope:'other'}:{})}))
  })
  login=await f.begin();const rejected=assert.rejects(login.result)
  await f.callback();await rejected
  const current=await f.store.read()
  assert.equal(current.generation,f.original.generation);assert.equal(current.refresh_state,'unknown');assert.equal(current.refresh_token,'old-refresh')
  assert.equal(f.exchanges.length,1)
  login.cancel();assert.ok(await f.store.read(),'late cancel never logs out the original generation')
})

test('two credential providers serialize recovery and only the first confirmation exchanges',async t=>{
  let entered,release
  const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r)
  const f=await fixture(t,async({res,reply})=>{entered();await gate;res.end(JSON.stringify(reply))})
  // Two independent official providers contend for the same durable record.
  const first=await f.begin(),second=await f.begin(true)
  const failed=assert.rejects(second.result,{code:'loop-host/conflict'})
  await f.callback(0);await ready
  await f.callback(1)
  assert.equal(f.exchanges.length,1)
  release();await first.result;await failed
  assert.equal(f.exchanges.length,1)
  assert.equal((await f.store.read()).access_token,'new-access')
})

test('logout queued during recovery removes the same authority after exchange settles',async t=>{
  let entered,release
  const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r)
  const f=await fixture(t,async({res,reply})=>{entered();await gate;res.end(JSON.stringify(reply))})
  const login=await f.begin();await f.callback();await ready
  const logout=f.store.logout(f.original.generation)
  release();await login.result;await logout
  assert.equal(await f.store.read(),undefined)
})

test('replacement login before confirmation prevents exchange or overwriting the new generation',async t=>{
  const f=await fixture(t),login=await f.begin()
  const replacement=await f.store.publish({...f.original,principal_id:'another'})
  const rejected=assert.rejects(login.result,{code:'loop-host/conflict'})
  await f.callback();await rejected
  assert.equal(f.exchanges.length,0);assert.equal((await f.store.read()).generation,replacement.generation)
})

test('recovery supports a Loop reverse-proxy path prefix',async t=>{
  const f=await fixture(t,undefined,{prefix:'/team/loop'}),login=await f.begin()
  assert.equal(new URL(login.authorizationURL).pathname,'/team/loop/external-host/page-reauthorize')
  await f.callback();assert.equal((await login.result).credential.grant_id,'grant')
})

for(const [issueStatus,issueCode] of [[409,'page_reauth_rebind_required'],[403,'page_reauth_device_mismatch'],[404,'not_found']])test(`unrecoverable ${issueCode} explains explicit reconnect without replacing authority`,async t=>{
  const f=await fixture(t,undefined,{issueStatus,issueCode})
  await assert.rejects(f.begin(),{code:'loop-host/recovery-unavailable'})
  assert.deepEqual(await f.store.read(),f.original)
  assert.equal(f.exchanges.length,0)
})

test('separate Node processes exchange only once when both recovery confirmations race',async t=>{
  const {fork}=await import('node:child_process')
  let entered,release
  const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r)
  const f=await fixture(t,async({res,reply})=>{entered();await gate;res.end(JSON.stringify(reply))})
  const workers=Array.from({length:2},()=>{
    const child=fork(new URL('./fixtures/native-recovery-child.mjs',import.meta.url),[f.root,f.base],{stdio:['ignore','pipe','pipe','ipc']})
    const messages=[];child.on('message',m=>messages.push(m))
    const exit=once(child,'exit')
    t.after(()=>{if(child.exitCode===null)child.kill('SIGTERM')})
    return {child,messages,exit}
  })
  const {setTimeout:delay}=await import('node:timers/promises')
  for(let i=0;i<300&&!workers.every(w=>w.messages.some(m=>m.state==='ready'));i++)await delay(10)
  assert.ok(workers.every(w=>w.messages.some(m=>m.state==='ready')))
  await f.callback(0);await ready
  await f.callback(1);release()
  await Promise.all(workers.map(w=>w.exit))
  assert.deepEqual(workers.flatMap(w=>w.messages.filter(m=>m.state!=='ready').map(m=>m.state)).sort(),['recovered','rejected'])
  assert.equal(workers.flatMap(w=>w.messages).find(m=>m.state==='rejected').code,'loop-host/conflict')
  assert.equal(f.exchanges.length,1)
})

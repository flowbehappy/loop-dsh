import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname,join,resolve,isAbsolute} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawn,execFile} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {worksiteOrigin} from '../worksite-origin.mjs'
import {promisify} from 'node:util'
import {setTimeout as delay} from 'node:timers/promises'
const exec=promisify(execFile),runtime=process.env.LOOP_TS_E2E_DSH_BIN,base=process.env.LOOP_TS_E2E_BASE_URL,worksiteParent=process.env.LOOP_TS_E2E_WORKSITE_PARENT

// The extended browser journey runs multiple bounded model turns before checking sync.
const extendedJourney = ['LOOP_TS_E2E_BUSINESS','LOOP_TS_E2E_CHANNEL'].some(key => process.env[key] === '1')
const probeTimeout = method => method === 'browser' && extendedJourney ? 180000 : 60000

for(const method of ['browser','access-token'])test('packaged plugin signs in and runs a persisted official DSH session: '+method,{skip:!runtime || method==='access-token' && !base,timeout:probeTimeout(method) + 30000},async t=>{
  assert.ok(isAbsolute(runtime),'supply an explicitly isolated official DSH bin.js')
  if(base)assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'real Loop must be an explicitly isolated loopback Test Hub')
  const root=await mkdtemp(join(tmpdir(),'loop-native-dsh-')),home=join(root,'home'),workspace=join(root,'workspace')
  let child,exit
  t.after(async()=>{
    if(child&&child.exitCode===null){child.kill('SIGTERM');await Promise.race([exit,delay(10000,undefined,{ref:false})]);if(child.exitCode===null){child.kill('SIGKILL');await exit}}
    if(process.env.LOOP_TS_E2E_KEEP==='1')t.diagnostic('isolated artifacts: '+root);else await rm(root,{recursive:true,force:true})
  })
  await mkdir(workspace,{recursive:true})
  const installation=randomUUID(),publicOrigin=worksiteParent && method==='browser'?worksiteOrigin(installation,worksiteParent,'http').origin:''
  if(publicOrigin)assert.ok(new URL(publicOrigin).hostname.endsWith('.localhost'),'Worksite E2E must use an isolated localhost parent')
  const environment={...process.env,DSH_HOME:home}
  // Never inherit model keys or the operator's Loop override configuration.
  for(const key of Object.keys(environment))if(/API_KEY|TOKEN|DSH_LOOP_|LOOP_CONNECTOR_|LOOP_HOST_/u.test(key))delete environment[key]
  await exec(process.execPath,[runtime,'web','--dump-config'],{cwd:workspace,env:environment,maxBuffer:4<<20})
  if(publicOrigin){
    await mkdir(join(home,'loop-plugin'),{mode:0o700})
    await writeFile(join(home,'loop-plugin/installation-id'),installation+'\n',{mode:0o600})
    environment.DSH_LOOP_PROXY_WORKSITE_URL=publicOrigin
    environment.DSH_LOOP_PROXY_WORKSITE_TRUSTED_HOST=new URL(publicOrigin).host
  }
  const packageRoot=join(root,'packages/node_modules/@pingkai/loop-dsh')
  await exec(process.execPath,[fileURLToPath(new URL('../build-native.mjs',import.meta.url)),packageRoot],{maxBuffer:4<<20})
  const profile=join(home,'profiles/web')
  if(process.env.LOOP_TS_E2E_INSTALL_PACKAGE==='1'){
    const packed=await exec('npm',['pack','--json','--pack-destination',root],{cwd:packageRoot,env:environment,maxBuffer:4<<20})
    const archive=join(root,JSON.parse(packed.stdout)[0].filename)
    await exec(process.execPath,[runtime,'plugin','--profile','web','add',archive],{cwd:workspace,env:environment,maxBuffer:4<<20})
    t.diagnostic('package installation: official DSH plugin add from fresh tarball')
  }else{
    // Fast mode uses the official runtime's exact dependencies.
    await symlink(resolve(dirname(runtime),'../../..'),join(packageRoot,'node_modules'),'dir')
    const manifest=JSON.parse(await readFile(join(profile,'package.json'),'utf8'))
    manifest.dsh.profile.bundles.push('@pingkai/loop-dsh')
    await writeFile(join(profile,'package.json'),JSON.stringify(manifest))
    await mkdir(join(profile,'node_modules/@pingkai'),{recursive:true})
    await symlink(packageRoot,join(profile,'node_modules/@pingkai/loop-dsh'),'dir')
  }
  const output=join(root,'result.json'),probe=join(root,'probe.mjs')
  await writeFile(probe,`import {writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createServer} from 'node:http'
import {once} from 'node:events'
import {setTimeout as delay} from 'node:timers/promises'
import {prepareChannelJourney} from ${JSON.stringify(new URL('./native-dsh-channel-fixture.mjs',import.meta.url).href)}
import {prepareBusinessJourney} from ${JSON.stringify(new URL('./native-dsh-business-fixture.mjs',import.meta.url).href)}
export const name='native-runtime-test'
export const inject=['loopHostActions','loopNativeSyncWriterFactory','sessionController','workspaceRegistry','credentials','loopHostService']
export async function apply(ctx){
 const result={}
 const trace=stage=>writeFile(${JSON.stringify(output+".progress")},stage)
 try{
  await trace("start")
  result.account=await ctx.loopHostActions.accountStatus();assert.equal(result.account.state,'signed_out')
  const writer=ctx.loopNativeSyncWriterFactory({profile:ctx.loopHostActions.currentSyncProfile(),queueLimit:10,shutdownTimeoutMs:1000,clientSessionLabel:'native-test'})
  writer.start();assert.equal(writer.totalQueued,0);await writer.shutdown()
  await trace("session");const localWorkspace=await ctx.workspaceRegistry.create(process.cwd(),'Native E2E');result.session=await ctx.sessionController.create({workspaceId:localWorkspace.id});assert.ok(result.session.sessionId)
  const base=${JSON.stringify(base??'')}
  if(base){
   let token=''
   const api=async(method,path,body,bearer=token)=>{
    const response=await fetch(base+path,{method,headers:{Accept:'application/json','Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(15000)})
    assert.ok(response.ok,method+' '+path.split('?')[0]+' '+response.status)
    const text=await response.text();return text?JSON.parse(text):undefined
   }
   const password="Isolated-Only-7!"+randomUUID()
   await trace("registration");const registered=await api('POST','/api/v1/auth/register',{name:'native_'+randomUUID().slice(0,8),email:'native-'+randomUUID()+'@example.com',password})
   token=registered.accessToken
   if(!registered.user.emailVerified){const mailbox=await api('GET','/internal/e2e/mailbox/latest?kind=verify&email='+encodeURIComponent(registered.user.email));await api('POST','/api/v1/auth/verify-email',{token:mailbox.token})}
   let upstreamCalls=0,upstreamError='',business,channelJourney
   const upstream=createServer(async(req,res)=>{
    try{
     assert.equal(req.url,'/v1/chat/completions');assert.equal(req.headers.authorization,'Bearer isolated-model-key')
     let raw='';for await(const chunk of req)raw+=chunk
     const input=JSON.parse(raw);assert.equal(input.model,'native-test-model');assert.ok(input.messages.length)
     upstreamCalls++
     const nl=String.fromCharCode(10),event=value=>'data: '+JSON.stringify(value)+nl+nl
     const call=channelJourney ? channelJourney.next(input) : business?.next(input)
     res.writeHead(200,{'Content-Type':'text/event-stream'})
     res.write(event({id:'test-completion',object:'chat.completion.chunk',created:1,model:'native-test-model',choices:[{index:0,delta:call?{role:'assistant',tool_calls:[call]}:{role:'assistant',content:'NATIVE_DSH_MODEL_OK'},finish_reason:null}]}))
     res.end(event({id:'test-completion',object:'chat.completion.chunk',created:1,model:'native-test-model',choices:[{index:0,delta:{},finish_reason:call?'tool_calls':'stop'}],usage:{prompt_tokens:12,completion_tokens:6,total_tokens:18}})+'data: [DONE]'+nl+nl)
    }catch(error){upstreamError=String(error);res.writeHead(500).end()}
   })
   await trace("upstream-start");upstream.listen(0,'127.0.0.1');await once(upstream,'listening')
   ctx.effect(()=>()=>{upstream.closeAllConnections();upstream.close()})
   await trace("model-profile");await api('POST','/api/v1/me/model-profiles',{displayName:'Isolated native model',model:'native-test-model',models:['native-test-model'],baseUrl:'http://127.0.0.1:'+upstream.address().port+'/v1',apiKey:'isolated-model-key',wireApi:'openai',verifiedWireApis:['openai']})
   await trace("workspace");const workspace=(await api('GET','/api/v1/workspaces'))[0].id
   const actions=ctx.loopHostActions
   const hostRuntime=ctx.loopHostService.runtime
   await hostRuntime.configureGlobalServer({serverUrl:base})
   await hostRuntime.configureGlobalServerWorkspace({workspaceId:workspace,expectedServerRevision:hostRuntime.serverRevision})
   const connect=()=>hostRuntime.connectAccount({expectedServerRevision:hostRuntime.serverRevision})
   const method=${JSON.stringify(method)}
   const publicOrigin=${JSON.stringify(publicOrigin)}
   let q,connected
   await trace("login")
   if(method==="access-token"){
    const {assistant}=await api('PUT','/api/v1/me/personal-assistants/'+workspace)
    const issued=await api('POST','/api/v1/me/api-tokens',{workspaceId:workspace,agentId:assistant.agentId,name:'Official DSH session',expiresInDays:1,purpose:'dsh.login'})
    connected=await hostRuntime.connectAccount({accessToken:issued.token,expectedServerRevision:hostRuntime.serverRevision})
   }else{
   const login=await connect();assert.equal(login.state,'needs_auth')
   q=new URL(login.challenge.loginUrl).searchParams
   if(publicOrigin)assert.equal(q.get('page_origin'),publicOrigin,'remote consent must use the advertised browser origin')
   const authorization={responseType:q.get('response_type'),clientId:q.get('client_id'),redirectUri:q.get('redirect_uri'),workspaceId:workspace,resource:q.get('resource'),state:q.get('state'),scope:q.get('scope'),codeChallenge:q.get('code_challenge'),codeChallengeMethod:q.get('code_challenge_method'),deviceLabel:q.get('device_label'),pageOrigin:q.get('page_origin')}
   const approved=await api('POST','/api/v1/auth/external-host/connection',{installationId:q.get('host_installation_id'),includeSync:true,pageResumeChallenge:q.get('page_resume_challenge'),authorization})
   const callback=await fetch(approved.redirectTo,{redirect:'error'});assert.equal(callback.status,200);await callback.text()
   for(let i=0;i<100;i++){connected=await connect();if(connected.state==='connected')break;await delay(20)}
   }
   assert.equal(connected.state,'connected')
   assert.equal((await actions.accountStatus()).state,'signed_in')
   if(publicOrigin){
    await trace('worksite-register')
    let registered=false
    for(let i=0;i<200;i++){const list=await api('GET','/api/v1/worksite/installations');if(list.installations.some(row=>row.installationId===q.get('host_installation_id'))){registered=true;break}await delay(50)}
    assert.ok(registered,'native Host installation must register')
    await api('POST','/api/v1/worksite/installations/'+encodeURIComponent(q.get('host_installation_id'))+'/enable',{})
    await trace('worksite-connect')
    let connected=false
    for(let i=0;i<500;i++){if((await actions.worksiteStatus({})).state==='connected'){connected=true;break}await delay(50)}
    assert.ok(connected,'real Worksite relay must connect')
    const launch=await api('POST','/api/v1/worksite/launches',{installationId:q.get('host_installation_id')})
    const started=await fetch(launch.actionUrl,{method:'POST',headers:{Origin:'http://loop.localhost:55691'},body:new URLSearchParams({installation:launch.installationId,ticket:launch.ticket}),redirect:'manual',signal:AbortSignal.timeout(10000)})
    assert.equal(started.status,303)
    const routeCookie=started.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');await started.text()
    assert.ok(routeCookie.includes('loop_worksite_session='));assert.ok(!routeCookie.includes('dsh-auth-'))
    const remote=await fetch(publicOrigin+'/',{headers:{Cookie:routeCookie},redirect:'manual',signal:AbortSignal.timeout(10000)})
    assert.equal(remote.status,200);assert.ok((await remote.text()).length>100);assert.ok(!remote.headers.getSetCookie().some(value=>value.startsWith('dsh-auth-')))
    result.worksite={relay:true,launch:true,remoteHost:true}
   }
   await trace("model-catalog");const catalog=await actions.modelRuntimeCatalog();assert.ok(catalog.connections.length)
   await trace("model-runtime");assert.ok(ctx.get('loopModelRuntime'),'model runtime unavailable; llm='+Boolean(ctx.get('llm'))+' sessions='+Boolean(ctx.get('sessions')))
   await ctx.get('loopModelRuntime').sync()
   await trace("dsh-model-catalog");const available=await ctx.sessionController.modelCatalog()
   const group=available.groups.find(group=>group.id.startsWith('loop-model-'))
   assert.ok(group,'Loop model provider must be registered in DSH')
   const model=group.models.find(model=>model.id.includes('native-test-model'));assert.ok(model)
   await trace("sync-enable")
   await hostRuntime.withSessionContext(result.session.sessionId,undefined,async context=>assert.equal(context.state,'inherited'))
   const syncRequest={workspaceId:localWorkspace.id,sessionId:result.session.sessionId}
   const enabled=await hostRuntime.setSync({...syncRequest,enabled:true});assert.ok(['on','pending'].includes(enabled.sync.state))
   await trace("select-model");await ctx.sessionController.selectModel({sessionId:result.session.sessionId,provider:group.id,model:model.id})
   if(method==="browser" && process.env.LOOP_TS_E2E_BUSINESS==="1"){const control=new AbortController();ctx.effect(()=>()=>control.abort());business=await prepareBusinessJourney(api,workspace,ctx.loopHostService,result.session.sessionId,control.signal)}
   await trace("prompt");await ctx.sessionController.prompt({sessionId:result.session.sessionId,requestId:randomUUID(),content:[{type:'text',text:business?'在 DSH project journey 项目中给项目负责人派一个测试任务，并在选中的知识库创建一份文档。':'Reply with NATIVE_DSH_MODEL_OK.'}]},AbortSignal.timeout(20000))
   await trace("wait");const completed=await ctx.sessionController.wait({sessionId:result.session.sessionId,timeoutMs:20000},AbortSignal.timeout(25000))
   await trace("check outcome");business?.check();assert.equal(upstreamError,'');assert.ok(upstreamCalls>0,'DSH must reach the configured upstream through Loop: '+JSON.stringify(completed))
   assert.ok(JSON.stringify(completed.output).includes('NATIVE_DSH_MODEL_OK'),'persisted assistant output must contain the streamed model reply')
   if(business) {
     await business.retry()
     await ctx.sessionController.prompt({sessionId:result.session.sessionId,requestId:randomUUID(),content:[{type:'text',text:'现在请重新申请刚才项目的授权，派给同一人，然后创建知识库文档。建立私有协作群，邀请测试同事并 @ 提醒他。'}]},AbortSignal.timeout(20000))
     const retried=await ctx.sessionController.wait({sessionId:result.session.sessionId,timeoutMs:20000},AbortSignal.timeout(25000))
     assert.ok(JSON.stringify(retried.output).includes('NATIVE_DSH_MODEL_OK'))
     await business.verify()
     result.business=true
   }
   if(method==="browser" && process.env.LOOP_TS_E2E_CHANNEL==="1"){
     const control=new AbortController();ctx.effect(()=>()=>control.abort())
     channelJourney=await prepareChannelJourney(api,workspace,ctx.loopHostService,result.session.sessionId,control.signal)
     for(const [i,scenario] of channelJourney.scenarios.entries()){
       await trace("channel scenario "+i)
       await ctx.sessionController.prompt({sessionId:result.session.sessionId,requestId:randomUUID(),content:[{type:'text',text:scenario.prompt}]},AbortSignal.timeout(20000))
       const done=await ctx.sessionController.wait({sessionId:result.session.sessionId,timeoutMs:20000},AbortSignal.timeout(25000))
       assert.equal(upstreamError,'')
       assert.ok(JSON.stringify(done.output).includes("NATIVE_DSH_MODEL_OK"))
       await channelJourney.verifyTurn()
     }
     control.abort()
     result.channelScenarios=channelJourney.scenarios.length
     channelJourney=undefined
   }
   await trace('sync-receipt')
   let uploaded
   const syncTarget=await hostRuntime.sessionSyncTarget(result.session.sessionId)
   assert.ok(syncTarget,'telemetry admission requires a bound session')
   for(let i=0;i<300;i++){uploaded=await hostRuntime.syncStatus(syncRequest);if(uploaded.lastReceipt&&uploaded.pending===0)break;await delay(50)}
   assert.ok(uploaded.lastReceipt,'real DSH telemetry must receive a server upload receipt: '+JSON.stringify(uploaded))
   const output=await actions.agentAction({workspaceId:'runtime-workspace',sessionId:result.session.sessionId,name:'workspace.list',arguments:{kind:'summary'}});assert.ok(output.data)
   if(publicOrigin){
    await trace('remote-oauth')
    await actions.disconnectModelConnection({connectionId:catalog.connections[0].connectionId})
    assert.equal((await actions.worksiteStatus({})).state,'connected','independent Worksite stays connected without the Agent grant')
    const remoteLogin=await connect();assert.equal(remoteLogin.state,'needs_auth')
    const rq=new URL(remoteLogin.challenge.loginUrl).searchParams
    assert.ok(rq.get('redirect_uri').startsWith(publicOrigin+'/__loop/worksite/callback/'))
    const remoteAuthorization={responseType:rq.get('response_type'),clientId:rq.get('client_id'),redirectUri:rq.get('redirect_uri'),workspaceId:workspace,resource:rq.get('resource'),state:rq.get('state'),scope:rq.get('scope'),codeChallenge:rq.get('code_challenge'),codeChallengeMethod:rq.get('code_challenge_method'),deviceLabel:rq.get('device_label'),pageOrigin:rq.get('page_origin')}
    const remoteApproved=await api('POST','/api/v1/auth/external-host/connection',{installationId:rq.get('host_installation_id'),includeSync:true,pageResumeChallenge:rq.get('page_resume_challenge'),authorization:remoteAuthorization})
    const callback=await fetch(remoteApproved.redirectTo,{redirect:'error',signal:AbortSignal.timeout(10000)});assert.equal(callback.status,200);await callback.text()
    let reconnected=false
    for(let i=0;i<100;i++){if((await connect()).state==='connected'){reconnected=true;break}await delay(20)}
    assert.ok(reconnected);result.worksite.remoteOAuth=true
   }
   if(method==="access-token"){
    let challenge
    try{await actions.disconnectAccount({})}catch(error){
      assert.equal(error.code,"loop-host/disconnect-auth-required")
      challenge=error.challenge
    }
    assert.ok(challenge)
    const fields=new URLSearchParams(new URL(challenge.loginUrl).hash.slice(1))
    const headers={'Content-Type':'application/json','X-Loop-Browser-Session':'cookie',Origin:base}
    const login=await fetch(base+'/api/v1/auth/login',{method:'POST',headers,body:JSON.stringify({email:registered.user.email,password})})
    assert.ok(login.ok);await login.body?.cancel()
    const cookie=login.headers.getSetCookie().map(line=>line.split(';')[0]).join('; ')
    const confirm=await fetch(base+'/api/v1/auth/external-host/disconnect-operations/confirm',{method:'POST',headers:{...headers,Cookie:cookie},body:JSON.stringify({challenge:fields.get('challenge'),state:fields.get('state')})})
    assert.equal(confirm.status,200);await confirm.body?.cancel()
   }
   await actions.disconnectAccount({});assert.equal((await actions.accountStatus()).state,'signed_out')
   if(publicOrigin){
    assert.equal((await actions.worksiteStatus({})).running,false)
    const list=await api('GET','/api/v1/worksite/installations')
    assert.ok(!list.installations.some(row=>row.installationId===q.get('host_installation_id')&&row.remoteAccessEnabled))
   }
   result.realLoop={method,account:true,modelCatalog:true,sessionAction:true,modelStream:true,telemetrySync:true,disconnect:true}
  }
  result.passed=true
 }catch(error){result.passed=false;result.error=String(error);result.stack=error.stack}
 await writeFile(${JSON.stringify(output)},JSON.stringify(result),{mode:0o600})
}
`)
  await writeFile(join(profile,'cordis.patch.yml'),`- insert:\n    - id: native-runtime-test\n      name: ${JSON.stringify(probe)}\n`)
  let log=''
  child=spawn(process.execPath,[runtime,'web','--no-open','--port','0'],{cwd:workspace,env:environment,stdio:['ignore','pipe','pipe']})
  exit=new Promise(resolve=>child.once('exit',resolve))
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{log=(log+chunk).slice(-100000)})
  let result
  const deadline = Date.now() + probeTimeout(method)
  while(Date.now() < deadline){
    try{result=JSON.parse(await readFile(output,'utf8'));break}catch(error){if(error.code!=='ENOENT')throw error}
    if(child.exitCode!==null)break
    await delay(100)
  }
  assert.ok(result,'official runtime did not finish the probe ('+await readFile(output+'.progress','utf8').catch(()=> 'not started')+'): '+log.replace(/token=[^\s]+/gu,'token=[redacted]'))
  assert.equal(result.passed,true,(result.stack??result.error??'')+'\n'+log.replace(/token=[^\s]+/gu,'token=[redacted]'))
  assert.doesNotMatch(log,/failed to import|ENOENT.*loop-proxy/u)
  assert.doesNotMatch(log,/opening the default browser/u)
  assert.ok(result.session.sessionId)
  if(method==='browser' && process.env.LOOP_TS_E2E_BUSINESS==='1')assert.equal(result.business,true)
  if(publicOrigin)assert.deepEqual(result.worksite,{relay:true,launch:true,remoteHost:true,remoteOAuth:true})
  if(base)assert.deepEqual(result.realLoop,{method,account:true,modelCatalog:true,sessionAction:true,modelStream:true,telemetrySync:true,disconnect:true})
  if(method==="browser" && process.env.LOOP_TS_E2E_CHANNEL==="1") {assert.equal(result.channelScenarios,15);t.diagnostic("15 channel history, consent, membership and named-board task scenarios verified")}
  const worksite=publicOrigin
    ? `enabled(relay=${result.worksite?.relay===true},launch=${result.worksite?.launch===true},remoteHost=${result.worksite?.remoteHost===true},remoteOAuth=${result.worksite?.remoteOAuth===true})`
    : 'not-requested'
  const completion=base?'real-loop-complete':'local-runtime-complete'
  t.diagnostic(`official DSH summary: completion=${completion}; worksite=${worksite}`)
})

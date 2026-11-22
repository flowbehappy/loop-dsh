import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {randomUUID,createHash} from 'node:crypto'
import {Context} from '@deepseek-ai/cordis'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import {createLoopHostActions} from '../host-actions-core.mjs'
import {setTimeout as delay} from 'node:timers/promises'
import {HostCredentialStore} from '../backend/credentials.ts'
import {TokenManager,LoopHTTP} from '../backend/http.ts'
import {ActionClient} from '../backend/actions.ts'
import {HostIdentity} from '../backend/host-identity.ts'
import {HostAPI} from '../backend/host-api.ts'
import {AccountService} from '../backend/account.ts'
import {ModelService} from '../backend/models.ts'
import {DisconnectService} from '../backend/disconnect.ts'
import {PageService} from '../backend/pages.ts'
import {SyncOutbox} from '../backend/sync.ts'

const base=process.env.LOOP_TS_E2E_BASE_URL
// This endpoint must be an explicitly supplied isolated Test Hub. The suite
// does not start databases, infer daily configuration, or use saved accounts.
for(const failure of ['none','create-response','execute-response','model-response','access-token'])test('real Loop headless journey including disconnect: '+failure, {skip:!base,timeout:120_000},async t=>{
  const {NativeHostActions}=await import(process.env.LOOP_TS_E2E_BUNDLE==='1'?'../backend/dist/adapter.mjs':'../backend/adapter.ts')
  assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'isolated loopback server required')
  const root=await mkdtemp(tmpdir()+'/loop-ts-real-e2e-')
  const ctx=new Context()
  t.after(async()=>{await ctx.fiber.dispose();await rm(root,{recursive:true,force:true})})
  await ctx.plugin(LocalCredentialProvider,{dshHome:root,watch:false})
  let humanToken=''
  async function api(method,path,body){
    const response=await fetch(base+path,{method,headers:{Accept:'application/json','Content-Type':'application/json',...(humanToken?{Authorization:'Bearer '+humanToken}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error'})
    const text=await response.text()
    assert.ok(response.ok,`${method} ${path.split('?')[0]} returned ${response.status}`)
    return text?JSON.parse(text):undefined
  }
  const password='Isolated-Test-Only-7!'+randomUUID()
  const registered=await api('POST','/api/v1/auth/register',{name:'ts_'+randomUUID().replaceAll('-','').slice(0,16),email:`ts-${randomUUID()}@example.com`,password})
  humanToken=registered.accessToken
  assert.ok(humanToken)
  if(!registered.user.emailVerified) {
    const mailbox=await api('GET','/internal/e2e/mailbox/latest?kind=verify&email='+encodeURIComponent(registered.user.email))
    await api('POST','/api/v1/auth/verify-email',{token:mailbox.token})
  }
  const workspaces=await api('GET','/api/v1/workspaces')
  assert.ok(workspaces.length)
  const workspace=workspaces[0].id
  const installation='native-e2e-'+randomUUID()
  const pageOrigin=failure==='access-token' ? 'dsh-app://app' : 'http://127.0.0.1:4333'
  let loseDispatch=false,dispatchRequests=0,loseModel=false,modelDisconnects=0,executes=0
  const nativeFetch=async(url,init)=>{
    const started=Date.now()
    if(String(url).endsWith("/execute"))executes++
    let response
    try{response=await fetch(url,init)}catch(error){t.diagnostic('Native request failed: '+init.method+' '+new URL(url).pathname.split('/').slice(-2).join('/')+' after '+(Date.now()-started)+'ms');throw error}
    if(Date.now()-started>2000)t.diagnostic('Slow native request: '+init.method+' '+new URL(url).pathname.split('/').slice(-2).join('/')+' '+(Date.now()-started)+'ms')
    if(String(url).endsWith('/connection')&&init.method==='DELETE'){
      modelDisconnects++
      if(loseModel){loseModel=false;assert.ok(response.ok);await response.body?.cancel();throw new Error('simulated lost model disconnect response')}
    }
    if(String(url).endsWith('/collaboration/actions/dispatch')){
      dispatchRequests++
      if(loseDispatch){loseDispatch=false;assert.ok(response.ok);await response.body?.cancel();throw new Error('simulated lost task response')}
    }
    return response
  }
  const facade=createLoopHostActions({stateHome:root+'/actions',serviceBaseUrl:base,loopWorkspaceId:workspace,installationId:installation,pageOrigin,syncProfile:'e2e'},
    {createHelper:config=>new NativeHostActions(config,{provider:ctx.get('credentials'),syncHome:root+'/sync',fetch:nativeFetch})})
  t.after(()=>facade.dispose())
  if(failure==='access-token'){
    const settingsPath='/api/v1/me/personal-assistants/'+workspace
    const {assistant}=await api('PUT',settingsPath)
    const issue=(agentId,purpose,permissions={})=>api('POST','/api/v1/me/api-tokens',{workspaceId:workspace,agentId,name:'DSH test',purpose,expiresInDays:1,permissions})
    const app=await api('POST','/api/v1/me/external-agents',{workspaceId:workspace,name:'CI'})
    const ordinary=await issue(app.agentId,'actions',{workspace:['read']})
    await assert.rejects(issue(app.agentId,'dsh.login'))
    await assert.rejects(facade.connectAccount({accessToken:ordinary.token}))
    const attempt=await fetch(base+'/api/v1/auth/external-host/token-login',{method:'POST',headers:{Authorization:'Bearer '+ordinary.token,'Content-Type':'application/json'},body:'{}'})
    assert.equal(attempt.status,401)
    const parent=await issue(assistant.agentId,'dsh.login')
    const connected=await facade.connectAccount({accessToken:parent.token})
    assert.equal(connected.state,'connected')
    const store=new HostCredentialStore(ctx.get('credentials'),base,workspace,installation)
    const credential=await store.read()
    assert.equal(credential.grant_id,connected.grantId)
    assert.equal(credential.principal_id,registered.user.id)
    assert.ok(!credential.host_page_proof)
    assert.ok(!JSON.stringify(credential).includes(parent.token))
    const actionsURL=credential.resource+'/actions?limit=1'
    async function status(url,bearer,body){
      const response=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
      await response.body?.cancel()
      return response.status
    }
    const devices=await api('GET','/api/v1/me/super-agent-grants')
    const device=devices.grants.find(g=>g.grantId===credential.grant_id)
    assert.equal(device.agent.agentId,assistant.agentId)
    assert.ok(Date.parse(device.expiresAt)<=Date.parse(parent.grant.expiresAt))
    assert.equal(await status(actionsURL,parent.token),401)
    assert.equal(await status(actionsURL,credential.access_token),200)
    const pageAttempt=await status(base+'/api/v1/auth/external-host/session',credential.access_token,{workspaceId:workspace,installationId:installation,pageOrigin,resumeProof:'a'.repeat(43)})
    assert.equal(pageAttempt,401)
    assert.equal((await facade.accountStatus({})).deviceOnly,true)
    for (const connection of ['business','apps']) {
      const allowedActions=connection==='apps'?['app.catalog','app.invoke']:['workspace.list']
      const resourceConstraints=connection==='apps'?['app:sample','app-action:sample/get-item']:[]
      const pending=await facade.beginHumanLogin({connection,allowedActions,resourceConstraints,manage:false})
      const login=new URL(pending.challenge.loginUrl)
      assert.equal(login.pathname,'/api/v1/auth/oauth/human/authorize')
      const query=login.searchParams
      const consent=await api('POST',login.pathname,{
        responseType:query.get('response_type'),clientId:query.get('client_id'),redirectUri:query.get('redirect_uri'),
        workspaceId:workspace,resource:query.get('resource'),state:query.get('state'),scope:query.get('scope'),
        codeChallenge:query.get('code_challenge'),codeChallengeMethod:query.get('code_challenge_method'),
        deviceLabel:query.get('device_label'),allowedActions,resourceConstraints,
      })
      const redirect=new URL(consent.redirectTo)
      assert.equal(redirect.origin+redirect.pathname,query.get('redirect_uri'))
      assert.equal((await fetch(redirect,{redirect:'error'})).status,200)
      for (let i=0;i<100;i++) {
        if ((await facade.completeHumanLogin({connection,challengeId:pending.challenge.id})).state==='connected') break
        await delay(25)
      }
      assert.equal((await facade.humanStatus({connection})).state,'connected')
      const refs={connection,workspaceId:'token-managed',sessionId:'token-session'}
      const catalog=await facade.humanCatalog(refs)
      assert.ok(catalog.actions.every(action=>allowedActions.includes(action)))
      if(connection==='business') assert.ok(catalog.actions.includes('workspace.list'))
      assert.equal((await facade.accountStatus({})).deviceOnly,true)
    }
    const pending=await facade.beginBind({workspace:{workspaceId:'token-managed'}})
    assert.equal(pending.state,'needs_auth')
    assert.equal((await facade.connectAccount({requestPageAccess:true})).challenge.id,pending.challenge.id)
    const reopened=new NativeHostActions({stateHome:root+'/actions',serviceBaseUrl:base,loopWorkspaceId:workspace,installationId:installation,pageOrigin,syncProfile:'e2e'},
      {provider:ctx.get('credentials'),syncHome:root+'/sync'})
    t.after(()=>reopened.dispose())
    const second=await reopened.request('connectAccount',{requestPageAccess:true})
    assert.equal(second.state,'needs_auth')
    assert.notEqual(second.challenge.loginUrl,pending.challenge.loginUrl)
    const link=new URL(pending.challenge.loginUrl)
    assert.equal(link.origin,base)
    assert.equal(link.pathname,'/external-host/page-reauthorize')
    const params=Object.fromEntries(new URLSearchParams(link.hash.slice(1)))
    const review=(operation,cookie)=>fetch(base+'/api/v1/auth/external-host/credential-recoveries/'+operation,{
      method:'POST',headers:{'Content-Type':'application/json','X-Loop-Browser-Session':'cookie',Origin:base,Cookie:cookie},
      body:JSON.stringify(params)})
    const login=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-Loop-Browser-Session':'cookie',Origin:base},
      body:JSON.stringify({email:registered.user.email,password})})
    assert.equal(login.status,200)
    const cookie=login.headers.getSetCookie().map(c=>c.split(';',1)[0]).join('; ')
    assert.ok(cookie)
    assert.equal((await review('confirm','')).status,401)
    const other={email:'other-'+randomUUID()+'@example.com',password,name:'other_'+randomUUID().slice(0,8)}
    const outsider=await api('POST','/api/v1/auth/register',other)
    if(!outsider.user.emailVerified){
      const verification=await api('GET','/internal/e2e/mailbox/latest?kind=verify&email='+encodeURIComponent(other.email))
      await api('POST','/api/v1/auth/verify-email',{token:verification.token})
    }
    const otherLogin=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-Loop-Browser-Session':'cookie',Origin:base},
      body:JSON.stringify({email:other.email,password})})
    assert.equal(otherLogin.status,200)
    const otherCookie=otherLogin.headers.getSetCookie().map(c=>c.split(';',1)[0]).join('; ')
    assert.equal((await review('confirm',otherCookie)).status,403)
    const inspection=await review('inspect',cookie)
    assert.equal(inspection.status,200)
    assert.equal((await inspection.json()).devicePageConsent,true)
    await assert.rejects(facade.openGlobalPage())
    const approved=await review('confirm',cookie)
    assert.equal(approved.status,200)
    assert.equal((await approved.json()).pageAuthorized,true)
    assert.ok(!(await review('confirm',cookie)).ok)
    assert.equal((await facade.connectAccount({requestPageAccess:true})).grantId,credential.grant_id)
    assert.ok(!(await facade.accountStatus({})).deviceOnly)
    assert.ok(!(await reopened.request('accountStatus')).deviceOnly)
    const page=await facade.openGlobalPage()
    assert.equal(new URL(page.url).pathname,'/external-host/page-session')
    const pages=new PageService(new HostAPI(new TokenManager(store,await store.read())),installation,pageOrigin)
    assert.equal((await pages.request('GET','/api/v1/me')).id,registered.user.id)
    const localWorkspace={workspaceId:'token-managed'}
    const selection=await facade.beginBind({workspace:localWorkspace})
    assert.equal(selection.state,'select_target')
    const project=await facade.createProject({workspace:localWorkspace,challengeId:selection.challenge.id,name:'Token project',prefix:'tok'})
    await assert.rejects(facade.completeBind({workspace:localWorkspace,challengeId:selection.challenge.id,projectId:project.projectId,agentId:assistant.agentId}),{code:'loop-host/waiting-for-access'})
    const created=await facade.agentAction({workspaceId:'token-managed',sessionId:'token-session',name:'project.create',arguments:{name:'Assistant project',prefix:'tap'}})
    const projectId=created.data.data.project.id
    const bound=await facade.completeBind({workspace:localWorkspace,challengeId:selection.challenge.id,projectId,agentId:assistant.agentId})
    assert.equal(bound.binding.projectId,projectId)
    const models=base+'/api/v1/external-model/workspaces/'+workspace+'/models'
    const sync=base+'/api/v1/host-sync/grant'
    assert.equal(await status(models,credential.access_token),200)
    assert.equal(await status(sync,credential.access_token),200)
    const {revision}=await api('PUT',settingsPath+'/permissions',{revision:assistant.revision,permissions:{workspace:['read']}})
    for (const url of [models,sync])assert.ok([401,403].includes(await status(url,credential.access_token)))
    await api('PUT',settingsPath+'/permissions',{revision,permissions:assistant.permissions})
    assert.equal(await status(models,credential.access_token),200)
    assert.equal(await status(sync,credential.access_token),200)
    await api('DELETE','/api/v1/me/api-tokens/'+parent.grant.grantId)
    assert.equal(await status(actionsURL,credential.access_token),401)
    assert.equal((await facade.accountStatus({})).state,'needs_auth')
    await assert.rejects(facade.openGlobalPage())
    for (const connection of ['business','apps']) {
      assert.equal((await facade.humanStatus({connection})).state,'signed_out')
      await assert.rejects(facade.humanCatalog({connection,workspaceId:'token-managed',sessionId:'token-session'}),{code:'loop-host/needs-auth'})
    }
    await assert.rejects(pages.request('GET','/api/v1/me'))
    await assert.rejects(facade.connectAccount({accessToken:parent.token}))
    return
  }
  const login=await facade.connectAccount({})
  assert.equal(login.state,'needs_auth')
  const q=new URL(login.challenge.loginUrl).searchParams
  const authorization={responseType:q.get('response_type'),clientId:q.get('client_id'),redirectUri:q.get('redirect_uri'),workspaceId:workspace,
    resource:q.get('resource'),state:q.get('state'),scope:q.get('scope'),codeChallenge:q.get('code_challenge'),codeChallengeMethod:q.get('code_challenge_method'),deviceLabel:q.get('device_label'),pageOrigin}
  const approved=await api('POST','/api/v1/auth/external-host/connection',{installationId:installation,includeSync:true,pageResumeChallenge:q.get('page_resume_challenge'),authorization})
  const callback=await fetch(approved.redirectTo,{redirect:'error'});assert.equal(callback.status,200);await callback.text()
  let connected
  for(let i=0;i<100;i++){
    connected=await facade.connectAccount({})
    if(connected.state==='connected')break
    await delay(10)
  }
  assert.equal(connected.state,'connected')
  const credential=await new HostCredentialStore(ctx.get('credentials'),base,workspace,installation).read()
  assert.equal(credential.workspace_id,workspace)
  assert.equal(credential.principal_id,registered.user.id)
  const store=new HostCredentialStore(ctx.get('credentials'),base,workspace,installation)
  const tokens=new TokenManager(store,credential),host=new HostAPI(tokens)
  const hostIdentity=new HostIdentity(ctx.get('credentials'),host,installation,base)
  // Natural target preparation and subscription tools both read status before
  // the first explicit bind. A fresh login must not need a pre-warmed device.
  assert.ok(!credential.device_credential)
  assert.equal((await facade.collaborationStatus({sessionId:'session-native'})).state,'unbound')
  assert.ok(!(await store.read()).device_credential)
  const hostProof=await hostIdentity.register()
  assert.equal(await hostIdentity.register(),hostProof)
  const device=await hostIdentity.device(store)
  assert.equal((await hostIdentity.device(store)).bindingId,device.bindingId)
  const account=new AccountService(host,installation,pageOrigin)
  assert.equal((await account.status()).state,'signed_in')
  assert.ok((await account.session(true)).pageLaunch)
  const pages=new PageService(host,installation,pageOrigin)
  const page=await facade.openGlobalPage()
  assert.ok(page.url.includes('/external-host/page-session#'))
  assert.ok(!page.url.includes(credential.access_token))
  assert.equal((await pages.request('GET','/api/v1/me')).id,registered.user.id)
  const actions=new ActionClient(new LoopHTTP(tokens,credential.resource))
  const catalog=await facade.agentCatalog({workspaceId:'local-workspace'});assert.ok(catalog.actions.includes('workspace.list'))
  const schema=await facade.agentSchema({workspaceId:'local-workspace',name:'workspace.list'});assert.equal(schema.id,'workspace.list')
  const listed=await facade.agentAction({workspaceId:'local-workspace',sessionId:'session-native',name:'workspace.list',arguments:{kind:'summary'}});assert.ok(listed.data)
  const knowledge=await facade.knowledgeCatalog({workspaceId:'local-workspace',sessionId:'session-native'})
  assert.equal(knowledge.scope.catalog,'knowledge');assert.equal(knowledge.scope.accountId,registered.user.id)
  const skills=await facade.skillCatalog({workspaceId:'local-workspace',sessionId:'session-native',limit:10})
  assert.equal(skills.scope.catalog,'skills');assert.ok(skills.data)
  const catalogEvents=[]
  facade.addSkillCatalogEventListener(event=>catalogEvents.push(event))
  assert.equal((await facade.skillCatalogWatch({workspaceId:'local-workspace'})).watching,true)
  for(let i=0;i<100 && !catalogEvents.some(item=>item.event.status?.state==='live');i++)await delay(20)
  assert.ok(catalogEvents.some(item=>item.event.status?.state==='live'),'real catalog WebSocket reaches live state')
  assert.equal((await facade.skillCatalogWatch({workspaceId:'local-workspace',stop:true})).watching,false)
  const models=new ModelService(host,installation);t.after(()=>models.dispose())
  const modelCatalog=await facade.modelRuntimeCatalog();assert.equal(modelCatalog.connections[0].connectionId,credential.grant_id)
  assert.equal((await facade.modelStatus()).state,'active')
  assert.equal((await facade.refreshModelConnections()).state,'active')
  const principal=await host.request('sync','GET','/grant')
  assert.equal(principal.userId,registered.user.id);assert.equal(principal.workspaceId,workspace)
  const bindingSelection=await facade.beginBind({workspace:{workspaceId:'project-workspace'},mode:'bind'})
  assert.equal(bindingSelection.state,'select_target')
  const createdProject=await facade.createProject({workspace:{workspaceId:'project-workspace'},challengeId:bindingSelection.challenge.id,name:'TS Project',prefix:'tse'})
  const projectCreated={project:{id:createdProject.projectId}}
  await assert.rejects(facade.completeBind({workspace:{workspaceId:'other-workspace'},challengeId:bindingSelection.challenge.id,projectId:createdProject.projectId,agentId:principal.agentId}),{code:'loop-host/conflict'})
  await assert.rejects(facade.completeBind({workspace:{workspaceId:'project-workspace'},challengeId:bindingSelection.challenge.id,projectId:createdProject.projectId,agentId:principal.agentId}),{code:'loop-host/waiting-for-access'})
  const projectCatalog=await facade.projectSyncCatalog({})
  assert.ok(projectCatalog.projects.some(item=>item.projectId===projectCreated.project.id))
  await assert.rejects(facade.prepareProjectSync({workspace:{workspaceId:'project-workspace'},projectId:projectCreated.project.id,agentId:principal.agentId}),{code:'loop-host/waiting-for-access'})
  const uploadCatalog=await facade.projectSyncCatalog({localWorkspaces:true})
  assert.equal(uploadCatalog.agent.agentId,principal.agentId)
  const {binding}=await facade.prepareProjectSync({workspace:{workspaceId:'local-workspace',displayTitle:'TS E2E Workspace'},agentId:principal.agentId,localWorkspace:true})
  const boards=await facade.collaborationBoards({sessionId:'session-native'})
  assert.ok(Array.isArray(boards.boards))
  const collaboration=await facade.collaborationBind({sessionId:'session-native',workspaceId:workspace,boardId:binding.defaultChannelId,coordinatorAgentId:principal.agentId})
  assert.equal((await facade.status({workspace:{workspaceId:'local-workspace'}})).state,'active')
  assert.ok((await facade.openLoopPage({workspace:{workspaceId:'local-workspace'}})).url.includes('/external-host/page-session#'))
  assert.equal(collaboration.scope.boardId,binding.defaultChannelId)
  assert.equal((await facade.collaborationStatus({sessionId:'session-native'})).state,'ready')
  const collaborationEvents=[]
  facade.addCollaborationEventListener(message=>collaborationEvents.push(message))
  assert.equal((await facade.collaborationWatch({sessionId:'session-native'})).watching,true)
  for(let i=0;i<300&&!collaborationEvents.some(message=>message.event.status?.state==='live');i++)await delay(10)
  assert.ok(collaborationEvents.some(message=>message.event.status?.state==='live'),'real collaboration stream becomes live')
  const directory=await facade.collaborationDirectory({sessionId:'session-native',limit:20})
  assert.ok(Array.isArray(directory.entries))
  const selected=directory.entries.find(entry=>entry.notifiable)
  assert.ok(selected,'isolated owner is available as an explicit notification target')
  const payloadText='请通知选中的测试成员',payloadDigest='sha256:'+createHash('sha256').update(payloadText).digest('hex')
  const prepared=await facade.collaborationPrepareIntent({sessionId:'session-native',bindingRevision:collaboration.scope.bindingRevision,targets:[{targetId:selected.targetId,targetType:selected.targetType,intendedActions:['dispatch','notify']}],payloadText,payloadDigest,shareScope:{scope:'task-only',resourceRefs:[]}})
  assert.equal(prepared.state,'prepared')
  await facade.collaborationBindIntent({sessionId:'session-native',intentRef:prepared.intentRef,requestId:'request-native',payloadDigest,acceptedSerializedText:payloadText,bindingRevision:collaboration.scope.bindingRevision})
  const activation={sessionId:'session-native',intentRef:prepared.intentRef,acceptedEventId:'event-native',acceptedMessageId:'message-native',acceptedSequence:1,acceptedTextDigest:payloadDigest}
  const activated=await facade.collaborationActivateIntent(activation)
  assert.equal(activated.state,'activated')
  assert.equal((await facade.collaborationActivateIntent(activation)).userIntentId,activated.userIntentId)
  await assert.rejects(facade.collaborationActivateIntent({...activation,acceptedMessageId:'another-message'}),{code:'loop-host/conflict'})
  const dispatchInput={sessionId:'session-native',intentRef:prepared.intentRef,action:'dispatch',clientRequestId:'native-dispatch',arguments:{target:{targetId:selected.targetId,kind:selected.targetType},task:{title:'TS isolated task',goal:'Exercise native collaboration without a model'}}}
  loseDispatch=true
  await assert.rejects(facade.collaborationAction(dispatchInput),{code:'loop-host/backend-unavailable'})
  const reconciled=await facade.collaborationReconcile({sessionId:'session-native',clientRequestIds:['native-dispatch']})
  assert.equal(reconciled.receipts.length,1)
  const dispatch=await facade.collaborationAction(dispatchInput)
  assert.equal(dispatch.replayed,true)
  assert.equal(dispatchRequests,2,'lost response retries the same server idempotency identity once')
  assert.ok(dispatch.receipt.taskId)
  const notificationInput={sessionId:'session-native',intentRef:prepared.intentRef,action:'notify',actionKey:'notify-isolated-owner',arguments:{recipient:{targetId:selected.targetId,kind:selected.targetType},triggerKind:'immediate',taskId:dispatch.receipt.taskId,message:'TS headless isolated notification'}}
  const notification=await facade.collaborationAction(notificationInput)
  assert.ok(notification.notificationId)
  const notificationReplay=await facade.collaborationAction(notificationInput)
  assert.equal(notificationReplay.notificationId,notification.notificationId)
  assert.equal(notificationReplay.replayed,true)
  const inspected=await facade.collaborationAction({sessionId:'session-native',action:'inspect',arguments:{taskId:dispatch.receipt.taskId,userIntentId:activated.userIntentId}})
  assert.equal(inspected.task.taskId,dispatch.receipt.taskId)
  assert.equal(typeof inspected.task.revision,'number')
  const activeStatus=await facade.collaborationStatus({sessionId:'session-native'})
  assert.ok(activeStatus.active.some(item=>item.taskId===dispatch.receipt.taskId && item.taskTitle==='TS isolated task'))
  const continuationText='继续 '+dispatch.receipt.taskId
  const continuation=await facade.collaborationContinuation({sessionId:'session-native',requestId:'followup-request',continuationRef:'native-continuation',acceptedMessageId:'followup-message',acceptedSequence:2,bindingRevision:collaboration.scope.bindingRevision,acceptedSerializedText:continuationText,payloadDigest:'sha256:'+createHash('sha256').update(continuationText).digest('hex')})
  assert.equal(continuation.state,'ready')
  const followed=await facade.collaborationAction({sessionId:'session-native',continuationRef:'native-continuation',action:'followup',actionKey:'continue-isolated-task',arguments:{taskId:dispatch.receipt.taskId,body:'TS native continuation followup',inputRefs:[]}})
  assert.equal(followed.receipt.taskId,dispatch.receipt.taskId)
  const management=await facade.collaborationAuthorize({sessionId:'session-native',bindingId:collaboration.scope.bindingId,bindingEpoch:collaboration.scope.bindingEpoch,taskId:dispatch.receipt.taskId,action:'followup'})
  assert.equal(management.authorized,true)
  assert.equal(management.managementEligible,true)
  assert.equal(management.management.taskId,dispatch.receipt.taskId)
  const subscribed=await facade.collaborationAction({sessionId:'session-native',action:'set-subscription',arguments:{target:'#'+dispatch.receipt.taskId,mode:'pull'},managementSource:{sessionId:'session-native',messageId:'subscribe-local-message',sequence:3,textDigest:'sha256:'+createHash('sha256').update('订阅测试任务').digest('hex')}})
  assert.ok(subscribed.subscriptionId)
  const subscriptions=await facade.collaborationAction({sessionId:'session-native',action:'list-subscriptions',arguments:{limit:20}})
  assert.ok(subscriptions.subscriptions.some(item=>item.subscriptionId===subscribed.subscriptionId))
  assert.ok(subscribed.scopeId)
  await api('POST',`/api/v1/workspaces/${workspace}/scopes/${encodeURIComponent(subscribed.scopeId)}/messages`,{content:'TS native isolated Human task reply',clientMessageId:'native-human-reply'})
  const updates=await facade.collaborationAction({sessionId:'session-native',action:'read-updates',arguments:{subscriptionId:subscribed.subscriptionId,limit:8}})
  assert.equal(updates.subscriptionId,subscribed.subscriptionId)
  assert.ok(Array.isArray(updates.eventIds))
  assert.ok(updates.eventIds.length>0,'native inbox receives the real Human task message')
  const inbound=collaborationEvents.find(message=>message.event.delivery&&updates.eventIds.includes(message.event.eventId))
  assert.ok(inbound)
  const admission=await facade.collaborationAuthorize({sessionId:'session-native',bindingId:collaboration.scope.bindingId,bindingEpoch:collaboration.scope.bindingEpoch,eventId:inbound.event.eventId})
  assert.equal(admission.authorized,true)
  const acceptedDelivery=await facade.collaborationAccept({sessionId:'session-native',bindingId:collaboration.scope.bindingId,bindingEpoch:collaboration.scope.bindingEpoch,eventId:inbound.event.eventId,contentHash:inbound.event.delivery.payloadHash,status:'accepted',sessionMessageId:'host-durable-task-reply',sessionSequence:4})
  assert.equal(acceptedDelivery.delivery.state,'committed')
  const paused=await facade.collaborationAction({sessionId:'session-native',action:'set-subscription',arguments:{target:'#'+dispatch.receipt.taskId,mode:'paused'}})
  assert.equal(paused.mode,'paused')
  assert.equal((await facade.collaborationWatch({sessionId:'session-native',stop:true})).watching,false)
  await assert.rejects(facade.collaborationAction({...notificationInput,arguments:{...notificationInput.arguments,message:'changed payload'}}),{code:'loop-host/conflict'})
  const syncInput={workspaceId:'local-workspace',sessionId:'session-native',context:{defaultChannelId:binding.defaultChannelId,projectId:'',agentId:principal.agentId}}
  assert.equal((await facade.setSync({...syncInput,enabled:true,confirmedSourceSequence:3})).state,'on')
  const outbox=new SyncOutbox(root+'/sync',facade.currentSyncProfile(),'session-native',credential,host)
  const session=await outbox.snapshot()
  assert.ok(session.syncSessionId)
  const writer=facade.createSyncWriter({profile:facade.currentSyncProfile(),queueLimit:100,shutdownTimeoutMs:1000,clientSessionLabel:'TS headless Harness'})
  writer.start()
  writer.enqueue('session-native',{sourceEventId:'dsh:session-native:v1:7',sourceThreadId:'session-native',sourceItemId:'item-7',kind:'human_message',state:'completed',provenance:'host_observed',content:'TS native headless E2E visible message'},facade.currentSyncProfile(),{accountPrincipal:credential.principal_id,loopWorkspaceId:workspace,agentId:principal.agentId,projectId:'',defaultChannelId:binding.defaultChannelId})
  for(let i=0;i<300&&!(await outbox.snapshot()).lastReceipt;i++)await delay(10)
  assert.ok((await outbox.snapshot()).lastReceipt,'native telemetry writer uploads without a Go helper')
  await writer.shutdown()
  assert.equal((await facade.retrySync(syncInput)).state,'on')
  const state=await outbox.snapshot();assert.equal(state.pending.length,0);assert.ok(state.lastReceipt.eventId)
  const events=await host.request('sync','GET',`/sessions/${encodeURIComponent(session.syncSessionId)}/events`)
  assert.ok(JSON.stringify(events).includes('TS native headless E2E visible message'))
  await assert.rejects(facade.setSync({...syncInput,context:{...syncInput.context,defaultChannelId:'other'},enabled:true}),{code:'loop-host/conflict'})
  assert.equal((await facade.setSync({...syncInput,enabled:false})).state,'off')
  assert.equal(await outbox.recordObserved({sourceEventId:'dsh:session-native:v1:8',sourceThreadId:'session-native',sourceItemId:'item-8',kind:'human_message',state:'completed',provenance:'host_observed',content:'not shared'}),false)
  assert.equal((await facade.setSync({...syncInput,enabled:true,confirmedSourceSequence:8})).state,'on')
  // Workspace-only unbind must stop its durable uploads while retaining the
  // account and the other Workspace's independent binding.
  await facade.prepareProjectSync({workspace:{workspaceId:'retained-workspace'},agentId:principal.agentId,localWorkspace:true})
  await facade.unbind({workspace:{workspaceId:'local-workspace'},sessionIds:['session-native'],hasRemainingBindings:true})
  assert.equal((await facade.status({workspace:{workspaceId:'local-workspace'}})).state,'needs_auth')
  assert.equal((await facade.status({workspace:{workspaceId:'retained-workspace'}})).state,'active')
  assert.equal((await facade.accountStatus()).state,'signed_in')
  assert.equal((await outbox.snapshot()).syncState,'stopped')
  await facade.unbind({workspace:{workspaceId:'local-workspace'},sessionIds:['session-native'],hasRemainingBindings:true})
  if(failure==='model-response'){
    loseModel=true
    await assert.rejects(facade.disconnectModelConnection({connectionId:credential.grant_id}),{code:'loop-host/backend-unavailable'})
    assert.ok(await store.read(),'unknown server outcome retains the exact credential for reconciliation')
    const disconnected=await facade.disconnectModelConnection({connectionId:credential.grant_id})
    assert.equal(disconnected.state,'needs_auth');assert.deepEqual(disconnected.connections,[])
    assert.equal(modelDisconnects,2)
    assert.equal((await facade.accountStatus()).state,'signed_out')
    assert.equal((await facade.modelStatus()).state,'needs_auth')
    t.diagnostic('Exact model connection revoke recovered after a lost response')
    return
  }
  let injected=false
  const disconnectFetch=async(url,init)=>{
    if(String(url).endsWith('/execute'))executes++
    const response=await fetch(url,init)
    const target=failure==='create-response'?String(url).endsWith('/disconnect-operations') && init.method==='POST':String(url).endsWith('/execute')
    if(failure!=='none' && target && !injected){injected=true;assert.ok(response.ok);await response.body?.cancel();throw new Error('simulated lost disconnect response')}
    return response
  }
  if(failure!=='none'){
    await assert.rejects(new DisconnectService(store,installation,pageOrigin,disconnectFetch).run(),/simulated lost/)
    assert.ok((await store.read()).disconnect)
    await assert.rejects(tokens.credential(),{code:'loop-host/needs-auth'})
  }
  await facade.disconnectAccount({})
  for(const name of await readdir(root+"/actions/bindings")){
    if(!name.endsWith(".json"))continue
    assert.notEqual(JSON.parse(await readFile(root+"/actions/bindings/"+name,"utf8")).grantId,credential.grant_id,"confirmed account disconnect removes old local bindings")
  }
  assert.equal(executes,1,'recovery reconciles the server receipt without executing twice')
  assert.equal(await store.read(),undefined)
  await assert.rejects(account.status(),{code:'loop-host/needs-auth'})
  t.diagnostic('Real isolated Loop OAuth, account, action, model catalog, sync readback and server-confirmed disconnect completed')
})

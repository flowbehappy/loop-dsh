import {writeFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {join} from 'node:path'
import assert from 'node:assert/strict'
const dir=process.env.LOOP_TEST_EVIDENCE_DIR
if (!dir) throw new Error('An explicit evidence directory is required')
const tip=text=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]})
export async function runAudit({ctx,api,workspace,sessionId,signal,ownerUser,localWorkspace,selectedModel}){
  const group=process.env.AUDIT_GROUP||'conversation', tag=randomUUID().slice(0,7), root='/api/v1/workspaces/'+workspace
  if(group==='collaboration-discovery') {
    const {runCollaborationDiscovery}=await import('./live-collaboration-discovery.mjs')
    return runCollaborationDiscovery({ctx,api,workspace,localWorkspace,selectedModel,signal})
  }
  const evidence={group,tag,sessionId,cases:[],offers:[],calls:[]}
  const verify=()=>{
    assert.ok(evidence.cases.length, 'No cases executed for '+group)
    assert.equal(evidence.listenerError,undefined)
    assert.deepEqual(evidence.cases.filter(c=>!c.ok).map(c=>({id:c.id,error:c.error})),[], 'Canonical checks failed')
  }
  const save=()=>writeFile(join(dir,'release-'+group+'.json'),JSON.stringify(evidence,null,2),{mode:0o600})
  const service=ctx.loopHostService, host=service.runtime
  for(const method of ['agentCommand','humanCommand']){
    const call=host[method].bind(host)
    host[method]=async(...a)=>{
      const cmd=a[1], item={case:evidence.cases.at(-1)?.id,principal:method,verb:cmd.verb,action:cmd.name}
      let args={}
      try{args=JSON.parse(cmd.input||'{}')}catch{}
      for(const k of ['target','channelName','documentId','message_id','taskId','channelId'])if(args[k])item[k]=args[k]
      try {
        const response=await call(...a)
        if(group==='dm-retry' && method==='humanCommand' && cmd.name==='message.send' && !response.failed){
          const replay=await call(...a)
          const original=JSON.parse(response.output).data.data.messageId
          const repeat=JSON.parse(replay.output).data.data.messageId
          evidence.replayed={original,repeat};await save()
          assert.equal(original,repeat,'identical authorized client message must return the same receipt')
        }
        item.failed=!!response?.failed;try{const body=JSON.parse(response.output)?.data?.data;item.returnedTarget=body?.targetKey;item.messageId=body?.messageId}catch{}
        if(response?.failed)item.error=String(response?.output||'').slice(0,320)
        return response
      }catch(e){item.error=String(e.message).slice(0,320);throw e}
      finally{evidence.calls.push(item);await save()}
    }
  }
  const {assistant}=await api('PUT','/api/v1/me/personal-assistants/'+workspace)
  const peerName='lin_'+tag, peer=await api('POST','/api/v1/auth/register',{name:peerName,email:peerName+'@example.com',password:'Isolated-Only!7'+randomUUID()},'')
  const peerAPI=(method,path,body)=>api(method,path,body,peer.accessToken)
  if(!peer.user.emailVerified){
    const mail=await peerAPI('GET','/internal/e2e/mailbox/latest?kind=verify&email='+encodeURIComponent(peer.user.email))
    await peerAPI('POST','/api/v1/auth/verify-email',{token:mail.token})
  }
  const invite=await api('POST',root+'/invites',{identifier:peer.user.email})
  await peerAPI('POST','/api/v1/auth/pending-invites/'+invite.inviteId+'/accept')
  const channel=await api('POST',root+'/channels',{name:'review-'+tag})
  await api('POST',root+'/channels/'+channel.id+'/members/batch',{members:[{userId:peer.user.id},{agentId:assistant.agentId,visibility:'private'}]})
  const msg=(actor,id,content)=>actor('POST',root+'/scopes/'+id+'/messages',{content,clientMessageId:randomUUID()})
  const history=async(actor,id)=>(await actor('GET',root+'/scopes/'+id+'/messages?limit=100')).messages
  const match=(rows,text)=>rows.filter(m=>m.content?.includes(text))
  const resources=new Set(['channel:'+channel.id])
  const self=await peerAPI('GET',root+'/members')
  const peerMember=self.members.find(m=>m.userId===peer.user.id).memberId
  resources.add('dm:@'+peerMember)
  const allowed=new Set(['message.history','message.send','message.thread-create','reaction.set','reaction.list','kb.doc-read','kb.doc-update','kb.doc-list'])
  const listen=async()=>{
    for await(const f of service.humanTaskEvents({sessionId},signal)){
      if(f.state==='idle')continue
      const ok=evidence.cases.at(-1)?.id!=='partial-history' && evidence.cases.at(-1)?.id!=='dm-declined' && allowed.has(f.action) && f.resources?.length>0 && f.resources.every(x=>resources.has(x))
      evidence.offers.push({case:evidence.cases.at(-1)?.id,state:f.state,action:f.action,resources:f.resources,decision:ok?'allow':'cancel'});await save()
      if(!ok || f.state==='reuse'){await service.decideHumanTask({sessionId,requestId:f.requestId,decision:ok?'reuse':'cancel'},signal);continue}
      const u=new URL(f.loginUrl),q=u.searchParams
      assert.equal(q.get('allowed_actions'),f.action)
      const consent=await api('POST',u.pathname,{responseType:'code',clientId:q.get('client_id'),redirectUri:q.get('redirect_uri'),workspaceId:workspace,resource:q.get('resource'),state:q.get('state'),scope:q.get('scope'),codeChallenge:q.get('code_challenge'),codeChallengeMethod:'S256',allowedActions:[f.action],resourceConstraints:f.resources,deviceLabel:q.get('device_label')})
      const callback=new URL(consent.redirectTo)
      assert.equal(callback.hostname,'127.0.0.1');assert.equal(callback.origin+callback.pathname,q.get('redirect_uri'))
      const res=await fetch(callback,{redirect:'error',signal});assert.equal(res.status,200);await res.body.cancel()
    }
  }
  listen().catch(async e=>{if(!signal.aborted){evidence.listenerError=String(e);await save()}})
  if (['dm','dm-first','dm-human'].includes(group)) ctx.on('user-questions/request',async(req,next)=>{
    if(req.agent?.session?.id!==sessionId)return next()
    evidence.clarifications??=[];evidence.clarifications.push(req.questions.map(q=>q.question));await save()
    return {answers:req.questions.map(q=>({id:q.id,selected:[],custom:'使用当前 Loop 工作区，目标同事是 '+peerName+'，成员 ID 是 '+peerMember+'。需要授权请通过 Loop 的授权卡，我会在卡上决定。'}))}
  },{prepend:true})
  if(group==='partial') ctx.on('user-questions/request',async(req,next)=>{
    if(req.agent?.session?.id!==sessionId)return next()
    evidence.clarifications??=[]; evidence.clarifications.push(req.questions.map(q=>q.question));await save()
    const answer=evidence.cases.at(-1)?.id==='partial-human-recheck'
      ? '就是刚才的 #'+channel.name+'，请用我本人的 Loop 身份核对，授权卡由我确认。'
      : '就是 #'+channel.name+'，先按助手自己的可见范围总结。'
    return {answers:req.questions.map(q=>({id:q.id,selected:[],custom:answer}))}
  },{prepend:true})
  let cursor=-1
  async function run(id,prompt,check){
    prompt='在 Loop 里，'+prompt;const c={id,prompt};evidence.cases.push(c);await save()
    try{
      await ctx.sessionController.prompt({sessionId,requestId:randomUUID(),content:[{type:'text',text:prompt}]},AbortSignal.timeout(175000))
      const done=await ctx.sessionController.wait({sessionId,afterSeq:cursor,maxMessages:200,timeoutMs:172000},AbortSignal.timeout(180000))
      c.reason=done.reason
      if(done.reason==='input-required'){
        c.pending={keys:Object.keys(done),state:done.state,records:done.output.records.slice(-10).map(r=>({t:r.event?.type,summary:r.event?.data?.message?.content?.map(b=>({type:b.type,name:b.name,text:b.text?.slice(0,140),args:b.arguments?Object.keys(b.arguments):undefined}))}))}
      }
      cursor=done.state?.cursor??Math.max(cursor,...done.output.records.map(r=>r.event?.seq??-1));
      c.debug=done.output.records.slice(0,7).map(r=>({type:r.type,event:r.event?.type,data:r.event?.type?.includes('error')?JSON.stringify(r.event.data).slice(0,1000):undefined,role:r.event?.data?.message?.role,reason:r.event?.data?.message?.errorMessage,stop:r.event?.data?.message?.stopReason}))
      const record=done.output.records.filter(x=>x.event?.type==='assistant/message').sort((a,b)=>b.event.seq-a.event.seq)[0]
      c.answer=(record?.event?.data?.message?.content||[]).map(x=>x.text||'').join(' ').slice(0,7000)
      c.observed=await check(c.answer);c.ok=true
    }catch(e){c.ok=false;c.error=e.message?.slice(0,1100)}
    await save()
  }
  const marker=label=>label+'-'+randomUUID().slice(0,8)
  if(group==='directory'){
    const project=(await api('POST',root+'/projects?envelope=container',{name:'诗歌项目-'+tag,prefix:'DIR'})).project
    const seed=await api('POST','/internal/e2e/agents/'+assistant.agentId+'/knowledge-base')
    const settings='/api/v1/me/personal-assistants/'+workspace
    const current=(await api('PUT',settings)).assistant
    const {resource:_resource,...permissions}=current.permissions
    await api('PUT',settings+'/permissions',{revision:current.revision,permissions})
    allowed.add('resource.lookup')
    resources.add('resource-lookup:project/'+encodeURIComponent(project.name))
    resources.add('resource-lookup:kb/'+encodeURIComponent(seed.name))
    resources.add('resource-lookup:all/')
    await run('named-project','帮我查一下「'+project.name+'」的项目编号。',async answer=>{assert.ok(answer.includes(project.id));return {id:project.id}})
    await run('owner-directory','把我名下的全部 Loop 资源按类型列出来，带上名称和 ID。',async answer=>{assert.ok(answer.includes(project.id));assert.ok(answer.includes(seed.id));return {project:project.id,kb:seed.id}})
  }else if(group==='human-membership'){
    const recoveryChannel=await api('POST',root+'/channels',{name:'member-recovery-'+tag})
    const board=recoveryChannel.id
    await api('POST',root+'/channels/'+board+'/members/batch',{members:[{agentId:assistant.agentId,visibility:'private'}]})
    const before=await api('GET',root+'/channels/'+board+'/members')
    assert.ok(!before.humans.some(m=>m.memberId===peerMember))
    resources.add('channel:'+board);resources.add('workspace-member:'+peerMember)
    allowed.add('channel.human-member-add');allowed.add('task.create')
    const title=marker('同事测试任务')
    ctx.on('user-questions/request',async(req,next)=>{
      if(req.agent?.session?.id!==sessionId)return next()
      evidence.clarifications??=[];evidence.clarifications.push(req.questions.map(q=>q.question));await save()
      return {answers:req.questions.map(q=>({id:q.id,selected:[],custom:'就是 '+peerName+'，成员 ID '+peerMember+'。任务建在 #'+recoveryChannel.name+'；如需邀请这位同事，可以申请授权，我会在授权卡确认。'}))}
    },{prepend:true})
    await run('human-missing-from-board','@'+peerName+' 给这位同事在 #'+recoveryChannel.name+' 创建一个测试任务，标题是「'+title+'」。需要的授权我会在卡片上确认。',async()=>{
      const page=await api('GET',root+'/channels/'+board+'/tasks?query='+encodeURIComponent(title))
      const rows=page.rows??page.tasks??page
      const matches=rows.filter(r=>r.title===title)
      assert.equal(matches.length,1,'one task on the requested board')
      const detail=await peerAPI('GET',root+'/tasks/'+matches[0].id)
      assert.equal(detail.detail.task.assigneeProfile.memberId,peerMember)
      assert.equal(detail.detail.task.channelId,board)
      const members=await peerAPI('GET',root+'/channels/'+board+'/members')
      assert.ok(members.humans.some(m=>m.memberId===peerMember))
      return {taskId:matches[0].id,board,assignee:peerMember,recipientReadable:true}
    })
  }else if(group==='manual'){
    const dm=await peerAPI('POST',root+'/channels/dm',{userId:ownerUser.id});const text=marker('手动授权回执')
    await run('manual-authorize','请代表我本人，使用 Loop 的 human authorize 手动入口为 message.send 申请权限，连接范围限定 dm:@'+peerMember+'，由 Loop 确定这个动作需要的权限。确认后请发给 '+peerName+'「'+text+'」。',async()=>{
      const found=match(await history(peerAPI,dm.id),text);assert.equal(found.length,1)
      assert.equal(found[0].authorProfile.actorType,'human');return {messageId:found[0].id}
    })
  }else if(group==='dm-retry'){
    const dm=await peerAPI('POST',root+'/channels/dm',{userId:ownerUser.id})
    const text=marker('重试核验'),key=randomUUID()
    for(const attempt of [1,2]){
      await run('send-'+attempt, '请代表我本人在与 '+peerName+' 的私聊里发送「'+text+'」。本次是同一个投递请求，使用 Loop 的 clientMessageId '+key+'；若已投递请保持同一条消息。',async()=>{
        const rows=match(await history(peerAPI,dm.id),text);assert.equal(rows.length,1)
        assert.equal(rows[0].authorProfile.actorType,'human')
        return {messageId:rows[0].id,count:rows.length}
      })
    }
  }else if(group==='dm-first'){
    const ownerMember=self.members.find(m=>m.userId===ownerUser.id).memberId
    const peerDMs=()=>peerAPI('GET',root+'/channels/dm?peerMemberId='+ownerMember)
    assert.deepEqual(await peerDMs(),[])
    const text=marker('首次私聊'),bad=marker('私有助手不可投递'),id=randomUUID()
    const failed=await ctx.loopHostActions.agentAction({workspaceId:'runtime-workspace',sessionId,name:'message.send',arguments:{target:'dm:@'+peerMember,content:bad,clientMessageId:id}}).then(v=>v.error?.code||null,e=>e.code)
    assert.ok(failed,'private assistant must refuse before delivery')
    evidence.privateSend=failed
    await run('no-dm-read','请用我本人身份读取与 '+peerName+' 已经存在的私聊。如果没有会话就告诉我，不要新建。',async()=>{
      assert.ok(evidence.offers.some(x=>x.action==='message.history'&&x.resources[0]==='dm:@'+peerMember));assert.deepEqual(await peerDMs(),[]);return {newDM:0}
    })
    await run('first-dm-send','请代表我本人给 '+peerName+' 单独发送「'+text+'」。',async()=>{
      const rows=await peerDMs();assert.equal(rows.length,1)
      const messages=await history(peerAPI,rows[0].id)
      assert.equal(match(messages,text).length,1);assert.equal(match(messages,bad).length,0)
      assert.equal(match(messages,text)[0].authorProfile.memberId,ownerMember)
      const inbox=await peerAPI('GET',root+'/conversations?source=index&kinds=dm&limit=100')
      assert.ok(inbox.items.some(r=>r.scopeId===rows[0].id),'receiver inbox entry missing')
      return {dm:rows[0].id,inbox:true,received:1}
    })
  }else if(['conversation','precision','dm'].includes(group)){
    const parent=await msg(group==='precision'?api:peerAPI,channel.id,'大家帮忙核对周四的回归窗口 '+tag)
    const text=marker('窗口确认'),newReply=marker('周五再核对'),dmText=marker('仅私聊'),reply=marker('接收方回执')
    const debugHistory=async()=>{
      const q=await ctx.loopHostActions.agentAction({workspaceId:'runtime-workspace',sessionId,name:'message.history',arguments:{target:'#'+channel.name,limit:100}})
      return q?.data?.data?.messages?.map(x=>({seq:x.seq,content:x.content}))
    }
    evidence.baseline={peer:(await history(peerAPI,channel.id)).map(x=>({seq:x.seq,content:x.content})),human:(await history(api,channel.id)).map(x=>({seq:x.seq,content:x.content})),agent:await debugHistory()}
    await save()
    const thread=await peerAPI('POST',root+'/channels/'+channel.id+'/threads',{parentMessageId:parent.id})
    resources.add('channel:'+thread.threadChannelId)
    resources.add('message:'+parent.id)
    if(group!=='dm'){
    await run('thread-reply','请在 #'+channel.name+' 里找到提到“周四的回归窗口”的那条原消息，只在那条消息的讨论串里回复「'+text+'」，别发到频道主时间线。',async()=>{
      const [child,top]=await Promise.all([history(peerAPI,thread.threadChannelId),history(peerAPI,channel.id)])
      assert.equal(match(child,text).length,1,'target thread reply count');assert.equal(match(top,text).length,0,'parent channel copy count')
      return {thread:thread.threadChannelId,count:1,parentCopies:0}
    })
    await msg(group==='precision'?api:peerAPI,thread.threadChannelId,newReply)
    await run('thread-read','刚才那条讨论串里又多了一条回复，请把最新回复的原文告诉我。',async(answer)=>{assert.ok(answer.includes(newReply),'latest thread marker missing');return {expected:newReply}})
    await run('reaction-add','在刚才周四回归窗口的频道原消息上点一个 👍。',async()=>{
      const m=(await history(peerAPI,channel.id)).find(x=>x.id===parent.id)
      assert.equal(m.reactions?.find(x=>x.emoji==='👍')?.count,1,'recipient reaction count');return {parent:parent.id,count:1}
    })
    await run('reaction-remove','把你刚才点在那条原消息上的 👍 撤掉。',async()=>{
      const m=(await history(peerAPI,channel.id)).find(x=>x.id===parent.id)
      assert.ok(evidence.cases.find(x=>x.id==='reaction-add').ok,'add prerequisite failed');assert.ok(!m.reactions?.find(x=>x.emoji==='👍'&&x.count>0),'reaction remains');return {count:0}
    })
    }
    const agentDM=await peerAPI('POST',root+'/channels/dm',{agentId:assistant.agentId}).catch(()=>({id:''}))
    const humanDM=await peerAPI('POST',root+'/channels/dm',{userId:ownerUser.id})
    for(const dm of [agentDM,humanDM])resources.add('channel:'+dm.id)
    let direct
    await run('named-dm','私聊工作区同事 '+peerName+'，单独发送「'+dmText+'」，不要发到群里。',async()=>{
      const receipt=evidence.calls.findLast(x=>x.case==='named-dm'&&x.action==='message.send'&&x.returnedTarget)
      const raw=receipt?.principal==='agentCommand' && !receipt.failed && receipt?.target?await ctx.loopHostActions.agentAction({workspaceId:'runtime-workspace',sessionId,name:'message.history',arguments:{target:receipt.target,limit:20}}):null
      const verified=raw?.data?.data?.targetKey
      const ids=[...new Set([verified,agentDM.id,humanDM.id].filter(id=>id&&id.startsWith('dm_')))]
      const checks=[]
      for(const id of ids){const result=await history(peerAPI,id).then(rows=>({count:match(rows,dmText).length})).catch(e=>({error:e.message}));checks.push({id,...result})}
      const top=await history(peerAPI,channel.id)
      const correct=checks.filter(x=>x.count===1)
      const inbox=await peerAPI('GET',root+'/conversations?source=index&kinds=dm&limit=100')
      evidence.dmChecks={checks,receipt,verified,recipientIndex:inbox.items?.some(x=>x.scopeId===correct[0]?.id||x.id===correct[0]?.id),publicCopies:match(top,dmText).length}
      if(verified?.startsWith('dm_'))direct=verified
      assert.equal(correct.length,1,'recipient DM count');assert.equal(match(top,dmText).length,0)
      direct=correct[0].id;return {dm:direct,channelCopies:0}
    })
    if(!direct)direct=humanDM.id
    try{await msg(peerAPI,direct,reply)}catch(e){evidence.peerReplyError=e.message;await save();return}
    await run('dm-readback','刚才 '+peerName+' 在私聊里回了什么？请给我最新那条的原文。',async(answer)=>{assert.ok(answer.includes(reply),'incoming DM marker missing');return {dm:direct,expected:reply}})
  }else if(group==='dm-human'){
    const dm=await peerAPI('POST',root+'/channels/dm',{userId:ownerUser.id})
    const receipt=marker('只给本人'), reply=marker('人工私聊回执')
    resources.add('channel:'+dm.id);resources.add('dm:'+dm.id)
    await msg(peerAPI,dm.id,reply)
    await run('dm-declined','请用我本人的身份私聊 '+peerName+'，只发「拒绝测试-'+tag+'」。必须获得我的确认。',async()=>{assert.equal(match(await history(peerAPI,dm.id),'拒绝测试-'+tag).length,0);assert.ok(evidence.offers.some(x=>x.case==='dm-declined'&&x.decision==='cancel'));return {copies:0}})
    await run('owner-incoming-dm','请用我本人的 Loop 身份读一下我与 '+peerName+' 已有的私聊，告诉我他最新发来的回执原文。如果需要请向我申请只读授权。',async(answer)=>{assert.ok(answer.includes(reply),'peer marker in owner DM');return {dm:dm.id,reply}})
    await run('owner-outgoing-dm','请明确代表我本人，在我与 '+peerName+' 这条现有的私聊里回复「'+receipt+'」。需要我的授权就申请。',async()=>{
      const rows=match(await history(peerAPI,dm.id),receipt);assert.equal(rows.length,1,'recipient sees exact message in existing Human DM');assert.equal(rows[0].authorProfile?.actorType,'human','send in the requested identity');return {messageId:rows[0].id}
    })
  }else if(group==='partial'){
    const mine=marker('主人排期'),theirs=marker('同事回执')
    await msg(api,channel.id,mine);await msg(peerAPI,channel.id,theirs)
    const agentPage=(await ctx.loopHostActions.agentAction({workspaceId:'runtime-workspace',sessionId,name:'message.history',arguments:{target:'#'+channel.name,limit:100}})).data.data
    evidence.visibility={humanRows:(await history(api,channel.id)).map(m=>m.content),agentRows:agentPage.messages.map(m=>m.content),fields:Object.keys(agentPage),mine,theirs}
    await run('partial-history','请看看 #'+channel.name+' 的大家刚才说了什么，按发言人总结一下。',async(answer)=>{
      const complete=answer.includes(theirs)&&answer.includes(mine), limited=/仅.*(可见|权限)|可见范围|权限.*(不足|范围|限制)|未必|无法确认|may not see|limited visibility/i.test(answer)
      evidence.firstAnswer={complete,limited}
      const qualified = limited || /助手可见|助手身份看到的视图|我能看到|我所能看到|我可以看到|我这边.*[看见]|我能读到|我.{0,6}可见|我目前能看到|可能看不到|我看到的|当前.*能看到|其他.*不可见|只能看到/u.test(answer)
      const categorical = /没有其他人的发言|是唯一的发言人|频道[里中]没有其他人发言/u.test(answer)
      assert.doesNotMatch(answer,/三(位|名|个)发言人|[（(]男[，,)）]|[（(]女[，,)）]/u,'Message history has only two authors and provides no gender data');
      assert.ok(!complete && answer.includes(mine) && qualified && !categorical,'summary must include both actual speakers or limit any speaker count to the assistant view');return {complete,limited}
    })
    await run('partial-human-recheck','我看见同事也在这个频道发了一条。请用我的 Loop 身份核实，向我申请这个频道的只读授权，再告诉我同事回执的完整随机编号。',async(answer)=>{
      assert.ok(answer.includes(theirs),'owner-visible peer marker missing');return {read:theirs,offers:evidence.offers}
    })
  }else if(group==='names'){
    const label='评审同事'+tag
    await peerAPI('PATCH','/api/v1/me',{displayName:label})
    const login='lin2_'+tag,other=await api('POST','/api/v1/auth/register',{name:login,email:login+'@example.com',password:'Isolated-Only!7'+randomUUID()},'')
    const oa=(m,p,b)=>api(m,p,b,other.accessToken)
    if(!other.user.emailVerified){
      const mail=await oa('GET','/internal/e2e/mailbox/latest?kind=verify&email='+encodeURIComponent(other.user.email))
      await oa('POST','/api/v1/auth/verify-email',{token:mail.token})
    }
    const invitation=await api('POST',root+'/invites',{identifier:other.user.email})
    await oa('POST','/api/v1/auth/pending-invites/'+invitation.inviteId+'/accept')
    await oa('PATCH','/api/v1/me',{displayName:label})
    await api('POST',root+'/channels/'+channel.id+'/members/batch',{members:[{userId:other.user.id}]})
    const members=(await api('GET',root+'/members')).members
    const first=members.find(x=>x.userId===peer.user.id),second=members.find(x=>x.userId===other.user.id)
    assert.equal(first.displayName,label);assert.equal(second.displayName,label)
    const title='确认负责人-'+tag
    const {tasks}=await api('POST',root+'/channels/'+channel.id+'/tasks',{tasks:[{title}]})
    const id=tasks[0].id
    const detail=async()=>(await api('GET',root+'/tasks/'+id)).detail.task
    const before=(await detail()).assigneeProfile?.memberId
    resources.add('task:'+id);for(const m of [first,second])resources.add('workspace-member:'+m.memberId);allowed.add('task.assign');allowed.add('task.update')
    ctx.on('user-questions/request',async(req,next)=>{
      if (req.agent?.session?.id!==sessionId || !req.questions?.some(q=>/同名|谁|哪|which|choose|select|identify|member|同事|colleague|person/i.test(q.question)))return next()
      if(process.env.NAMES_DELAY_CHOICE==='1' && evidence.cases.at(-1)?.id==='same-name-person'){
        assert.equal((await detail()).assigneeProfile?.memberId,before)
        return {answers:req.questions.map(q=>({id:q.id,selected:[],custom:'暂时不选，请保持负责人不变，等我下一条消息给出登录名。'}))}
      }
      evidence.clarification={before:(await detail()).assigneeProfile?.memberId??null,questions:req.questions.map(q=>q.question),choice:second.memberId}
      await save()
      return {answers:req.questions.map(q=>({id:q.id,selected:[],custom:'选登录名 '+login+'，邮箱 '+other.user.email+'。'}))}
    },{prepend:true})
    await run('same-name-person','请把 #'+channel.name+' 里的任务《'+title+'》指派给同事「'+label+'」。',async(answer)=>{
      const actual=(await detail()).assigneeProfile?.memberId
      evidence.identity={before,actual,first:first.memberId,second:second.memberId}
      if(evidence.clarification){assert.equal(evidence.clarification.before,before??null);assert.equal(actual,second.memberId,'selection after clarification');return {actual,chosen:second.memberId}}
      assert.equal(actual,before,'ambiguous name must not change assignee');assert.match(answer,/同名|多位|同一|两|确认|区分|which|multiple|two/i)
      return {before,actual,candidates:2}
    })
    await run('select-one-person','选登录名为 '+login+' 的那位，邮箱是 '+other.user.email+'。请把刚才那项任务交给他。',async()=>{
      const actual=(await detail()).assigneeProfile?.memberId;assert.equal(actual,second.memberId,'selected recipient');return {actual,expected:second.memberId}
    })
  }else if(group==='team'){
    const teamName='联调小组-'+tag
    const teams=async()=>{const x=await api('GET',root+'/teams');return Array.isArray(x)?x:(x.teams??x.items)}
    await run('new-team','请新建名为「'+teamName+'」的 Loop Team 团队，先不用添加其他成员。',async()=>{
      const rows=await teams();const matches=rows.filter(x=>x.displayName===teamName||x.name===teamName||x.team?.name===teamName);assert.equal(matches.length,1,'team visible to human owner');return {count:1}
    })
  }else if(group==='tasks'){
    const title='轮值交接-'+tag
    const page=await api('POST',root+'/channels/'+channel.id+'/tasks',{tasks:[{title}]})
    const task=page.tasks[0]
    const members=(await api('GET',root+'/members')).members
    const lin=members.find(m=>m.userId===peer.user.id), agent=members.find(m=>m.agentId===assistant.agentId)
    if(agent)await api('POST',root+'/tasks/'+task.id+'/collaborators',{memberId:agent.memberId,role:'contributor'})
    resources.add('task:'+task.id);resources.add('workspace-member:'+lin.memberId);allowed.add('task.assign');allowed.add('task.update');allowed.add('task.get')
    const detail=async()=>(await api('GET',root+'/tasks/'+task.id)).detail.task
    await run('handoff-by-name','把 #'+channel.name+' 里现有的任务《'+title+'》交给同事 '+peerName+'。',async()=>{
      const d=await detail();assert.equal(d.assigneeProfile?.memberId,lin.memberId,'assignee must be exact member');return {task:task.id,member:lin.memberId}
    })
    const comment=marker('验收说明')
    await run('task-discussion','请在《'+title+'》的任务讨论里留言「'+comment+'」，不要在频道重复提醒。',async()=>{
      const page=await api('GET',root+'/tasks/'+task.id+'/timeline?limit=50')
      const entries=page.entries.filter(x=>x.discussion?.body?.includes(comment))
      assert.equal(entries.length,1,'discussion message count');assert.equal(match(await history(peerAPI,channel.id),comment).length,0);return {entry:entries[0].id}
    })
    const priorAssignee=(await detail()).assigneeProfile?.memberId;const revised='交接已复核-'+tag
    await run('rename-preserves-assignee','把同一个任务改名为《'+revised+'》，负责人保留。',async()=>{
      const d=await detail();assert.equal(d.title,revised);assert.equal(d.assigneeProfile?.memberId,priorAssignee,'renaming changed the assignee');return {id:d.id,assignee:d.assigneeProfile?.memberId}
    })
  }else if(group==='timer'){
    const text=marker('定时交付')
    await run('scheduled-delivery','请用 Loop 的服务端定时消息功能，1 分钟后向 #'+channel.name+' 发送一条内容为「'+text+'」的提醒，只发一次。',async()=>{
      const schedules=await api('GET',root+'/schedules')
      const found=schedules.filter(s=>s.messageTemplate===text)
      assert.equal(found.length,1,'server must hold one schedule')
      const start=Date.now();let messages=[]
      for(let i=0;i<32;i++){
        messages=match(await history(peerAPI,channel.id),text)
        if(messages.length)break
        await new Promise(resolve=>setTimeout(resolve,4000))
      }
      await new Promise(resolve=>setTimeout(resolve,3000))
      messages=match(await history(peerAPI,channel.id),text)
      const runs=await api('GET',root+'/schedules/'+found[0].id+'/runs')
      evidence.timer={id:found[0].id,received:messages.length,seconds:Math.round((Date.now()-start)/1000),runs}
      assert.equal(messages.length,1,'recipient should receive exactly one scheduled message');return {id:found[0].id,messageId:messages[0].id}
    })
  }else if(group==='schedule'||group==='server-schedule'){
    const text=marker('交班提醒')
    const schedules=async()=>{
      const p=await api('GET',root+'/schedules'), humanRows=Array.isArray(p)?p:(p.items??p.schedules??[])
      const a=await ctx.loopHostActions.agentAction({workspaceId:'runtime-workspace',sessionId,name:'scheduled-message.list',arguments:{limit:50}}).catch(()=>null)
      const agentRows=a?.data?.data?.items??[]
      evidence.scheduleRows={agent:agentRows,human:humanRows}
      return [...new Map([...agentRows,...humanRows].map(x=>[x.id,x])).values()]
    }
    let id
    await run('schedule-create',(group==='server-schedule'?'请用 Loop 服务端的定时消息功能建立安排，关闭 DSH 后仍需生效。':'')+'安排两小时后往 #'+channel.name+' 发「'+text+'」，只发一次，现在先别发。',async()=>{
      const found=(await schedules()).filter(x=>x.messageTemplate===text);assert.equal(found.length,1,'scheduled message count');id=found[0].id;assert.ok(found[0].target?.ref==='#'+channel.name || JSON.stringify(found[0].target).includes(channel.id));assert.equal(match(await history(peerAPI,channel.id),text).length,0);return {id,status:found[0].status,target:found[0].target}
    })
    await run('schedule-pause','先暂停刚才的交班提醒，保留设置。',async()=>{const found=(await schedules()).find(x=>x.id===id);assert.equal(found?.status,'paused','schedule paused');return {id,status:found.status}})
    await run('schedule-resume','恢复这条提醒，还是发往原频道，不要新建第二条。',async()=>{const found=(await schedules()).filter(x=>x.messageTemplate===text);assert.equal(found.length,1);assert.equal(found[0].id,id);assert.equal(found[0].status,'active');return {id,count:1}})
    await run('schedule-cancel','交班提醒最终取消，请删除刚才那条安排。',async()=>{assert.ok(id);const rows=(await schedules()).filter(x=>x.id===id&&!['deleted','cancelled'].includes(x.status));assert.equal(rows.length,0);return {id,count:0}})
  }else{
    const seed=await api('POST','/internal/e2e/agents/'+assistant.agentId+'/knowledge-base')
    const title='交接清单-'+tag,original=marker('原有步骤'),added=marker('新增核对')
    const tool=await ctx.loopHostActions.agentAction({workspaceId:'runtime-workspace',sessionId,name:'kb.doc-create',arguments:{kbId:seed.id,title,content:tip(original)}})
    const docs=()=>api('GET',root+'/documents?scope=kb:'+seed.id)
    const row=(await docs()).find(r=>r.title===title);assert.ok(row?.id,'seed document missing')
    resources.add('kb:'+seed.id);resources.add('document:'+row.id)
    if(group==='readable-doc'){
      await api('POST',root+'/kb/'+seed.id+'/permissions/grants',{subjectType:'user',subjectId:peer.user.id,role:'view'})
      const peerView=await peerAPI('GET',root+'/documents/'+row.id)
      assert.ok(JSON.stringify(peerView).includes(original))
    }
    await run('document-find','请在可用知识库中找到《'+title+'》，告诉我它目前写的步骤。',async(answer)=>{assert.ok(answer.includes(original),'existing document body missing');return {id:row.id,original}})
    await run('document-edit','请在刚才找到的《'+title+'》末尾追加一段「'+added+'」，原文保留，不要另建文档。',async()=>{
      const exact=(await docs()).filter(r=>r.title===title);assert.equal(exact.length,1);assert.equal(exact[0].id,row.id)
      const doc=await api('GET',root+'/documents/'+row.id),body=JSON.stringify(doc);assert.ok(body.includes(original)&&body.includes(added),'document body must include original and added markers');return {id:row.id,original,added}
    })
    if(group==='permission-check'){
      const before=await history(peerAPI,channel.id)
      await run('check-before-sharing','帮我确认同事 '+peerName+' 能不能打开《'+title+'》。没有权限就告诉我，不要改权限，也不要在频道发文档正文。',async(answer)=>{
        let readable
        try{await peerAPI('GET',root+'/documents/'+row.id);readable=true}catch(e){assert.match(e.message,/403|404/);readable=false}
        const after=await history(peerAPI,channel.id)
        const honest=/无法|不能|不可|未|不具备|不能确认|没有|无法核实|cannot|cannot verify|no access/i.test(answer)
        assert.ok(honest&&!readable,'recipient should remain ungranted and answer should reflect it');assert.equal(after.length,before.length,'unexpected channel write')
        return {readable,messagesAdded:0}
      })
      verify();return
    }
    await run('share-document','把刚更新的《'+title+'》的 Loop 文档链接发到 #'+channel.name+'，方便同事打开。',async()=>{
      const rows=(await history(peerAPI,channel.id)).filter(x=>x.content?.includes(row.id))
      assert.equal(rows.length,1,'recipient messages containing exact document ID');const message=rows[0].content
      assert.match(message,/(https?:\/\/[^\s)]+|\]\(\/[^)]+\))/,'clickable document link');const docRead=await peerAPI('GET',root+'/documents/'+row.id).then(d=>({readable:JSON.stringify(d).includes(original)})).catch(e=>({readable:false,reason:e.message}))
      evidence.share={messageId:rows[0].id,content:message,recipient:docRead}
      const canonical='/w/'+workspace+'/kb/'+seed.id+'/documents/'+row.id
      const href=message.match(/https?:[^\s)]+/)?.[0]
      const actual=href?new URL(href):null
      evidence.share.canonical=canonical;evidence.share.linkPath=actual?.pathname;evidence.share.linkOrigin=actual?.origin
      assert.equal(docRead.readable,group==='readable-doc')
      assert.ok(!message.includes(original)&&!message.includes(added),'sharing a link must not copy document body')
      assert.ok(actual && actual.origin===process.env.LOOP_TS_E2E_BASE_URL && (actual.pathname===canonical || actual.pathname==='/kb/'+seed.id+'/documents/'+row.id),'document link must use the Loop page route and origin')
      return evidence.share
    })
  }
  await save()
  verify()
}

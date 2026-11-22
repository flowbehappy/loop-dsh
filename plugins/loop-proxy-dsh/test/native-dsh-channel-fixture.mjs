import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

export const channelQuestion = '你去看看 Loop in Loop 这个频道，他们在讨论些啥？'

export async function prepareChannelJourney(api, workspace, service, sessionId, signal) {
  const root = '/api/v1/workspaces/'+workspace
  const create = (name, actor = api) => actor('POST',root+'/channels',{name})
  const marker = '验收主题：蓝鲸迁移 '+randomUUID().slice(0,8)
  const other = '不应出现在目标频道结果中 '+randomUUID()
  const post = (id,content,actor = api) => actor('POST',root+'/scopes/'+id+'/messages',{content,clientMessageId:randomUUID()})
  const target = await create('loop-in-loop')
  await post(target.id,marker)
  const context = await service.runtime.agentCommand(sessionId,{verb:'context'},signal)
  const fallback = JSON.parse(context.output).defaultChannelId
  assert.ok(fallback && fallback !== target.id)
  await post(fallback,other)
  const duplicate = await create('review-two')
  const first = await create('review-one')
  for (const ch of [first,duplicate]) await api('PATCH',root+'/channels/'+ch.id,{name:'同名评审'})
  await post(first.id,other)
  const selectedMarker='第二组的核对结果 '+randomUUID()
  await post(duplicate.id,selectedMarker)
  const peerName='peer_'+randomUUID().slice(0,8)
  const peer=await api('POST','/api/v1/auth/register',{name:peerName,email:peerName+'@example.com',password:'Isolated-Peer-7!'+randomUUID()},'')
  const peerAPI=(method,path,body)=>api(method,path,body,peer.accessToken)
  if(!peer.user.emailVerified){
    const mail=await peerAPI('GET','/internal/e2e/mailbox/latest?kind=verify&email='+encodeURIComponent(peer.user.email))
    await peerAPI('POST','/api/v1/auth/verify-email',{token:mail.token})
  }
  const invite=await api('POST',root+'/invites',{identifier:peer.user.email})
  await peerAPI('POST','/api/v1/auth/pending-invites/'+invite.inviteId+'/accept')
  const privateChannel=await create('peer-only',peerAPI)
  await post(privateChannel.id,other,peerAPI)
  const bound=await service.runtime.agentCommand(sessionId,{verb:'call',name:'channel.get',input:JSON.stringify({channelId:fallback})},signal)
  const defaultChannel=JSON.parse(bound.output).data.data.channel.slug
  assert.ok(defaultChannel)
  const fallbackCall='loop-proxy call message.history '+JSON.stringify({target:'#'+defaultChannel,limit:1})
  const scenarios=[
    {prompt:channelQuestion,name:'Loop in Loop',id:target.id,deny:true,expect:/declined/i,fallback:true},
    {prompt:'重新申请刚才频道的只读授权。',name:'Loop in Loop',id:target.id,text:marker},
    {prompt:'同名评审频道在讨论什么？',name:'同名评审',expect:/several channels/i,fallback:true},
    {prompt:'是 #review-two。',name:'#review-two',id:duplicate.id,text:selectedMarker},
    {prompt:'读取 peer-only。',name:'peer-only',id:privateChannel.id,expect:/forbidden|not found|not allowed|access|40[34]|denied|permission/i,fallback:true},
    {prompt:'读取不存在的频道。',name:'absent-channel',expect:/no matching channel/i,fallback:true},
    {prompt:'看看默认频道。',name:'#'+defaultChannel,id:fallback,text:other},
    {prompt:'通过原先的消息工具重读 #loop-in-loop。',name:'#loop-in-loop',id:target.id,legacy:true,text:marker},
  ]
  let index=0,step=0,error,offers=0
  const consume=(async()=>{
    for await(const f of service.humanTaskEvents({sessionId},signal)){
      if(f.state==='idle')continue
      const scenario=scenarios[index]
      offers++
      assert.equal(f.action,'message.history')
      assert.deepEqual(f.resources,['channel:'+scenario.id])
      assert.equal(f.manage,false)
      if(scenario.deny){await service.decideHumanTask({sessionId,requestId:f.requestId,decision:'cancel'},signal);continue}
      if(f.state==='reuse'){await service.decideHumanTask({sessionId,requestId:f.requestId,decision:'reuse'},signal);continue}
      const u=new URL(f.loginUrl), q=u.searchParams
      assert.equal(q.get('allowed_actions'),'message.history')
      assert.equal(q.get('resource_constraints'),'channel:'+scenario.id)
      assert.doesNotMatch(q.get('scope'),/human_write|human_manage/)
      const approval=await api('POST',u.pathname,{responseType:'code',clientId:q.get('client_id'),redirectUri:q.get('redirect_uri'),workspaceId:workspace,resource:q.get('resource'),state:q.get('state'),scope:q.get('scope'),codeChallenge:q.get('code_challenge'),codeChallengeMethod:'S256',allowedActions:['message.history'],resourceConstraints:f.resources,deviceLabel:q.get('device_label')})
      const callback=new URL(approval.redirectTo)
      assert.equal(callback.origin+callback.pathname,q.get('redirect_uri'));assert.equal(callback.hostname,'127.0.0.1')
      const response=await fetch(callback,{redirect:'error',signal});assert.equal(response.status,200);await response.body?.cancel()
    }
  })()
  consume.catch(e=>{if(!signal.aborted)error=e})
  return {
    scenarios,
    next(input){
      if(!input.tools?.length)return
      const s=scenarios[index], previous=JSON.stringify(input.messages.findLast(m=>m.role==='tool')?.content ?? '')
      const menu=input.tools.map(t=>t.function?.name)
      function tool(name,args){
        const direct=menu.includes(name)
        assert.ok(direct || menu.includes('run_code'),'DSH tool menu: '+menu.join(','))
        const parameters=direct ? args : {code:'const result = await tools.'+name+'('+JSON.stringify(args)+'); text(result)'}
        return {index:0,id:'call_channel_'+index+'_'+step,type:'function',function:{name:direct?name:'run_code',arguments:JSON.stringify(parameters)}}
      }
      if(step++===0){
        if(s.legacy)return tool('bash',{command:'loop-proxy call message.history '+JSON.stringify({target:s.name,limit:10}),description:'Read named channel'})
        return tool('loop_channel_history',{channelName:s.name,limit:10})
      }
      if(step===2){
        if(s.text){
          assert.ok(previous.includes(s.text),'Missing selected channel content: '+previous.slice(-700))
          assert.ok(previous.includes(s.id),'Missing verified target ID')
          if(s.text!==other)assert.ok(!previous.includes(other))
        }else{
          assert.match(previous,s.expect)
          assert.ok(!previous.includes(marker) && !previous.includes(other))
        }
        if(s.fallback)return tool('bash',{command:fallbackCall,description:'Try another channel'})
      }else if(step===3 && s.fallback){
        assert.match(previous,/before reading another channel/)
        assert.ok(!previous.includes(other))
      }
    },
    verifyTurn(){
      if(error)throw error
      assert.equal(step,scenarios[index].fallback?3:2)
      assert.equal(offers,scenarios[index].id && scenarios[index].id!==fallback ? 1:0,'Unexpected consent count at '+index)
      index++;step=0;offers=0
    },
  }
}

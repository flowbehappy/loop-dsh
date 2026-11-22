import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

// Deterministic model responses for the isolated official-runtime journey.
// Assertions against the Human API below the model verify the effects independently.
export async function prepareBusinessJourney(api, workspace, service, sessionId, signal) {
  const {assistant} = await api('PUT','/api/v1/me/personal-assistants/'+workspace)
  const seed = await api('POST','/internal/e2e/agents/'+assistant.agentId+'/knowledge-base')
  const root = '/api/v1/workspaces/'+workspace
  const {project} = await api('POST',root+'/projects?envelope=container',{name:'DSH project journey',prefix:'DSHJ'})
  const peerName = 'peer_'+randomUUID().slice(0,8)
  const peer = await api('POST','/api/v1/auth/register',{name:peerName,email:peerName+'@example.com',password:'Isolated-Peer-7!'+randomUUID()},'')
  const peerAPI = (method,path,body) => api(method,path,body,peer.accessToken)
  if (!peer.user.emailVerified) {
    const mail = await peerAPI('GET','/internal/e2e/mailbox/latest?kind=verify&email='+encodeURIComponent(peer.user.email))
    await peerAPI('POST','/api/v1/auth/verify-email',{token:mail.token})
  }
  const invite = await api('POST',root+'/invites',{identifier:peer.user.email})
  await peerAPI('POST','/api/v1/auth/pending-invites/'+invite.inviteId+'/accept')
  const {members} = await api('GET',root+'/members')
  const colleague = members.find(member=>member.userId===peer.user.id)
  assert.ok(colleague?.memberId)
  let channelId, channelSlug
  let turn = 1
  let denied = 0
  let granted = 0
  let picked = 0
  const approvals = (async()=>{
    for await (const frame of service.humanTaskEvents({sessionId},signal)) {
      if (frame.state==='idle') continue
      if (frame.state==='pick') {
        if (frame.family!=='project') throw Error('Unexpected resource picker')
        await service.decideHumanTask({sessionId,requestId:frame.requestId,decision:'select',resourceUrl:frame.browseUrl+'/'+project.id},signal)
        picked++
        continue
      }
      if (!['task.create','channel.human-member-add'].includes(frame.action)) throw Error('Unexpected approval '+frame.action)
      if (frame.state==='reuse') {
        await service.decideHumanTask({sessionId,requestId:frame.requestId,decision:'reuse'},signal)
        continue
      }
      const url=new URL(frame.loginUrl), q=url.searchParams
      const resources = frame.action==='task.create' ? ['project:'+project.id] : ['channel:'+channelId,'workspace-member:'+colleague.memberId]
      assert.deepEqual(q.get('resource_constraints').split(',').sort(),resources.sort())
      assert.equal(q.get('allowed_actions'),frame.action)
      if (turn===1) {
        await service.decideHumanTask({sessionId,requestId:frame.requestId,decision:'cancel'},signal)
        denied++
        continue
      }
      granted++
      const approval=await api('POST',url.pathname,{responseType:'code',clientId:q.get('client_id'),redirectUri:q.get('redirect_uri'),workspaceId:workspace,resource:q.get('resource'),state:q.get('state'),scope:q.get('scope'),codeChallenge:q.get('code_challenge'),codeChallengeMethod:'S256',allowedActions:[frame.action],resourceConstraints:resources,deviceLabel:q.get('device_label')})
      const callback=new URL(approval.redirectTo)
      assert.equal(callback.origin+callback.pathname,q.get('redirect_uri'))
      assert.equal(callback.hostname,'127.0.0.1')
      const response=await fetch(callback,{redirect:'error',signal})
      assert.equal(response.status,200)
      await response.body?.cancel()
    }
  })()
  let approvalError
  approvals.catch(error=>{if(!signal.aborted)approvalError=error})
  const task = 'loop-proxy call task.create '+JSON.stringify({projectId:project.id,tasks:[{title:'DSH assigned task',assignee:project.leadMemberId,wake:false}]})
  const document = 'loop-proxy call kb.doc-create '+JSON.stringify({kbId:seed.id,title:'DSH knowledge document',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Created from DSH'}]}]}})
  const call = (action,args) => 'loop-proxy call '+action+' '+JSON.stringify(args)
  const notify = () => call('message.send',{target:'#'+channelSlug,expectedScopeId:channelId,content:'[@'+peerName+'](/mentions/human/'+peer.user.id+') Please review the assigned task.',clientMessageId:'dsh-mention-replay'})
  const calls = [
    ['loop-proxy actions channel.', 'loop-proxy call project.list '+JSON.stringify({name:project.name}), 'loop-proxy pick project',task],
    [task,document,call('channel.create',{requestId:'dsh-private-channel',displayName:'DSH collaboration',visibility:'private'}),
      previous => {
        channelId=previous.match(/chn_[a-z0-9]+/u)?.[0]
        channelSlug=previous.replaceAll(String.fromCharCode(92),'').match(/"slug"\s*:\s*"([a-z0-9-]+)"/u)?.[1]
        assert.ok(channelSlug,'channel.create must return a sendable channel slug')
        assert.ok(channelId,'channel.create must return its canonical channel ID')
        return call('channel.human-member-add',{channelId,memberId:colleague.memberId})
      },notify,notify],
  ]
  let step = 0
  return {
    check(){if(approvalError)throw approvalError},
    async retry() {
      if(approvalError)throw approvalError
      assert.equal(denied,1)
      assert.equal(picked,1)
      const page=await api('POST',root+'/projects/'+project.id+'/tasks/browse',{limit:20})
      assert.equal(page.totalCount,0)
      turn=2
      step=0
    },
    next(input) {
      if (!input.tools?.length || step>=calls[turn-1].length) return
      const previous=JSON.stringify(input.messages.findLast(message=>message.role==='tool')?.content ?? '')
      if (turn===1 && step===1) assert.ok(previous.includes('channel.human-member-add') && previous.includes('requiresHumanAuthorization'))
      if (turn===1 && step===2) assert.ok(previous.includes('loop-proxy pick project') && !previous.includes(project.id))
      if (turn===1 && step===3) assert.ok(previous.includes(project.id))
      const next=calls[turn-1][step++]
      const command=typeof next==='function' ? next(previous) : next
      const bash = {command,description:command.split(' ').slice(0,3).join(' ')}
      const tool = input.tools.some(t=>t.function?.name==='bash') ? 'bash' : 'run_code'
      const parameters = tool==='bash' ? bash : {code:'const r = await tools.bash('+JSON.stringify(bash)+'); text(r)'}
      return {index:0,id:'call_business_'+turn+'_'+step,type:'function',function:{name:tool,arguments:JSON.stringify(parameters)}}
    },
    async verify() {
      if(approvalError)throw approvalError
      assert.equal(step,calls[turn-1].length)
      assert.equal(granted,2)
      const page = await api('POST',root+'/projects/'+project.id+'/tasks/browse',{limit:20})
      assert.equal(page.totalCount,1)
      assert.equal(page.rows.length,1)
      const {detail} = await api('GET',root+'/tasks/'+page.rows[0].id)
      assert.equal(detail.task.title,'DSH assigned task')
      assert.equal(detail.task.projectId,project.id)
      assert.equal(detail.task.channelId,'')
      assert.equal(detail.task.assigneeProfile.memberId,project.leadMemberId)
      const docs=await api('GET',root+'/documents?scope=kb:'+seed.id)
      const matches=docs.filter(row=>row.title==='DSH knowledge document')
      assert.equal(matches.length,1)
      const document=await api('GET',root+'/documents/'+matches[0].id)
      assert.ok(JSON.stringify(document).includes('Created from DSH'))
      const roster=await peerAPI('GET',root+'/channels/'+channelId+'/members')
      assert.ok(roster.humans.some(person=>person.memberId===colleague.memberId))
      const history=await peerAPI('GET',root+'/scopes/'+channelId+'/messages?limit=20')
      const mentions=history.messages.filter(message=>message.content.includes('Please review the assigned task.'))
      assert.equal(mentions.length,1)
      assert.ok(mentions[0].resolvedMentions.some(mention=>mention.type==='human' && mention.id===peer.user.id))
    },
  }
}

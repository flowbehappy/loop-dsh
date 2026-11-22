import test from 'node:test'
import assert from 'node:assert/strict'
import {shareDocumentLink,requestHumanDM} from '../backend/actions.ts'

test('share sends only the verified link to the exact channel and preserves the retry key', async () => {
  const sends=[]
  let receipt={documentId:'doc_1',kbId:'kb_1',content:'confidential'}
  const api={async invoke(action,args){
    switch(action){
      case 'workspace.list':return {data:{data:{channels:[{name:'planning',channelId:'chn_1',displayName:'Planning'}]}}}
      case 'kb.doc-read':return {data:{data:receipt}}
      case 'message.send':sends.push(args);return {data:{data:{messageId:'receipt'}}}
      default:assert.fail(action)
    }
  }}
  const args={channelName:'Planning',documentId:'doc_1',clientMessageId:'retry-1'}
  const send=()=>shareDocumentLink(api,args,'https://loop.example','ws_a')
  const link='https://loop.example/w/ws_a/kb/kb_1/documents/doc_1'
  assert.equal((await send()).recipientAccess,'unverified')
  await send()
  assert.deepEqual(sends,[0,1].map(()=>({target:'#planning',expectedScopeId:'chn_1',content:link,clientMessageId:'retry-1'})))
  const held=await shareDocumentLink(api,{...args,requireRecipientAccess:true},'https://loop.example','ws_a')
  assert.equal(held.data.data.state,'not_sent')
  receipt={...receipt,documentId:'doc_other'}
  await assert.rejects(send(),/verify/)
  assert.equal(sends.length,2)
})

test('personal DM approval binds the peer, action and read or write permission', async () => {
  const target='dm:@abcdefghijkl'
  const policy={action:'message.history',write:false,workspaceWide:false,manage:false,resourceConstraints:[target]}
  let preview=policy
  const api={async delegationPreview(action,args){assert.equal(args.target,target);assert.equal(args.asHuman,undefined);return preview}}
  const prepare=()=>requestHumanDM(api,'message.history',{target,asHuman:true})
  assert.deepEqual((await prepare()).delegationArguments,{target})
  for (const change of [{action:'message.send'},{write:true},{manage:true},{workspaceWide:true},{resourceConstraints:['dm:@differentone']}]) {
    preview={...policy,...change}
    await assert.rejects(prepare(),/authorization/)
  }
})

test('general channel send also enforces link-only sharing for a generated excerpt',async()=>{
  const {checkDocumentShare}=await import('../host-service.mjs')
  const base='https://loop.example', link=base+'/w/ws_a/kb/kb_b/documents/doc_c'
  const send=(content,text)=>checkDocumentShare({verb:'call',name:'message.send',input:JSON.stringify({target:'#team',content})},
    {source:{kind:'user',rpcId:'r'},content:[{type:'text',text}]},base)
  assert.throws(()=>send('New private conclusion. '+link,'Share the document link.'),/No message was sent/)
  send(link,'Share the document link.')
  send('Approved wording '+link,'Send this exact message: Approved wording '+link)
  send('Discuss the budget','Tell the team to discuss the budget.')
})

test('ambiguous assignees are checked against the live human directory before a task write', async () => {
  const {default:Host} = await import('../host-service.mjs')
  const first = {name:'aaaaaaaaaaaa',displayName:'Alex'}, second = {name:'bbbbbbbbbbbb',displayName:'Alex'}
  let text = 'Assign the task to Alex'
  const message = {source:{kind:'user',rpcId:'rpc'},get content() {return [{type:'text',text}]}}
  let reads = 0
  const host = {findHumans:Host.prototype.findHumans,humanTasks:{current:()=>message},runtime:{async agentCommand(_id,command) {
    reads++
    const {query} = JSON.parse(command.input)
    const humans = query === 'Alex' ? [first,second] : query === 'alice2' ? [second] : [first,second].filter(person=>person.name === query)
    return {output:JSON.stringify({data:{data:{humans}}})}
  }}}
  const check = (action,args)=>Host.prototype.checkAssignee.call(host,'chat',message,{verb:'call',name:action,input:JSON.stringify(args)})
  await assert.rejects(check('task.assign',{assignee:first.name}),/Several people/)
  await assert.rejects(check('task.create',{tasks:[{assignee:'Alex'}]}),/Several people/)
  host.assigneeAnswers = new WeakMap([[message,{answers:['登录名 alice2']}]])
  await check('task.assign',{assignee:second.name})
  await assert.rejects(check('task.assign',{assignee:first.name}),/Several people/)
  await assert.rejects(check('task.assign',{assignee:'Alex'}),/Several people/)
  const prior = reads
  await check('task.update',{title:'Keep the owner'})
  text = 'Assign it to @'+second.name
  await check('task.assign',{assignee:second.name})
  assert.equal(reads,prior)
})

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

import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {once} from 'node:events'
import {setTimeout as delay} from 'node:timers/promises'
import {WebSocketServer} from 'ws'
import {CatalogWatch} from '../backend/catalog-watch.ts'
import {ProtectedStream} from '../backend/stream.ts'
const waitFor=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await delay(10)}throw new Error('condition not reached')}
async function fixture(t,handler){
  const http=createServer(),ws=new WebSocketServer({server:http}),requests=[]
  http.listen(0,'127.0.0.1');await once(http,'listening')
  const base=`http://127.0.0.1:${http.address().port}`
  ws.on('connection',(socket,request)=>{requests.push(request);handler(socket,request,requests.length)})
  t.after(async()=>{for(const socket of ws.clients)socket.terminate();await new Promise(resolve=>ws.close(resolve));await new Promise(resolve=>http.close(resolve))})
  return {base,requests,tokens:{async credential(){return {resource:base+'/api/v1/workspaces/workspace/external/agent',access_token:'synthetic-stream-access',workspace_id:'workspace'}}},scope:{serverBaseUrl:base,workspaceId:'workspace',accountId:'account',installationId:'installation',hostWorkspaceId:'host',sessionId:'',catalog:'skills'}}
}
const hello=(extra={})=>({kind:'hello',type:'skill_catalog',workspaceId:'workspace',agentMemberId:'agent',generation:'skill-catalog-v1:workspace',subscriptionId:'subscription',latestEventSeq:5,retainedFromSeq:2,resumeFrom:0,snapshotRequired:true,...extra})

test('catalog snapshot is notified and acknowledged; reconnect uses the acknowledged cursor and private header',async t=>{
  const acks=[],events=[]
  const f=await fixture(t,(socket,request,count)=>{
    socket.send(JSON.stringify(hello(count>1?{snapshotRequired:false}:{})))
    socket.on('message',raw=>{
      const ack=JSON.parse(raw);acks.push(ack)
      if(count===1)socket.close()
    })
  })
  const watch=new CatalogWatch(f.tokens,async()=>f.scope,event=>events.push(event));t.after(()=>watch.dispose())
  await waitFor(()=>f.requests.length===2)
  assert.equal(new URL(f.requests[1].url,f.base).searchParams.get('afterEventSeq'),'5')
  assert.equal(f.requests[0].headers.authorization,'Bearer synthetic-stream-access')
  assert.ok(!f.requests[0].url.includes('synthetic-stream-access'))
  assert.equal(acks[0].ackedEventSeq,5)
  assert.ok(events.some(item=>item.event.reason==='snapshot'))
  await watch.dispose()
  assert.equal(f.requests.length,2)
})

test('catalog events use current binding scope, acknowledge unknown kinds and reject unsafe revisions',async t=>{
  const acks=[],events=[];let socket,currentScope
  const f=await fixture(t,client=>{socket=client;client.send(JSON.stringify(hello({snapshotRequired:false})));client.on('message',raw=>acks.push(JSON.parse(raw)))})
  currentScope=f.scope
  const watch=new CatalogWatch(f.tokens,async()=>currentScope,event=>events.push(event));t.after(()=>watch.dispose())
  await waitFor(()=>events.length===1)
  currentScope={...f.scope,bindingRevision:'new-binding'}
  socket.send(JSON.stringify({kind:'event',event:{eventId:'e6',eventSeq:6,type:'skill.catalog_changed',payload:{revision:1}}}))
  socket.send(JSON.stringify({kind:'event',event:{eventId:'e7',eventSeq:7,type:'future.kind',payload:{}}}))
  await waitFor(()=>acks.length===2)
  assert.equal(events[1].scope.bindingRevision,'new-binding')
  assert.equal(acks[1].ackedEventSeq,7)
  socket.send('{"kind":"event","event":{"eventId":"e8","eventSeq":8,"type":"skill.catalog_changed","payload":{"revision":9007199254740993}}}')
  await waitFor(()=>events.some(item=>item.event.status?.state==='backoff'))
  assert.equal(acks.length,2)
  await watch.dispose()
})

test('a mismatched stream hello emits no live state or catalog data',async t=>{
  const events=[]
  const f=await fixture(t,socket=>socket.send(JSON.stringify(hello({workspaceId:'other'}))))
  const watch=new CatalogWatch(f.tokens,async()=>f.scope,event=>events.push(event));t.after(()=>watch.dispose())
  await waitFor(()=>events.length>0)
  assert.deepEqual(events.map(item=>item.event.status?.state),['backoff'])
  await watch.dispose()
})

test('stream cancellation closes the socket and rejects a blocked reader',async t=>{
  const f=await fixture(t,()=>{}),control=new AbortController()
  const stream=await ProtectedStream.open(f.tokens,'/catalog/events',{},control.signal)
  const read=stream.read();control.abort()
  await assert.rejects(read,{code:'loop-host/cancelled'})
  await assert.rejects(stream.read(),{code:'loop-host/cancelled'})
})

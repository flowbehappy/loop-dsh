import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer,request} from 'node:http'
import {once} from 'node:events'
import WebSocket,{WebSocketServer} from 'ws'
import {YamuxTransport,YamuxSocket,createYamux} from '../backend/yamux.ts'

test('production yamux transport preserves four concurrent large HTTP streams', {timeout:30_000}, async t => {
  const relay = new WebSocketServer({host:'127.0.0.1',port:0})
  await once(relay,'listening')
  const accepted = once(relay,'connection')
  const clientSocket = new WebSocket(`ws://127.0.0.1:${relay.address().port}`,{maxPayload:8<<20,perMessageDeflate:false})
  const [serverSocket] = await accepted
  await once(clientSocket,'open')
  const client=createYamux(new YamuxTransport(clientSocket,'outbound'))
  const server=createYamux(new YamuxTransport(serverSocket,'inbound'))
  const http=createServer((req,res)=>{res.writeHead(200,{'Content-Length':req.headers['content-length']});req.pipe(res)})
  server.addEventListener('stream',event=>{const socket=new YamuxSocket(event.detail);socket.on('error',()=>{});http.emit('connection',socket)})
  t.after(()=>{client.abort(new Error('done'));server.abort(new Error('done'));clientSocket.terminate();serverSocket.terminate();http.closeAllConnections();relay.close()})
  await Promise.all(Array.from({length:4},async(_,index)=>{
    const payload=Buffer.alloc(700000+index,index+65),stream=await client.createStream()
    const echoed=await new Promise((resolve,reject)=>{
      const req=request({method:'POST',path:'/',host:'localhost',headers:{'Content-Length':payload.length},createConnection:()=>new YamuxSocket(stream)},res=>{
        const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve(Buffer.concat(chunks)));res.on('error',reject)
      })
      req.on('error',reject);req.end(payload)
    })
    assert.deepEqual(echoed,payload)
  }))
})

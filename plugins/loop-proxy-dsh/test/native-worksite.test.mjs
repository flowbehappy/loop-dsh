import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {once} from 'node:events'
import {setTimeout as delay} from 'node:timers/promises'
import WebSocket,{WebSocketServer} from 'ws'
import {createYamux,YamuxTransport,YamuxSocket} from '../backend/yamux.ts'
import {WorksiteClient,validateWorksite} from '../backend/worksite.ts'
const waitFor=async predicate=>{for(let i=0;i<300;i++){if(predicate())return;await delay(10)}throw new Error('condition not reached')}
async function fixture(t){
  const observed=[],relayHeaders=[],muxers=[],sockets=[]
  const local=createServer((req,res)=>{
    if(req.url==='/?token=process-secret'){res.writeHead(302,{'Set-Cookie':'dsh-auth-private=process-cookie; HttpOnly','Location':'/'});res.end();return}
    observed.push(req.headers)
    res.writeHead(200,{'Content-Length':req.headers['content-length']??0,'Set-Cookie':'private=must-not-leak'})
    req.pipe(res)
  })
  const localWS=new WebSocketServer({noServer:true})
  localWS.on('headers',headers=>headers.push('Set-Cookie: secret=private'))
  local.on('upgrade',(request,socket,head)=>{observed.push(request.headers);localWS.handleUpgrade(request,socket,head,client=>{client.on('message',data=>client.send(data))})})
  local.listen(0,'127.0.0.1');await once(local,'listening')
  const relay=createServer(),ws=new WebSocketServer({server:relay})
  relay.listen(0,'127.0.0.1');await once(relay,'listening')
  ws.on('connection',(socket,request)=>{relayHeaders.push(request.headers);sockets.push(socket);muxers.push(createYamux(new YamuxTransport(socket,'inbound')))})
  const publicOrigin=`http://127.0.0.1:${relay.address().port}`
  const config={worksiteUrl:publicOrigin,publicOrigin,webServerOrigin:`http://127.0.0.1:${local.address().port}`,authenticatedUrl:publicOrigin+'/?token=process-secret',hostGeneration:'generation',hostKind:'web',installationId:'installation',proof:'proof-'.repeat(8)}
  const client=new WorksiteClient(config)
  t.after(async()=>{await client.dispose();for(const socket of localWS.clients)socket.terminate();await new Promise(resolve=>localWS.close(resolve));for(const mux of muxers)mux.abort(new Error('test done'));for(const socket of sockets)socket.terminate();await new Promise(resolve=>ws.close(resolve));local.closeAllConnections();relay.closeAllConnections();await Promise.all([new Promise(resolve=>local.close(resolve)),new Promise(resolve=>relay.close(resolve))])})
  async function exchange(raw){
    const stream=await muxers.at(-1).createStream()
    const result=new Promise((resolve,reject)=>{
      let data=Buffer.alloc(0)
      stream.addEventListener('message',event=>{
        data=Buffer.concat([data,Buffer.from(event.data.subarray())]);const end=data.indexOf('\r\n\r\n')
        if(end<0)return
        const header=data.subarray(0,end).toString(),length=/content-length: (\d+)/iu.exec(header)
        if(length && data.length>=end+4+Number(length[1]))resolve({header,body:data.subarray(end+4)})
      })
      stream.addEventListener('end',()=>resolve({header:data.toString(),body:Buffer.alloc(0)}))
      stream.addEventListener('abort',()=>reject(new Error('stream aborted')))
    })
    stream.send(raw)
    let timer
    try{return await Promise.race([result,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('response timeout')),5000)})])}finally{clearTimeout(timer);stream.abort(new Error('request complete'))}
  }
  client.start();await waitFor(()=>client.status().state==='connected')
  return {client,config,observed,relayHeaders,sockets,exchange,async websocket(){
    const stream=await muxers.at(-1).createStream()
    const socket=new WebSocket(publicOrigin.replace('http:','ws:')+'/socket',{createConnection:()=>new YamuxSocket(stream),headers:{Cookie:'attacker=bad',Authorization:'attacker'}})
    return socket
  }}
}

test('Worksite injects only the private Host cookie and streams bounded HTTP without returning cookies',async t=>{
  const f=await fixture(t),host=new URL(f.config.publicOrigin).host,payload=Buffer.alloc(600000,'a')
  const result=await f.exchange(Buffer.concat([Buffer.from(`POST /stream HTTP/1.1\r\nHost: ${host}\r\nContent-Length: ${payload.length}\r\nCookie: attacker=value\r\nAuthorization: attacker\r\nX-Forwarded-Host: attacker\r\n\r\n`),payload]))
  assert.match(result.header,/200/);assert.ok(!/set-cookie/iu.test(result.header));assert.deepEqual(result.body,payload)
  assert.equal(f.observed[0].cookie,'dsh-auth-private=process-cookie')
  assert.equal(f.observed[0].authorization,undefined);assert.equal(f.observed[0]['x-forwarded-host'],undefined)
  assert.equal(f.relayHeaders[0].authorization,'WorksiteInstallation '+f.config.proof)
})

test('Worksite rejects wrong Host/origin and reconnects after transport loss',async t=>{
  const f=await fixture(t),host=new URL(f.config.publicOrigin).host
  for(const headers of ['Host: elsewhere',`Host: ${host}\r\nOrigin: https://elsewhere`]){
    const result=await f.exchange(Buffer.from(`GET / HTTP/1.1\r\n${headers}\r\nConnection: close\r\n\r\n`))
    assert.match(result.header,/400/)
  }
  assert.equal(f.observed.length,0)
  f.sockets[0].terminate()
  await waitFor(()=>f.sockets.length===2 && f.client.status().state==='connected')
  await f.client.dispose();assert.equal(f.client.status().running,false)
})

test('Worksite configuration cannot redirect local process authentication to an external target',()=>{
  const config={worksiteUrl:'https://worksite.example',publicOrigin:'https://worksite.example',webServerOrigin:'http://127.0.0.1:4000',authenticatedUrl:'https://worksite.example/?token=secret',hostGeneration:'generation',hostKind:'web',installationId:'installation',proof:'x'.repeat(43)}
  assert.doesNotThrow(()=>validateWorksite(config))
  assert.throws(()=>validateWorksite({...config,webServerOrigin:'https://outside.example'}))
  assert.throws(()=>validateWorksite({...config,authenticatedUrl:'https://outside.example/?token=secret'}))
  assert.throws(()=>validateWorksite({...config,publicOrigin:'https://other.example'}))
})


test('Worksite WebSocket upgrades preserve streaming and hide process cookies',async t=>{
  const f=await fixture(t),socket=await f.websocket()
  t.after(()=>socket.terminate())
  const [response]=await once(socket,'upgrade')
  assert.equal(response.headers['set-cookie'],undefined)
  if(socket.readyState!==WebSocket.OPEN)await once(socket,'open')
  const message=once(socket,'message');socket.send('hello through yamux')
  assert.equal((await message)[0].toString(),'hello through yamux')
  assert.equal(f.observed[0].cookie,'dsh-auth-private=process-cookie')
  assert.equal(f.observed[0].authorization,undefined)
  const closed=once(socket,'close');await f.client.dispose();await closed
})

test('Worksite callback registrations stay private and are removed on cancellation',async t=>{
  const f=await fixture(t),host=new URL(f.config.publicOrigin).host
  let received
  const registration=f.client.registerCallback((req,res)=>{received=req.url;res.writeHead(200,{'Content-Length':'2'});res.end('ok')})
  const target=new URL(registration.url)
  const first=await f.exchange(Buffer.from(`GET ${target.pathname}?code=synthetic HTTP/1.1\r\nHost: ${host}\r\n\r\n`))
  assert.equal(first.body.toString(),'ok');assert.equal(received,'/callback?code=synthetic')
  registration.dispose()
  const after=await f.exchange(Buffer.from(`GET ${target.pathname} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`))
  assert.match(after.header,/404/)
})

test('an established Worksite reconnects without an Agent credential and never mints an offline proof',async t=>{
  const {LoopBackend}=await import('../backend/runtime.ts')
  const {createHash}=await import('node:crypto')
  const f=await fixture(t)
  await f.client.dispose()
  const key='loop-host/installation-proof-'+createHash('sha256').update(JSON.stringify([f.config.worksiteUrl,'owner'])).digest('hex')
  const records=new Map([[key,{kind:'grant',payload:{schema:1,server:f.config.worksiteUrl,principal:'owner',proof:f.config.proof}}]])
  const provider={async readRecord(key){return structuredClone(records.get(key))},async modifyRecord(key,mutate){const next=await mutate(structuredClone(records.get(key)));if(next!==undefined)records.set(key,next);return structuredClone(records.get(key))}}
  const backend=new LoopBackend({provider,server:f.config.worksiteUrl,installation:'installation',pageOrigin:f.config.publicOrigin,fetch:async()=>{throw new Error('offline Worksite must not request Agent authority')}})
  t.after(()=>backend.dispose())
  const context={accountPrincipal:'owner',workspaceId:'workspace',sessionId:'host'}
  await backend.worksiteStart(context,f.config)
  await waitFor(()=>backend.worksiteStatus().state==='connected')
  assert.equal(f.relayHeaders.at(-1).authorization,'WorksiteInstallation '+f.config.proof)
  await backend.worksiteStop()
  await assert.rejects(backend.worksiteStart({...context,accountPrincipal:'other'},f.config),{code:'loop-host/needs-auth'})
  assert.equal(records.size,1)
})

test('remote OAuth completes PKCE through the Worksite yamux callback and removes the route',async t=>{
  const {beginHostLogin}=await import('../backend/oauth.ts')
  const {createHash}=await import('node:crypto')
  const {HostCredentialStore}=await import('../backend/credentials.ts')
  const f=await fixture(t),base='http://127.0.0.1:4999',records=new Map()
  const provider={async readRecord(key){return structuredClone(records.get(key))},async modifyRecord(key,mutate){const next=await mutate(structuredClone(records.get(key)));if(next!==undefined)records.set(key,next);return structuredClone(records.get(key))}}
  let registration,authorization,exchanges=0
  const login=await beginHostLogin({provider,server:base,installation:'installation',pageOrigin:f.config.publicOrigin,callbackBroker:f.client,fetch:async(url,init)=>{
    if(String(url).includes('/.well-known/'))return Response.json({issuer:base+'/api/v1/auth/oauth',authorization_endpoint:base+'/authorize',registration_endpoint:base+'/register',token_endpoint:base+'/token'})
    if(String(url).endsWith('/register')){registration=JSON.parse(init.body);return Response.json({...registration,client_id:'remote-client'})}
    exchanges++
    const body=new URLSearchParams(init.body)
    assert.equal(body.get('redirect_uri'),registration.redirect_uris[0])
    assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'),authorization.searchParams.get('code_challenge'))
    assert.equal(body.get('code'),'remote-code')
    return Response.json({access_token:'remote-access-synthetic',refresh_token:'remote-refresh-synthetic',token_type:'Bearer',expires_in:3600,scope:'loop.host offline_access',workspace_id:'workspace',principal_id:'owner',grant_id:'grant'})
  }})
  t.after(()=>login.cancel())
  authorization=new URL(login.authorizationURL)
  const callback=new URL(authorization.searchParams.get('redirect_uri'))
  assert.equal(callback.origin,f.config.publicOrigin)
  assert.match(callback.pathname,/\/__loop\/worksite\/callback\/installation\//)
  const query=new URLSearchParams({state:authorization.searchParams.get('state'),workspace_id:'workspace',code:'remote-code',page_launch:'page-assertion',page_origin:f.config.publicOrigin,page_launch_expires_in:'60'})
  const send=async params=>f.exchange(Buffer.from(`GET ${callback.pathname}?${params} HTTP/1.1\r\nHost: ${callback.host}\r\nConnection: close\r\n\r\n`))
  const wrong=new URLSearchParams(query);wrong.set('state','wrong')
  assert.match((await send(wrong)).header,/400/);assert.equal(exchanges,0)
  assert.match((await send(query)).header,/200/)
  const result=await login.result
  assert.equal(result.credential.principal_id,'owner')
  assert.equal((await new HostCredentialStore(provider,base,'workspace','installation').read()).grant_id,'grant')
  assert.equal(exchanges,1)
  assert.match((await send(query)).header,/404/,'consumed callback cannot be used again')
  assert.equal(f.observed.length,0,'OAuth callback is not forwarded to DSH')
})

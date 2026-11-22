import {randomBytes} from "node:crypto"
import {createServer,request as httpRequest} from "node:http"
import {request as httpsRequest} from "node:https"
import type {IncomingMessage,ServerResponse,ClientRequest,RequestListener} from "node:http"
import type {Duplex} from "node:stream"
import {once} from "node:events"
import {setTimeout as delay} from "node:timers/promises"
import WebSocket from "ws"
import {YamuxTransport,YamuxSocket,createYamux} from "./yamux.ts"
import {LoopError,requireActive} from "./errors.ts"

export interface WorksiteConfig {worksiteUrl:string;webServerOrigin:string;authenticatedUrl:string;publicOrigin:string;hostGeneration:string;hostKind:"web"|"desktop";installationId:string;proof:string}
const hidden=new Set(["authorization","cookie","forwarded","x-forwarded-for","x-forwarded-host","x-forwarded-proto","proxy-authorization","proxy-connection"])
function transportHeaders(source:IncomingMessage["headers"],upgrade=false){
  const result={...source}
  const nominated=String(source.connection??"").toLowerCase().split(",").map(name=>name.trim())
  for(const name of ["connection","keep-alive","proxy-authenticate","proxy-authorization","proxy-connection","te","trailer","transfer-encoding","upgrade",...nominated])delete result[name]
  if(upgrade){result.connection="Upgrade";result.upgrade="websocket"}
  return result
}
function origin(value:string,local=false){
  const url=new URL(value)
  if(!["http:","https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname!=="/" || local && !["127.0.0.1","localhost","[::1]"].includes(url.hostname))throw new LoopError("loop-host/invalid-request","Invalid Worksite origin")
  return url
}
export function validateWorksite(input:WorksiteConfig){
  const local=origin(input.webServerOrigin,true),publicURL=origin(input.publicOrigin),relay=origin(input.worksiteUrl),authenticated=new URL(input.authenticatedUrl)
  if(publicURL.origin!==relay.origin || relay.protocol!=="https:" && !["localhost","127.0.0.1","[::1]"].includes(relay.hostname) && !relay.hostname.endsWith(".localhost") ||
     authenticated.origin!==publicURL.origin || authenticated.username || authenticated.password || authenticated.hash || !authenticated.searchParams.get("token") ||
     !input.installationId || !input.hostGeneration || !["web","desktop"].includes(input.hostKind) || input.proof.length<32 || input.proof.length>512)throw new LoopError("loop-host/invalid-request","Invalid Worksite Host identity")
  return {local,publicURL,relay,authenticated}
}
/** Fixed-target streaming reverse proxy. DSH's process cookie remains entirely
 * inside this Host; browser headers cannot select a target or supply authority. */
export class WorksiteClient {
  private config:WorksiteConfig
  private parsed:ReturnType<typeof validateWorksite>
  private control=new AbortController()
  private completion?:Promise<void>
  private wake?:()=>void
  private state="connecting"
  private notify:(state:string)=>void
  private requests=new Set<ClientRequest>()
  private callbacks=new Map<string,RequestListener>()
  constructor(config:WorksiteConfig,notify:(state:string)=>void=()=>{}){this.parsed=validateWorksite(config);this.config={...config};this.notify=notify}
  registerCallback(handler:RequestListener){
    if(this.control.signal.aborted)throw new LoopError("loop-host/unavailable","Worksite is stopped")
    const token=randomBytes(32).toString("hex")
    const path="/__loop/worksite/callback/"+encodeURIComponent(this.config.installationId)+"/"+token
    this.callbacks.set(path,handler)
    return {url:this.parsed.publicURL.origin+path,dispose:()=>{this.callbacks.delete(path)}}
  }
  status(){return {state:this.state,running:!!this.completion && !this.control.signal.aborted}}
  private changed(state:string){if(this.state===state)return;this.state=state;try{this.notify(state)}catch{}}
  start(){if(!this.completion){this.completion=this.run();void this.completion.catch(()=>{})}else this.wake?.();return this.status()}
  async dispose(){this.control.abort();this.callbacks.clear();this.wake?.();for(const request of this.requests)request.destroy();await this.completion;this.changed("offline")}
  private async cookie():Promise<string>{
    const {local,publicURL,authenticated}=this.parsed
    const endpoint=new URL(authenticated.pathname+authenticated.search,local)
    return new Promise((resolve,reject)=>{
      const request=(local.protocol==="https:"?httpsRequest:httpRequest)(endpoint,{method:"GET",headers:{Host:publicURL.host},signal:this.control.signal},response=>{
        response.resume()
        if(!response.statusCode || response.statusCode<200 || response.statusCode>=400){reject(new LoopError("loop-host/unavailable","DSH authentication was rejected"));return}
        const cookies=(response.headers["set-cookie"]??[]).map(value=>value.split(";",1)[0]).filter(value=>/^dsh-auth-[^=]+=.+$/u.test(value))
        if(!cookies.length){reject(new LoopError("loop-host/unavailable","DSH authentication returned no Host cookie"));return}
        resolve(cookies.join("; "))
      })
      this.requests.add(request);request.once("close",()=>this.requests.delete(request))
      request.setTimeout(15_000,()=>request.destroy())
      request.once("error",()=>reject(new LoopError("loop-host/unavailable","DSH authentication failed")))
      request.end()
    })
  }
  private allowed(request:IncomingMessage):boolean{
    return request.method!=="CONNECT" && !!request.url?.startsWith("/") && !request.url.startsWith("//") && !/[\\\x00-\x20]/u.test(request.url) && request.headers.host?.toLowerCase()===this.parsed.publicURL.host.toLowerCase() && (!request.headers.origin || request.headers.origin===this.parsed.publicURL.origin)
  }
  private upstream(request:IncomingMessage,cookie:string){
    const headers=transportHeaders(request.headers,request.headers.upgrade?.toLowerCase()==="websocket")
    for(const key of Object.keys(headers))if(hidden.has(key))delete headers[key]
    headers.host=this.parsed.publicURL.host;headers.cookie=cookie
    return (this.parsed.local.protocol==="https:"?httpsRequest:httpRequest)({protocol:this.parsed.local.protocol,hostname:this.parsed.local.hostname.replace(/^\[|\]$/gu,""),port:this.parsed.local.port,
      method:request.method,path:request.url,headers,signal:this.control.signal})
  }
  private track(request:ClientRequest){this.requests.add(request);request.once("close",()=>this.requests.delete(request))}
  private proxy(request:IncomingMessage,response:ServerResponse,cookie:string){
    if(!this.allowed(request)){response.writeHead(400);response.end("Invalid Worksite request");return}
    if(request.url!.startsWith("/__loop/worksite/callback/")){
      const url=new URL(request.url!,this.parsed.publicURL)
      const callback=this.callbacks.get(url.pathname)
      if(!callback || !["GET","POST"].includes(request.method??"")){response.writeHead(404);response.end();return}
      request.url="/callback"+url.search
      try{callback(request,response)}catch{response.destroy()}
      return
    }
    const upstream=this.upstream(request,cookie);this.track(upstream)
    upstream.once("response",remote=>{
      const headers=transportHeaders(remote.headers);delete headers["set-cookie"]
      response.writeHead(remote.statusCode??502,headers);remote.pipe(response)
      remote.once("error",()=>response.destroy())
    })
    upstream.once("error",()=>{if(!response.headersSent){response.writeHead(502);response.end("DeepSeek Harness Host is unavailable")}else response.destroy()})
    request.once("aborted",()=>upstream.destroy());response.once("close",()=>upstream.destroy());request.pipe(upstream)
  }
  private upgrade(request:IncomingMessage,socket:Duplex,head:Buffer,cookie:string){
    if(!this.allowed(request)||request.headers.upgrade?.toLowerCase()!=="websocket"){socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");return}
    const upstream=this.upstream(request,cookie);this.track(upstream)
    upstream.once("upgrade",(response,remote,remoteHead)=>{
      const headers=Object.entries(transportHeaders(response.headers,true)).filter(([name])=>name!=="set-cookie").flatMap(([name,value])=>(Array.isArray(value)?value:[value]).map(value=>`${name}: ${value}`))
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headers.join("\r\n")}\r\n\r\n`)
      if(remoteHead.length)socket.write(remoteHead);if(head.length)remote.write(head)
      socket.pipe(remote).pipe(socket)
      socket.once("close",()=>remote.destroy());remote.once("close",()=>socket.destroy());remote.on("error",()=>socket.destroy());socket.on("error",()=>remote.destroy())
    })
    upstream.once("response",response=>{response.resume();socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n")})
    upstream.once("error",()=>socket.destroy());socket.once("close",()=>upstream.destroy());upstream.end()
  }
  private async connected(){
    const url=new URL("/api/v1/worksite/host",this.parsed.relay);url.protocol=url.protocol==="https:"?"wss:":"ws:"
    const socket=new WebSocket(url,{followRedirects:false,handshakeTimeout:20_000,maxPayload:8<<20,perMessageDeflate:false,headers:{
      Authorization:"WorksiteInstallation "+this.config.proof,"X-Loop-Worksite-Installation":this.config.installationId,"X-Loop-Worksite-Generation":this.config.hostGeneration,
      "X-Loop-Worksite-Host-Kind":this.config.hostKind,"X-Loop-Worksite-Public-Origin":this.parsed.publicURL.origin}})
    const stop=()=>socket.terminate();this.control.signal.addEventListener("abort",stop,{once:true})
    const transport=new YamuxTransport(socket)
    let rejection="offline"
    socket.on("unexpected-response",(_request,response)=>{rejection=({401:"needs_enable",403:"registration_conflict",409:"state_changed",400:"blocked",404:"blocked",426:"blocked"} as Record<number,string>)[response.statusCode??0]??"offline";response.resume();socket.terminate()})
    const closed=once(socket,"close").catch(()=>{})
    let mux:ReturnType<typeof createYamux>|undefined
    const server=createServer()
    try{
      await Promise.race([once(socket,"open"),closed.then(()=>{throw new Error("closed")})]);requireActive(this.control.signal)
      const cookie=await this.cookie()
      mux=createYamux(transport)
      server.on("request",(request,response)=>this.proxy(request,response,cookie))
      server.on("upgrade",(request,socket,head)=>this.upgrade(request,socket,head,cookie))
      server.on("connect",(_request,socket)=>socket.destroy())
      server.headersTimeout=10_000;server.requestTimeout=120_000;server.keepAliveTimeout=120_000
      mux.addEventListener("stream",event=>{const streamSocket=new YamuxSocket(event.detail);streamSocket.on("error",()=>{});server.emit("connection",streamSocket)})
      this.changed("connected");await closed
    }catch{this.changed(rejection)}finally{this.control.signal.removeEventListener("abort",stop);server.closeAllConnections();mux?.abort(new Error("Worksite disconnected"));transport.abort(new Error("Worksite disconnected"));socket.terminate()}
  }
  private async run(){
    let backoff=250
    while(!this.control.signal.aborted){
      await this.connected()
      if(this.control.signal.aborted)break
      if(this.state==="connected")this.changed("offline")
      const minimum=this.state==="needs_enable"?15_000:["registration_conflict","state_changed","blocked"].includes(this.state)?30_000:250
      backoff=Math.max(backoff,minimum)
      const wake=new AbortController();this.wake=()=>wake.abort()
      await delay(backoff,undefined,{signal:AbortSignal.any([this.control.signal,wake.signal])}).catch(()=>{})
      this.wake=undefined;backoff=Math.min(backoff*2,minimum===250?5000:minimum*2)
    }
  }
}

import WebSocket from "ws"
import {TokenManager} from "./http.ts"
import {parseWire,stringifyWire} from "./codec.ts"
import {LoopError,requireActive} from "./errors.ts"

// Both Loop streams send a heartbeat every 25 seconds. Allow several missed
// beats, but do not trust OPEN after sleep or a silent network change.
const RECEIVE_TIMEOUT_MS=90_000
const LIVENESS_CHECK_MS=15_000

/** Bounded authenticated stream with no redirect or credential-bearing URL. */
export class ProtectedStream {
  private socket:WebSocket
  private queue:any[]=[]
  private reader?:{resolve:(value:any)=>void;reject:(error:unknown)=>void}
  private failure?:LoopError
  private signal?:AbortSignal
  private abort:()=>void
  private opened:Promise<void>
  private lastReceivedAt=0
  private liveness?:ReturnType<typeof setInterval>
  constructor(url:URL,headers:Record<string,string>,signal?:AbortSignal){
    requireActive(signal);this.signal=signal
    this.socket=new WebSocket(url,{headers,followRedirects:false,handshakeTimeout:20_000,maxPayload:2<<20,perMessageDeflate:false})
    this.abort=()=>this.close()
    signal?.addEventListener("abort",this.abort,{once:true})
    this.opened=new Promise((resolve,reject)=>{
      this.socket.once("open",()=>{
        if(this.failure){this.socket.terminate();reject(this.failure);return}
        this.lastReceivedAt=Date.now()
        this.liveness=setInterval(()=>this.checkLiveness(),LIVENESS_CHECK_MS)
        this.liveness.unref()
        resolve()
      })
      this.socket.once("error",()=>reject(new LoopError("loop-host/backend-unavailable","Loop stream connection failed")))
      this.socket.once("close",()=>reject(new LoopError("loop-host/backend-unavailable","Loop stream closed before opening")))
    })
    void this.opened.catch(()=>{})
    this.socket.on("message",(bytes,binary)=>{
      if(this.failure)return
      try{
        if(binary)throw new Error("binary frame")
        const value=parseWire(bytes.toString())
        this.lastReceivedAt=Date.now()
        if(this.reader){const reader=this.reader;this.reader=undefined;reader.resolve(value)}
        else{if(this.queue.length>=64)throw new Error("queue budget");this.queue.push(value)}
      }catch{this.end(new LoopError("loop-host/backend-invalid","Invalid or excessive Loop stream frames"));this.socket.terminate()}
    })
    // Control frames arrive even when the application consumer is busy.
    this.socket.on("ping",()=>{if(!this.failure)this.lastReceivedAt=Date.now()})
    this.socket.on("pong",()=>{if(!this.failure)this.lastReceivedAt=Date.now()})
    this.socket.on("error",()=>this.end(new LoopError("loop-host/backend-unavailable","Loop stream failed")))
    this.socket.once("close",()=>{signal?.removeEventListener("abort",this.abort);this.end(new LoopError("loop-host/backend-unavailable","Loop stream closed"))})
  }
  static async open(tokens:TokenManager,suffix:string,query:Record<string,string>,signal?:AbortSignal){
    const credential=await tokens.credential(signal)
    if(!["/catalog/events","/collaboration/stream"].includes(suffix))throw new LoopError("loop-host/invalid-request","Unsupported Loop stream")
    const url=new URL(credential.resource.replace(/\/external\/agent$/u,"")+suffix)
    url.protocol=url.protocol==="https:"?"wss:":"ws:"
    url.search=new URLSearchParams(query).toString()
    const headers:Record<string,string>={Authorization:"Bearer "+credential.access_token}
    if(credential.device_credential)headers["X-Loop-Super-Agent-Device"]=credential.device_credential
    const stream=new ProtectedStream(url,headers,signal)
    try{await stream.opened;requireActive(signal);return stream}catch(error){stream.close();throw error}
  }
  private stale(){const elapsed=Date.now()-this.lastReceivedAt;return elapsed<0||elapsed>=RECEIVE_TIMEOUT_MS}
  private checkLiveness(){
    if(!this.failure&&this.socket.readyState===WebSocket.OPEN&&this.stale()){
      this.end(new LoopError("loop-host/backend-unavailable","Loop stream heartbeat timed out"))
      this.socket.terminate()
    }
  }
  get connected(){return !this.failure&&this.socket.readyState===WebSocket.OPEN&&!this.stale()}
  private end(error:LoopError){clearInterval(this.liveness);this.liveness=undefined;this.failure??=error;this.reader?.reject(this.failure);this.reader=undefined}
  async read():Promise<any>{
    requireActive(this.signal)
    this.checkLiveness()
    if(this.failure)throw this.failure
    if(this.queue.length)return this.queue.shift()
    if(this.reader)throw new LoopError("loop-host/conflict","Concurrent stream readers are not supported")
    return new Promise((resolve,reject)=>{this.reader={resolve,reject}})
  }
  async send(value:unknown):Promise<void>{
    requireActive(this.signal);if(this.failure)throw this.failure
    const data=stringifyWire(value)
    if(Buffer.byteLength(data)>2<<20)throw new LoopError("loop-host/invalid-request","Stream frame is too large")
    await new Promise<void>((resolve,reject)=>this.socket.send(data,error=>error?reject(new LoopError("loop-host/backend-unavailable","Loop stream send failed")):resolve()))
  }
  close(){this.signal?.removeEventListener("abort",this.abort);this.end(new LoopError("loop-host/cancelled","Loop stream stopped"));this.queue=[];this.socket.terminate()}
}

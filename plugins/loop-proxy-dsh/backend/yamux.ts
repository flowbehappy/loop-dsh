import {AbstractMessageStream} from "@libp2p/utils"
import {yamux} from "@libp2p/yamux"
import WebSocket from "ws"
import {Duplex} from "node:stream"
import type {YamuxMuxerInit} from "@libp2p/yamux"

// Never log transport frames or Host credentials through a dependency logger.
const silent:any=Object.assign(()=>{}, {trace:()=>{},error:()=>{},enabled:false,newScope:()=>silent})
/** Actual WebSocket transport, not an in-memory connection-pair adapter. */
export class YamuxTransport extends AbstractMessageStream {
  private socket:WebSocket
  constructor(socket:WebSocket,direction:"inbound"|"outbound"="outbound"){
    super({log:silent,direction,maxMessageSize:64<<10,maxReadBufferLength:8<<20,maxWriteBufferLength:8<<20,inactivityTimeout:120_000})
    this.socket=socket
    socket.on("message",(data,binary)=>{
      if(!binary){this.abort(new Error("Expected binary Worksite transport"));return}
      try{this.onData(Buffer.isBuffer(data)?data:Buffer.from(data as ArrayBuffer))}catch{this.abort(new Error("Invalid Worksite transport data"))}
    })
    socket.on("error",()=>this.onTransportClosed(new Error("Worksite transport failed")))
    socket.once("close",()=>this.onTransportClosed())
  }
  sendData(data:Parameters<AbstractMessageStream["sendData"]>[0]){
    if(this.socket.readyState!==WebSocket.OPEN)throw new Error("Worksite transport is closed")
    const bytes=data.subarray()
    this.socket.send(bytes,{binary:true},error=>{
      if(error){this.abort(new Error("Worksite transport write failed"));return}
      this.safeDispatchEvent("drain")
    })
    // One outstanding chunk bounds buffering, with resume on actual socket IO.
    return {sentBytes:bytes.byteLength,canSendMore:false}
  }
  sendReset(){this.socket.terminate()}
  sendPause(){this.socket.pause()}
  sendResume(){this.socket.resume()}
  async close(){this.socket.close();this.onTransportClosed()}
}
export function createYamux(transport:YamuxTransport,options:YamuxMuxerInit={}){
  return yamux({enableKeepAlive:true,keepAliveInterval:15_000,maxInboundStreams:128,maxOutboundStreams:128,maxMessageSize:64<<10,
    streamOptions:{maxStreamWindowSize:1<<20,maxReadBufferLength:2<<20,maxWriteBufferLength:2<<20,inactivityTimeout:120_000},...options})().createStreamMuxer(transport)
}
type MuxStream=ReturnType<typeof createYamux>["streams"][number]
/** Let Node's HTTP parser, streaming and upgrade handling operate on yamux
 * streams, preserving backpressure in both directions. */
export class YamuxSocket extends Duplex {
  readonly remoteAddress="127.0.0.1"
  readonly remoteFamily="IPv4"
  readonly remotePort=0
  private stream:MuxStream
  private timeout?:ReturnType<typeof setTimeout>
  private timeoutMs=0
  constructor(stream:MuxStream){
    super({allowHalfOpen:true,readableHighWaterMark:64<<10,writableHighWaterMark:64<<10})
    this.stream=stream
    stream.addEventListener("message",event=>{this.touch();if(!this.push(Buffer.from(event.data.subarray())))stream.pause()})
    stream.addEventListener("end",()=>this.push(null))
    stream.addEventListener("close",()=>this.destroy())
    stream.addEventListener("abort",()=>this.destroy(new Error("Worksite stream aborted")))
    stream.addEventListener("reset",()=>this.destroy(new Error("Worksite stream reset")))
  }
  private touch(){if(this.timeout)clearTimeout(this.timeout);if(this.timeoutMs){this.timeout=setTimeout(()=>this.emit("timeout"),this.timeoutMs);this.timeout.unref()}}
  setTimeout(ms:number,callback?:()=>void){this.timeoutMs=ms;if(callback)this.once("timeout",callback);this.touch();return this}
  setNoDelay(){return this}
  setKeepAlive(){return this}
  _read(){this.stream.resume()}
  _write(chunk:Buffer,_encoding:BufferEncoding,callback:(error?:Error|null)=>void){
    this.touch()
    try{if(this.stream.send(chunk))callback();else this.stream.onDrain().then(()=>callback(),()=>callback(new Error("Worksite stream closed")))}catch{callback(new Error("Worksite stream write failed"))}
  }
  _final(callback:(error?:Error|null)=>void){this.stream.close().then(()=>callback(),()=>callback(new Error("Worksite stream close failed")))}
  _destroy(error:Error|null,callback:(error?:Error|null)=>void){if(this.timeout)clearTimeout(this.timeout);if(this.stream.status!=="closed")this.stream.abort(error??new Error("Worksite socket closed"));callback(error)}
}

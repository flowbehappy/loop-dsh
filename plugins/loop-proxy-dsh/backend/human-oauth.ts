import {createHash,randomBytes,timingSafeEqual} from "node:crypto"
import {once} from "node:events"
import {createServer} from "node:http"
import type {RequestListener} from "node:http"
import {boundedJSON} from "./http.ts"
import {LoopError,requireActive} from "./errors.ts"

export const humanIssuerPath="/api/v1/auth/oauth/human"
const ttl=300_000
export type HumanSlot="business"|"apps"
export type HumanConsent={allowedActions:string[];resourceConstraints:string[];scope:string}
export type CallbackBroker={registerCallback(handler:RequestListener):{url:string;dispose():void}}
export function humanSlot(value:unknown):HumanSlot {
  if(value===undefined || value==="business")return "business"
  if(value==="apps")return value
  throw new LoopError("loop-host/invalid-request","Invalid Human connection slot")
}
function list(value:unknown,format:RegExp,limit:number):string[] {
  if(!Array.isArray(value) || value.length>limit || value.some(item=>typeof item!=="string" || !format.test(item)))throw new LoopError("loop-host/invalid-request","Invalid Human authorization parameters")
  return [...new Set<string>(value)].sort()
}
export function humanConsent(input:any):HumanConsent {
  const allowedActions=list(input.allowedActions,/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/u,100)
  const resourceConstraints=list(input.resourceConstraints===undefined?[]:input.resourceConstraints,/^[a-z][a-z0-9-]*:[^,\x00-\x1f\x7f:*?]{1,510}$/u,128)
  if(!allowedActions.length || (input.manage!==undefined && typeof input.manage!=="boolean"))throw new LoopError("loop-host/invalid-request","Invalid Human consent request")
  return {allowedActions,resourceConstraints,scope:"loop.human_access"+(input.write===false && !input.manage?"":" loop.human_write")+(input.manage?" loop.human_manage":"")+" offline_access"}
}
export function sameScope(a:unknown,b:string):boolean {
  return typeof a==="string" && a.trim().split(/\s+/u).sort().join(" ")===b.trim().split(/\s+/u).sort().join(" ")
}
export function sameList(a:unknown,b:string[]):boolean {
  return Array.isArray(a) && a.every(item=>typeof item==="string") && JSON.stringify([...a].sort())===JSON.stringify([...b].sort())
}
export type HumanTokens={clientID:string;accessToken:string;refreshToken:string;expiresAt:string;scope:string}
export type HumanOAuth={url:string;expiresAt:string;result:Promise<HumanTokens>;cancel():void}
const noProtocol=()=>new LoopError("loop-host/backend-invalid","Loop did not provide the expected Human OAuth protocol")

export async function beginHumanOAuth(options:{server:string;workspace:string;resource:string;consent:HumanConsent;fetcher:typeof fetch;signal:AbortSignal;broker?:CallbackBroker}):Promise<HumanOAuth>{
  const {server,workspace,resource,consent,fetcher}=options
  const issuer=server+humanIssuerPath
  const authorizationEndpoint=issuer+"/authorize",tokenEndpoint=issuer+"/token",registrationEndpoint=server+"/api/v1/auth/oauth/register"
  const control=new AbortController(), expiresAt=new Date(Date.now()+ttl).toISOString()
  const signal=AbortSignal.any([options.signal,control.signal,AbortSignal.timeout(ttl)])
  const get=async(url:string,init?:RequestInit):Promise<any>=>{
    requireActive(signal)
    try{
      const response=await fetcher(url,{...init,redirect:"error",signal:AbortSignal.any([signal,AbortSignal.timeout(20_000)])})
      if(!response.ok){await response.body?.cancel();throw new LoopError("loop-host/needs-auth","Loop rejected Human authorization",response.status)}
      return await boundedJSON(response,64<<10)
    }catch(error){requireActive(signal);throw error instanceof LoopError?error:noProtocol()}
  }
  const scopes=consent.scope.split(" ")
  function supports(value:unknown,items:string[]){return Array.isArray(value)&&items.every(item=>value.includes(item))}
  const base=new URL(server)
  const resourcePath=new URL(resource).pathname.slice(base.pathname.replace(/\/$/u,"").length)
  const [protectedResource,metadata]=await Promise.all([
    get(server+"/.well-known/oauth-protected-resource"+resourcePath),get(server+"/.well-known/oauth-authorization-server"+humanIssuerPath)
  ])
  if(protectedResource?.resource!==resource || !supports(protectedResource.authorization_servers,[issuer]) || !supports(protectedResource.scopes_supported,scopes) ||
    metadata?.issuer!==issuer || metadata.authorization_endpoint!==authorizationEndpoint || metadata.token_endpoint!==tokenEndpoint || metadata.registration_endpoint!==registrationEndpoint ||
    !supports(metadata.scopes_supported,scopes) || !supports(metadata.code_challenge_methods_supported,["S256"]) || !supports(metadata.token_endpoint_auth_methods_supported,["none"]))throw noProtocol()
  const state=randomBytes(32).toString("base64url"), verifier=randomBytes(32).toString("base64url")
  let accept!:(query:URLSearchParams)=>void,reject!:(error:unknown)=>void,consumed=false
  const callback=new Promise<URLSearchParams>((resolve,fail)=>{accept=resolve;reject=fail})
  void callback.catch(()=>{})
  const onAbort=()=>reject(new LoopError("loop-host/cancelled","Loop Human login cancelled or expired"))
  signal.addEventListener("abort",onAbort,{once:true})
  const handler:RequestListener=(req,res)=>{
    let params:URLSearchParams
    try{
      const url=new URL(req.url??"/","http://127.0.0.1")
      if(req.method!=="GET" || url.pathname!=="/callback"){res.writeHead(404).end();return}
      params=url.searchParams
    }catch{res.writeHead(400).end();return}
    const proof=Buffer.from(params.get("state")??"")
    if(params.getAll("state").length!==1 || proof.length!==state.length || !timingSafeEqual(proof,Buffer.from(state))){res.writeHead(400).end();return}
    if(consumed){res.writeHead(409).end();return}
    consumed=true
    res.setHeader("Cache-Control","no-store");res.setHeader("Referrer-Policy","no-referrer");res.setHeader("Content-Type","text/html; charset=utf-8")
    res.end('<!doctype html><meta name="referrer" content="no-referrer"><title>Loop</title><script>history.replaceState(null,"",location.pathname);window.close()</script><p lang="zh">可关闭此页。原对话会自动收到授权结果。</p><p lang="en">You can close this tab. The original conversation will receive your decision automatically.</p>',()=>accept(params))
  }
  const listener=createServer(handler)
  let forwarded:ReturnType<CallbackBroker["registerCallback"]>|undefined
  listener.headersTimeout=5000;listener.requestTimeout=10_000
  const close=async()=>{
    signal.removeEventListener("abort",onAbort);forwarded?.dispose();listener.closeAllConnections()
    if(listener.listening)await new Promise<void>(resolve=>listener.close(()=>resolve()))
  }
  try{
    requireActive(signal)
    let redirectURI:string
    if(options.broker){forwarded=options.broker.registerCallback(handler);redirectURI=forwarded.url}
    else{
      listener.listen(0,"127.0.0.1");await once(listener,"listening",{signal})
      const address=listener.address()
      if(!address || typeof address==="string")throw noProtocol()
      redirectURI="http://127.0.0.1:"+address.port+"/callback"
    }
    const registration=await get(registrationEndpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({client_name:"Loop DeepSeek Connector (Human)",redirect_uris:[redirectURI],token_endpoint_auth_method:"none"})})
    const clientID=registration?.client_id
    if(typeof clientID!=="string" || !clientID || registration.token_endpoint_auth_method!=="none" || !sameList(registration.redirect_uris,[redirectURI]))throw noProtocol()
    const params=new URLSearchParams({response_type:"code",client_id:clientID,redirect_uri:redirectURI,workspace_id:workspace,resource,
      scope:consent.scope,state,code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256",
      allowed_actions:consent.allowedActions.join(","),device_label:"DeepSeek Harness"})
    if(consent.resourceConstraints.length)params.set("resource_constraints",consent.resourceConstraints.join(","))
    const result=callback.then(async query=>{
      requireActive(signal)
      if(query.get("error"))throw new LoopError("loop-host/needs-auth","Loop Human authorization was not approved")
      const code=query.get("code")
      if(!code || query.getAll("code").length!==1 || query.getAll("iss").length>1 ||
        ((metadata.authorization_response_iss_parameter_supported===true || query.has("iss")) && query.get("iss")!==issuer))throw noProtocol()
      const token=await get(tokenEndpoint,{method:"POST",body:new URLSearchParams({grant_type:"authorization_code",client_id:clientID,code,code_verifier:verifier,redirect_uri:redirectURI,resource})})
      if(typeof token?.access_token!=="string" || !/^[\x21-\x7e]+$/u.test(token.access_token) || typeof token.refresh_token!=="string" || !token.refresh_token ||
        String(token.token_type).toLowerCase()!=="bearer" || token.resource!==resource || !sameScope(token.scope,consent.scope) ||
        !Number.isSafeInteger(token.expires_in) || token.expires_in<=0 || token.expires_in>31_536_000)throw noProtocol()
      return {clientID,accessToken:token.access_token,refreshToken:token.refresh_token,expiresAt:new Date(Date.now()+token.expires_in*1000).toISOString(),scope:token.scope}
    }).finally(close)
    void result.catch(()=>{})
    return {url:authorizationEndpoint+"?"+params.toString(),expiresAt,result,cancel:()=>control.abort()}
  }catch(error){await close();requireActive(signal);throw error}
}

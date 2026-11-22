import {AccountService} from "./account.ts"
import {HostAPI,hostRoot} from "./host-api.ts"
import {boundedJSON} from "./http.ts"
import {LoopError,requireActive} from "./errors.ts"

/** Embedded browser authority stays in Host memory. Opening a page uses a
 * fresh one-time assertion; OAuth tokens are never put in a browser URL. */
export class PageService {
  private api:HostAPI
  private account:AccountService
  private origin:string
  private fetcher:typeof fetch
  private cookies?:{access:string;refresh:string}
  private control=new AbortController()
  private active(signal?:AbortSignal):AbortSignal {
    const combined=AbortSignal.any([this.control.signal,AbortSignal.timeout(20_000),...(signal?[signal]:[])])
    requireActive(combined);return combined
  }
  constructor(api:HostAPI,installation:string,pageOrigin:string,fetcher:typeof fetch=fetch){
    this.api=api;this.account=new AccountService(api,installation,pageOrigin);this.origin=pageOrigin;this.fetcher=fetcher
  }
  async launch(next="/workspaces",signal?:AbortSignal):Promise<{url:string;expiresAt:string}> {
    signal=this.active(signal)
    if(!next.startsWith("/") || next.startsWith("//") || /[\\\x00-\x20]/u.test(next))throw new LoopError("loop-host/invalid-request","Invalid Loop page target")
    const credential=await this.api.tokens.credential(signal)
    const base=hostRoot(credential,"account").slice(0,-"/api/v1/auth/external-host".length)
    const launch=await this.account.session(true,signal)
    const fragment=new URLSearchParams({page_launch:launch.pageLaunch!,page_origin:this.origin,next})
    return {url:base+"/external-host/page-session#"+fragment,expiresAt:new Date(Date.now()+Math.min(launch.expiresIn!,86400)*1000).toISOString()}
  }
  private async acquire(signal?:AbortSignal):Promise<void> {
    signal=this.active(signal)
    await (async()=>{
      const credential=await this.api.tokens.credential(signal)
      const root=hostRoot(credential,"account")
      const launch=await this.account.session(true,signal)
      const response=await this.fetcher(root+"/page-sessions",{method:"POST",redirect:"error",headers:{"Content-Type":"application/json","X-Loop-Browser-Session":"external-page"},
        body:JSON.stringify({pageLaunch:launch.pageLaunch,pageOrigin:this.origin}),signal})
      await response.body?.cancel()
      if(response.status!==204)throw new LoopError("loop-host/needs-auth","Loop page session could not be established",response.status)
      let access="",refresh=""
      for(const cookie of response.headers.getSetCookie()){
        const value=cookie.split(";",1)[0],index=value.indexOf("=")
        if(value.slice(0,index)==="loop_external_page_session")access=value.slice(index+1)
        if(value.slice(0,index)==="loop_external_page_refresh")refresh=value.slice(index+1)
      }
      if(!access || !refresh)throw new LoopError("loop-host/backend-invalid","Loop page session is incomplete")
      requireActive(signal)
      this.cookies={access,refresh}
    })()
  }
  async request(method:"GET"|"POST"|"PUT",path:string,body:unknown,signal?:AbortSignal):Promise<any> {
    signal=this.active(signal)
    const credential=await this.api.tokens.credential(signal)
    // Fixed Human product operations only. Agent actions never use this path.
    const pathname=path.split("?",1)[0]
    const workspaceRoot="/api/v1/workspaces/"+encodeURIComponent(credential.workspace_id)
    const relative=pathname.startsWith(workspaceRoot+"/")?pathname.slice(workspaceRoot.length):""
    const readable=method==="GET" && (["/api/v1/me","/api/v1/me/super-agent-grants","/api/v1/workspaces"].includes(pathname) || /^\/projects(?:\/[a-zA-Z0-9_-]+)?$/u.test(relative))
    const grant=method==="PUT" && /^\/projects\/[a-zA-Z0-9_-]+\/agent-grants\/[a-zA-Z0-9_-]+$/u.test(relative)
    const disconnect=method==="POST" && pathname==="/api/v1/auth/external-host/disconnect-operations/confirm"
    const create=method==="POST" && relative==="/projects"
    if(!readable && !grant && !disconnect && !create)throw new LoopError("loop-host/invalid-request","Unsupported page-session operation")
    const base=hostRoot(credential,"account").slice(0,-"/api/v1/auth/external-host".length)
    for(let attempt=0;attempt<2;attempt++){
      if(!this.cookies)await this.acquire(signal)
      const cookies=this.cookies!
      const response=await this.fetcher(base+path,{method,redirect:"error",headers:{"Content-Type":"application/json","X-Loop-Browser-Session":"external-page",
        Cookie:`loop_external_page_session=${cookies.access}; loop_external_page_refresh=${cookies.refresh}`},...(body===undefined?{}:{body:JSON.stringify(body)}),signal})
      if(response.status===401 && attempt===0){await response.body?.cancel();this.cookies=undefined;continue}
      if(!response.ok){await response.body?.cancel();throw new LoopError(response.status===401?"loop-host/needs-auth":response.status===403?"loop-host/waiting-for-access":"loop-host/backend-unavailable","Loop page operation was rejected",response.status)}
      if(response.status===204){await response.body?.cancel();return undefined}
      const result=await boundedJSON(response)
      requireActive(signal)
      return result
    }
  }
  clear():void{this.control.abort();this.cookies=undefined}
}

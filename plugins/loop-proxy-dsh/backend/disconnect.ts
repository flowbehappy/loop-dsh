import {randomBytes,randomUUID} from "node:crypto"
import type {Credential} from "./credentials.ts"
import {HostCredentialStore} from "./credentials.ts"
import {TokenManager,boundedJSON} from "./http.ts"
import {HostAPI} from "./host-api.ts"
import {PageService} from "./pages.ts"
import {LoopError,requireActive} from "./errors.ts"

const secret=()=>randomBytes(32).toString("base64url")
/** Exact-grant revocation. The provider atomically freezes the operation with
 * the credential, fencing normal requests before any network mutation. A lost
 * response is reconciled by operation identity, never by broad account revoke. */
export class DisconnectService {
  private store:HostCredentialStore
  private installation:string
  private origin:string
  private fetcher:typeof fetch
  private cleanup?: (credential:Credential,signal?:AbortSignal)=>Promise<void>
  constructor(store:HostCredentialStore,installation:string,origin:string,fetcher:typeof fetch=fetch,cleanup?: (credential:Credential,signal?:AbortSignal)=>Promise<void>){this.cleanup=cleanup;this.store=store;this.installation=installation;this.origin=origin;this.fetcher=fetcher}
  async run(signal?:AbortSignal,replacements=0):Promise<void> {
    requireActive(signal)
    const frozen=await this.store.freezeDisconnect(async current=>{
      if(!current || current.disconnect)return current
      if(!current.host_callback_uri)throw new LoopError("loop-host/needs-auth","Reconnect Loop to enable native disconnect")
      return {...current,disconnect:{input:{operationId:randomUUID(),operationSecret:secret(),installationId:this.installation,
        hostSource:"deepseek_harness",grantIds:[current.grant_id],humanGrantIds:[],callbackClientId:current.client_id,
        grantProofs:[{grantId:current.grant_id,refreshToken:current.refresh_token}],humanConfirmedRecovery:false,
        workspaceId:current.workspace_id,callbackUri:current.host_callback_uri,pageOrigin:this.origin,hostNonce:secret(),
        challenge:secret(),state:secret(),completionCodeVerifier:secret()}}}
    })
    if(!frozen)return
    const operation=frozen.disconnect!,input=operation.input
    const confirmationRequired=()=>{
      if(!operation.browserURL||!operation.expiresAt)throw new LoopError("loop-host/disconnect-failed","Disconnect confirmation is unavailable")
      const error=new LoopError("loop-host/disconnect-auth-required","Sign in to Loop with the original account and confirm Finish Disconnecting")
      error.challenge={id:input.operationId,loginUrl:operation.browserURL,expiresAt:operation.expiresAt}
      throw error
    }
    const save=async(patch:Record<string,unknown>)=>{
      await this.store.modify(async current=>{
        if(current?.generation!==frozen.generation || current.disconnect?.input.operationId!==input.operationId)throw new LoopError("loop-host/conflict","Loop account changed during disconnect")
        return {...current,disconnect:{...current.disconnect!,...patch}}
      })
    }
    const call=async(method:string,suffix:string,body?:unknown)=>{
      const response=await this.fetcher(this.store.server+"/api/v1/auth/external-host/disconnect-operations"+suffix,{
        method,redirect:"error",headers:{"Content-Type":"application/json","X-Loop-Host-Operation-Secret":input.operationSecret},
        ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20_000)]):AbortSignal.timeout(20_000)})
      if(!response.ok){await response.body?.cancel();throw new LoopError("loop-host/disconnect-failed","Loop disconnect could not be completed",response.status)}
      return boundedJSON(response,64<<10)
    }
    let status:any
    const suffix="/"+encodeURIComponent(input.operationId)
    const create=async()=>{
      const created=await call("POST","",input)
      if(created.operationId!==input.operationId||!Number.isFinite(Date.parse(created.expiresAt)))throw new LoopError("loop-host/backend-invalid","Invalid disconnect operation")
      let browser:URL
      try{browser=new URL(created.browserUrl)}catch{throw new LoopError("loop-host/backend-invalid","Invalid disconnect confirmation URL")}
      if(browser.origin!==new URL(this.store.server).origin||browser.username||browser.password)throw new LoopError("loop-host/backend-invalid","Disconnect confirmation belongs to another server")
      Object.assign(operation,{created:true,browserURL:browser.href,expiresAt:created.expiresAt})
      await save({created:true,browserURL:browser.href,expiresAt:created.expiresAt})
    }
    if(!operation.receipt){
      // Status works even after credentials were revoked and survives a lost
      // execute response. Do not refresh before replaying a lost create.
      try {status=await call("GET",suffix)}catch(error){
        // Only the server's explicit expiry permits replacement. Preserve
        // the frozen exact grant set and never unfreeze normal requests.
        if(error instanceof LoopError&&error.status===410&&replacements===0){
          await this.store.modify(async current=>{
            if(current?.generation!==frozen.generation||current.disconnect?.input.operationId!==input.operationId)throw new LoopError("loop-host/conflict","Disconnect operation changed")
            return {...current,disconnect:{input:{...input,operationId:randomUUID(),operationSecret:secret(),hostNonce:secret(),challenge:secret(),state:secret(),completionCodeVerifier:secret()}}}
          })
          return this.run(signal,replacements+1)
        }
        if(!(error instanceof LoopError) || ![401,404].includes(error.status) || operation.created)throw error
        await create()
        status=await call("GET",suffix)
      }
      if(status.operationId!==input.operationId)throw new LoopError("loop-host/backend-invalid","Disconnect operation identity changed")
      if(status.status==="awaiting_confirmation"){
        if(!operation.browserURL)await create()
        const tokens=new TokenManager(this.store,frozen,{fetch:this.fetcher,disconnectRecovery:true})
        const pages=new PageService(new HostAPI(tokens,this.fetcher),this.installation,this.origin,this.fetcher)
        try {
          const confirmation=await pages.request("POST","/api/v1/auth/external-host/disconnect-operations/confirm",{challenge:input.challenge,state:input.state},signal)
          if(typeof confirmation?.completionCode!=="string" || !confirmation.completionCode)throw new LoopError("loop-host/backend-invalid","Disconnect confirmation is incomplete")
          status=await call("POST",suffix+"/execute",{completionCode:confirmation.completionCode,completionCodeVerifier:input.completionCodeVerifier})
        }catch(error){
          if(error instanceof LoopError&&(error.code==="loop-host/needs-auth"||[401,403].includes(error.status)))confirmationRequired()
          throw error
        }finally{pages.clear()}
      }else if(status.status==="confirmed"){
        const reissued=await call("POST",suffix+"/reissue-completion",{})
        if(reissued.receipt)status=reissued
        else {
          if(typeof reissued.completionCode!=="string" || !reissued.completionCode)throw new LoopError("loop-host/backend-invalid","Disconnect completion is unavailable")
          status=await call("POST",suffix+"/execute",{completionCode:reissued.completionCode,completionCodeVerifier:input.completionCodeVerifier})
        }
      }
      const receipt=status?.receipt
      if(status?.operationId!==input.operationId || receipt?.operationId!==input.operationId || receipt.status!=="completed" || receipt.installationId!==this.installation || receipt.workspaceId!==frozen.workspace_id || !Number.isFinite(Date.parse(receipt.completedAt)))throw new LoopError("loop-host/backend-invalid","Disconnect receipt is invalid")
      await save({receipt})
      operation.receipt=receipt
    }
    await this.cleanup?.(frozen,signal)
    const removed=await this.store.logout(frozen.generation,{disconnectOperationId:input.operationId})
    if(!removed)throw new LoopError("loop-host/conflict","Loop connection changed before disconnect cleanup completed")
  }
}

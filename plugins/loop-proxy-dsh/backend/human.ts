import {randomUUID} from "node:crypto"
import {ActionClient} from "./actions.ts"
import {HostCredentialStore} from "./credentials.ts"
import type {Credential,CredentialProvider} from "./credentials.ts"
import {boundedJSON,LoopHTTP,TokenManager} from "./http.ts"
import {LoopError,requireActive} from "./errors.ts"
import {appActions,beginHumanOAuth,humanConsent,humanIssuerPath,sameList,sameScope} from "./human-oauth.ts"
import type {CallbackBroker,HumanConsent,HumanOAuth,HumanSlot,HumanTokens} from "./human-oauth.ts"

export type HumanOwner={accountPrincipal:string;workspaceId:string;policyKey?:string;includeGrant?:boolean;verify(signal:AbortSignal):Promise<void>}
type HumanStatus={state:"signed_out"|"needs_auth"|"connected";connection:HumanSlot;accountPrincipal?:string;workspaceId?:string;challenge?:Challenge;grant?:{id:string;expiresAt:string;allowedActions:string[];resourceConstraints:string[];scope:string}}
type Challenge={id:string;loginUrl:string;expiresAt:string}
type Pending={connection:HumanSlot;owner:HumanOwner;cancel:AbortController;result?:HumanStatus;error?:unknown;challenge?:Challenge}
const unavailable=()=>new LoopError("loop-host/needs-auth","The selected Human connection is not active")
const canDetach=(error:unknown)=>error instanceof LoopError && error.code==="loop-host/needs-auth"

/** Owns local Human consent and requests only. Loop is the authority on grants,
 * App constraints, live resource ACLs, and durable audit. */
export class HumanConnectionService {
  private fetcher:typeof fetch
  private control=new AbortController()
  private ownerKey?:string
  private lifetime=new AbortController()
  private pending=new Map<string,Pending>()
  private disconnecting=new Map<string,AbortController>()
  private use=new Map<string,AbortController>()
  private work=new Set<Promise<unknown>>()
  private options:{provider:CredentialProvider;server:string;installation:string;fetch?:typeof fetch;broker?:()=>CallbackBroker|undefined}
  constructor(options:HumanConnectionService["options"]){
    this.options=options
    this.fetcher=options.fetch??fetch
  }
  detach():void {
    this.lifetime.abort()
    this.lifetime=new AbortController()
    this.pending.clear();this.use.clear();this.disconnecting.clear();this.ownerKey=undefined
  }
  async dispose():Promise<void>{this.control.abort();this.detach();await Promise.allSettled(this.work)}
  private track<T>(promise:Promise<T>):Promise<T> {
    this.work.add(promise)
    void promise.finally(()=>this.work.delete(promise)).catch(()=>{})
    return promise
  }
  private slotSignal(owner:HumanOwner,connection:HumanSlot):AbortSignal {
    const key=this.connectionKey(owner,connection)
    let control=this.use.get(key)
    if(!control){control=new AbortController();this.use.set(key,control)}
    return control.signal
  }
  private ownerSignal(owner:HumanOwner,signal?:AbortSignal):AbortSignal {
    requireActive(this.control.signal);requireActive(signal)
    const key=JSON.stringify([owner.accountPrincipal,owner.workspaceId])
    if(this.ownerKey!==key){this.detach();this.ownerKey=key}
    return AbortSignal.any([this.control.signal,this.lifetime.signal,...(signal?[signal]:[])])
  }
  private statusValue(connection:HumanSlot,state:HumanStatus["state"],owner?:HumanOwner):HumanStatus {
    return {state,connection,...(owner?{accountPrincipal:owner.accountPrincipal,workspaceId:owner.workspaceId}:{})}
  }
  private connectionKey(owner:HumanOwner,connection:HumanSlot):string {
    return connection + "/" + (owner.policyKey ?? "")
  }
  private store(owner:HumanOwner,connection:HumanSlot):HostCredentialStore {
    return new HostCredentialStore(this.options.provider,this.options.server,owner.workspaceId,this.options.installation,{account:owner.accountPrincipal,connection,policyKey:owner.policyKey})
  }
  private async session(store:HostCredentialStore,method:"GET"|"DELETE",token:string,signal:AbortSignal):Promise<any>{
    requireActive(signal)
    let response:Response
    try{response=await this.fetcher(store.resource+"/session",{method,headers:{Authorization:"Bearer "+token,Accept:"application/json"},redirect:"error",signal:AbortSignal.any([signal,AbortSignal.timeout(20_000)])})}
    catch{requireActive(signal);throw new LoopError("loop-host/backend-unavailable","Loop Human grant request did not complete",0,method==="DELETE")}
    if(response.status===(method==="DELETE"?204:200)){
      if(method==="DELETE"){await response.body?.cancel();return}
      let data:unknown
      try{data=await boundedJSON(response,64<<10)}catch{throw new LoopError("loop-host/backend-invalid","Invalid Loop Human grant response")}
      requireActive(signal);return data
    }
    await response.body?.cancel()
    if(response.status===401)throw unavailable()
    throw new LoopError("loop-host/backend-unavailable","Loop Human grant request was rejected",response.status,method==="DELETE" && response.status>=500)
  }
  private validate(raw:any,owner:HumanOwner,store:HostCredentialStore,connection:HumanSlot,expected:{clientID:string;scope:string;grantID?:string;consent?:HumanConsent}):HumanConsent {
    if(!Array.isArray(raw?.resourceConstraints) || raw.principalKind!=="human" || raw.humanUserId!==owner.accountPrincipal || raw.workspaceId!==owner.workspaceId || raw.resource!==store.resource ||
      raw.clientId!==expected.clientID || raw.status!=="active" || typeof raw.grantId!=="string" || !raw.grantId || (expected.grantID && raw.grantId!==expected.grantID) ||
      typeof raw.expiresAt!=="string" || !Number.isFinite(Date.parse(raw.expiresAt)) || Date.parse(raw.expiresAt)<=Date.now() || !sameScope(raw.scope,expected.scope))throw unavailable()
    let consent:HumanConsent
    try{consent=humanConsent({allowedActions:raw.allowedActions,resourceConstraints:raw.resourceConstraints,write:raw.scope.split(/\s+/u).includes("loop.human_write"),manage:raw.scope.split(/\s+/u).includes("loop.human_manage")},connection)}
    catch{throw unavailable()}
    if(!sameList(raw.allowedActions,consent.allowedActions)||!sameList(raw.resourceConstraints,consent.resourceConstraints)||
      (expected.consent && (!sameList(raw.allowedActions,expected.consent.allowedActions)||!sameList(raw.resourceConstraints,expected.consent.resourceConstraints))))throw unavailable()
    return consent
  }
  private async verifyCurrent(owner:HumanOwner,connection:HumanSlot,store:HostCredentialStore,signal:AbortSignal){
    const credential=await store.read()
    if(!credential)throw unavailable()
    const tokens=new TokenManager(store,credential,{fetch:this.fetcher})
    const current=await tokens.credential(signal)
    const raw=await this.session(store,"GET",current.access_token,signal)
    const consent=this.validate(raw,owner,store,connection,{clientID:credential.client_id,scope:credential.scope,grantID:credential.grant_id})
    await owner.verify(signal);requireActive(signal)
    return {credential,tokens,consent,expiresAt:raw.expiresAt as string}
  }
  async status(owner:HumanOwner|undefined,connection:HumanSlot,request:AbortSignal):Promise<HumanStatus> {
    if(!owner){this.detach();return this.statusValue(connection,"signed_out")}
    const key=this.connectionKey(owner,connection)
    const signal=AbortSignal.any([this.ownerSignal(owner,request),this.slotSignal(owner,connection)])
    if(this.disconnecting.has(key))return this.statusValue(connection,"needs_auth",owner)
    try{
      const {credential,consent,expiresAt}=await this.verifyCurrent(owner,connection,this.store(owner,connection),signal)
      if (!owner.includeGrant) return this.statusValue(connection,"connected",owner)
      return {...this.statusValue(connection,"connected",owner),grant:{id:credential.grant_id,expiresAt,...consent}}
    }
    catch(error){
      requireActive(signal);if(!canDetach(error))throw error
      const pending=this.pending.get(key)
      if(pending?.challenge && Date.parse(pending.challenge.expiresAt)>Date.now()){
        await owner.verify(signal);requireActive(signal)
        if(this.pending.get(key)===pending)return {...this.statusValue(connection,"needs_auth",owner),challenge:pending.challenge}
      }
      return this.statusValue(connection,"needs_auth",owner)
    }
  }
  async begin(owner:HumanOwner,connection:HumanSlot,input:any,request:AbortSignal){
    const lifetime=this.ownerSignal(owner),consent=humanConsent(input,connection)
    const key=this.connectionKey(owner,connection)
    if(this.disconnecting.has(key))throw new LoopError("loop-host/conflict","Human disconnect is in progress")
    let previous=this.pending.get(key)
    if(previous?.challenge && Date.parse(previous.challenge.expiresAt)<=Date.now()){previous.cancel.abort();this.pending.delete(key);previous=undefined}
    if(previous){
      if(previous.challenge && !previous.result && !previous.error)throw new LoopError("loop-host/conflict","Finish or cancel the pending Human login")
      if(!previous.result && !previous.error)throw new LoopError("loop-host/conflict","Human login is starting")
      this.pending.delete(key)
    }
    const pending:Pending={owner,connection,cancel:new AbortController()}
    this.pending.set(key,pending)
    const signal=AbortSignal.any([lifetime,pending.cancel.signal,request])
    try{
      const store=this.store(owner,connection)
      const before=await store.read()
      if(before){
        try{await this.verifyCurrent(owner,connection,store,signal);throw new LoopError("loop-host/conflict","Disconnect the current Human grant before changing it")}
        catch(error){if(!canDetach(error))throw error}
      }
      await owner.verify(signal)
      // The browser flow outlives the HTTP RPC used to start it.
      const flowSignal=AbortSignal.any([lifetime,pending.cancel.signal])
      const flow=await beginHumanOAuth({server:store.server,workspace:owner.workspaceId,resource:store.resource,consent,fetcher:this.fetcher,signal:flowSignal,broker:this.options.broker?.()})
      if(signal.aborted){flow.cancel();requireActive(signal)}
      pending.challenge={id:randomUUID(),loginUrl:flow.url,expiresAt:flow.expiresAt}
      this.track(this.finish(pending,store,consent,flow,before?.generation,flowSignal).then(result=>{pending.result=result},error=>{pending.error=error}))
      return {...this.statusValue(connection,"needs_auth",owner),challenge:pending.challenge}
    }catch(error){pending.cancel.abort();if(this.pending.get(key)===pending)this.pending.delete(key);throw error}
  }
  private async finish(pending:Pending,store:HostCredentialStore,consent:HumanConsent,flow:HumanOAuth,generation:string|undefined,signal:AbortSignal):Promise<HumanStatus>{
    const {owner,connection}=pending
    const key=this.connectionKey(owner,connection)
    const token:HumanTokens=await flow.result
    signal=AbortSignal.any([signal,AbortSignal.timeout(Math.max(1,Date.parse(flow.expiresAt)-Date.now()))])
    const raw=await this.session(store,"GET",token.accessToken,signal)
    this.validate(raw,owner,store,connection,{clientID:token.clientID,scope:token.scope,consent})
    await owner.verify(signal)
    const saved=await store.publish({version:1,principal_id:owner.accountPrincipal,workspace_id:owner.workspaceId,grant_id:raw.grantId,
      resource:store.resource,token_endpoint:store.server+humanIssuerPath+"/token",client_id:token.clientID,scope:token.scope,
      access_token:token.accessToken,refresh_token:token.refreshToken,access_expires_at:token.expiresAt},signal,{generation})
    try{await owner.verify(signal);requireActive(signal)}catch(error){await store.logout(saved.generation);throw error}
    this.use.get(key)?.abort();this.use.delete(key)
    return this.statusValue(connection,"connected",owner)
  }
  async complete(owner:HumanOwner,connection:HumanSlot,challengeId:unknown,request:AbortSignal){
    const signal=this.ownerSignal(owner,request)
    const key=this.connectionKey(owner,connection)
    const pending=this.pending.get(key)
    if(!pending?.challenge || pending.challenge.id!==challengeId)throw new LoopError("loop-host/invalid-request","Unknown Human login challenge")
    await owner.verify(signal);requireActive(signal)
    if(pending.error){this.pending.delete(key);throw pending.error}
    if(pending.result){this.pending.delete(key);return this.status(owner,connection,request)}
    if(Date.parse(pending.challenge.expiresAt)<=Date.now()){
      pending.cancel.abort();this.pending.delete(key);throw new LoopError("loop-host/cancelled","Loop Human login expired")
    }
    return {...this.statusValue(connection,"needs_auth",owner),challenge:pending.challenge}
  }
  cancel(owner:HumanOwner,connection:HumanSlot,challengeId:unknown,request:AbortSignal){
    this.ownerSignal(owner,request)
    const key=this.connectionKey(owner,connection)
    const pending=this.pending.get(key)
    if(typeof challengeId!=="string" || !challengeId)throw new LoopError("loop-host/invalid-request","Human login challenge is required")
    if(pending?.challenge?.id===challengeId){pending.cancel.abort();this.pending.delete(key)}
    return {}
  }
  async disconnect(owner:HumanOwner|undefined,connection:HumanSlot,request:AbortSignal):Promise<HumanStatus> {
    if(!owner)throw unavailable()
    const key=this.connectionKey(owner,connection)
    const parent=this.ownerSignal(owner,request),operation=new AbortController()
    const signal=AbortSignal.any([parent,operation.signal])
    if(this.disconnecting.has(key))throw new LoopError("loop-host/conflict","Human disconnect is in progress")
    this.disconnecting.set(key,operation)
    this.use.get(key)?.abort();this.use.delete(key)
    this.pending.get(key)?.cancel.abort();this.pending.delete(key)
    try{
      const store=this.store(owner,connection),credential=await store.read()
      if(!credential)return this.statusValue(connection,"signed_out",owner)
      await owner.verify(signal);requireActive(signal)
      // Try the saved bearer before refresh, so an uncertain rotation cannot
      // prevent revoking a grant whose existing access bearer still works.
      let current=credential, revoked=false
      const revoke=async()=>{
        const raw=await this.session(store,"GET",current.access_token,signal)
        try{this.validate(raw,owner,store,connection,{grantID:credential.grant_id,clientID:credential.client_id,scope:credential.scope})}
        catch{throw new LoopError("loop-host/conflict","Human grant identity did not match; nothing was revoked")}
        await owner.verify(signal);requireActive(signal)
        const latest=await store.read()
        if(latest?.generation!==credential.generation)throw new LoopError("loop-host/conflict","Human connection changed during disconnect")
        await this.session(store,"DELETE",current.access_token,signal)
        revoked=true
      }
      try{await revoke()}catch(error){
        if(!canDetach(error))throw error
        if(credential.refresh_state!=="unknown" || typeof credential.refresh_started_at==="number"){
          try{
            current=await new TokenManager(store,credential,{fetch:this.fetcher}).credential(signal,credential.access_token)
            await revoke()
          }catch(retryError){if(!canDetach(retryError))throw retryError}
        }
      }
      if(!await store.logout(credential.generation))throw new LoopError("loop-host/conflict","Human connection changed during disconnect")
      if(!revoked)throw new LoopError("loop-host/human-revoke-unconfirmed","Human connection removed locally; Loop did not confirm revocation. Review the grant in Loop before reconnecting.")
      requireActive(signal)
      return this.statusValue(connection,"signed_out",owner)
    }finally{if(this.disconnecting.get(key)===operation)this.disconnecting.delete(key)}
  }
  async action(owner:HumanOwner,connection:HumanSlot,kind:"humanCatalog"|"humanSchema"|"humanAction",input:any,request:AbortSignal){
    const signal=AbortSignal.any([this.ownerSignal(owner,request),this.slotSignal(owner,connection)])
    if(this.disconnecting.has(this.connectionKey(owner,connection)))throw unavailable()
    const store=this.store(owner,connection)
    const {credential,tokens,consent}=await this.verifyCurrent(owner,connection,store,signal)
    if(input.expectedGrantId !== undefined && credential.grant_id !== input.expectedGrantId)throw unavailable()
    const client=new ActionClient(new LoopHTTP(tokens,store.resource,this.fetcher))
    const permitted=(name:string)=>appActions.has(name)===(connection==="apps") && consent.allowedActions.includes(name)
    try{
      if(kind==="humanCatalog"){
        if(input.prefix!==undefined && typeof input.prefix!=="string")throw new LoopError("loop-host/invalid-request","Invalid Human action prefix")
        const catalog=await client.actions(signal)
        await owner.verify(signal);requireActive(signal)
        return {actions:catalog.map(item=>item.id).filter(name=>permitted(name)&&(!input.prefix||name.startsWith(input.prefix))).sort()}
      }
      if(typeof input.name!=="string" || !permitted(input.name))throw new LoopError("loop-host/waiting-for-access","Action is not granted in the selected Human connection")
      const schema=await client.describe(input.name,signal)
      if(schema?.id!==input.name)throw new LoopError("loop-host/backend-invalid","Invalid Loop Human action schema")
      if(kind==="humanSchema"){await owner.verify(signal);requireActive(signal);return schema}
      if(input.requireReadOnly!==false && schema.readOnly!==true)throw new LoopError("loop-host/waiting-for-access","Current human intent is required for this action")
      const args=input.arguments===undefined?{}:input.arguments
      if(input.name==="app.invoke" && (typeof args?.extensionName!=="string" || typeof args.action!=="string" ||
        !consent.resourceConstraints.includes("app:"+args.extensionName) || !consent.resourceConstraints.includes("app-action:"+args.extensionName+"/"+args.action)))
        throw new LoopError("loop-host/waiting-for-access","App and Action must match the exact granted locators")
      await owner.verify(signal);requireActive(signal)
      const result=await client.invoke(input.name,args,signal)
      requireActive(signal)
      return result
    }catch(error){
      // Do not relay remote error bodies in Human mode, which can be supplied
      // by underlying App adapters. Keep local validation messages intact.
      if(error instanceof LoopError && error.status){
        let message="Loop rejected the Human action (HTTP "+error.status+")."
        if(error.code==="resource_not_granted"){
          message="The Human grant does not cover the selected resources. Check the exact resource locators required by the action schema."
        }else if(error.status===403){
          message="Loop denied the Human action. Check the action grant, its resource constraints and the Human's access to the target."
        }
        throw new LoopError("loop-host/human-action-rejected",message,error.status,error.outcomeUnknown)
      }
      throw error
    }
  }
}

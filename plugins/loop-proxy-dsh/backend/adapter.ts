import {cleanupDisconnectedState} from "./disconnect-cleanup.ts"
import {createHash,randomUUID} from "node:crypto"
import {join} from "node:path"
import {LoopBackend} from "./runtime.ts"
import type {ConnectionOperationLease} from "./runtime.ts"
import {serviceURL,HostCredentialStore} from "./credentials.ts"
import type {CredentialProvider} from "./credentials.ts"
import {DurableJSON} from "./storage.ts"
import {LoopError,requireActive} from "./errors.ts"
import {publicValue} from "./codec.ts"
import {NativeSyncWriter} from "./sync-writer.ts"
import {SyncOutbox} from "./sync.ts"
import {TokenManager} from "./http.ts"
import {HostAPI} from "./host-api.ts"
import {HumanConnectionService} from "./human.ts"
import type {HumanOwner} from "./human.ts"
import {humanSlot} from "./human-oauth.ts"

interface Config {stateHome:string;serviceBaseUrl:string;loopWorkspaceId:string;installationId:string;pageOrigin:string;syncProfile:string;accountPrincipal?:string;authorizationSettings?:string|false}
interface Options {provider:CredentialProvider;fetch?:typeof fetch;syncHome?:string}
/** Implements the existing Host action transport directly. This adapter is
 * injected into the existing facade; it never spawns or falls back to Go. */
export class NativeHostActions {
  readonly config:Config
  accountPrincipal:string
  onAccountPrincipal?: (principal:string)=>Promise<void>|void
  private syncHome?:string
  private options:Options
  private writers=new Set<NativeSyncWriter>()
  private captureBlocked=false
  private accountDisconnect?:Promise<void>
  private backend?:LoopBackend
  private human?:HumanConnectionService
  private workspace:string
  private locator?:DurableJSON
  private ready:Promise<void>
  private challenge?:{id:string;loginUrl:string;expiresAt:string}
  private pageConsent?: {grantId: string; challenge: {id: string; loginUrl: string; expiresAt: string}}
  private selection?:{id:string;expires:number;workspace:string;account:string;agent:string;grantId:string}
  private completion?:Promise<void>
  private loginError?:unknown
  private connecting?:Promise<any>
  private control=new AbortController()
  private events=new Set<(message:any)=>void>()
  private skills=new Set<(message:any)=>void>()
  constructor(config:Config,options:Options){
    if(config.authorizationSettings!==false&&(typeof config.authorizationSettings==="string"?config.authorizationSettings.trim():process.env.DSH_LOOP_PROXY_AUTHORIZATION_SETTINGS?.trim()))throw new LoopError("loop-host/unsupported","Native Host does not yet support separately configured authorization policies")
    this.options=options
    this.syncHome=options.syncHome
    config={...config,serviceBaseUrl:config.serviceBaseUrl?serviceURL(config.serviceBaseUrl):""}
    this.config={...config};this.accountPrincipal=config.accountPrincipal??"";this.workspace=config.loopWorkspaceId??""
    if(config.serviceBaseUrl){
      this.backend=new LoopBackend({provider:options.provider,server:config.serviceBaseUrl,installation:config.installationId,pageOrigin:config.pageOrigin,fetch:options.fetch,legacyProofRoot:join(config.stateHome,"installation-proofs"),onDisconnected:async(credential,signal)=>{
        await Promise.all([...this.writers].map(writer=>writer.fenceAll()))
        await cleanupDisconnectedState({stateHome:config.stateHome,syncHome:options.syncHome,profile:config.syncProfile,server:config.serviceBaseUrl},credential,signal)
      }})
      this.human=new HumanConnectionService({provider:options.provider,server:config.serviceBaseUrl,installation:config.installationId,fetch:options.fetch,broker:()=>this.backend?.oauthCallbackBroker()})
      const key=createHash("sha256").update(JSON.stringify([config.serviceBaseUrl,config.installationId])).digest("hex")
      this.locator=new DurableJSON(join(config.stateHome,"native-accounts",key+".json"))
    }
    this.ready=this.restore()
    void this.ready.catch(()=>{})
  }
  private async restore(){
    const locator=await this.locator?.read()
    if(!locator)return
    if(locator.server!==this.config.serviceBaseUrl || locator.installation!==this.config.installationId || typeof locator.workspace!=="string" || !locator.workspace)throw new LoopError("loop-host/invalid-state","Invalid account locator")
    if(!this.workspace)this.workspace=locator.workspace
  }
  addEventListener(listener:(message:any)=>void){this.events.add(listener);return()=>{this.events.delete(listener)}}
  addSkillCatalogEventListener(listener:(message:any)=>void){this.skills.add(listener);return()=>{this.skills.delete(listener)}}
  createSyncWriter(config:{profile:string;queueLimit:number;shutdownTimeoutMs:number;clientSessionLabel:string},status:(session:string,state:string)=>void=()=>{}){
    if(!this.syncHome)throw new LoopError("loop-host/unavailable","Native sync storage is not configured")
    const credential=async(profile:string,signal:AbortSignal)=>{
      await this.ready;requireActive(signal);requireActive(this.control.signal)
      if(this.captureBlocked)throw new LoopError("loop-host/needs-auth","Loop disconnect fences sync capture")
      if(profile!==this.config.syncProfile)throw new LoopError("loop-host/conflict","Sync profile belongs to a different Loop server")
      const current=this.workspace?await new HostCredentialStore(this.options.provider,this.config.serviceBaseUrl,this.workspace,this.config.installationId).read():undefined
      if(current?.disconnect)throw new LoopError("loop-host/needs-auth","Loop disconnect is pending")
      if(current&&this.accountPrincipal&&current.principal_id!==this.accountPrincipal)throw new LoopError("loop-host/conflict","Sync account changed")
      return current
    }
    const apiFor=(current:any)=>new HostAPI(new TokenManager(new HostCredentialStore(this.options.provider,this.config.serviceBaseUrl,current.workspace_id,this.config.installationId),current,{fetch:this.options.fetch}),this.options.fetch)
    const writer=new NativeSyncWriter(config,async(profile,session,pending,signal)=>{
      const current=await credential(profile,signal)
      if(!current){
        if(!pending||!this.accountPrincipal||pending.accountPrincipal!==this.accountPrincipal||pending.loopWorkspaceId!==this.workspace)throw new LoopError("loop-host/needs-auth","Explicit pending sync owner is unavailable")
        return SyncOutbox.pending(this.syncHome!,profile,session,pending)
      }
      if(pending&&(pending.accountPrincipal!==current.principal_id||pending.loopWorkspaceId!==current.workspace_id))throw new LoopError("loop-host/conflict","Pending capture belongs to another account")
      return new SyncOutbox(this.syncHome!,profile,session,current,apiFor(current),pending??undefined)
    },status,async(profile,signal)=>{
      const current=await credential(profile,signal)
      return current?SyncOutbox.resumable(this.syncHome!,profile,current,apiFor(current)):[]
    })
    this.writers.add(writer)
    return writer
  }
  private async connectionIdentity():Promise<{state:"signed_out"}|{state:"signed_in";accountPrincipal:string;workspaceId:string;grantId:string}>{
    const current=this.workspace && await new HostCredentialStore(this.options.provider,this.config.serviceBaseUrl,this.workspace,this.config.installationId).read()
    if(!current || current.disconnect || this.accountDisconnect)return {state:"signed_out"}
    return {state:"signed_in",accountPrincipal:current.principal_id,workspaceId:current.workspace_id,grantId:current.grant_id}
  }
  private async observe(principal:string){
    requireActive(this.control.signal)
    // Catalog reads must not publish an account-change event: the Host model
    // runtime responds to that event by reading the catalog again.
    if(this.accountPrincipal===principal)return
    this.human?.detach()
    await this.onAccountPrincipal?.(principal);this.accountPrincipal=principal
  }
  private async connect(signal:AbortSignal,accessToken?:string,requestPageAccess=false){
    if(accessToken!==undefined && (!/^loop_dsh_[A-Za-z0-9_-]{43}$/u.test(accessToken))) throw new LoopError("loop-host/needs-auth","Use a personal assistant DSH token")
    if(accessToken && (this.connecting || this.challenge))throw new LoopError("loop-host/conflict","A login is already in progress")
    if(this.connecting)return this.connecting
    if(this.accountDisconnect)throw new LoopError("loop-host/conflict","Loop disconnect is in progress")
    if(this.challenge)return {state:"needs_auth",challenge:this.challenge}
    this.connecting=(async()=>{
      const lease=this.backend!.claimConnectionOperation("login")
      let retained=false
      try {
        const status=this.workspace?await this.backend!.accountStatus(this.workspace,signal):{state:"signed_out"}
        if(status.state==="signing_out")throw new LoopError("loop-host/conflict","Finish pending Loop disconnect before signing in")
        if (status.state === "signed_in") {
          if (accessToken) throw new LoopError("loop-host/conflict","Sign out before changing accounts")
          this.captureBlocked = false
          await this.observe(status.accountPrincipal)
          if (requestPageAccess && status.deviceOnly) {
            if (!this.pageConsent || this.pageConsent.grantId !== status.grantId || Date.parse(this.pageConsent.challenge.expiresAt) <= Date.now()) {
              const challenge = await this.backend!.preparePageConsent(this.workspace, status.grantId, signal)
              this.pageConsent = challenge ? {grantId: status.grantId, challenge} : undefined
            }
            if (this.pageConsent) return {state: "needs_auth", challenge: this.pageConsent.challenge}
          }
          if (!status.deviceOnly) this.pageConsent = undefined
          return {...status, state: "connected"}
        }
        if (requestPageAccess) throw new LoopError("loop-host/needs-auth","Reconnect the assistant before authorizing pages")
        if(this.loginError){const error=this.loginError;this.loginError=undefined;throw error}
        // Poll cancellation must not cancel an already-presented browser consent.
        const started=await this.backend!.beginLogin(accessToken ? signal : this.control.signal,accessToken)
        if (!accessToken) this.challenge={id:started.challengeId,loginUrl:started.authorizationURL,expiresAt:new Date(Date.now()+10*60_000).toISOString()}
        const publish=async()=>{
          const identity=await this.backend!.completeLogin(started.challengeId)
          await this.locator!.transaction(async(_current,save)=>save({server:this.config.serviceBaseUrl,installation:this.config.installationId,workspace:identity.workspaceId}),this.control.signal)
          if(this.workspace!==identity.workspaceId)this.human?.detach()
          this.workspace=identity.workspaceId
          this.captureBlocked=false
          await this.observe(identity.accountPrincipal)
          return identity
        }
        if(accessToken){
          return {...await publish(),state:"connected"}
        }
        retained=true
        let completion:Promise<void>
        completion=publish().then(()=>{}).catch(error=>{this.loginError=error}).finally(()=>{
          this.challenge=undefined
          if(this.completion===completion)this.completion=undefined
          this.backend!.releaseConnectionOperation(lease)
        })
        this.completion=completion
        return {state:"needs_auth",challenge:this.challenge}
      } finally {
        if(!retained)this.backend!.releaseConnectionOperation(lease)
      }
    })().finally(()=>{this.connecting=undefined})
    return this.connecting
  }
  private disconnect(input:any,signal?:AbortSignal,lease?:ConnectionOperationLease):Promise<void>{
    if(this.accountDisconnect)return this.accountDisconnect
    const owned=lease??this.backend!.claimConnectionOperation("account-disconnect",true)
    const combined=AbortSignal.any([this.control.signal,...(signal?[signal]:[])])
    this.captureBlocked=true
    this.human?.detach()
    let operation:Promise<void>
    operation=(async()=>{
      requireActive(combined);await this.ready;requireActive(combined)
      // Consent can finish between cancellation and its caller publishing the
      // workspace locator. Wait for both before choosing the grant to revoke.
      await this.connecting?.catch(()=>{})
      if(this.challenge)this.backend!.cancelLogin(this.challenge.id)
      await this.completion
      const credential=this.workspace?await new HostCredentialStore(this.options.provider,this.config.serviceBaseUrl,this.workspace,this.config.installationId).readForDisconnect():undefined
      if(credential&&((this.accountPrincipal&&this.accountPrincipal!==credential.principal_id)||(input.accountPrincipal&&input.accountPrincipal!==credential.principal_id)))throw new LoopError("loop-host/needs-auth","Loop account changed")
      this.captureBlocked=true
      this.selection=undefined
      await this.backend!.disconnectAccount(this.workspace,combined,owned)
      await this.observe("")
    })().finally(()=>{
      if(this.accountDisconnect===operation)this.accountDisconnect=undefined
      this.backend!.releaseConnectionOperation(owned)
    })
    this.accountDisconnect=operation
    return operation
  }
  private async humanOwner(input:any,signal:AbortSignal):Promise<HumanOwner|undefined>{
    const workspaceId=this.workspace
    if(!workspaceId || this.captureBlocked || this.accountDisconnect){this.human?.detach();return undefined}
    const status=await this.backend!.accountStatus(workspaceId,signal)
    requireActive(signal)
    if(status.state!=="signed_in" || status.workspaceId!==workspaceId || workspaceId!==this.workspace || this.captureBlocked || this.accountDisconnect){this.human?.detach();return undefined}
    const accountPrincipal=status.accountPrincipal
    if(this.accountPrincipal && this.accountPrincipal!==accountPrincipal){this.human?.detach();throw new LoopError("loop-host/needs-auth","Loop account changed")}
    if(input.accountPrincipal!==undefined && input.accountPrincipal!==accountPrincipal || input.loopWorkspaceId!==undefined && input.loopWorkspaceId!==workspaceId)throw new LoopError("loop-host/needs-auth","Human connection owner changed")
    return {accountPrincipal,workspaceId,verify:async(active)=>{
      requireActive(active)
      const local=()=>this.workspace===workspaceId && !this.captureBlocked && !this.accountDisconnect && (!this.accountPrincipal || this.accountPrincipal===accountPrincipal)
      if(!local())throw new LoopError("loop-host/needs-auth","Human connection owner changed")
      const fresh=await this.backend!.accountStatus(workspaceId,active)
      requireActive(active)
      if(!local() || fresh.state!=="signed_in" || fresh.workspaceId!==workspaceId || fresh.accountPrincipal!==accountPrincipal){
        this.human?.detach()
        throw new LoopError("loop-host/needs-auth","Human connection owner changed")
      }
    }}
  }
  async request(action:string,input:any={},signal?:AbortSignal):Promise<any>{
    return publicValue(await this.requestNative(action,input,signal))
  }
  private requestNative(action:string,input:any={},signal?:AbortSignal):Promise<any>{
    if(this.backend && action==="unbind" && input.hasRemainingBindings===false){
      if(![undefined,"","human_confirmed"].includes(input.recoveryMode)||typeof input.workspace?.workspaceId!=="string"||!input.workspace.workspaceId||input.sessionIds!==undefined&&(!Array.isArray(input.sessionIds)||input.sessionIds.length>4096||input.sessionIds.some((id:any)=>typeof id!=="string"||! /^[a-zA-Z0-9_.:-]{1,255}$/u.test(id))))return Promise.reject(new LoopError("loop-host/invalid-request","Invalid Workspace disconnect request"))
      return this.disconnect(input,signal).then(()=>({}))
    }
    if(this.backend && action==="disconnectAccount"){
      if(![undefined,"","human_confirmed"].includes(input.recoveryMode))return Promise.reject(new LoopError("loop-host/invalid-request","Invalid disconnect recovery mode"))
      return this.disconnect(input,signal).then(()=>({}))
    }
    let lease:ConnectionOperationLease|undefined
    if(this.backend && action==="disconnectModelConnection")lease=this.backend.claimConnectionOperation("model-revoke")
    return this.requestNativeOwned(action,input,signal,lease).finally(()=>{
      if(lease){
        this.backend?.releaseConnectionOperation(lease)
      }
    })
  }
  private async requestNativeOwned(action:string,input:any={},signal?:AbortSignal,lease?:ConnectionOperationLease):Promise<any>{
    const combined=AbortSignal.any([this.control.signal,...(signal?[signal]:[])])
    requireActive(combined);await this.ready;requireActive(combined)
    if(action==="humanStatus" && !this.backend)return {state:"signed_out",connection:humanSlot(input.connection)}
    if(!this.backend){if(action==="accountStatus")return {state:"signed_out"};throw new LoopError("loop-host/needs-auth","Select a Loop server first")}
    if(this.human && ["humanStatus","beginHumanLogin","completeHumanLogin","cancelHumanLogin","disconnectHuman","humanCatalog","humanSchema","humanAction"].includes(action)){
      const connection=humanSlot(input.connection)
      const businessAction=action==="humanCatalog" || action==="humanSchema" || action==="humanAction"
      if(businessAction && (typeof input.workspaceId!=="string" || !input.workspaceId || typeof input.sessionId!=="string" || !input.sessionId))throw new LoopError("loop-host/invalid-request","Host Workspace and Session are required")
      const owner=await this.humanOwner(input,combined)
      if(owner) owner.includeGrant=input.includeGrant===true
      if(owner && input.policyKey!==undefined){
        if(typeof input.policyKey!=="string" || !/^[a-f0-9]{64}$/u.test(input.policyKey))throw new LoopError("loop-host/invalid-request","Invalid task authorization scope")
        owner.policyKey=input.policyKey
      }
      if(action==="humanStatus")return this.human.status(owner,connection,combined)
      if(!owner)throw new LoopError("loop-host/needs-auth","Loop Host sign-in is required for Human delegation")
      if(action==="beginHumanLogin")return this.human.begin(owner,connection,input,combined)
      if(action==="completeHumanLogin")return this.human.complete(owner,connection,input.challengeId,combined)
      if(action==="cancelHumanLogin")return this.human.cancel(owner,connection,input.challengeId,combined)
      if(action==="disconnectHuman")return this.human.disconnect(owner,connection,combined)
      if(businessAction)return this.human.action(owner,connection,action,input,combined)
    }
    if(action==="worksiteStatus")return this.backend.worksiteStatus()
    if(action==="worksiteStop")return this.backend.worksiteStop()
    if(action==="connectAccount")return this.connect(combined,input.accessToken,input.requestPageAccess === true)
    if(action==="beginBind"){
      if(![undefined,"","bind","switch"].includes(input.mode)||typeof input.workspace?.workspaceId!=="string"||!input.workspace.workspaceId)throw new LoopError("loop-host/invalid-request","Invalid binding request")
      const connected=await this.connect(combined)
      if(connected.state!=="connected")return connected
    }
    if(action==="accountStatus")return this.workspace?this.backend.accountStatus(this.workspace,combined):{state:"signed_out"}
    if(action==="modelStatus"){
      const status=await this.connectionIdentity()
      if(status.state!=="signed_in")return {state:"needs_auth",connections:[],...(this.accountPrincipal?{accountPrincipal:this.accountPrincipal}:{})}
      if((this.accountPrincipal&&this.accountPrincipal!==status.accountPrincipal)||(input.accountPrincipal&&input.accountPrincipal!==status.accountPrincipal))throw new LoopError("loop-host/needs-auth","Loop account changed")
      const catalog=await this.backend.modelRuntimeCatalog({accountPrincipal:status.accountPrincipal,workspaceId:this.workspace,sessionId:"host-account"},combined)
      return {...catalog,state:catalog.connections.length?"active":"needs_auth"}
    }
    if(action==="disconnectAccount"){
      if(![undefined,"","human_confirmed"].includes(input.recoveryMode))throw new LoopError("loop-host/invalid-request","Invalid disconnect recovery mode")
      await this.disconnect(input,combined,lease);return {}
    }
    if(action==="openGlobalPage")return this.backend.openGlobalPage(this.workspace,combined)
    if(action==="worksiteStart"){
      if(input.accountPrincipal&&input.accountPrincipal!==this.accountPrincipal)throw new LoopError("loop-host/needs-auth","Host owner changed")
      return this.backend.worksiteStart({accountPrincipal:this.accountPrincipal,workspaceId:this.workspace,sessionId:"host-account"},input,combined)
    }
    if(action==="disconnectModelConnection"){
      const credential=this.workspace?await new HostCredentialStore(this.options.provider,this.config.serviceBaseUrl,this.workspace,this.config.installationId).read():undefined
      if(!credential||credential.grant_id!==input.connectionId)throw new LoopError("loop-host/target-unavailable","Loop model connection was not found")
      if((this.accountPrincipal&&this.accountPrincipal!==credential.principal_id)||(input.accountPrincipal&&input.accountPrincipal!==credential.principal_id))throw new LoopError("loop-host/needs-auth","Loop account changed")
      const result=await this.backend!.disconnectModelConnection({accountPrincipal:credential.principal_id,workspaceId:this.workspace,sessionId:"host-account"},input.connectionId,combined,lease)
      this.captureBlocked=true
      this.human?.detach()
      this.selection=undefined
      await Promise.all([...this.writers].map(writer=>writer.fenceAll()))
      await this.observe("")
      return result
    }
    // Binding setup needs the live Host session. Each business API verifies its own credential.
    const status=["beginBind","createProject","completeBind","unbind"].includes(action)
      ? await this.backend.accountStatus(this.workspace,combined) : await this.connectionIdentity()
    if(status.state!=="signed_in")throw new LoopError("loop-host/needs-auth","Loop sign-in is required")
    if((this.accountPrincipal && this.accountPrincipal!==status.accountPrincipal) || (input.accountPrincipal && input.accountPrincipal!==status.accountPrincipal))throw new LoopError("loop-host/needs-auth","Loop account changed")
    await this.observe(status.accountPrincipal)
    const context={accountPrincipal:status.accountPrincipal,workspaceId:this.workspace,sessionId:input.hostSessionId || input.sessionId || "host-account"}
    const syncOptions={stateHome:this.config.stateHome,syncHome:this.syncHome??this.config.stateHome,profile:this.config.syncProfile}
    if(action==="unbind"){
      if(![undefined,"","human_confirmed"].includes(input.recoveryMode)||typeof input.workspace?.workspaceId!=="string"||!input.workspace.workspaceId||input.sessionIds!==undefined&&(!Array.isArray(input.sessionIds)||input.sessionIds.length>4096||input.sessionIds.some((id:any)=>typeof id!=="string"||! /^[a-zA-Z0-9_.:-]{1,255}$/u.test(id))))throw new LoopError("loop-host/invalid-request","Invalid Workspace disconnect request")
      for(const writer of this.writers)await writer.fenceSessions(input.sessionIds??[])
      if(input.hasRemainingBindings)return this.backend.syncAction(context,syncOptions,"unbind",input,combined)
      await this.disconnect(input,combined);return {}
    }
    if(action==="beginBind"){
      const binding=await this.backend.syncAction(context,syncOptions,"checkWorkspaceBinding",{workspaceId:input.workspace.workspaceId},combined)
      if(binding&&input.mode!=="switch")return {state:"active",binding,accountPrincipal:status.accountPrincipal}
      if ("deviceOnly" in status && status.deviceOnly) return this.connect(combined, undefined, true)
      const catalog=await this.backend.syncAction(context,syncOptions,"projectSyncCatalog",{},combined)
      const selection={id:randomUUID(),expires:Date.now()+15*60_000,workspace:input.workspace.workspaceId,account:status.accountPrincipal,agent:catalog.agent.agentId,grantId:status.grantId}
      this.selection=selection
      return {state:"select_target",challenge:{id:selection.id,loginUrl:"",expiresAt:new Date(selection.expires).toISOString()},projects:catalog.projects,agents:[catalog.agent],accountPrincipal:status.accountPrincipal,workspaceName:catalog.workspaceName,workspaceId:catalog.workspaceId}
    }
    if(action==="completeBind"||action==="createProject"){
      const selection=this.selection
      if(!selection||selection.id!==input.challengeId||selection.expires<=Date.now()||selection.workspace!==input.workspace?.workspaceId||selection.account!==status.accountPrincipal||selection.grantId!==status.grantId)throw new LoopError("loop-host/conflict","Binding selection expired or changed")
      if(action==="createProject")return this.backend.syncAction(context,syncOptions,action,input,combined)
      if(input.agentId!==selection.agent)throw new LoopError("loop-host/conflict","Selected Agent changed")
      const result=await this.backend.syncAction(context,syncOptions,"prepareProjectSync",input,combined)
      if(this.selection===selection)this.selection=undefined
      return result
    }
    if(action==="checkWorkspaceBinding")return this.backend.syncAction(context,syncOptions,action,input,combined)
    if(["openLoopPage","status","refreshProjectSyncMetadata"].includes(action))return this.backend.syncAction(context,syncOptions,action,input,combined)
    if(action.startsWith("collaboration"))return this.backend.collaborationAction(context,this.config.stateHome,action,input,combined,message=>{for(const listener of this.events){try{listener(publicValue(message))}catch{}}})
    if(action==="skillCatalogWatch")return this.backend.watchCatalog(context,input,message=>{for(const listener of this.skills){try{listener(message)}catch{}}},combined)
    if(["knowledgeCatalog","skillCatalog","skillContent"].includes(action))return this.backend.catalogRead(context,action,input,combined)
    if(["projectSyncCatalog","prepareProjectSync","reconcileWorkspaceBinding","setSync","syncStatus","retrySync"].includes(action)){
      if(!this.syncHome)throw new LoopError("loop-host/unavailable","Native sync storage is not configured")
      return this.backend.syncAction(context,{stateHome:this.config.stateHome,syncHome:this.syncHome,profile:this.config.syncProfile},action,input,combined)
    }
    switch(action){
      case "agentCatalog":{
        if(!input.workspaceId)throw new LoopError("loop-host/invalid-request","Host Workspace is required")
        const catalog=await this.backend.catalog(context,combined)
        return {actions:catalog.map(item=>item.id).filter(name=>!input.prefix || name.startsWith(input.prefix)).sort()}
      }
      case "agentSchema":
      case "agentAction": {
        if(action==="agentAction" && (!input.workspaceId || !input.sessionId))throw new LoopError("loop-host/invalid-request","Host Workspace and Session are required")
        try {
          return action==="agentSchema" ? await this.backend.describe(context,input.name,combined)
            : await this.backend.invoke(context,input.name,input.arguments??{},combined)
        } catch (error) {
          if (!input.prepareDelegation || !(error instanceof LoopError) || error.outcomeUnknown) throw error
          const denied = error.status===403 && ["action_not_granted","resource_not_granted","forbidden_scope","forbidden","action_unavailable"].includes(error.code)
          const missing = error.status===404 && error.code==="unknown_action"
          if (!denied && !missing) throw error
          try {
            const delegation = await this.backend.delegationPreview(context,input.name,input.delegationArguments,combined)
            if (delegation?.action!==input.name) throw error
            return {error:{code:error.code,message:error.message},delegation}
          } catch (previewError) {
            if (previewError instanceof LoopError && previewError.status===400) throw previewError
            throw error
          }
        }
      }
      case "modelRuntimeCatalog":return this.backend.modelRuntimeCatalog(context,combined)
      case "refreshModelConnections":{
        const catalog=await this.backend.refreshModelConnections(context,combined)
        return {...catalog,state:catalog.connections.length?"active":"needs_auth"}
      }
      case "ensureModelSession":return this.backend.ensureModelSession(context,input,combined)
      case "closeModelHostSession":return this.backend.closeModelHostSession(context,combined)
      case "closeAllModelSessions":return this.backend.closeAllModelSessions(context,combined)
      default:throw new LoopError("loop-host/unsupported","Native Host action is not implemented: "+action)
    }
  }
  async dispose(){
    const outcomes=await Promise.allSettled([...this.writers].map(writer=>writer.shutdown()))
    this.control.abort();await this.human?.dispose();await this.backend?.dispose();await this.completion;this.writers.clear();this.events.clear();this.skills.clear()
    const failed=outcomes.find(result=>result.status==="rejected")
    if(failed?.status==="rejected")throw failed.reason
  }
}

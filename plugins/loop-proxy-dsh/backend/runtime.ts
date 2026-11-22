import {CollaborationService} from "./collaboration.ts"
import type {CollaborationWatch} from "./collaboration-watch.ts"
import type {CollaborationNamespace} from "./collaboration-store.ts"
import {WorksiteClient,validateWorksite} from "./worksite.ts"
import {HostIdentity} from "./host-identity.ts"
import {CatalogWatch} from "./catalog-watch.ts"
import {SyncControl} from "./sync-control.ts"
import type {SyncOptions} from "./sync-control.ts"
import {DisconnectService} from "./disconnect.ts"
import {PageService} from "./pages.ts"
import {AccountService} from "./account.ts"
import {HostAPI} from "./host-api.ts"
import {ModelService} from "./models.ts"
import type {ModelInput} from "./models.ts"
import {randomUUID,randomBytes,createHash} from "node:crypto"
import {HostCredentialStore, serviceURL} from "./credentials.ts"
import type {CredentialProvider, Credential} from "./credentials.ts"
import {TokenManager, LoopHTTP} from "./http.ts"
import {ActionClient, readNamedChannel, requestHumanDM, shareDocumentLink} from "./actions.ts"
import {beginHostLogin} from "./oauth.ts"
import type {HostLogin} from "./oauth.ts"
import {LoopError, requireActive} from "./errors.ts"

export interface RuntimeOptions {
  provider: CredentialProvider
  server: string
  installation: string
  pageOrigin: string
  fetch?: typeof fetch
  legacyProofRoot?: string
  onDisconnected?: (credential:Credential,signal?:AbortSignal)=>Promise<void>
}
export interface AccountIdentity {accountPrincipal: string; workspaceId: string; grantId: string}
export type ConnectionOperationKind = "login" | "model-revoke" | "account-disconnect"
export interface ConnectionOperationLease {kind:ConnectionOperationKind; token:symbol}
/** Host-only context. The UI/tool adapter must obtain this from the actual DSH
 * session rather than forwarding model-supplied account or workspace fields.
 */
export interface ActionContext {accountPrincipal: string; workspaceId: string; sessionId: string}

/** Owns in-process requests and OAuth listeners. No global process handlers,
 * environment mutation, shell helpers, or tokens in its public responses.
 * Business binding/ledger adapters remain responsible for their own fences.
 */
export class LoopBackend {
  private options: RuntimeOptions
  private control = new AbortController()
  private pending = new Set<Promise<unknown>>()
  private logins = new Map<string, {login: HostLogin, completion: Promise<AccountIdentity>}>()
  private models = new Map<string, ModelService>()
  private worksite?:{generation:string;configuration:string;client:WorksiteClient}
  private worksiteQueue:Promise<unknown>=Promise.resolve()
  private watchQueue:Promise<unknown>=Promise.resolve()
  private watches = new Map<string,{generation:string;watch:CatalogWatch}>()
  private collaborationWatches = new Map<string,{generation:string;watch:CollaborationWatch}>()
  private generations = new Map<string, string>()
  private connectionOperation?:ConnectionOperationLease
  private accountDisconnects = new Map<string,Promise<void>>()
  private modelOperations = new Set<Promise<unknown>>()
  private loginQueue: Promise<unknown> = Promise.resolve()
  private closed = false
  private disposal?: Promise<void>
  constructor(options: RuntimeOptions) {
    this.options = {...options, server: serviceURL(options.server)}
    if (!options.installation) throw new LoopError("loop-host/invalid-request", "Installation is required")
  }
  private active(signal?: AbortSignal): AbortSignal {
    if (this.closed) throw new LoopError("loop-host/unavailable", "Loop plugin is stopped")
    const combined = signal ? AbortSignal.any([signal, this.control.signal]) : this.control.signal
    requireActive(combined)
    return combined
  }
  private track<T>(operation: () => Promise<T>): Promise<T> {
    const promise = Promise.resolve().then(operation)
    this.pending.add(promise)
    void promise.finally(() => this.pending.delete(promise)).catch(() => {})
    return promise
  }
  private store(workspace: string): HostCredentialStore {
    return new HostCredentialStore(this.options.provider, this.options.server, workspace, this.options.installation)
  }
  private identity(credential: Credential): AccountIdentity {
    return {accountPrincipal: credential.principal_id, workspaceId: credential.workspace_id, grantId: credential.grant_id}
  }
  /** One owner coordinates login, model revocation and full disconnect. Full
   * disconnect preempts earlier work so model deletion cannot win after the
   * user has requested installation-level remote cleanup. */
  claimConnectionOperation(kind:ConnectionOperationKind,preempt=false):ConnectionOperationLease {
    if(this.connectionOperation && !(preempt && kind==="account-disconnect")){
      throw new LoopError("loop-host/conflict","Another Loop connection operation is in progress")
    }
    const lease={kind,token:Symbol(kind)}
    this.connectionOperation=lease
    return lease
  }
  ownsConnectionOperation(lease:ConnectionOperationLease):boolean {
    return this.connectionOperation?.token===lease.token
  }
  releaseConnectionOperation(lease:ConnectionOperationLease):void {
    if(this.ownsConnectionOperation(lease))this.connectionOperation=undefined
  }
  private requireConnectionOperation(lease:ConnectionOperationLease,kind:ConnectionOperationKind):void {
    if(lease.kind!==kind || !this.ownsConnectionOperation(lease))throw new LoopError("loop-host/conflict","Loop connection operation was superseded")
  }
  private accountDisconnectPending():boolean {
    return this.connectionOperation?.kind==="account-disconnect"
  }
  oauthCallbackBroker() {
    return this.worksite?.client.status().state==="connected"?this.worksite.client:undefined
  }
  beginLogin(signal?: AbortSignal, accessToken?:string): Promise<{challengeId: string; authorizationURL: string}> {
    const combined = this.active(signal)
    const previous = this.loginQueue
    const setup = this.track(() => previous.then(async () => {
      requireActive(combined)
      if(this.connectionOperation && this.connectionOperation.kind!=="login")throw new LoopError("loop-host/conflict","Another Loop connection operation is in progress")
      // One pending consent per runtime prevents a late login replacing a newer one.
      for (const {login} of this.logins.values()) login.cancel()
      await Promise.allSettled([...this.logins.values()].map(value => value.completion))
      const login = await beginHostLogin({...this.options, accessToken, signal: combined,...(this.worksite?.client.status().state==="connected"?{callbackBroker:this.worksite.client}:{})})
      const challengeId = randomUUID()
      const completion = this.track(async () => {
        const {credential} = await login.result
        requireActive(combined)
        this.generations.set(credential.workspace_id, credential.generation)
        return this.identity(credential)
      })
      void completion.catch(() => {})
      this.logins.set(challengeId, {login, completion})
      return {challengeId, authorizationURL: login.authorizationURL}
    }))
    this.loginQueue = setup.catch(() => {})
    return setup
  }
  async completeLogin(challengeId: string): Promise<AccountIdentity> {
    this.active()
    const login = this.logins.get(challengeId)
    if (!login) throw new LoopError("loop-host/invalid-request", "Unknown login challenge")
    try { return await login.completion } finally { this.logins.delete(challengeId) }
  }
  cancelLogin(challengeId: string): void {
    this.logins.get(challengeId)?.login.cancel()
  }
  private async credential(context: ActionContext, signal: AbortSignal): Promise<Credential> {
    if (!context.sessionId || !context.accountPrincipal || !context.workspaceId) throw new LoopError("loop-host/invalid-request", "Action context is incomplete")
    const store = this.store(context.workspaceId)
    // Refresh consults the provider under its disk lock, so stale readRecord
    // snapshots cannot authorize a replaced or signed-out account.
    const credential = await store.read()
    if (!credential || credential.principal_id !== context.accountPrincipal) throw new LoopError("loop-host/needs-auth", "Loop account changed")
    const generation = this.generations.get(context.workspaceId)
    if (generation && generation !== credential.generation) throw new LoopError("loop-host/needs-auth", "Loop connection changed")
    this.generations.set(context.workspaceId, credential.generation)
    return await new TokenManager(store, credential, {fetch: this.options.fetch}).credential(signal)
  }
  private action<T>(context: ActionContext, signal: AbortSignal | undefined, operation: (client: ActionClient, signal: AbortSignal) => Promise<T>, mutation = false): Promise<T> {
    const combined = this.active(signal)
    return this.track(async () => {
      const credential = await this.credential(context, combined)
      const tokens = new TokenManager(this.store(context.workspaceId), credential, {fetch: this.options.fetch})
      const result = await operation(new ActionClient(new LoopHTTP(tokens, credential.resource, this.options.fetch)), combined)
      requireActive(combined)
      const current = await this.store(context.workspaceId).modify(async current => current)
      if (current?.generation !== credential.generation) throw new LoopError("loop-host/needs-auth", "Loop connection changed before the result arrived", 0, mutation)
      return result
    })
  }
  catalog(context: ActionContext, signal?: AbortSignal, domain = "", personal = false) {
    return this.action(context, signal, (client, combined) => client.actions(combined, domain, personal))
  }
  delegationPreview(context: ActionContext, name: string, args: Record<string,unknown> | undefined, signal?: AbortSignal) {
    return this.action(context, signal, (client, combined) => client.delegationPreview(name, args, combined))
  }
  channelHistory(context: ActionContext, args: Record<string,unknown>, prepare: boolean, signal?: AbortSignal, priorDenial?: LoopError) {
    return this.action(context, signal, (client, combined) => readNamedChannel(client,args,prepare,combined,priorDenial))
  }
  humanDM(context: ActionContext, name: string, args: Record<string,unknown>, signal?: AbortSignal) {
    return this.action(context,signal,(client,combined)=>requestHumanDM(client,name,args,combined))
  }
  shareLink(context: ActionContext, args: Record<string,unknown>, base: string, workspace: string, signal?: AbortSignal) {
    return this.action(context,signal,(client,combined)=>shareDocumentLink(client,args,base,workspace,combined),true)
  }
  describe(context: ActionContext, name: string, signal?: AbortSignal) {
    return this.action(context, signal, (client, combined) => client.describe(name, combined))
  }
  invoke(context: ActionContext, name: string, args: Record<string, unknown>, signal?: AbortSignal) {
    return this.action(context, signal, (client, combined) => client.invoke(name, args, combined), true)
  }
  accountStatus(workspace: string, signal?: AbortSignal): Promise<any> {
    const combined = this.active(signal)
    return this.track(async () => {
      const credential = await this.store(workspace).read()
      if (!credential) return {state: "signed_out"}
      if (credential.disconnect) return {state:"signing_out"}
      const tokens = new TokenManager(this.store(workspace), credential, {fetch:this.options.fetch})
      try { return await new AccountService(new HostAPI(tokens, this.options.fetch), this.options.installation, this.options.pageOrigin).status(combined) }
      catch (error) {
        if (error instanceof LoopError && error.code === "loop-host/needs-auth") return {state:"needs_auth", accountPrincipal:credential.principal_id, workspaceId:workspace}
        throw error
      }
    })
  }
  async preparePageConsent(workspace: string, expectedGrant: string, signal: AbortSignal) {
    const store = this.store(workspace)
    // Persist one candidate per grant before preparing any browser confirmation.
    // A retry or another Host process must ask Loop to approve the same proof.
    const credential = await store.modify(async current => {
      requireActive(signal)
      if (!current || current.disconnect || current.grant_id !== expectedGrant || current.login_method !== "access_token") {
        throw new LoopError("loop-host/conflict", "The device connection changed")
      }
      return current.host_page_proof ? current : {...current, host_page_proof: randomBytes(32).toString("base64url")}
    })
    if (!credential?.host_page_proof) throw new LoopError("loop-host/needs-auth", "The device connection changed")
    const proof = credential.host_page_proof
    const api = new HostAPI(new TokenManager(store, credential, {fetch: this.options.fetch}), this.options.fetch)
    const result = await api.request("account", "POST", "/session", {
      workspaceId: workspace, installationId: this.options.installation, pageOrigin: this.options.pageOrigin,
      pageConsent: "prepare", resumeProof: proof,
    }, signal)
    if (result.grantId !== expectedGrant || result.principalId !== credential.principal_id || result.workspaceId !== workspace) {
      throw new LoopError("loop-host/conflict", "The device connection changed")
    }
    if (result.pageAuthorized === true) return
    const url = new URL(result.pageConsentUrl, this.options.server)
    if (url.origin !== new URL(this.options.server).origin || url.pathname !== "/external-host/page-reauthorize" ||
        url.username || url.password || !url.hash || !(Date.parse(result.pageConsentExpiresAt) > Date.now())) {
      throw new LoopError("loop-host/backend-invalid", "Loop returned an invalid page authorization")
    }
    return {id: randomUUID(), loginUrl: url.href, expiresAt: result.pageConsentExpiresAt as string}
  }

  openGlobalPage(workspace: string, signal?: AbortSignal): Promise<any> {
    const combined=this.active(signal)
    return this.track(async()=>{
      const credential=await this.store(workspace).read()
      if(!credential)throw new LoopError("loop-host/needs-auth","Loop sign-in is required")
      const api=new HostAPI(new TokenManager(this.store(workspace),credential,{fetch:this.options.fetch}),this.options.fetch)
      return new PageService(api,this.options.installation,this.options.pageOrigin,this.options.fetch).launch("/workspaces",combined)
    })
  }
  private async modelService(context: ActionContext, signal: AbortSignal): Promise<ModelService> {
    const credential = await this.credential(context, signal)
    requireActive(signal)
    const key = credential.generation
    let models = this.models.get(key)
    if (!models) {
      models = new ModelService(new HostAPI(new TokenManager(this.store(context.workspaceId), credential, {fetch:this.options.fetch}), this.options.fetch), this.options.installation, this.options.fetch)
      this.models.set(key, models)
    }
    return models
  }
  modelRuntimeCatalog(context: ActionContext, signal?: AbortSignal): Promise<any> {
    const combined = this.active(signal)
    return this.track(async () => (await this.modelService(context, combined)).runtimeCatalog(combined))
  }
  refreshModelConnections(context: ActionContext, signal?: AbortSignal): Promise<any> {
    const combined = this.active(signal)
    return this.track(async () => (await this.modelService(context, combined)).refreshCatalog(combined))
  }
  disconnectModelConnection(context:ActionContext,connectionId:string,signal?:AbortSignal,lease?:ConnectionOperationLease):Promise<any>{
    const combined=this.active(signal)
    const owned=lease??this.claimConnectionOperation("model-revoke")
    this.requireConnectionOperation(owned,"model-revoke")
    const operation=this.track(async()=>{
      const store=this.store(context.workspaceId),credential=await this.credential(context,combined)
      if(connectionId!==credential.grant_id)throw new LoopError("loop-host/target-unavailable","Loop model connection was not found")
      await this.models.get(credential.generation)?.dispose();this.models.delete(credential.generation)
      const api=new HostAPI(new TokenManager(store,credential,{fetch:this.options.fetch}),this.options.fetch)
      try{await api.request("models","DELETE","/connection",undefined,combined)}catch(error){
        // Same public contract as the Go connection owner: an explicit 401
        // from DELETE confirms this connection is already unavailable. A
        // refresh or transport failure is never treated as confirmation.
        if(!(error instanceof LoopError)||error.status!==401)throw error
      }
      this.requireConnectionOperation(owned,"model-revoke")
      const removed=await store.revokeModel(credential.generation,()=>this.ownsConnectionOperation(owned))
      if(!removed)throw new LoopError("loop-host/conflict","Loop connection changed during model revocation")
      if(!this.ownsConnectionOperation(owned))throw new LoopError("loop-host/conflict","Full Loop disconnect superseded model revocation")
      this.generations.delete(context.workspaceId)
      return {state:"needs_auth",accountPrincipal:credential.principal_id,connections:[]}
    })
    this.modelOperations.add(operation)
    void operation.finally(()=>{
      this.modelOperations.delete(operation)
    }).catch(()=>{})
    return lease?operation:operation.finally(()=>this.releaseConnectionOperation(owned))
  }
  ensureModelSession(context: ActionContext, input: ModelInput, signal?: AbortSignal): Promise<any> {
    const combined = this.active(signal)
    if (context.sessionId !== input.hostSessionId) return Promise.reject(new LoopError("loop-host/conflict", "Model request belongs to another Host session"))
    return this.track(async () => (await this.modelService(context, combined)).ensureSession(input, combined))
  }
  closeModelHostSession(context: ActionContext, signal?: AbortSignal): Promise<any> {
    const combined = this.active(signal)
    return this.track(async () => (await this.modelService(context, combined)).closeHostSession(context.sessionId))
  }
  closeAllModelSessions(context: ActionContext, signal?: AbortSignal): Promise<any> {
    const combined = this.active(signal)
    return this.track(async () => (await this.modelService(context, combined)).closeHostSession())
  }
  private collaborationWatchKey(root:string,route:CollaborationNamespace){
    return JSON.stringify([root,route.serverBaseUrl,route.installationId,route.workspaceId,route.accountId,route.hostSessionId,route.bindingId,route.bindingEpoch])
  }
  collaborationAction(context:ActionContext,root:string,action:string,input:any,signal?:AbortSignal,emit:(value:any)=>void=()=>{}):Promise<any>{
    const combined=this.active(signal)
    if(action==="collaborationWatch"){
      const previous=this.watchQueue
      const operation=this.track(async()=>{
        await previous;requireActive(combined)
        const credential=await this.credential(context,combined),store=this.store(context.workspaceId)
        const api=new HostAPI(new TokenManager(store,credential,{fetch:this.options.fetch}),this.options.fetch)
        const identity=new HostIdentity(this.options.provider,api,this.options.installation,this.options.server,this.options.legacyProofRoot)
        const service=new CollaborationService(api,store,identity,root,this.options.installation)
        const route=await service.watchRoute(input,combined)
        const key=this.collaborationWatchKey(root,route),old=this.collaborationWatches.get(key)
        if(!input.stop&&input.ensure&&old?.generation===credential.generation&&old.watch.state!=="stopped"&&
           Boolean(old.watch.namespace.archive)===Boolean(route.archive)&&
           old.watch.namespace.deviceBindingId===route.deviceBindingId&&old.watch.namespace.agentMemberId===route.agentMemberId)return {watching:true}
        this.collaborationWatches.delete(key);await old?.watch.dispose()
        if(input.stop)return {watching:false}
        if(this.collaborationWatches.size>=64)throw new LoopError("loop-host/unavailable","Too many collaboration watches")
        const watch=await service.watch(route,emit,this.control.signal,combined)
        this.collaborationWatches.set(key,{generation:credential.generation,watch})
        return {watching:true}
      })
      this.watchQueue=operation.catch(()=>{});return operation
    }
    return this.track(async()=>{
      const credential=await this.credential(context,combined),store=this.store(context.workspaceId)
      const api=new HostAPI(new TokenManager(store,credential,{fetch:this.options.fetch}),this.options.fetch)
      const identity=new HostIdentity(this.options.provider,api,this.options.installation,this.options.server,this.options.legacyProofRoot)
      const service=new CollaborationService(api,store,identity,root,this.options.installation)
      switch(action){
        case "collaborationStatus":return service.status(input,combined)
        case "collaborationWaitStatus":return service.waitStatus(input,route=>{
          const entry=this.collaborationWatches.get(this.collaborationWatchKey(root,route))
          return entry?.generation===credential.generation&&!entry.watch.namespace.archive&&
            entry.watch.namespace.deviceBindingId===route.deviceBindingId&&entry.watch.namespace.agentMemberId===route.agentMemberId?entry.watch.state:"stopped"
        },combined)
        case "collaborationBoards":return service.boards(input,combined)
        case "collaborationBindings":return service.bindings(combined)
        case "collaborationBind":return service.bind(input,combined)
        case "collaborationDirectory":return service.directory(input,combined)
        case "collaborationPrepareIntent":return service.prepareIntent(input,combined)
        case "collaborationBindIntent":return service.bindIntent(input,combined)
        case "collaborationActivateIntent":return service.activateIntent(input,combined)
        case "collaborationAction":{
          const result=await service.action(input,combined,emit)
          if(input.action==="set-subscription"&&result.mode==="push")await this.collaborationAction(context,root,"collaborationWatch",{sessionId:input.sessionId,ensure:result.replayed===true},combined,emit)
          return result
        }
        case "collaborationReconcile":{
          const {watchRoute,...result}=await service.reconcile(input,combined)
          // A watch startup failure must not turn a persisted successful write
          // into an uncertain outcome. snapshotRequired remains until recovery.
          if(watchRoute)await this.collaborationAction(context,root,"collaborationWatch",watchRoute,combined,emit).catch(()=>{})
          return result
        }
        case "collaborationContinuation":return service.continuation(input,combined)
        case "collaborationCancel":return service.cancel(input,combined)
        case "collaborationAccept":return service.accept(input,combined)
        case "collaborationAuthorize":return service.authorize(input,combined)
        default:throw new LoopError("loop-host/unsupported","Native collaboration action is not implemented: "+action)
      }
    })
  }
  worksiteStatus(){this.active();return this.worksite?.client.status()??{state:"stopped",running:false}}
  worksiteStop():Promise<any>{
    const previous=this.worksiteQueue
    const operation=this.track(async()=>{await previous;const current=this.worksite;this.worksite=undefined;await current?.client.dispose();return {state:"stopped",running:false}})
    this.worksiteQueue=operation.catch(()=>{});return operation
  }
  worksiteStart(context:ActionContext,input:any,signal?:AbortSignal):Promise<any>{
    const combined=this.active(signal),previous=this.worksiteQueue
    const operation=this.track(async()=>{
      await previous;requireActive(combined)
      validateWorksite({...input,installationId:this.options.installation,proof:"x".repeat(43)})
      const configuration=createHash("sha256").update(JSON.stringify([input.worksiteUrl,input.webServerOrigin,input.authenticatedUrl,input.publicOrigin,input.hostGeneration,input.hostKind])).digest("hex")
      if(!context.accountPrincipal||!context.workspaceId)throw new LoopError("loop-host/needs-auth","Host owner is unavailable")
      if(this.accountDisconnectPending())throw new LoopError("loop-host/needs-auth","Host disconnect is pending")
      const current=await this.store(context.workspaceId).modify(async value=>value)
      if(current&&(current.disconnect||current.principal_id!==context.accountPrincipal))throw new LoopError("loop-host/needs-auth","Host owner changed or disconnect is pending")
      let proof=await HostIdentity.loadProof(this.options.provider,this.options.server,context.accountPrincipal,this.options.legacyProofRoot,combined)
      if(current){
        const api=new HostAPI(new TokenManager(this.store(context.workspaceId),current,{fetch:this.options.fetch}),this.options.fetch)
        const identity=new HostIdentity(this.options.provider,api,this.options.installation,this.options.server,this.options.legacyProofRoot)
        try{proof=await identity.register(combined)}catch(error){
          // Worksite has independent Human+Home-proof authority. A revoked
          // Agent credential cannot disable an already enabled Worksite.
          if(!proof)throw error
        }
      }
      if(!proof)throw new LoopError("loop-host/needs-auth","Established Host proof is unavailable")
      requireActive(combined)
      if(this.accountDisconnectPending())throw new LoopError("loop-host/needs-auth","Host disconnect is pending")
      const generation=createHash("sha256").update(context.accountPrincipal+"\0"+proof).digest("hex")
      if(this.worksite?.generation===generation&&this.worksite.configuration===configuration)return this.worksite.client.start()
      await this.worksite?.client.dispose();this.worksite=undefined
      requireActive(combined)
      const client=new WorksiteClient({...input,installationId:this.options.installation,proof})
      this.worksite={generation,configuration,client};return client.start()
    })
    this.worksiteQueue=operation.catch(()=>{});return operation
  }
  private catalogScope(credential:Credential,workspace:string,session:string,catalog:string){
    const {server,installation}=this.options
    const identity=[server,installation,credential.workspace_id,credential.principal_id,credential.grant_id,credential.client_id,workspace]
    return {installationId:installation,accountId:credential.principal_id,serverBaseUrl:server,workspaceId:credential.workspace_id,
      hostWorkspaceId:workspace,sessionId:session,catalog,identityFingerprint:"skill-scope:"+createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0,36)}
  }

  watchCatalog(context:ActionContext,input:any,emit:(value:any)=>void,signal?:AbortSignal):Promise<any>{
    const combined=this.active(signal)
    const previous=this.watchQueue
    const operation=this.track(async()=>{
      await previous
      requireActive(combined)
      if(typeof input.workspaceId!=="string" || !/^[a-zA-Z0-9_.:-]{1,255}$/u.test(input.workspaceId))throw new LoopError("loop-host/invalid-request","Invalid Host Workspace")
      const key=JSON.stringify([context.workspaceId,context.accountPrincipal,input.workspaceId])
      if(input.stop){const old=this.watches.get(key);this.watches.delete(key);await old?.watch.dispose();return {watching:false}}
      const credential=await this.credential(context,combined)
      const old=this.watches.get(key)
      if(old?.generation===credential.generation)return {watching:true}
      await old?.watch.dispose()
      requireActive(combined)
      const tokens=new TokenManager(this.store(context.workspaceId),credential,{fetch:this.options.fetch})
      const watch=new CatalogWatch(tokens,async()=>this.catalogScope(await tokens.credential(this.control.signal),input.workspaceId,"","skills"),emit,this.control.signal)
      if(this.watches.size>=64){await watch.dispose();throw new LoopError("loop-host/unavailable","Too many catalog watches")}
      this.watches.set(key,{generation:credential.generation,watch})
      return {watching:true}
    })
    this.watchQueue=operation.catch(()=>{})
    return operation
  }
  catalogRead(context:ActionContext,action:string,input:any,signal?:AbortSignal):Promise<any>{
    const combined=this.active(signal)
    return this.track(async()=>{
      const names:Record<string,string>={skillCatalog:"skill.catalog",skillContent:"skill.content",knowledgeCatalog:"kb.catalog"}
      if(!names[action] || !input.workspaceId || !input.sessionId)throw new LoopError("loop-host/invalid-request","Invalid catalog request")
      const credential=await this.credential(context,combined)
      const scope=this.catalogScope(credential,input.workspaceId,input.sessionId,action==="knowledgeCatalog"?"knowledge":"skills")
      const fields=action==="skillContent"?["skillId","path","expectedVersionId","expectedCommitSha","offset","maxBytes"]:action==="knowledgeCatalog"?["kbId","cursor"]:["query","cursor","limit"]
      const args=Object.fromEntries(fields.filter(key=>input[key]!==undefined && input[key]!=="").map(key=>[key,input[key]]))
      const result=await this.invoke(context,names[action],args,combined)
      if(!result?.data || !Object.hasOwn(result.data,"data"))throw new LoopError("loop-host/backend-invalid","Catalog read returned no action data")
      return {scope,data:result.data.data}
    })
  }
  syncAction(context:ActionContext,options:Omit<SyncOptions,"installation"|"server">,action:string,input:any,signal?:AbortSignal):Promise<any> {
    const combined=this.active(signal)
    return this.track(async()=>{
      const credential=await this.credential(context,combined)
      const api=new HostAPI(new TokenManager(this.store(context.workspaceId),credential,{fetch:this.options.fetch}),this.options.fetch)
      const pages=new PageService(api,this.options.installation,this.options.pageOrigin,this.options.fetch)
      const sync=new SyncControl(api,{...options,installation:this.options.installation,server:this.options.server},pages)
      try{return await (async()=>{switch(action){
        case "checkWorkspaceBinding":return sync.binding(input.workspaceId,combined)
        case "reconcileWorkspaceBinding":return sync.reconcileWorkspaceBinding(input,combined)
        case "unbind":return sync.unbind(input,combined)
        case "status":return sync.workspaceStatus(input,combined)
        case "refreshProjectSyncMetadata":return sync.refreshMetadata(input,combined)
        case "createProject":return sync.createProject(input,combined)
        case "openLoopPage":{
          const binding=await sync.binding(input.workspace?.workspaceId,combined)
          if(!binding)throw new LoopError("loop-host/conflict","The Workspace is not bound")
          const next=input.pagePath || (binding.projectId?`/w/${encodeURIComponent(context.workspaceId)}/projects/${encodeURIComponent(binding.projectId)}/tasks`:`/w/${encodeURIComponent(context.workspaceId)}`)
          return pages.launch(next,combined)
        }
        case "projectSyncCatalog":
          return input.localWorkspaces?sync.catalog(combined):sync.projectCatalog(combined)
        case "prepareProjectSync":
          return input.localWorkspace?sync.prepareLocal(input.workspace,input.agentId,combined):sync.prepareProject(input,combined)
        case "setSync":return sync.set(input,combined)
        case "syncStatus":return sync.status(input,combined)
        case "retrySync":return sync.retry(input,combined)
        default:throw new LoopError("loop-host/invalid-request","Unknown sync action")
      }})()}finally{pages.clear()}
    })
  }
  disconnectAccount(workspace:string,signal?:AbortSignal,lease?:ConnectionOperationLease):Promise<void> {
    const current=this.accountDisconnects.get(workspace)
    if(current)return current
    const combined=this.active(signal)
    const owned=lease??this.claimConnectionOperation("account-disconnect",true)
    this.requireConnectionOperation(owned,"account-disconnect")
    const operation=this.track(async()=>{
      await Promise.allSettled([...this.modelOperations])
      // A cancelled publisher must finish before the exact grant set freezes.
      for(const {login} of this.logins.values())login.cancel()
      await this.loginQueue
      for(const {login} of this.logins.values())login.cancel()
      await Promise.allSettled([...this.logins.values()].map(value=>value.completion))
      await this.worksiteStop()
      if(!workspace)return
      const store=this.store(workspace),credential=await store.readForDisconnect()
      if(!credential)return
      for(const [key,entry] of this.watches)if(entry.generation===credential.generation){this.watches.delete(key);await entry.watch.dispose()}
      for(const [key,entry] of this.collaborationWatches)if(entry.generation===credential.generation){this.collaborationWatches.delete(key);await entry.watch.dispose()}
      await this.models.get(credential.generation)?.dispose()
      this.models.delete(credential.generation)
      await new DisconnectService(store,this.options.installation,this.options.pageOrigin,this.options.fetch,this.options.onDisconnected).run(combined)
      this.generations.delete(workspace)
    })
    let settled:Promise<void>
    settled=operation.finally(()=>{
      if(this.accountDisconnects.get(workspace)===settled)this.accountDisconnects.delete(workspace)
      if(!lease)this.releaseConnectionOperation(owned)
    })
    this.accountDisconnects.set(workspace,settled)
    return settled
  }
  /** Local authority invalidation. Server revocation and business disconnect
   * recovery must precede this in the product account adapter. */
  forgetLocalAccount(context: ActionContext, signal?: AbortSignal): Promise<void> {
    const combined = this.active(signal)
    return this.track(async () => {
      requireActive(combined)
      const store = this.store(context.workspaceId)
      await store.modify(async current => {
        if (current && current.principal_id !== context.accountPrincipal) throw new LoopError("loop-host/conflict", "Loop account changed")
        if (current?.disconnect) throw new LoopError("loop-host/conflict", "Loop disconnect is pending")
        return undefined
      })
      const generation = this.generations.get(context.workspaceId)
      if (generation) { await this.models.get(generation)?.dispose(); this.models.delete(generation) }
      this.generations.delete(context.workspaceId)
    })
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal
    this.closed = true
    this.control.abort()
    for (const {login} of this.logins.values()) login.cancel()
    this.disposal = (async () => {
      await this.worksite?.client.dispose();this.worksite=undefined
      await Promise.all([...this.watches.values()].map(entry=>entry.watch.dispose()))
      this.watches.clear()
      await Promise.all([...this.collaborationWatches.values()].map(entry=>entry.watch.dispose()))
      this.collaborationWatches.clear()
      await Promise.all([...this.models.values()].map(models => models.dispose()))
      while (this.pending.size) await Promise.allSettled([...this.pending])
      this.models.clear()
      this.logins.clear()
      this.generations.clear()
    })()
    return this.disposal
  }
}

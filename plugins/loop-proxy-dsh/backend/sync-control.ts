import {createHash} from "node:crypto"
import {join} from "node:path"
import type {Credential} from "./credentials.ts"
import {ActionClient} from "./actions.ts"
import {LoopHTTP} from "./http.ts"
import {PageService} from "./pages.ts"
import {HostAPI} from "./host-api.ts"
import {DurableJSON} from "./storage.ts"
import {SyncOutbox} from "./sync.ts"
import {integer,stringifyWire} from "./codec.ts"
import {LoopError} from "./errors.ts"

const hash=(value:string)=>createHash("sha256").update(value).digest("hex")
function ownedBy(record:any,credential:Credential) {
  return record.grantId === credential.grant_id && record.clientId === credential.client_id
}
function disconnecting(record:any) { return Boolean(record?.revocation || record?.accountDisconnect) }
export interface SyncOptions {stateHome:string;syncHome:string;profile:string;installation:string;server:string}
/** Business upload consent remains separate from possession of an account
 * credential. Binding paths and records retain the Go client's public layout. */
export class SyncControl {
  private api:HostAPI
  private options:SyncOptions
  private pages?:PageService
  constructor(api:HostAPI,options:SyncOptions,pages?:PageService){this.api=api;this.options=options;this.pages=pages}
  async principal(signal?:AbortSignal){
    const credential=await this.api.tokens.credential(signal)
    const principal=await this.api.request("sync","GET","/grant",undefined,signal)
    if(principal?.userId!==credential.principal_id || principal.workspaceId!==credential.workspace_id || typeof principal.agentId!=="string" || !principal.agentId)throw new LoopError("loop-host/needs-auth","Loop upload identity changed")
    return {credential,principal}
  }
  private async bindingFile(workspace:string,signal?:AbortSignal){
    if(typeof workspace!=="string" || !workspace.trim())throw new LoopError("loop-host/invalid-request","Host Workspace identity is required")
    const credential=await this.api.tokens.credential(signal)
    const key=hash([this.options.installation,credential.principal_id,workspace,this.options.server,credential.workspace_id].join("\0"))
    return {credential,file:new DurableJSON(join(this.options.stateHome,"bindings",key+".json"))}
  }
  async binding(workspace:string,signal?:AbortSignal){
    const {credential,file}=await this.bindingFile(workspace,signal)
    const record=await file.read()
    return this.checkedTarget(record,credential)
  }
  private checkedTarget(record:any,credential:Credential){
    if(!record)return undefined
    if(disconnecting(record))throw new LoopError("loop-host/conflict","Workspace disconnect is pending")
    if(record.target?.loopWorkspaceId!==credential.workspace_id||record.target?.loopServiceBaseUrl!==this.options.server)throw new LoopError("loop-host/conflict","Workspace binding points to a different Loop server or Workspace")
    if(!ownedBy(record,credential)){
      const reason=record.clientId==="" ? "Legacy Workspace binding needs verification during Workspace sync" : "Workspace binding belongs to another connection"
      throw new LoopError("loop-host/conflict",reason)
    }
    return record.target
  }
  async catalogScope(workspace:string,session:string,catalog="skills",signal?:AbortSignal){
    const {credential,file}=await this.bindingFile(workspace,signal)
    const record=await file.read()
    const target=this.checkedTarget(record,credential)
    const revision=record?"hostbinding:"+hash([target.loopServiceBaseUrl,target.loopWorkspaceId,target.projectId,target.defaultChannelId,target.agentId,record.grantId,record.clientId].map(value=>value??"").join("\0")).slice(0,36):""
    const scope:any={installationId:this.options.installation,accountId:credential.principal_id,serverBaseUrl:this.options.server,workspaceId:credential.workspace_id,hostWorkspaceId:workspace,sessionId:session,catalog}
    if(record)Object.assign(scope,{projectId:target.projectId,agentId:target.agentId,bindingRevision:revision})
    scope.identityFingerprint="skill-scope:"+hash([this.options.server,credential.principal_id,this.options.installation,credential.workspace_id,workspace,target?.projectId??"",target?.agentId??"",revision].join("\0")).slice(0,36)
    return scope
  }
  async unbind(input:any,signal?:AbortSignal){
    const {credential,file}=await this.bindingFile(input.workspace?.workspaceId,signal)
    this.checkedTarget(await file.read(),credential)
    // Stop durable upload first. A failure leaves the binding visible so the
    // same operation can safely retry; no other Workspace is changed.
    for(const session of input.sessionIds??[])await (await this.outbox(session,signal)).stop(signal)
    await file.remove(record=>{
      if(record&&(disconnecting(record)||!ownedBy(record,credential)||record.target?.loopWorkspaceId!==credential.workspace_id||record.target?.loopServiceBaseUrl!==this.options.server))throw new LoopError("loop-host/conflict","Workspace binding changed during removal")
    },signal)
    return {}
  }
  async workspaceStatus(input:any,signal?:AbortSignal){
    let target:any
    try{target=await this.binding(input.workspace?.workspaceId,signal)}catch(error){if(error instanceof LoopError&&error.code==="loop-host/conflict")return {state:"revoked",reason:error.message};throw error}
    if(!target)return {state:"needs_auth",reason:"Loop authorization is required"}
    const credential=await this.api.tokens.credential(signal)
    if(target.projectId){
      try{await new ActionClient(new LoopHTTP(this.api.tokens,credential.resource)).invoke("project.get",{projectId:target.projectId},signal)}
      catch (error) {
        if (!(error instanceof LoopError) || error.outcomeUnknown) throw error
        if (error.status === 401 || error.code === "loop-host/needs-auth") return {state:"needs_auth",reason:error.message}
        if (error.status === 403) return {state:"waiting_for_access",reason:error.message}
        if (error.status === 404) return {state:"target_unavailable",reason:error.message}
        throw error
      }
    }else{
      const {principal}=await this.principal(signal)
      if(principal.agentId!==target.agentId)throw new LoopError("loop-host/conflict","Workspace Agent changed")
    }
    return {state:"active",accountPrincipal:credential.principal_id,accountName:target.accountName||credential.principal_id}
  }
  async refreshMetadata(input:any,signal?:AbortSignal){
    const projectName=typeof input.projectName==="string"?input.projectName.trim():"",workspaceName=typeof input.workspaceName==="string"?input.workspaceName.trim():""
    if(!input.projectId||!projectName||!workspaceName||Buffer.byteLength(projectName)>255||Buffer.byteLength(workspaceName)>255)throw new LoopError("loop-host/invalid-request","Invalid Project metadata")
    const previous=await this.binding(input.workspace?.workspaceId,signal)
    if(!previous||previous.projectId!==input.projectId)throw new LoopError("loop-host/conflict","Managed Project binding changed")
    const {credential,grant,me,root}=await this.projectIdentity(signal)
    if(grant.agent.agentId!==previous.agentId)throw new LoopError("loop-host/conflict","Managed Project Agent changed")
    const {project}=await this.pages!.request("GET",root+"/"+encodeURIComponent(input.projectId)+"?envelope=container",undefined,signal)
    if(project?.workspaceId!==credential.workspace_id||project.id!==input.projectId||project.status&&project.status!=="active")throw new LoopError("loop-host/target-unavailable","Managed Project is unavailable")
    const {file}=await this.bindingFile(input.workspace.workspaceId,signal)
    return file.transaction(async(record,save)=>{
      if(!record||disconnecting(record)||!ownedBy(record,credential)||record.target.projectId!==previous.projectId||record.target.agentId!==previous.agentId)throw new LoopError("loop-host/conflict","Managed Project binding changed")
      Object.assign(record.target,{projectName,loopWorkspaceName:workspaceName,agentName:grant.agent.displayName||previous.agentId,accountName:me.displayName||me.name||me.email||credential.principal_id})
      await save(record);return {binding:record.target,accountPrincipal:credential.principal_id}
    },signal)
  }
  async catalog(signal?:AbortSignal){
    const {credential,principal}=await this.principal(signal)
    return {state:"active",grantId:credential.grant_id,accountPrincipal:principal.userId,accountName:principal.userId,workspaceId:principal.workspaceId,workspaceName:principal.workspaceId,
      agent:{agentId:principal.agentId,displayName:principal.agentId},projects:[]}
  }
  private async projectIdentity(signal?:AbortSignal){
    if(!this.pages)throw new LoopError("loop-host/unavailable","Page session is unavailable")
    const credential=await this.api.tokens.credential(signal)
    const me=await this.pages.request("GET","/api/v1/me",undefined,signal)
    const grants=await this.pages.request("GET","/api/v1/me/super-agent-grants",undefined,signal)
    const grant=grants?.grants?.find((item:any)=>item.grantId===credential.grant_id && item.clientId===credential.client_id && item.resource===credential.resource && (!item.status || item.status==="active"))
    if(me?.id!==credential.principal_id || !grant?.agent?.agentId)throw new LoopError("loop-host/needs-auth","Project account authority changed")
    const workspaces=await this.pages.request("GET","/api/v1/workspaces",undefined,signal)
    const workspace=Array.isArray(workspaces)?workspaces.find(item=>item.id===credential.workspace_id):undefined
    if(!workspace)throw new LoopError("loop-host/target-unavailable","Loop Workspace is unavailable")
    return {credential,grant,me,workspace,root:"/api/v1/workspaces/"+encodeURIComponent(credential.workspace_id)+"/projects"}
  }
  async projectCatalog(signal?:AbortSignal){
    const {credential,grant,me,workspace,root}=await this.projectIdentity(signal)
    const projects:any[]=[],seen=new Set<string>();let cursor=""
    for(let page=0;page<2;page++){
      const query=new URLSearchParams({status:"active",envelope:"container",limit:"100",...(cursor?{cursor}:{})})
      const response=await this.pages!.request("GET",root+"?"+query,undefined,signal)
      if(!Array.isArray(response?.projects))throw new LoopError("loop-host/backend-invalid","Invalid Project catalog")
      for(const project of response.projects){
        if(!project.id || project.workspaceId!==credential.workspace_id || seen.has(project.id) || projects.length>=200)throw new LoopError("loop-host/backend-invalid","Project catalog identity is invalid")
        seen.add(project.id)
        if(project.status && project.status!=="active")continue
        projects.push({workspaceId:credential.workspace_id,workspaceName:workspace.name||workspace.id,projectId:project.id,projectName:project.name,defaultChannelId:"",role:project.viewerRole ?? ""})
      }
      if(!response.hasMore)return {state:"active",accountPrincipal:credential.principal_id,accountName:me.displayName||me.name||me.email,workspaceId:workspace.id,workspaceName:workspace.name||workspace.id,agent:grant.agent,projects}
      if(!response.nextCursor || response.nextCursor===cursor)throw new LoopError("loop-host/backend-invalid","Project cursor did not advance")
      cursor=response.nextCursor
    }
    throw new LoopError("loop-host/target-unavailable","Too many Projects to synchronize")
  }
  async createProject(input:any,signal?:AbortSignal){
    const name=typeof input.name==="string"?input.name.trim():"",prefix=typeof input.prefix==="string"?input.prefix.trim().toLowerCase():""
    if(!name||Buffer.byteLength(name)>255||!/^[a-z]{1,32}$/u.test(prefix))throw new LoopError("loop-host/invalid-request","Project name or prefix is invalid")
    const {credential,workspace,root}=await this.projectIdentity(signal)
    const response=await this.pages!.request("POST",root+"?envelope=container",{name,prefix},signal)
    if(!response?.project?.id||response.project.workspaceId!==credential.workspace_id)throw new LoopError("loop-host/backend-invalid","Project creation returned an invalid identity",0,true)
    return {workspaceId:credential.workspace_id,workspaceName:workspace.name||workspace.id,projectId:response.project.id,projectName:response.project.name,role:response.project.viewerRole ?? ""}
  }
  async prepareProject(input:any,signal?:AbortSignal){
    const {credential,grant,me,workspace,root}=await this.projectIdentity(signal)
    if(input.agentId!==grant.agent.agentId || typeof input.projectId!=="string" || !input.projectId)throw new LoopError("loop-host/conflict","Selected Project or Agent is invalid")
    const {project}=await this.pages!.request("GET",root+"/"+encodeURIComponent(input.projectId)+"?envelope=container",undefined,signal)
    if(project?.id!==input.projectId || project.workspaceId!==credential.workspace_id || project.status && project.status!=="active")throw new LoopError("loop-host/target-unavailable","Selected Project is unavailable")
    const {file}=await this.bindingFile(input.workspace?.workspaceId,signal)
    return file.transaction(async(record,save)=>{
      if(disconnecting(record))throw new LoopError("loop-host/conflict","Workspace disconnect is pending")
      this.checkedTarget(record,credential)
      // Project Agents derive access from current server resource rules. The
      // retired /agent-grants endpoint must not be revived or replaced by a
      // hidden Human privilege escalation.
      try{await new ActionClient(new LoopHTTP(this.api.tokens,credential.resource)).invoke("project.get",{projectId:input.projectId},signal)}
      catch (error) {
        if (error instanceof LoopError && !error.outcomeUnknown && error.status === 403) {
          throw new LoopError("loop-host/waiting-for-access", error.message, error.status)
        }
        throw error
      }
      const target={loopServiceBaseUrl:this.options.server,loopWorkspaceId:credential.workspace_id,loopWorkspaceName:workspace.name||workspace.id,
        projectId:project.id,projectName:project.name,defaultChannelId:"",agentId:input.agentId,agentName:grant.agent.displayName||input.agentId,accountName:me.displayName||me.name||me.email,
        webUrl:this.options.server+"/w/"+encodeURIComponent(credential.workspace_id)+"/projects/"+encodeURIComponent(project.id)+"/tasks"}
      await save({target,grantId:credential.grant_id,clientId:credential.client_id})
      return {binding:target,accountPrincipal:credential.principal_id}
    },signal)
  }
  private async ensureLocalChannel(workspace:{workspaceId:string;displayTitle?:string},signal?:AbortSignal){
    const key=hash(this.options.installation+"\0"+workspace.workspaceId)
    const suffix=" (DSH "+key.slice(0,12)+")"
    const title=Buffer.from(workspace.displayTitle?.trim().split(/\s+/u).join(" ") || "Workspace")
    let end=Math.min(title.length,250-Buffer.byteLength(suffix))
    while(end<title.length && end>0 && (title[end]&0xc0)===0x80)end--
    const displayName=title.subarray(0,end).toString("utf8").trim()+suffix
    const result=await this.api.request("sync","POST","/workspace-bindings",{externalWorkspaceId:key,displayName},signal)
    if(typeof result?.channelId!=="string" || !result.channelId)throw new LoopError("loop-host/backend-invalid","Invalid upload channel")
    return result.channelId as string
  }
  /** Go's channel writer persisted an empty client ID
   * and, if available, the account setup grant. Neither is upload consent for
   * a new connection. The Host fences old Sessions between probe and commit. */
  async reconcileWorkspaceBinding(input:any,signal?:AbortSignal){
    const {workspace,expectedTarget:expected,confirm}=input
    const {credential,file}=await this.bindingFile(workspace?.workspaceId,signal)
    const conflict=(reason:string)=>new LoopError("loop-host/conflict",reason)
    if(typeof confirm!=="boolean"||input.accountPrincipal!==credential.principal_id||!expected)throw new LoopError("loop-host/invalid-request","Invalid binding reconciliation request")
    return file.transaction(async(record,save)=>{
      const replacement=input.expectedGrantId!==undefined
      if(replacement && input.expectedGrantId!==credential.grant_id)throw conflict("The confirmed Loop connection changed")
      if(!record && !replacement)throw conflict("Workspace binding is missing")
      const target=record ? record.target : expected
      if(!target||disconnecting(record)||expected.unbinding||target.placementKind!=="channel_session"||target.projectId!==""||!target.defaultChannelId||
        target.loopServiceBaseUrl!==this.options.server||target.loopWorkspaceId!==credential.workspace_id||target.agentId!==input.agentId||
        ["placementKind","projectId","defaultChannelId","loopServiceBaseUrl","loopWorkspaceId","agentId"].some(key=>expected[key]!==target[key]))throw conflict("Saved Workspace target changed or is disconnecting")
      const accountFile=(await this.bindingFile(credential.workspace_id,signal)).file
      if(disconnecting(await accountFile.read()))throw conflict("Account disconnect is pending")
      if(!confirm&&record&&ownedBy(record,credential))return {changed:false,owned:true}
      if(record && (typeof record.clientId!=="string" || typeof record.grantId!=="string" || (!replacement && record.clientId!=="")))throw conflict("Workspace binding has a different connection owner")
      const fingerprint=hash(stringifyWire([file.path,credential.generation,expected,record??null]))
      if(confirm&&input.expectedRecord!==fingerprint)throw conflict("Workspace binding changed during reconciliation")
      const {principal}=await this.principal(signal)
      if(principal.agentId!==target.agentId)throw conflict("Authenticated Workspace Agent changed")
      if(await this.ensureLocalChannel(workspace,signal)!==target.defaultChannelId)throw conflict("Loop no longer maps this Workspace to the saved channel")
      if(!confirm)return {needsConfirmation:true,expectedRecord:fingerprint}
      await this.api.tokens.credential(signal) // generation-fenced after the remote lookup
      if(disconnecting(await accountFile.read()))throw conflict("Account disconnect is pending")
      const restoredTarget=record ? target : {...target,loopWorkspaceName:credential.workspace_id,
        projectName:"",agentName:principal.agentId,accountName:credential.principal_id,
        webUrl:this.options.server+"/w/"+encodeURIComponent(credential.workspace_id)+"/channel/"+encodeURIComponent(target.defaultChannelId)}
      await save({...record,target:restoredTarget,grantId:credential.grant_id,clientId:credential.client_id})
      return {changed:true}
    },signal)
  }
  async prepareLocal(workspace:{workspaceId:string;displayTitle?:string},agentId:string,signal?:AbortSignal){
    const {credential,principal}=await this.principal(signal)
    if(agentId!==principal.agentId)throw new LoopError("loop-host/conflict","Selected Agent does not match this connection")
    const {file}=await this.bindingFile(workspace.workspaceId,signal)
    return file.transaction(async(record,save)=>{
      if(disconnecting(record))throw new LoopError("loop-host/conflict","Workspace disconnect is pending")
      const previous=this.checkedTarget(record,credential)
      const channelId=await this.ensureLocalChannel(workspace,signal)
      if(previous?.placementKind==="channel_session" && (previous.defaultChannelId!==channelId || previous.agentId!==agentId))throw new LoopError("loop-host/conflict","Saved Workspace channel or Agent changed")
      const target={placementKind:"channel_session",loopServiceBaseUrl:this.options.server,loopWorkspaceId:credential.workspace_id,loopWorkspaceName:credential.workspace_id,
        projectId:"",projectName:"",defaultChannelId:channelId,agentId,agentName:agentId,accountName:credential.principal_id,
        webUrl:this.options.server+"/w/"+encodeURIComponent(credential.workspace_id)+"/channel/"+encodeURIComponent(channelId)}
      await save({target,grantId:credential.grant_id,clientId:credential.client_id})
      return {binding:target,accountPrincipal:credential.principal_id}
    },signal)
  }
  async outbox(session:string,signal?:AbortSignal,pending?:import("./sync.ts").PendingContext){
    const credential=await this.api.tokens.credential(signal)
    return new SyncOutbox(this.options.syncHome,this.options.profile,session,credential,this.api,pending)
  }
  async validateContext(input:any,signal?:AbortSignal){
    const target=await this.binding(input.workspaceId,signal)
    if(!target || !input.context || (input.context.agentId!==undefined && target.agentId!==input.context.agentId) || (!input.context.defaultChannelId || target.defaultChannelId && target.defaultChannelId!==input.context.defaultChannelId) || (target.projectId??"")!==(input.context.projectId??""))throw new LoopError("loop-host/conflict","Session upload target differs from the saved Workspace binding")
    return target
  }
  async set(input:any,signal?:AbortSignal){
    const target=await this.validateContext(input,signal)
    const credential=await this.api.tokens.credential(signal)
    if(input.enabled)await SyncOutbox.archiveLegacy(this.options.syncHome,this.options.profile,input.sessionId,credential,signal)
    const outbox=await this.outbox(input.sessionId,signal,{accountPrincipal:credential.principal_id,loopWorkspaceId:credential.workspace_id,agentId:target.agentId,projectId:target.projectId??"",defaultChannelId:input.context.defaultChannelId})
    if(input.enabled){
      const {principal}=await this.principal(signal)
      if(principal.agentId!==target.agentId)throw new LoopError("loop-host/conflict","Upload Agent changed")
      const before=await outbox.snapshot()
      const boundary=input.confirmedSourceSequence===undefined?integer(before.nextSequence)-1n:integer(input.confirmedSourceSequence)
      if(boundary<0n)throw new LoopError("loop-host/invalid-request","Invalid consent boundary")
      const placement=target.projectId?{kind:"project_session" as const,targetId:target.projectId,channelId:input.context.defaultChannelId,confirmedSourceSequence:boundary}:{kind:"channel_session" as const,targetId:target.defaultChannelId,confirmedSourceSequence:boundary}
      await outbox.ensureSession(placement,principal.workspaceId,principal.agentId,"DeepSeek Harness "+hash(input.sessionId).slice(0,16),signal)
      await outbox.resume(boundary,signal)
    }else{
      const stopped=await outbox.stop(signal)
      if(stopped.syncSessionId)await this.api.request("sync","POST",`/sessions/${encodeURIComponent(stopped.syncSessionId)}/sync-state`,{state:"stopped",boundarySourceSequence:integer(stopped.resumeSourceSequence??0)},signal,{lossless:true})
    }
    return this.status(input,signal)
  }
  async status(input:any,signal?:AbortSignal){
    await this.validateContext(input,signal)
    const outbox=await this.outbox(input.sessionId,signal),snapshot=await outbox.snapshot()
    const result:any={state:"off",pending:snapshot.pending.length,historyPartial:false,health:"idle"}
    if(!snapshot.syncSessionId)return {...result,state:"needs_auth",reason:"Continue enabling sync for this Session"}
    if(snapshot.syncState==="active"){
      result.state=snapshot.pending.length?"pending":"on";result.health=snapshot.pending.length?"pending":"idle"
      if(snapshot.lastUploadFailed && snapshot.pending.length){result.state="error";result.health="error"}
    }
    if(snapshot.lastReceipt){
      const sequence=integer(snapshot.lastReceipt.sourceSequence)
      result.lastReceipt={sourceSequence:sequence<=BigInt(Number.MAX_SAFE_INTEGER)?Number(sequence):sequence.toString(),acceptedAt:snapshot.lastReceipt.acceptedAt}
    }
    if(snapshot.defaultChannelId)result.destination={channelId:snapshot.defaultChannelId,...(snapshot.topicId?{topicId:snapshot.topicId}:{})}
    return result
  }
  async retry(input:any,signal?:AbortSignal){
    await this.validateContext(input,signal)
    const outbox=await this.outbox(input.sessionId,signal)
    try{await outbox.flush(signal)}catch{
      const status=await this.status(input,signal)
      return status.state==="off"?status:{...status,state:"retrying",health:"retrying",reason:"Loop upload is awaiting confirmation"}
    }
    return this.status(input,signal)
  }
}

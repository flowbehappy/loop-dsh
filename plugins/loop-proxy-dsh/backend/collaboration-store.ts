import {createHash} from "node:crypto"
import {join} from "node:path"
import {link,readFile,open,readdir,lstat} from "node:fs/promises"
import {DurableJSON} from "./storage.ts"
import {integer,parseWire,stringifyWire} from "./codec.ts"
import {LoopError} from "./errors.ts"

export interface CollaborationNamespace {
  serverBaseUrl:string;accountId:string;installationId:string;workspaceId:string;hostSessionId:string
  deviceBindingId?:string;agentMemberId?:string;bindingId?:string;bindingEpoch?:string;coordinatorAgentId?:string
  boardId?:string;projectId?:string;bindingRevision?:string;archive?:boolean
}
const baseKeys=["serverBaseUrl","accountId","installationId","workspaceId","hostSessionId"] as const
const maps=["intents","actions","events","deliveryIndex","continuations","taskStates"]
const fields=new Set(["managementSources","subscriptionProgress","deliveryGap","taskStates","version","namespace","binding","capability","intents","actions","events","deliveryIndex","continuations","deliveryCursor","generation","subscriptionId","snapshotProgress","snapshotSkipped","snapshotRequired","audienceAcknowledged","updatedAt"])
const clone=(value:any)=>parseWire(stringifyWire(value,{sortKeys:false}))
export function emptyCollaboration(namespace:CollaborationNamespace):any{
  return {version:2,namespace:{...namespace},intents:{},actions:{},events:{},deliveryIndex:{},continuations:{},taskStates:{},deliveryCursor:0n,updatedAt:new Date().toISOString()}
}
export class CollaborationStore {
  private root:string
  constructor(root:string){this.root=join(root,"collaboration")}
  file(namespace:CollaborationNamespace){
    if(baseKeys.some(key=>typeof namespace[key]!=="string" || !namespace[key]))throw new LoopError("loop-host/invalid-request","Collaboration namespace is incomplete")
    const parts=baseKeys.map(key=>namespace[key])
    if(namespace.archive){if(!namespace.bindingId || !namespace.bindingEpoch)throw new LoopError("loop-host/invalid-request","Archive route is incomplete");parts.push("archive",namespace.bindingId,namespace.bindingEpoch)}
    const key=createHash("sha256").update(parts.join("\0")).digest("hex")
    return new DurableJSON(join(this.root,key+".json"))
  }
  private decode(raw:any,namespace:CollaborationNamespace){
    if(raw===undefined)return emptyCollaboration(namespace)
    if(!raw || Object.keys(raw).some(key=>!fields.has(key)) || integer(raw.version)!==2n || !raw.namespace || baseKeys.some(key=>raw.namespace[key]!==namespace[key]) || integer(raw.deliveryCursor??0)<0n)throw new LoopError("loop-host/invalid-state","Collaboration state identity or version is invalid")
    if(namespace.archive && (raw.namespace.bindingId!==namespace.bindingId || raw.namespace.bindingEpoch!==namespace.bindingEpoch || !raw.namespace.archive))throw new LoopError("loop-host/conflict","Archived collaboration route changed")
    for(const key of maps){raw[key]??={};if(typeof raw[key]!=="object" || Array.isArray(raw[key]))throw new LoopError("loop-host/invalid-state","Invalid collaboration state map")}
    if(Buffer.byteLength(stringifyWire(raw))>8<<20)throw new LoopError("loop-host/queue-full","Collaboration state exceeds its size budget")
    return raw
  }
  private async migrate(raw:any,file:DurableJSON,save:(value:any)=>Promise<void>,namespace:CollaborationNamespace){
    if(raw===undefined || integer(raw.version)!==1n)return raw
    this.decode({...raw,version:2},namespace)
    // Keep the original bytes and inode, as the Go upgrader does. Never use
    // this backup to roll back newer receipts automatically.
    const backup=new DurableJSON(file.path+".v1.bak")
    try{await link(file.path,backup.path)}catch(error:any){if(error.code!=="EEXIST")throw error}
    await backup.read()
    const [original,saved]=await Promise.all([readFile(file.path),readFile(backup.path)])
    if(!original.equals(saved))throw new LoopError("loop-host/invalid-state","Collaboration upgrade backup differs; preserve both files for recovery")
    if(process.platform!=="win32"){
      const directory=await open(this.root,"r");try{await directory.sync()}finally{await directory.close()}
    }
    const upgraded={...raw,version:2}
    this.decode(upgraded,raw.namespace)
    await save(upgraded)
    return upgraded
  }
  async load(namespace:CollaborationNamespace){
    const file=this.file(namespace)
    return file.transaction(async(raw,save)=>this.decode(await this.migrate(raw,file,save,namespace),namespace))
  }
  async list(owner:Pick<CollaborationNamespace,"serverBaseUrl"|"accountId"|"installationId"|"workspaceId">){
    let entries
    try{
      const info=await lstat(this.root)
      if(!info.isDirectory()||info.isSymbolicLink()||process.platform!=="win32"&&(info.mode&0o077)!==0)throw new LoopError("loop-host/invalid-state","Collaboration directory must be private")
      entries=await readdir(this.root,{withFileTypes:true})
    }catch(error:any){if(error.code==="ENOENT")return [];throw error}
    const documents:any[]=[]
    for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
      if(documents.length>=64)break
      if(!entry.isFile()||!/^[a-f0-9]{64}\.json$/u.test(entry.name))continue
      const file=new DurableJSON(join(this.root,entry.name))
      const raw=await file.read(),namespace=raw?.namespace
      if(!raw?.binding||!namespace||Object.entries(owner).some(([key,value])=>namespace[key]!==value))continue
      if(this.file(namespace).path!==file.path)throw new LoopError("loop-host/invalid-state","Collaboration filename identity changed")
      documents.push(await this.load(namespace))
    }
    return documents
  }
  async update(namespace:CollaborationNamespace,apply:(state:any)=>Promise<void>|void,signal?:AbortSignal){
    return this.file(namespace).transaction(async(raw,save)=>{
      const state=this.decode(await this.migrate(raw,this.file(namespace),save,namespace),namespace)
      if(!namespace.archive && namespace.bindingId && state.binding && (state.binding.bindingId!==namespace.bindingId || integer(state.binding.bindingEpoch).toString()!==namespace.bindingEpoch))throw new LoopError("loop-host/conflict","Collaboration route is stale")
      await apply(state);state.updatedAt=new Date().toISOString()
      this.decode(state,namespace);await save(state);return state
    },signal)
  }
  async transition(base:CollaborationNamespace,next:CollaborationNamespace,binding:any,capability:any,signal?:AbortSignal){
    return this.file(base).transaction(async(raw,save)=>{
      let state=this.decode(await this.migrate(raw,this.file(base),save,base),base)
      if(state.binding && (state.namespace.bindingId!==next.bindingId || state.namespace.bindingEpoch!==next.bindingEpoch)){
        const archived=clone(state);archived.namespace.archive=true
        // Archive is durable before replacement; interruption can duplicate
        // history but cannot erase the old route or its uncertain mutations.
        await this.file(archived.namespace).write(archived)
        state=emptyCollaboration(next)
      }
      state.namespace={...next};state.binding=clone(binding);state.capability=clone(capability);state.updatedAt=new Date().toISOString()
      this.decode(state,next);await save(state);return state
    },signal)
  }
}

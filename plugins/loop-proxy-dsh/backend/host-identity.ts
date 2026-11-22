import {constants} from "node:fs"
import {lstat,open} from "node:fs/promises"
import {join,isAbsolute} from "node:path"
import {acquireLock} from "./storage.ts"
import {createHash,randomBytes} from "node:crypto"
import {HostCredentialStore} from "./credentials.ts"
import type {CredentialProvider} from "./credentials.ts"
import {HostAPI} from "./host-api.ts"
import {LoopError,requireActive} from "./errors.ts"

const validProof=(value:unknown):value is string=>typeof value==="string"&&Buffer.byteLength(value)>=32&&Buffer.byteLength(value)<=255&&!/[\r\n\x00]/u.test(value)&&value.trim()===value
async function legacyProof(root:string|undefined,server:string,principal:string,signal?:AbortSignal){
  if(!root)return undefined
  if(!isAbsolute(root))throw new LoopError("loop-host/invalid-state","Host proof directory must be absolute")
  try{
    const directory=await lstat(root)
    if(!directory.isDirectory()||directory.isSymbolicLink()||process.platform!=="win32"&&(directory.mode&0o077)!==0)throw new LoopError("loop-host/invalid-state","Host proof directory must be private")
  }catch(error:any){if(error.code==="ENOENT")return undefined;throw error}
  const path=join(root,createHash("sha256").update(server+"\0"+principal).digest("hex")+".proof")
  const release=await acquireLock(path+".lock",signal,true)
  try{
    const info=await lstat(path)
    if(!info.isFile()||info.isSymbolicLink()||process.platform!=="win32"&&(info.mode&0o077)!==0)throw new LoopError("loop-host/invalid-state","Host proof must be a private regular file")
    const file=await open(path,constants.O_RDONLY|(process.platform==="win32"?0:constants.O_NOFOLLOW))
    try{
      const current=await file.stat()
      if(!current.isFile()||current.size>512||process.platform!=="win32"&&(current.mode&0o077)!==0)throw new LoopError("loop-host/invalid-state","Invalid Host proof file")
      const proof=(await file.readFile("utf8")).trim()
      if(!validProof(proof))throw new LoopError("loop-host/invalid-state","Invalid Host proof")
      return proof
    }finally{await file.close()}
  }catch(error:any){if(error.code==="ENOENT")return undefined;throw error}finally{await release()}
}
async function homeProof(provider:CredentialProvider,server:string,principal:string,create:boolean,root?:string,signal?:AbortSignal):Promise<string|undefined>{
  if(!principal)throw new LoopError("loop-host/needs-auth","Host account identity is required")
  const key="loop-host/installation-proof-"+createHash("sha256").update(JSON.stringify([server,principal])).digest("hex")
  const record=await provider.modifyRecord(key,async current=>{
    requireActive(signal)
    if(current!==undefined){
      if(current?.kind!=="grant"||current.payload?.schema!==1||current.payload.server!==server||current.payload.principal!==principal||!validProof(current.payload.proof))throw new LoopError("loop-host/credential-unavailable","Invalid Host identity record")
      return undefined
    }
    // Preserve the original file for rollback. Import under its Go-compatible
    // lock before generating an identity which the server would reject.
    const proof=await legacyProof(root,server,principal,signal)??(create?randomBytes(32).toString("base64url"):undefined)
    requireActive(signal)
    return proof?{kind:"grant",payload:{schema:1,server,principal,proof}}:undefined
  })
  requireActive(signal)
  return record?.payload.proof
}

/** Home proof is owned by the official credential provider and scoped to the
 * same server/account as the existing Go proof. Registering it never enables
 * remote access or grants a board binding. */
export class HostIdentity {
  private provider:CredentialProvider
  private api:HostAPI
  private installation:string
  private server:string
  private legacyRoot?:string
  constructor(provider:CredentialProvider,api:HostAPI,installation:string,server:string,legacyRoot?:string){this.provider=provider;this.api=api;this.installation=installation;this.server=server;this.legacyRoot=legacyRoot}
  static loadProof(provider:CredentialProvider,server:string,principal:string,legacyRoot?:string,signal?:AbortSignal){return homeProof(provider,server,principal,false,legacyRoot,signal)}
  async proof(signal?:AbortSignal):Promise<string>{
    const credential=await this.api.tokens.credential(signal)
    return (await homeProof(this.provider,this.server,credential.principal_id,true,this.legacyRoot,signal))!
  }
  async device(store:HostCredentialStore,signal?:AbortSignal):Promise<any>{
    const initial=await this.api.tokens.credential(signal)
    await store.modify(async current=>{
      requireActive(signal)
      if(current?.generation!==initial.generation || current.disconnect)throw new LoopError("loop-host/needs-auth","Loop connection changed")
      return current.device_credential?current:{...current,device_credential:randomBytes(32).toString("base64url")}
    })
    const deviceInstanceId="dsh-"+createHash("sha256").update([this.installation,initial.principal_id,this.server,initial.workspace_id].join("\0")).digest("hex").slice(0,24)
    let existing:any
    try{existing=(await this.api.request("workspace","GET","/external-host/binding",undefined,signal))?.binding}catch(error){
      if(!(error instanceof LoopError) || ![401,403,404].includes(error.status))throw error
    }
    if(existing?.status==="active"){
      if(existing.deviceInstanceId!==deviceInstanceId)throw new LoopError("loop-host/conflict","Agent is already bound to another Host installation")
      if(existing.hostInstallationId===this.installation && existing.hostSource==="deepseek_harness")return existing
    }
    const proof=await this.proof(signal)
    const result=await this.api.request("workspace","POST","/external-host/binding",{deviceInstanceId,hostInstallationId:this.installation,deviceLabel:"DeepSeek Harness",hostSource:"deepseek_harness"},signal,{hostInstallationProof:proof})
    const binding=result?.binding??result
    if(binding.deviceInstanceId!==deviceInstanceId || binding.status!=="active" || !binding.bindingId)throw new LoopError("loop-host/backend-invalid","Host device binding identity changed")
    return binding
  }
  async register(signal?:AbortSignal):Promise<string>{
    const proof=await this.proof(signal)
    const result=await this.api.request("workspace","POST","/host-installations",{installationId:this.installation,deviceLabel:"DeepSeek Harness",hostSource:"deepseek_harness"},signal,{hostInstallationProof:proof})
    if(result?.installationId!==this.installation || result.hostSource!=="deepseek_harness" || result.status!=="active")throw new LoopError("loop-host/backend-invalid","Host registration identity changed")
    return proof
  }
}

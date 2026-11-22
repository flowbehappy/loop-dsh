import {join} from "node:path"
import {lstat,readdir} from "node:fs/promises"
import type {Credential} from "./credentials.ts"
import {DurableJSON} from "./storage.ts"
import {connectionBindingKey} from "./sync.ts"
import {LoopError,requireActive} from "./errors.ts"

async function records(directory:string):Promise<DurableJSON[]> {
  try {
    const info=await lstat(directory)
    if(!info.isDirectory()||info.isSymbolicLink()||process.platform!=="win32"&&(info.mode&0o077)!==0)throw new LoopError("loop-host/invalid-state","Disconnect state directory must be private")
    const entries=await readdir(directory,{withFileTypes:true})
    return entries.filter(entry=>/^[a-f0-9]{64}\.json$/u.test(entry.name)).map(entry=>{
      if(!entry.isFile())throw new LoopError("loop-host/invalid-state","Disconnect state must be a regular file")
      return new DurableJSON(join(directory,entry.name))
    })
  }catch(error:any){if(error.code==="ENOENT")return [];throw error}
}
/** Runs after the server receipt is durable and before deleting credentials.
 * Retrying after any local failure cannot revoke twice or resume old uploads. */
export async function cleanupDisconnectedState(options:{stateHome:string;syncHome?:string;profile:string;server:string},credential:Credential,signal?:AbortSignal):Promise<void>{
  if(!credential.disconnect?.receipt)throw new LoopError("loop-host/conflict","Confirmed disconnect is required before clearing local state")
  if(!/^[a-zA-Z0-9_.-]+$/u.test(options.profile)||[".",".."].includes(options.profile))throw new LoopError("loop-host/invalid-state","Invalid sync profile")
  const ownsBinding=(record:any)=>record?.grantId===credential.grant_id&&record?.target?.loopServiceBaseUrl===options.server&&record?.target?.loopWorkspaceId===credential.workspace_id
  const ownsOutbox=(record:any)=>record?.bindingKey===connectionBindingKey(credential)||record?.bindingKey?.startsWith("pending:")&&record.pendingContext?.accountPrincipal===credential.principal_id&&record.pendingContext?.loopWorkspaceId===credential.workspace_id
  if(options.syncHome)for(const file of await records(join(options.syncHome,"outbox",options.profile))){
    requireActive(signal)
    // Delete only the exact disconnected connection. A stopped legacy skeleton
    // is still owned by its binding and must be removed so another account can
    // reuse the same profile/session without inheriting old history.
    await file.remove(record=>record!==undefined&&ownsOutbox(record),signal)
  }
  for(const file of await records(join(options.stateHome,"bindings"))){
    requireActive(signal)
    if(!ownsBinding(await file.read()))continue
    await file.remove(record=>{
      if(record&&!ownsBinding(record))throw new LoopError("loop-host/conflict","Binding changed during disconnect cleanup")
    },signal)
  }
}

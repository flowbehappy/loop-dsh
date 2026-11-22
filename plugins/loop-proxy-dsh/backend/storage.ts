import {constants} from "node:fs"
import {copyFile,open,readFile,mkdir,lstat,rename,unlink} from "node:fs/promises"
import type {FileHandle} from "node:fs/promises"
import {dirname, resolve, join} from "node:path"
import {randomUUID} from "node:crypto"
import {setTimeout as delay} from "node:timers/promises"
import {LoopError, requireActive} from "./errors.ts"
import {parseWire, stringifyWire} from "./codec.ts"

function stateError(message: string): LoopError { return new LoopError("loop-host/invalid-state", message) }
async function privateDirectory(path: string): Promise<void> {
  await mkdir(path,{recursive:true,mode:0o700})
  const info = await lstat(path)
  if (!info.isDirectory() || info.isSymbolicLink() || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) throw stateError("State directory must be private and not a symbolic link")
}
async function regular(path: string): Promise<void> {
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) throw stateError("State must be a private regular file")
  } catch (error: any) { if (error.code !== "ENOENT") throw error }
}
interface NativeLock {attempt(): boolean; release(): Promise<void>}
let native: Promise<any> | undefined
async function platform(): Promise<any> {
  return native ??= (async () => {
    const {default:koffi} = await import("koffi")
    if (process.platform === "win32") {
      const lib = koffi.load("kernel32.dll")
      return {windows:true,
        create:lib.func("intptr_t __stdcall CreateFileW(const char16_t *name, uint32_t access, uint32_t share, void *security, uint32_t creation, uint32_t flags, intptr_t templateFile)"),
        close:lib.func("int __stdcall CloseHandle(intptr_t handle)"),
        lock:lib.func("int __stdcall LockFileEx(intptr_t handle, uint32_t flags, uint32_t reserved, uint32_t low, uint32_t high, void *overlapped)"),
        unlock:lib.func("int __stdcall UnlockFileEx(intptr_t handle, uint32_t reserved, uint32_t low, uint32_t high, void *overlapped)"),
        error:lib.func("uint32_t __stdcall GetLastError(void)"),
      }
    }
    if (!["darwin","linux"].includes(process.platform)) throw stateError("Unsupported state lock platform")
    let lib
    try { lib = koffi.load(process.platform === "darwin" ? "/usr/lib/libSystem.B.dylib" : "libc.so.6") }
    catch (error) { if (process.platform !== "linux") throw error; lib = koffi.load("libc.so") }
    return {windows:false,flock:lib.func("int flock(int fd, int operation)"),errno:koffi.errno}
  })()
}
async function openLock(path: string, shared: boolean): Promise<NativeLock> {
  await privateDirectory(dirname(path)); await regular(path)
  const api = await platform()
  let closed = false
  if (api.windows) {
    const handle = api.create(path,0xc0000000,3,null,4,0x80,0)
    if (handle === -1 || handle === -1n) throw stateError("Cannot open state lock")
    const overlap = Buffer.alloc(32)
    return {attempt() {
      if (api.lock(handle,shared ? 1 : 3,0,1,0,overlap)) return true
      if (api.error() === 33) return false
      throw stateError("Cannot acquire state lock")
    },async release() { if (!closed) {closed=true; api.unlock(handle,0,1,0,overlap); api.close(handle)} }}
  }
  const file = await open(path,constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW,0o600)
  return {attempt() {
    if (api.flock(file.fd,(shared ? 1 : 2) | 4) === 0) return true
    if ([4,11,35].includes(api.errno())) return false
    throw stateError("Cannot acquire state lock")
  },async release() {if (!closed) {closed=true; api.flock(file.fd,8); await file.close()}}}
}
/** Same flock/LockFileEx protocol and lock pathname as the existing Go client.
 * Lock files are never unlinked; kernel ownership ends on process death. */
export async function acquireLock(path: string, signal?: AbortSignal, shared = false): Promise<() => Promise<void>> {
  requireActive(signal)
  const lock = await openLock(resolve(path),shared)
  try {
    for (;;) {
      requireActive(signal)
      if (lock.attempt()) return () => lock.release()
      try { await delay(25,undefined,{signal}) } catch { requireActive(signal) }
    }
  } catch (error) {await lock.release(); throw error}
}
export class DurableJSON {
  readonly path: string
  constructor(path: string) {this.path=resolve(path)}
  async read(): Promise<any | undefined> {
    await regular(this.path)
    let file: FileHandle
    try {file=await open(this.path,constants.O_RDONLY | (process.platform === "win32" ? 0 : constants.O_NOFOLLOW))}
    catch (error:any) {if(error.code === "ENOENT") return undefined; throw error}
    try {
      const info=await file.stat()
      if(!info.isFile() || info.size>32<<20) throw stateError("Invalid state file type or size")
      return parseWire(await file.readFile("utf8"))
    } finally {await file.close()}
  }
  async write(value: unknown): Promise<void> {
    const data=stringifyWire(value,{sortKeys:false})
    if(Buffer.byteLength(data)>32<<20) throw stateError("State exceeds its size budget")
    const dir=dirname(this.path)
    await privateDirectory(dir); await regular(this.path)
    const temporary=join(dir,`.loop-state-${randomUUID()}.tmp`)
    let file: FileHandle | undefined
    try {
      file=await open(temporary,"wx",0o600)
      await file.writeFile(data,"utf8"); await file.sync(); await file.close(); file=undefined
      await rename(temporary,this.path)
      if(process.platform!=="win32") {
        const directory=await open(dir,constants.O_RDONLY)
        try {await directory.sync()} finally {await directory.close()}
      }
    } finally {await file?.close(); await unlink(temporary).catch((error:any)=>{if(error.code!=="ENOENT")throw error})}
  }
  async transaction<T>(operation: (current: any | undefined, save: (value: unknown) => Promise<void>) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const release=await acquireLock(this.path+".lock",signal)
    try {requireActive(signal); return await operation(await this.read(),value=>this.write(value))}
    finally {await release()}
  }
  /** Remove under the same stable lock used by readers which mutate state. A
   * false validator result leaves the file untouched. */
  async remove(validate:(current:any|undefined)=>boolean|void|Promise<boolean|void>,signal?:AbortSignal):Promise<boolean>{
    return this.transaction(async current=>{
      if(await validate(current)===false)return false
      try{await unlink(this.path)}catch(error:any){if(error.code!=="ENOENT")throw error}
      if(process.platform!=="win32"){
        const directory=await open(dirname(this.path),constants.O_RDONLY)
        try{await directory.sync()}finally{await directory.close()}
      }
      return true
    },signal)
  }
  /** Conservatively move a validated state file to a private archive while
   * holding the same stable lock. The source is removed only after the archive
   * is durable, and an existing identical archive makes a retry idempotent. */
  async archive(destination:string,validate:(current:any)=>boolean|Promise<boolean>,signal?:AbortSignal):Promise<boolean>{
    const target=resolve(destination)
    if(target===this.path)throw stateError("State archive must use a new path")
    return this.transaction(async current=>{
      if(current===undefined || !await validate(current))return false
      const archiveDirectory=dirname(target)
      await privateDirectory(archiveDirectory); await regular(target)
      try {
        await copyFile(this.path,target,constants.COPYFILE_EXCL)
      } catch(error:any) {
        if(error.code!=="EEXIST")throw error
        const [source,archived]=await Promise.all([readFile(this.path),readFile(target)])
        if(!source.equals(archived))throw stateError("State archive path already contains different data")
      }
      const archive=await open(target,constants.O_RDONLY | (process.platform==="win32"?0:constants.O_NOFOLLOW))
      try{await archive.sync()}finally{await archive.close()}
      if(process.platform!=="win32"){
        const directory=await open(archiveDirectory,constants.O_RDONLY)
        try{await directory.sync()}finally{await directory.close()}
      }
      // Persist a newly-created archive directory in its own parent before
      // removing the only original copy.
      if(process.platform!=="win32"){
        const parent=await open(dirname(dirname(target)),constants.O_RDONLY)
        try{await parent.sync()}finally{await parent.close()}
      }
      try{await unlink(this.path)}catch(error:any){if(error.code!=="ENOENT")throw error}
      if(process.platform!=="win32"){
        const directory=await open(dirname(this.path),constants.O_RDONLY)
        try{await directory.sync()}finally{await directory.close()}
      }
      return true
    },signal)
  }
}

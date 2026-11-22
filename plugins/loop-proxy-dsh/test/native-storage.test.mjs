import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,rm,writeFile,symlink,stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {once} from 'node:events'
import {fileURLToPath} from 'node:url'
import {parseWire,stringifyWire,integer,WireNumber} from '../backend/codec.ts'
import {DurableJSON,acquireLock} from '../backend/storage.ts'
const run=promisify(execFile)
async function temporary(t){const root=await mkdtemp(tmpdir()+'/loop-ts-storage-');t.after(()=>rm(root,{recursive:true,force:true}));return root}

test('Go codec golden fixtures retain exact bytes, numeric lexemes and map ordering',async()=>{
  const fixtures=JSON.parse(await readFile(new URL('./fixtures/go-codec-cases.json',import.meta.url),'utf8'))
  for(const fixture of fixtures.cases)assert.equal(stringifyWire(parseWire(fixture.rawInput,{duplicates:'last'})),fixture.goOutput,fixture.id)
  assert.equal(integer(parseWire('9007199254740993')),9007199254740993n)
  assert.equal(stringifyWire({'\u{10000}':1,'\ue000':2}),'{"":2,"𐀀":1}')
})

test('state JSON rejects duplicate keys, malformed input, unsafe numbers and prototype pollution',()=>{
  for(const raw of ['{"a":1,"a":2}','[1,]','01','1e','{} trailing','"\\uZZZZ"','[[[['])assert.throws(()=>parseWire(raw))
  assert.throws(()=>stringifyWire({value:9007199254740992}))
  assert.throws(()=>stringifyWire({value:Infinity}))
  const circular={};circular.self=circular;assert.throws(()=>stringifyWire(circular))
  const value=parseWire('{"__proto__":{"polluted":true}}')
  assert.equal(Object.getPrototypeOf(value),null)
  assert.equal({}.polluted,undefined)
  assert.equal(stringifyWire(new WireNumber('1.00')),'1.00')
})

test('durable JSON retains private permissions, rejects symlinks and preserves old bytes on invalid writes',async t=>{
  const root=await temporary(t),path=join(root,'state.json'),store=new DurableJSON(path)
  await store.transaction(async(_current,save)=>save({version:1,count:9007199254740993n}))
  assert.equal(integer((await store.read()).count),9007199254740993n)
  if(process.platform!=='win32')assert.equal((await stat(path)).mode&0o777,0o600)
  const before=await readFile(path,'utf8')
  await assert.rejects(store.write({bad:undefined}))
  assert.equal(await readFile(path,'utf8'),before)
  const link=join(root,'linked.json');await symlink(path,link)
  await assert.rejects(new DurableJSON(link).read(),/private regular file/)
  await assert.rejects(new DurableJSON(link).write({bad:true}),/private regular file/)
})

test('kernel lock cancellation and shared readers exclude independent writers',async t=>{
  const root=await temporary(t),lock=join(root,'state.lock')
  const probe=()=>run(process.execPath,[fileURLToPath(new URL('./fixtures/native-lock-child.mjs',import.meta.url)),'try',lock])
  const release=await acquireLock(lock)
  assert.equal((await probe()).stdout.trim(),'blocked')
  await assert.rejects(acquireLock(lock,AbortSignal.timeout(70)),{code:'loop-host/cancelled'})
  await release();await release()
  const releaseReader1=await acquireLock(lock,undefined,true)
  const releaseReader2=await acquireLock(lock,AbortSignal.timeout(100),true)
  assert.equal((await probe()).stdout.trim(),'blocked')
  await releaseReader1();await releaseReader2()
  assert.equal((await probe()).stdout.trim(),'acquired')
})

test('process death releases the kernel lock without deleting its pathname',async t=>{
  const root=await temporary(t),path=join(root,'state.lock')
  const child=spawn(process.execPath,[fileURLToPath(new URL('./fixtures/native-lock-child.mjs',import.meta.url)),'hold',path],{stdio:['pipe','pipe','pipe']})
  t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL')})
  const [ready]=await once(child.stdout,'data');assert.equal(ready.toString(),'locked\n')
  const exited=once(child,'exit');child.kill('SIGKILL');await exited
  const release=await acquireLock(path,AbortSignal.timeout(1000));await release()
  assert.ok((await stat(path)).isFile())
})

test('independent processes perform durable increments without lost updates',async t=>{
  const root=await temporary(t),path=join(root,'state.json')
  await Promise.all(Array.from({length:4},()=>run(process.execPath,[fileURLToPath(new URL('./fixtures/native-lock-child.mjs',import.meta.url)),'increment',path],{timeout:15000})))
  assert.equal(integer((await new DurableJSON(path).read()).count),80n)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,readFile,readdir,lstat,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,dirname,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {Context} from '@deepseek-ai/cordis'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'

test('native release loads its packaged entry with complete assets and no Go helper',async t=>{
  const source=resolve(dirname(fileURLToPath(import.meta.url)),'..')
  const root=await mkdtemp(join(tmpdir(),'loop-native-package-')),dest=join(root,'package'),ctx=new Context()
  t.after(async()=>{await ctx.fiber.dispose();await rm(root,{recursive:true,force:true})})
  execFileSync(process.execPath,[join(source,'build-native.mjs'),dest],{stdio:'pipe'})
  const pkg=JSON.parse(await readFile(join(dest,'package.json'),'utf8'))
  assert.equal(pkg.exports['./managed-actions'],'./managed-native-actions.mjs')
  assert.ok(pkg.files.includes('artifact.sha256'))
  const patch=await readFile(join(dest,'cordis.patch.yml'),'utf8')
  assert.ok(!patch.includes('hostSyncBinary'))
  assert.ok(patch.includes('loopNativeSyncWriterFactory'))
  const files=[]
  async function scan(path){for(const item of await readdir(path,{withFileTypes:true})){const child=join(path,item.name);if(item.isDirectory())await scan(child);else{assert.ok(item.isFile());files.push(child)}}}
  await scan(dest)
  assert.ok(!files.some(path=>/\.(?:go|exe)$|\/loop-proxy$/u.test(path)))
  for(const line of (await readFile(join(dest,'artifact.sha256'),'utf8')).trim().split('\n')){
    const [digest,path]=line.split('  ')
    assert.equal(createHash('sha256').update(await readFile(join(dest,path))).digest('hex'),digest,path)
  }
  // Dependencies are supplied by the official Host, not copied into a second
  // runtime. Resolve the already installed test dependencies for this load.
  await symlink(join(source,'node_modules'),join(dest,'node_modules'),'dir')
  await ctx.plugin(LocalCredentialProvider,{dshHome:join(root,'home'),watch:false})
  let installed
  ctx.provide('loopManagedConfig',{actionsHome:join(root,'actions'),syncHome:join(root,'sync'),kind:'web',installationId:'installation',syncProfile:'native-package'})
  ctx.provide('loopHostService',{setAccountPrincipal(){},setActions(actions){installed=actions}})
  ctx.provide('webServer',{getOrigin:()=> 'http://127.0.0.1:3999'})
  ctx.provide('workspaceRegistry',{list:()=>[]});ctx.provide('tools',{})
  await ctx.plugin(await import(pathToFileURL(join(dest,pkg.exports['./managed-actions'])).href))
  assert.equal((await installed.accountStatus()).state,'signed_out')
  assert.equal(typeof ctx.get('loopNativeSyncWriterFactory'),'function')
  await assert.rejects(lstat(join(dest,'loop-proxy')),{code:'ENOENT'})
})

test('managed release packages the native backend without Go or host-signing inputs',{skip:process.platform==='win32'},async t=>{
  const source=resolve(dirname(fileURLToPath(import.meta.url)),'..')
  const root=await mkdtemp(join(tmpdir(),'loop-managed-native-')),dest=join(root,'package')
  t.after(()=>rm(root,{recursive:true,force:true}))
  const env={...process.env,PATH:dirname(process.execPath)+':/usr/bin:/bin'}
  for(const key of Object.keys(env))if(key.startsWith('LOOP_MANAGED_')||key.startsWith('LOOP_PROXY_'))delete env[key]
  execFileSync('/bin/sh',[join(source,'build-managed.sh'),dest],{env,stdio:'pipe'})
  const entries=execFileSync('tar',['-tzf',dest+'.tgz'],{encoding:'utf8'}).split('\n')
  assert.ok(entries.includes('package/backend/dist/adapter.mjs'))
  assert.ok(entries.includes('package/managed-native-actions.mjs'))
  assert.ok(!entries.some(path=>/(?:^|\/)(?:loop-proxy(?:\.exe)?|managed-hosts\.json)$/u.test(path)))
  assert.equal((await readFile(join(dest,'flavor'),'utf8')).trim(),'native')
})

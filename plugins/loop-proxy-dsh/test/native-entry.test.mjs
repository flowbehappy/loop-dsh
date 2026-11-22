import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {Context} from '@deepseek-ai/cordis'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import * as nativeEntry from '../managed-native-actions.mjs'

test('native managed entry uses official credential injection and disposes its sync service without a helper',async t=>{
  const root=await mkdtemp(tmpdir()+'/loop-native-entry-'),ctx=new Context()
  t.after(async()=>{await ctx.fiber.dispose();await rm(root,{recursive:true,force:true})})
  await ctx.plugin(LocalCredentialProvider,{dshHome:root,watch:false})
  let installed
  ctx.provide('loopManagedConfig',{actionsHome:root+'/actions',syncHome:root+'/sync',kind:'web',installationId:'installation',syncProfile:'native-entry'})
  ctx.provide('loopHostService',{setAccountPrincipal(){},setActions(actions){installed=actions}})
  ctx.provide('webServer',{getOrigin:()=> 'http://127.0.0.1:3999'})
  ctx.provide('workspaceRegistry',{list:()=>[]})
  ctx.provide('tools',{})
  const plugin=await ctx.plugin(nativeEntry)
  assert.ok(installed)
  assert.equal((await installed.accountStatus()).state,'signed_out')
  const writer=ctx.get('loopNativeSyncWriterFactory')({profile:'native-entry',queueLimit:10,shutdownTimeoutMs:1000,clientSessionLabel:'test'})
  writer.start();assert.equal(writer.totalQueued,0)
  await writer.shutdown()
  await plugin.dispose()
  await assert.rejects(installed.accountStatus(),{code:'loop-host/cancelled'})
})

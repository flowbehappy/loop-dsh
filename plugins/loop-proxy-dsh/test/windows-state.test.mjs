import assert from 'node:assert/strict'
import {mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {BindingStore} from '../binding-store.mjs'
import {validateWorkspaceRef} from '../host-protocol.mjs'
import {checkWindowsPath} from '../private-path.mjs'

test('Windows state survives atomic publication and restart with a private ACL', {skip:process.platform !== 'win32'}, async () => {
  const parent=mkdtempSync(join(tmpdir(),'loop-native-state-'))
  const root=join(parent,'private')
  try {
    const first=new BindingStore({root})
    await first.init()
    checkWindowsPath(root)
    const identity=readFileSync(join(root,'installation-id'),'utf8')
    const second=new BindingStore({root})
    await second.init()
    assert.equal(readFileSync(join(root,'installation-id'),'utf8'),identity)
    assert.equal(validateWorkspaceRef({workspaceId:'workspace-one',path:root,displayTitle:'Windows'}).path,root)
    assert.throws(()=>validateWorkspaceRef({workspaceId:'workspace-one',path:'C:relative',displayTitle:'Windows'}),/absolute/)
  } finally {rmSync(parent,{recursive:true,force:true})}
})

import assert from "node:assert/strict"
import {mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import test from "node:test"
import {resolveManagedConfig, assertManagedWorkspace} from "../managed-config.mjs"

test("Web and Desktop share one stable installation without launcher environment", () => {
  const home=mkdtempSync(join(tmpdir(),"loop-managed-"))
  const pkg=join(home,"package");mkdirSync(pkg)
  try {
    const web=resolveManagedConfig({home,name:"web"},pkg)
    const desktop=resolveManagedConfig({home,name:"desktop"},pkg)
    assert.equal(web.installationId,desktop.installationId)
    assert.equal(web.actionsHome,desktop.actionsHome)
    assert.equal(web.syncProfile,desktop.syncProfile)
    assert.equal(readFileSync(join(web.root,"installation-id"),"utf8").trim(),web.installationId)
    assert.throws(()=>assertManagedWorkspace(web,home),/outside the workspace/)
    const project=join(home,"project");mkdirSync(project)
    assert.doesNotThrow(()=>assertManagedWorkspace(web,project))
    assert.throws(()=>resolveManagedConfig({home,name:"headless"},pkg),/official DSH/)
  } finally {rmSync(home,{recursive:true,force:true})}
})

test("managed state refuses symlink redirection",()=>{
  const home=mkdtempSync(join(tmpdir(),"loop-managed-"))
  try {
    const target=join(home,"other");mkdirSync(target,{mode:0o700})
    symlinkSync(target,join(home,"loop-plugin"))
    assert.throws(()=>resolveManagedConfig({home,name:"web"},home),/not private/)
  } finally {rmSync(home,{recursive:true,force:true})}
})

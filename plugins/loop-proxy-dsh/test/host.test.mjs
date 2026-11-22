import assert from "node:assert/strict"
import test from "node:test"
import {parseCommand, createLoopProxyBridge, apply} from "../host.mjs"

const session = "session-11111111-2222-3333-4444-555555555555"
function fixture(service) {
  const hooks = new Map()
  const ctx = {get: name => name === "loopHostService" ? service : undefined,
    on(name, callback) { hooks.set(name, callback); return () => hooks.delete(name) }}
  return {bridge:createLoopProxyBridge(ctx,{skillPath:new URL("../../../skills/loop-proxy-harness/SKILL.md",import.meta.url).pathname}),hooks}
}
function commandExec(command, signal = new AbortController().signal) {
  return {name:"bash",arguments:{command},signal,agent:{session:{id:session,header:{cwd:"/tmp/project"}}}}
}

test("parseCommand accepts only the exact Loop Proxy command grammar", () => {
  assert.deepEqual(parseCommand('loop-proxy guide agents'), {verb: "guide", name: "agents", input: ""})
  assert.deepEqual(parseCommand('loop-proxy context'), {verb: "context", name: "", input: ""})
  assert.deepEqual(parseCommand('loop-proxy actions task.'), {verb: "actions", name: "task.", input: ""})
  assert.deepEqual(parseCommand('loop-proxy schema task.get'), {verb: "schema", name: "task.get", input: ""})
  assert.deepEqual(parseCommand('loop-proxy schema workflow.plan {"includeOutput":true}'), {verb:"schema", name:"workflow.plan", input:'{"includeOutput":true}'})
  assert.equal(parseCommand('loop-proxy schema workflow.plan {"includeOutput":"yes"}'), null)
  assert.deepEqual(
    parseCommand('loop-proxy call task.get {"taskId":"tsk_1"}'),
    {verb: "call", name: "task.get", input: '{"taskId":"tsk_1"}'},
  )
  assert.deepEqual(parseCommand("loop-proxy call project.list"), {verb:"call", name:"project.list", input:"{}", implicitEmptyInput:true})
  for (const command of [
    'loop-proxy',
    'loop-proxy context other',
    'loop-proxy context {}',
    'loop-proxy guide',
    'loop-proxy guide agents {}',
    'loop-proxy guide ../SKILL.md',
    'loop-proxy human call task.get',
    'loop-proxy actions input extra',
    'loop-proxy actions; id',
    ' loop-proxy actions',
    'loop-proxy call task.get []',
    'loop-proxy call task.get null',
    'loop-proxy call task.get {"taskId":"one"}{"taskId":"two"}',
    'cd /tmp && loop-proxy actions',
  ]) {
    assert.equal(parseCommand(command), null, command)
  }
})


test("native commands preserve literal JSON without shell evaluation", async () => {
  const seen=[]
  const f=fixture({canUseAgentActions:()=>true,async agentCommand(id, command) { seen.push({id,command});return {failed:false,output:"accepted"} }})
  for (const content of ["a'b", 'a"b', "line one\nline two", "$(do-not-execute)", "`do-not-execute`", "path\\to\\file"]) {
    const input=JSON.stringify({content})
    const result=await f.bridge.execute(commandExec(`loop-proxy call message.send ${input}`),()=>assert.fail("shell invoked"))
    assert.equal(result.value.exitCode,0)
    assert.deepEqual(JSON.parse(seen.at(-1).command.input),{content})
    assert.equal(seen.at(-1).id,session)
  }
  f.bridge.dispose()
})

test("malformed commands, shell chaining and foreign workdirs never dispatch", async () => {
  const f=fixture({canUseAgentActions:()=>true,agentCommand:()=>assert.fail("unexpected dispatch")})
  for (const command of ['loop-proxy call task.get {} | cat','loop-proxy call task.get {} ; pwd','loop-proxy call task.get {"bad":','loop-proxy context extra']) {
    const result=await f.bridge.execute(commandExec(command),()=>assert.fail("shell invoked"))
    assert.equal(result.value.exitCode,1)
    assert.match(result.value.stdout.text,/dispatched.*false/)
  }
  const foreign=commandExec('loop-proxy actions');foreign.arguments.workdir='/another/project'
  assert.equal((await f.bridge.execute(foreign,()=>assert.fail("shell invoked"))).value.exitCode,1)
  f.bridge.dispose()
})

test("Human requests use their exact connection and never fall back to Agent", async () => {
  const seen=[]
  const f=fixture({canUseAgentActions:()=>true,agentCommand:()=>assert.fail("Agent fallback"),
    async humanCommand(id, command) {seen.push({id,command});return {failed:false,output:"human"}}})
  for (const [prefix,connection] of [['human','business'],['human-apps','apps']]) {
    const result=await f.bridge.execute(commandExec(`loop-proxy ${prefix} actions`),()=>assert.fail("shell invoked"))
    assert.equal(result.value.exitCode,0);assert.equal(seen.at(-1).command.connection,connection)
  }
  f.bridge.dispose()
})

test("permission denial and unavailable native service remain failed tool results", async () => {
  for (const service of [undefined,{canUseAgentActions:()=>true,async agentCommand(){throw new Error("exact resource denied")}}]) {
    const f=fixture(service)
    const result=await f.bridge.execute(commandExec('loop-proxy call task.get {"taskId":"exact"}'),()=>assert.fail("shell invoked"))
    assert.equal(result.value.exitCode,1)
    if(service)assert.match(result.value.stdout.text,/exact resource denied/)
    f.bridge.dispose()
    assert.equal((await f.bridge.execute(commandExec('loop-proxy actions'))).value.exitCode,1)
  }
})

test("local guides remain readable before login and native entry requires managed configuration", async () => {
  const f=fixture(undefined)
  const result=await f.bridge.execute(commandExec('loop-proxy guide tasks'),()=>assert.fail("shell invoked"))
  assert.equal(result.value.exitCode,0);assert.match(result.value.stdout.text,/task/i)
  f.bridge.dispose()
  assert.throws(()=>apply({get:()=>undefined}),/native managed configuration/)
  assert.doesNotThrow(()=>apply({get:()=>({})}))
})

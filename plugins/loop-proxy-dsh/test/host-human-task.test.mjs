import assert from "node:assert/strict"
import test from "node:test"
import {HumanTaskConsent} from "../host-human-task.mjs"
import {parseCommand} from "../host.mjs"

const command = parseCommand('loop-proxy human authorize project.get {"summary":"查看春季发布项目","resourceConstraints":["project:prj_spring"]}')
const grant = {id:"grant-one",expiresAt:"2031-01-01T00:00:00Z",allowedActions:["project.get"],
  resourceConstraints:["project:prj_spring"],scope:"loop.human_access offline_access"}
const status = {state:"connected",accountPrincipal:"user",workspaceId:"workspace",grant}
function input(text) {
  return {source:{kind:"user",rpcId:"rpc-1"},content:[{type:"text",text}]}
}

test("only the original local instruction can confirm and consume a task grant",async t=>{
  const sessions = new Map([["chat",input("请帮我使用我本人的身份查看春季发布项目")]])
  let current = status
  const tasks = new HumanTaskConsent({owner:async()=>({serviceBaseUrl:"https://loop.example"}),current:id=>sessions.get(id),request:async()=>current})
  const abort = new AbortController()
  t.after(()=>{abort.abort();tasks.dispose()})
  const events = tasks.events("chat",abort.signal)
  assert.equal((await events.next()).value.state,"idle")
  const running = tasks.authorize("chat",command,abort.signal)
  const view = (await events.next()).value
  assert.equal(view.state,"reuse")
  assert.deepEqual(view.resources,grant.resourceConstraints)
  assert.equal(view.expiresAt,grant.expiresAt)
  assert.throws(()=>tasks.decide({sessionId:"another",requestId:view.requestId,decision:"reuse"}))
  assert.throws(()=>tasks.forCommand("chat",command))
  tasks.decide({sessionId:"chat",requestId:view.requestId,decision:"reuse"})
  assert.equal((await running).failed,false)
  assert.equal(tasks.forCommand("chat",{...command,verb:"call"}).grant.id,grant.id)
  assert.equal(tasks.forCommand("chat",{...command,name:"project.archive"}).grant.id,grant.id)
  assert.throws(()=>tasks.forCommand("chat",{...command,connection:"apps"}))
  sessions.set("chat",input("以我的名义再查一次"))
  assert.throws(()=>tasks.forCommand("chat",command))
  assert.equal((await events.next()).value.state,"idle")
  const revoked = tasks.authorize("chat",command,abort.signal)
  const second = (await events.next()).value
  current = {...status,state:"needs_auth",grant:undefined}
  tasks.decide({sessionId:"chat",requestId:second.requestId,decision:"reuse"})
  await assert.rejects(revoked,/revoked/)
})

test("ordinary and remote inputs cannot start a personal task, and empty resource scope must be declared",async t=>{
  let message=input("Please read the project")
  const tasks = new HumanTaskConsent({owner:async()=>({serviceBaseUrl:"https://loop.example"}),current:()=>message,request:()=>assert.fail("unexpected request")})
  t.after(()=>tasks.dispose())
  const signal=new AbortController().signal
  await assert.rejects(tasks.authorize("chat",command,signal),/direct instruction/)
  message=input("不要以我的名义查看这个项目")
  await assert.rejects(tasks.authorize("chat",command,signal),/direct instruction/)
  message={...input("以我的名义查看项目"),source:{kind:"delivery"}}
  await assert.rejects(tasks.authorize("chat",command,signal),/direct instruction/)
  message=input("以我的名义查看项目")
  await assert.rejects(tasks.authorize("chat",{...command,input:'{"summary":"项目"}'},signal),/exact resource/)

})

test("a current user task can review a real denial once without an identity keyword",async t=>{
  const owner={serviceBaseUrl:"https://loop.example",accountPrincipal:"user",loopWorkspaceId:"workspace"}
  const preview={action:command.name,summary:"Read project",manage:false,write:false,resourceConstraints:grant.resourceConstraints,workspaceWide:false}
  let message=input("查看春季项目，不要用英文显示结果")
  const tasks=new HumanTaskConsent({owner:async()=>owner,current:()=>message,request:async()=>status})
  const abort=new AbortController()
  t.after(()=>{abort.abort();tasks.dispose()})
  assert.equal(tasks.canOffer(message),true)
  assert.equal(tasks.canOffer(input("不要以我的名义办这件事")),false)
  assert.equal(tasks.canOffer(input("只用助手自己的权限")),false)
  assert.equal(tasks.canOffer({...message,source:{kind:"delivery"}}),false)
  const stream=tasks.events("chat",abort.signal)
  await stream.next()
  const result=tasks.offer("chat",message,owner,preview,"查看春季项目",abort.signal)
  const view=(await stream.next()).value
  assert.equal(view.agentDenied,true)
  assert.equal(view.state,"reuse")
  assert.throws(()=>tasks.forCommand("chat",command))
  tasks.decide({sessionId:"chat",requestId:view.requestId,decision:"cancel"})
  await assert.rejects(result,/declined/)
  await assert.rejects(tasks.offer("chat",message,owner,{...preview,resourceConstraints:["project:other"]},"查看另一项目",abort.signal),/already requested/)
  message=input("查看春季项目")
  await assert.rejects(tasks.offer("chat",message,{...owner,accountPrincipal:"another"},preview,"查看春季项目",abort.signal),/connection changed/)
})

test("project and KB selection return only the chosen locator to the original request",async t=>{
  const owner={serviceBaseUrl:"https://loop.example",accountPrincipal:"user",loopWorkspaceId:"ws_one"}
  let message=input("选择我要用的项目")
  const tasks=new HumanTaskConsent({owner:async()=>owner,current:()=>message,request:()=>assert.fail("selection cannot grant access")})
  const abort=new AbortController()
  t.after(()=>{abort.abort();tasks.dispose()})
  const events=tasks.events("chat",abort.signal)
  await events.next()
  for (const [family,id] of [["project","proj_one"],["kb","kb_one"]]) {
    assert.equal(parseCommand("loop-proxy pick "+family).name,family)
    const running=tasks.pick("chat",message,family,abort.signal)
    const view=(await events.next()).value
    assert.equal(view.state,"pick")
    const select=resourceUrl=>tasks.decide({sessionId:"chat",requestId:view.requestId,decision:"select",resourceUrl})
    assert.throws(()=>select(view.browseUrl.replace("ws_one","ws_other")+"/"+id))
    assert.throws(()=>select(view.browseUrl.replace("loop.example","other.example")+"/"+id))
    assert.throws(()=>select(view.browseUrl+"/unknown"))
    select(view.browseUrl+"/"+id)
    assert.deepEqual(await running,{workspaceId:"ws_one",[family==="project"?"projectId":"kbId"]:id})
    assert.throws(()=>select(view.browseUrl+"/"+id))
    await events.next()
  }
  const cancelled=tasks.pick("chat",message,"project",abort.signal)
  const view=(await events.next()).value
  tasks.decide({sessionId:"chat",requestId:view.requestId,decision:"cancel"})
  await assert.rejects(cancelled,/declined/)
  await assert.rejects(tasks.pick("chat",message,"project",abort.signal),/already declined/)
  assert.throws(()=>tasks.forCommand("chat",command))
})

test("a request to act for the user preserves positive and negative identity intent",async()=>{
  const {requestsHumanIdentity}=await import('../host-human-task.mjs')
  for (const text of ['请明确代表我本人发送','Please send on my behalf']) assert.equal(requestsHumanIdentity(input(text)),true)
  for (const text of ['不要代表我本人回复',"Do not send on my behalf"]) assert.equal(requestsHumanIdentity(input(text)),false)
})

test("an unpublished action cannot open a personal consent card",async t=>{
  const message=input("请代表我本人私聊同事")
  const tasks=new HumanTaskConsent({current:()=>message,
    owner:async(_session,_signal,action)=>{assert.equal(action,"direct-message.send");throw new Error("unpublished action")},
    request:async()=>assert.fail("no authorization should start")})
  t.after(()=>tasks.dispose())
  await assert.rejects(tasks.authorize("chat",{...command,name:"direct-message.send"},new AbortController().signal),/unpublished action/)
  assert.equal(tasks.pending.size,0)
})

test("manual authorization derives omitted write scope from the published action",async t=>{
  const signal=new AbortController().signal
  const message=input("请代表我本人给同事发私聊，限定 dm:@abcdefghijkl")
  const owner={serviceBaseUrl:"https://loop.example",accountPrincipal:"user",loopWorkspaceId:"workspace"}
  const tasks=new HumanTaskConsent({current:()=>message,owner:async(_id,_s,action)=>action?{...owner,readOnly:false}:owner,
    request:async()=>assert.fail("unexpected connection request")})
  t.after(()=>tasks.dispose())
  tasks.confirm=async(_session,_message,{policy})=>({policy})
  const send={...command,name:"message.send",input:JSON.stringify({summary:"Send the approved DM",resourceConstraints:["dm:@abcdefghijkl"]})}
  const wrongPeer={...send,input:send.input.replace("dm:@abcdefghijkl","dm:abcdefghijkl")}
  await assert.rejects(tasks.authorize("chat",wrongPeer,signal),/exact DM resource/)
  await tasks.authorize("chat",send,signal)
  assert.equal(tasks.approved.get(message).policy.write,true)
  const readOnly={...send,input:JSON.stringify({...JSON.parse(send.input),write:false})}
  await assert.rejects(tasks.authorize("chat",readOnly,signal),/published Loop action/)
})

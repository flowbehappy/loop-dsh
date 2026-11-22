// Task admission belongs to the Host. Only the browser receives the OAuth URL.
// Holding the originating tool call open lets DSH resume the very same turn.
import {createHash, randomUUID} from "node:crypto"
import {EventEmitter, on} from "node:events"
import {setTimeout as delay} from "node:timers/promises"
import {humanLoginSchema} from "./host-protocol.mjs"

function refusal(message) {
  return Object.assign(new Error(message), {code:"loop-host/waiting-for-access"})
}

export function userText(message) {
  if (message?.source?.kind !== "user" || !message.source.rpcId) return ""
  return message.content?.filter(block => block.type === "text").map(block => block.text).join("\n").trim() ?? ""
}

const explicit = /(?:代表我本人|on my behalf)|(?:以|使用|用)(?:我(?:本人)?的?|本人的?)(?:名义|名義|身份|身分|账号|帳號|账户|帳戶)|(?:in my (?:own )?name|(?:use|using) my (?:own )?(?:identity|account|name)|act as me)\b|(?:私|わたし)の(?:名前|名義|アカウント)で/iu
const assistantOnly = /(?:仅|僅|只)(?:限|用|使用)?(?:助手|智能体|智能體)(?:自己)?(?:的)?(?:权限|權限)|(?:do not|don't|never) (?:ask|request) (?:for )?(?:permission|authorization)|only use (?:the )?(?:assistant|agent)(?:['’]s)? (?:permissions|access)/iu
const noPersonalAccess = /(?:不要|别|別|禁止|不能|不准|无需|無需|不得|请勿|請勿).{0,12}(?:代表我本人|(?:以|用)(?:我(?:本人)?的?|本人(?:的)?)(?:名义|名義|身份|身分|账号|帳號|账户|帳戶)|(?:请求|請求|申请|申請)(?:我的|个人|個人)?(?:授权|授權))|(?:do not|don't|never|without|not to)\b[^.!?。！？]{0,60}(?:my (?:own )?(?:name|account|identity)|as me|on my behalf)/iu

export function requestsHumanIdentity(message) {
  const text = userText(message)
  return !noPersonalAccess.test(text) && !assistantOnly.test(text) && (explicit.test(text) || /^\s*\/as-me(?:\s|$)/u.test(text))
}

function taskPolicy(command, readOnly) {
  const input = JSON.parse(command.input)
  if (typeof input.summary !== "string" || !input.summary.trim() || input.summary.length > 400 ||
      Object.keys(input).some(key => !["summary","resourceConstraints","manage","write","workspaceWide"].includes(key))) {
    throw refusal("Give a short, human-readable description of the exact action and objects, with exact resourceConstraints.")
  }
  const policy = humanLoginSchema.parse({connection:command.connection,allowedActions:[command.name],
    resourceConstraints:input.resourceConstraints,manage:input.manage})
  if (input.write !== undefined && typeof input.write !== "boolean") throw refusal("write must be a boolean")
  if (readOnly === false && input.write === false && !policy.manage) {
    throw refusal("The requested permission does not match the published Loop action.")
  }
  policy.write = policy.manage || input.write === true || readOnly === false
  if ((policy.resourceConstraints.length === 0) !== (input.workspaceWide === true)) {
    throw refusal("Specify exact resource locators, or explicitly request workspaceWide for an action covering all accessible resources.")
  }
  policy.resourceConstraints.sort()
  const policyKey = createHash("sha256").update(JSON.stringify(policy)).digest("hex")
  return {policy,policyKey,summary:input.summary.trim()}
}

function matches(grant, policy) {
  return grant && grant.allowedActions.length === 1 && grant.allowedActions[0] === policy.allowedActions[0] &&
    grant.resourceConstraints.length === policy.resourceConstraints.length &&
    policy.resourceConstraints.every(value => grant.resourceConstraints.includes(value)) &&
    grant.scope.split(" ").includes("loop.human_manage") === policy.manage &&
    grant.scope.split(" ").includes("loop.human_write") === policy.write
}

export class HumanTaskConsent {
  constructor({current,request,owner}) {
    this.owner = owner
    this.current = current
    this.request = request
    this.pending = new Map()
    this.approved = new WeakMap()
    this.offers = new WeakMap()
    this.changed = new EventEmitter()
    this.control = new AbortController()
  }

  async *events(sessionId, signal) {
    const active = AbortSignal.any([this.control.signal,signal])
    const changes = on(this.changed, sessionId, {signal:active})
    try {
      yield this.pending.get(sessionId)?.view ?? {state:"idle"}
      for await (const _ of changes) yield this.pending.get(sessionId)?.view ?? {state:"idle"}
    } catch (error) {
      if (!active.aborted) throw error
    } finally { await changes.return() }
  }

  decide({sessionId,requestId,decision}) {
    const entry = this.pending.get(sessionId)
    if (!entry || entry.view?.requestId !== requestId || this.current(sessionId) !== entry.message) throw refusal("This task authorization is no longer active.")
    if (decision === "cancel") entry.cancel.abort(refusal("The user declined task authorization."))
    else if (decision === "reuse" && entry.view.state === "reuse") entry.resolve()
    else throw refusal("This task requires confirmation in Loop.")
    return {}
  }

  canOffer(message) {
    const text = userText(message)
    return Boolean(text) && !assistantOnly.test(text) && !noPersonalAccess.test(text)
  }

  async offer(sessionId, message, owner, preview, description, signal, input = "", agentDenied = true) {
    if (this.current(sessionId) !== message || !this.canOffer(message)) throw refusal("The originating user request changed.")
    const {action, resourceConstraints, manage, write, workspaceWide} = preview
    const summary = (typeof description === "string" && description.trim()) || preview.summary || action
    const command = {name:action, connection:action.startsWith("app.") ? "apps" : "business",
      input:JSON.stringify({summary:summary.slice(0,400),resourceConstraints,manage,write,workspaceWide})}
    const policy = taskPolicy(command)
    let history = this.offers.get(message)
    if (!history) {
      history = {requests:new Set(), declined:new Set()}
      this.offers.set(message,history)
    }
    const requestKey = createHash("sha256").update(policy.policyKey).update(input).digest("hex")
    if (history.declined.has(action) || history.requests.has(requestKey)) {
      throw refusal("This authorization was already requested in this turn. Do not repeat it.")
    }
    history.requests.add(requestKey)
    try {
      return await this.confirm(sessionId,message,policy,signal,owner,agentDenied)
    } catch (error) {
      history.declined.add(action)
      throw error
    }
  }

  async authorize(sessionId,command,signal) {
    const message = this.current(sessionId)
    if (!this.canOffer(message) || !requestsHumanIdentity(message)) {
      throw refusal("Personal mode requires a direct instruction. For ordinary requests use the Agent action first. The Host will offer personal authorization if appropriate.")
    }
    const owner = await this.owner(sessionId,signal,command.name)
    const policy = taskPolicy(command,owner.readOnly)
    const requestedPeer = userText(message).match(/dm:@[a-z0-9]{12}(?![a-z0-9])/gu)
    if (requestedPeer?.length === 1 && ["message.send","message.history"].includes(command.name) &&
        !policy.policy.resourceConstraints.includes(requestedPeer[0])) {
      throw refusal("Use the exact DM resource specified by the user: "+requestedPeer[0]+". No authorization has been requested.")
    }
    const grant = await this.confirm(sessionId,message,policy,signal,owner)
    this.approved.set(message,grant)
    return {failed:false,output:JSON.stringify({authorized:true,connection:grant.policy.connection,action:command.name,resources:grant.policy.resourceConstraints})}
  }

  async confirm(sessionId,message,{policy,policyKey,summary},signal,expectedOwner,agentDenied = false) {
    if (this.pending.has(sessionId)) throw refusal("Finish the pending authorization in this task.")
    const cancel = new AbortController()
    const active = AbortSignal.any([signal,this.control.signal,cancel.signal,AbortSignal.timeout(300_000)])
    const check = () => {
      active.throwIfAborted()
      if (this.current(sessionId) !== message) throw refusal("The originating user turn changed.")
    }
    check()
    const requestId = randomUUID()
    const entry = {message,cancel}
    this.pending.set(sessionId,entry)
    let challenge, target
    try {
      const route = await this.owner(sessionId,active)
      check()
      if (expectedOwner && (route.serviceBaseUrl !== expectedOwner.serviceBaseUrl || route.accountPrincipal !== expectedOwner.accountPrincipal ||
          route.loopWorkspaceId !== expectedOwner.loopWorkspaceId)) throw refusal("The original Loop connection changed.")
      target = {...route,connection:policy.connection,includeGrant:true}
      // Recognize a matching connection made by the older settings page.
      let status = await this.request("humanStatus",target,active)
      if (!matches(status.grant,policy)) {
        target = {...target,policyKey}
        status = await this.request("humanStatus",target,active)
      }
      check()
      if (!status.accountPrincipal || !status.workspaceId) throw refusal("Sign in to Loop first.")
      const owner = {serviceBaseUrl:route.serviceBaseUrl,accountPrincipal:status.accountPrincipal,workspaceId:status.workspaceId}
      target = {...target,accountPrincipal:owner.accountPrincipal,loopWorkspaceId:owner.workspaceId}
      const details = {requestId,summary,action:policy.allowedActions[0],resources:policy.resourceConstraints,manage:policy.manage,agentDenied}
      if (matches(status.grant,policy)) {
        const originalId = status.grant.id
        const decision = Promise.withResolvers()
        entry.resolve = decision.resolve
        entry.view = {...details,state:"reuse",expiresAt:status.grant.expiresAt}
        this.changed.emit(sessionId)
        const abort = () => decision.reject(active.reason)
        active.addEventListener("abort",abort,{once:true})
        try { await decision.promise } finally { active.removeEventListener("abort",abort) }
        check()
        status = await this.request("humanStatus",target,active)
        if (status.grant?.id !== originalId) throw refusal("The authorization was revoked or replaced.")
      } else {
        status = await this.request("beginHumanLogin",{...policy,...target},active)
        challenge = status.challenge
        if (!challenge) throw refusal("Loop did not return a browser authorization request.")
        check()
        const browserUrl = new URL(challenge.loginUrl)
        browserUrl.hash = new URLSearchParams({task:summary}).toString()
        entry.view = {...details,state:"browser",loginUrl:browserUrl.href}
        this.changed.emit(sessionId)
        do {
          await delay(750,undefined,{signal:active})
          check()
          status = await this.request("completeHumanLogin",{...target,challengeId:challenge.id},active)
        } while (status.state === "needs_auth" && status.challenge?.id === challenge.id)
      }
      check()
      if (!matches(status.grant,policy) || status.accountPrincipal !== owner.accountPrincipal || status.workspaceId !== owner.workspaceId) {
        throw refusal("Loop has not confirmed this task's exact authorization.")
      }
      return {...owner,id:status.grant.id,policyKey:target.policyKey,policy}
    } catch (error) {
      if (cancel.signal.aborted) throw cancel.signal.reason
      throw error
    } finally {
      this.pending.delete(sessionId)
      this.changed.emit(sessionId)
      if (challenge) await this.request("cancelHumanLogin",{...target,challengeId:challenge.id},AbortSignal.timeout(3000)).catch(()=>{})
    }
  }

  forCommand(sessionId,command) {
    const message = this.current(sessionId)
    const grant = message && this.approved.get(message)
    if (!grant || command.connection !== grant.policy.connection) {
      throw refusal("Use the assistant for ordinary work. Explicit personal tasks must first authorize the exact action from this user turn.")
    }
    return {message,grant}
  }

  dispose() { this.control.abort() }
}

// This protocol module is shared with the browser bundle. Host-side storage
// additionally resolves and validates the path using the native filesystem.
function isAbsolute(value) {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) ||
    /^\\\\[^\\]+\\[^\\]+(?:\\|$)/.test(value)
}
import {LOOP_MODEL_ROUTE_PREFIX} from "./model-identity.mjs"

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/
const MAX_STRING = 2048

export const WORKSPACE_REF_KEYS = new Set(["workspaceId", "path", "displayTitle"])

function fail(message) {
  throw new TypeError(message)
}

function object(value, label, allowed) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`)
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} has an unknown field`)
  }
  return value
}

function text(value, label, max = MAX_STRING) {
  if (typeof value !== "string" || value.length === 0 || Buffer.byteLength(value) > max) {
    fail(`${label} must be a non-empty bounded string`)
  }
  return value
}

function textAllowEmpty(value, label, max) {
  if (typeof value !== "string" || Buffer.byteLength(value) > max) {
    fail(`${label} must be a bounded string`)
  }
  return value
}

function id(value, label) {
  text(value, label, 200)
  if (!ID.test(value)) fail(`${label} is invalid`)
  return value
}

function absolutePath(value, label) {
  text(value, label)
  if (!isAbsolute(value) || value.includes("\0")) fail(`${label} must be absolute`)
  return value
}

export function validateWorkspaceRef(value) {
  object(value, "workspace", WORKSPACE_REF_KEYS)
  return workspaceRef(value)
}

function workspaceRef(value) {
  return {
    workspaceId: id(value.workspaceId, "workspaceId"),
    path: absolutePath(value.path, "workspace path"),
    displayTitle: text(value.displayTitle, "workspace displayTitle", 255),
  }
}

const BIND_KEYS = new Set([...WORKSPACE_REF_KEYS, "mode", "choice", "locale"])
export function validateBeginBind(value) {
  object(value, "beginBind request", BIND_KEYS)
  const request = workspaceRef(value)
  if (value.mode !== undefined && value.mode !== "bind" && value.mode !== "switch") {
    fail("mode must be bind or switch")
  }
  request.mode = value.mode ?? "bind"
  if (value.locale !== undefined) {
    if (value.locale !== "zh" && value.locale !== "en") fail("locale must be zh or en")
    request.locale = value.locale
  }
  if (value.choice !== undefined) {
    const choice = object(value.choice, "binding choice", new Set(["projectId", "agentId"]))
    request.choice = {
      projectId: id(choice.projectId, "projectId"),
      agentId: id(choice.agentId, "agentId"),
    }
  }
  return request
}

const COMPLETE_KEYS = new Set([...WORKSPACE_REF_KEYS, "challengeId", "projectId", "agentId", "expectedRevision"])
export function validateCompleteBind(value) {
  object(value, "completeBind request", COMPLETE_KEYS)
  const request = workspaceRef(value)
  request.challengeId = id(value.challengeId, "challengeId")
  request.projectId = id(value.projectId, "projectId")
  request.agentId = id(value.agentId, "agentId")
  if (value.expectedRevision !== undefined && value.expectedRevision !== null) {
    request.expectedRevision = id(value.expectedRevision, "expectedRevision")
  } else {
    request.expectedRevision = null
  }
  return request
}

const UNBIND_KEYS = new Set([...WORKSPACE_REF_KEYS, "expectedRevision", "recoveryMode"])
export function validateUnbind(value) {
  object(value, "unbind request", UNBIND_KEYS)
  const request = workspaceRef(value)
  request.expectedRevision = id(value.expectedRevision, "expectedRevision")
  if (value.recoveryMode !== undefined) {
    if (value.recoveryMode !== "human_confirmed") fail("recoveryMode must be human_confirmed")
    request.recoveryMode = value.recoveryMode
  }
  return request
}

export function validateDisconnectAccount(value) {
  object(value, "disconnect request", new Set(["recoveryMode"]))
  if (value.recoveryMode !== undefined && value.recoveryMode !== "human_confirmed") fail("recoveryMode must be human_confirmed")
  return value.recoveryMode === undefined ? {} : {recoveryMode: value.recoveryMode}
}

const SESSION_KEYS = new Set(["workspaceId", "sessionId"])
export function validateSessionRef(value) {
  object(value, "session request", SESSION_KEYS)
  return {
    workspaceId: id(value.workspaceId, "workspaceId"),
    sessionId: id(value.sessionId, "sessionId"),
  }
}

const SYNC_KEYS = new Set(["workspaceId", "sessionId", "enabled", "confirmedSourceSequence"])
export function validateSetSync(value) {
  object(value, "setSync request", SYNC_KEYS)
  const request = {
    workspaceId: id(value.workspaceId, "workspaceId"),
    sessionId: id(value.sessionId, "sessionId"),
  }
  if (typeof value.enabled !== "boolean") fail("enabled must be boolean")
  request.enabled = value.enabled
  if (value.confirmedSourceSequence !== undefined) {
    if (!Number.isSafeInteger(value.confirmedSourceSequence) || value.confirmedSourceSequence < 0) {
      fail("confirmedSourceSequence must be a non-negative safe integer")
    }
    request.confirmedSourceSequence = value.confirmedSourceSequence
  }
  return request
}

const CREATE_PROJECT_KEYS = new Set([...WORKSPACE_REF_KEYS, "challengeId", "name", "prefix"])
export function validateCreateProject(value) {
  object(value, "createProject request", CREATE_PROJECT_KEYS)
  const request = workspaceRef(value)
  request.challengeId = id(value.challengeId, "challengeId")
  request.name = text(value.name, "project name", 255).trim()
  if (request.name === "") fail("project name must not be blank")
  request.prefix = text(value.prefix, "project prefix", 32).trim()
  if (!/^[A-Za-z]{1,32}$/.test(request.prefix)) {
    fail("project prefix must be 1-32 ASCII letters")
  }
  return request
}

export function validateGlobalPage(value) {
  return object(value, "globalPage request", new Set())
}

export function validateConfigureGlobalServer(value) {
  object(value, "configureGlobalServer request", new Set(["serverUrl"]))
  return {serverUrl: text(value.serverUrl, "server URL").trim()}
}

export function validateConfigureGlobalServerWorkspace(value) {
  object(value, "configureGlobalServerWorkspace request", new Set([
    "workspaceId",
    "expectedServerRevision",
  ]))
  return {
    workspaceId: id(value.workspaceId, "Loop workspace id"),
    expectedServerRevision: id(value.expectedServerRevision, "expectedServerRevision"),
  }
}

const OPEN_PAGE_KEYS = new Set([...WORKSPACE_REF_KEYS, "sessionId", "projectId", "pagePath"])
export function validateOpenLoopPage(value) {
  object(value, "openLoopPage request", OPEN_PAGE_KEYS)
  const request = workspaceRef(value)
  if (value.sessionId !== undefined) request.sessionId = id(value.sessionId, "sessionId")
  if (value.projectId !== undefined) request.projectId = id(value.projectId, "projectId")
  if (value.pagePath !== undefined) {
    text(value.pagePath, "page path")
    if (!value.pagePath.startsWith("/") || value.pagePath.startsWith("//") || value.pagePath.includes("\\")) {
      fail("page path must be an absolute Loop path")
    }
    request.pagePath = value.pagePath
  }
  return request
}

export function validateProjectSyncSettingsRequest(value) {
  return object(value, "project sync settings request", new Set())
}

export function validateSetProjectSyncSettings(value) {
  object(value, "set project sync settings request", new Set(["enabled", "defaultRoot"]))
  if (value.enabled === undefined && value.defaultRoot === undefined) {
    fail("project sync settings require enabled or defaultRoot")
  }
  const request = {}
  if (value.enabled !== undefined) {
    if (typeof value.enabled !== "boolean") fail("project sync enabled must be boolean")
    request.enabled = value.enabled
  }
  if (value.defaultRoot !== undefined) {
    request.defaultRoot = absolutePath(value.defaultRoot, "default project root")
    if (request.defaultRoot === "/") fail("default project root is invalid")
  }
  return request
}

export function validateSyncProjects(value) {
  object(value, "sync projects request", new Set(["reconcileWorkspaceBinding", "expectedServerRevision", "expectedGrantId"]))
  if (value.reconcileWorkspaceBinding === undefined && value.expectedServerRevision === undefined && value.expectedGrantId === undefined) return {}
  if (value.reconcileWorkspaceBinding !== true) fail("workspace repair requires explicit confirmation")
  return {reconcileWorkspaceBinding: true, ...(value.expectedGrantId === undefined ? {} : {expectedGrantId:id(value.expectedGrantId, "connection grant")}), expectedServerRevision: id(value.expectedServerRevision, "server revision")}
}

export function validateChangeProjectDirectory(value) {
  object(value, "change project directory request", new Set([
    "projectId",
    "path",
    "expectedBindingRevision",
  ]))
  const request = {
    projectId: id(value.projectId, "projectId"),
    path: absolutePath(value.path, "project directory"),
  }
  if (value.expectedBindingRevision !== undefined) {
    request.expectedBindingRevision = id(value.expectedBindingRevision, "expectedBindingRevision")
  }
  return request
}

function collaborationRequest(value, label, allowed, required = []) {
  object(value, label, new Set(allowed))
  for (const field of required) {
    if (!Object.hasOwn(value, field)) fail(`${label}.${field} is required`)
  }
  return value
}

export function validateCollaborationStatus(value) {
  return collaborationRequest(value, "collaboration status", ["sessionId", "workspaceId"], ["sessionId"])
}

export function validateCollaborationSnapshot(value) {
  return collaborationRequest(value, "collaboration snapshot", [
    "sessionId", "workspaceId", "bindingRevision", "sessionGeneration",
  ], ["sessionId"])
}

export function validateCollaborationBoards(value) {
  return collaborationRequest(value, "collaboration boards", [
    "sessionId", "query", "cursor", "limit",
  ], ["sessionId"])
}

export function validateCollaborationBind(value) {
  return collaborationRequest(value, "collaboration bind", [
    "sessionId", "workspaceId", "boardId", "coordinatorAgentId",
    "expectedRevision", "expectedBindingEpoch", "sourceGeneration", "shareScope",
  ], ["sessionId", "boardId", "coordinatorAgentId"])
}

export function validateCollaborationDirectory(value) {
  return collaborationRequest(value, "collaboration directory", [
    "sessionId", "workspaceId", "bindingRevision", "scopeGeneration",
    "query", "kinds", "cursor", "limit",
  ], ["sessionId"])
}

export function validatePrepareCollaborationIntent(value) {
  if (value?.activateOnClaim !== undefined && typeof value.activateOnClaim !== "boolean") fail("activateOnClaim must be boolean")
  return collaborationRequest(value, "prepare collaboration intent", [
    "sessionId", "workspaceId", "bindingRevision", "sessionGeneration",
    "serializedText", "payloadText", "payloadDigest", "references", "targets",
    "shareScope", "expiresAt", "activateOnClaim",
  ], ["sessionId"])
}

export function validateBindCollaborationIntent(value) {
  return collaborationRequest(value, "bind collaboration intent", [
    "intentRef", "requestId", "payloadDigest", "acceptedSerializedText",
    "sessionId", "sessionGeneration", "bindingRevision",
  ], ["sessionId", "requestId"])
}

export function validateBindCollaborationContinuation(value) {
  return collaborationRequest(value, "bind collaboration continuation", [
    "sessionId", "requestId", "continuationRef", "bindingRevision",
    "payloadDigest", "acceptedSerializedText",
  ], ["sessionId", "requestId", "continuationRef", "payloadDigest", "acceptedSerializedText"])
}

export function validateCancelCollaborationIntent(value) {
  return collaborationRequest(value, "cancel collaboration intent", [
    "sessionId", "intentRef", "clientRequestId", "reason", "expectedStatus",
  ], ["sessionId"])
}



export function validateFollowupCollaborationTask(value) {
  return collaborationRequest(value, "followup collaboration task", [
    "sessionId", "taskId", "targetId", "expectedRevision", "goal",
    "inputRefs", "shareScope", "clientRequestId",
  ], ["sessionId", "taskId", "goal"])
}

export function validateCollaborationInspect(value) {
  return collaborationRequest(value, "inspect collaboration", ["sessionId", "taskId", "messageId"], ["sessionId", "taskId"])
}

export function validateCollaborationReconcile(value) {
  return collaborationRequest(value, "reconcile collaboration", [
    "sessionId", "clientRequestIds", "eventIds",
  ], ["sessionId"])
}

export function validateCollaborationEvents(value) {
  return collaborationRequest(value, "collaboration events", [
    "sessionId", "afterEventId",
  ], ["sessionId"])
}

const SKILL_CATALOG_KEYS = new Set([
  "workspaceId", "sessionId", "query", "cursor", "limit",
])
export function validateSkillCatalog(value) {
  object(value, "Skill catalog request", SKILL_CATALOG_KEYS)
  const request = {
    workspaceId: id(value.workspaceId, "workspaceId"),
    sessionId: id(value.sessionId, "sessionId"),
  }
  if (value.query !== undefined) request.query = textAllowEmpty(value.query, "query", 200)
  if (value.cursor !== undefined) request.cursor = text(value.cursor, "catalog cursor", 2048)
  if (value.limit !== undefined) {
    if (!Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 50) {
      fail("limit must be an integer from 1 to 50")
    }
    request.limit = value.limit
  }
  return request
}

const SKILL_CONTENT_KEYS = new Set([
  "workspaceId", "sessionId", "skillId", "path",
  "expectedVersionId", "expectedCommitSha", "offset", "maxBytes",
])
export function validateSkillContent(value) {
  object(value, "Skill content request", SKILL_CONTENT_KEYS)
  const request = {
    workspaceId: id(value.workspaceId, "workspaceId"),
    sessionId: id(value.sessionId, "sessionId"),
    skillId: id(value.skillId, "skillId"),
    path: text(value.path, "Skill content path", 1024),
  }
  if (request.path.includes("\0")) fail("Skill content path is invalid")
  if (value.expectedVersionId !== undefined) {
    request.expectedVersionId = text(value.expectedVersionId, "expectedVersionId", 128)
  }
  if (value.expectedCommitSha !== undefined) {
    request.expectedCommitSha = text(value.expectedCommitSha, "expectedCommitSha", 64)
  }
  if (request.expectedVersionId !== undefined && request.expectedCommitSha !== undefined) {
    fail("expectedVersionId and expectedCommitSha are mutually exclusive")
  }
  if (value.offset !== undefined) {
    if (!Number.isSafeInteger(value.offset) || value.offset < 0) {
      fail("offset must be a non-negative safe integer")
    }
    request.offset = value.offset
  }
  if ((request.offset ?? 0) > 0 &&
      request.expectedVersionId === undefined && request.expectedCommitSha === undefined) {
    fail("a Skill content continuation requires an exact version")
  }
  if (value.maxBytes !== undefined) {
    if (!Number.isSafeInteger(value.maxBytes) || value.maxBytes < 1 || value.maxBytes > 32768) {
      fail("maxBytes must be an integer from 1 to 32768")
    }
    request.maxBytes = value.maxBytes
  }
  return request
}

export function validateModelStatus(value) {
  return object(value, "Loop model status request", new Set())
}

const MODEL_DISCONNECT_KEYS = new Set(["connectionId"])
export function validateDisconnectModelConnection(value) {
  object(value, "disconnect Loop model connection request", MODEL_DISCONNECT_KEYS)
  return {connectionId: id(value.connectionId, "connectionId")}
}

const MODEL_DEFAULT_KEYS = new Set([
  "kind",
  "provider",
  "model",
  "connectionId",
  "workspaceId",
  "expectedServerRevision",
  "expectedAccountPrincipal",
])
const MODEL_DEFAULT_LOOP_KEYS = [
  "connectionId",
  "workspaceId",
  "expectedServerRevision",
  "expectedAccountPrincipal",
]
export function validateSetDefaultModel(value) {
  object(value, "set default model request", MODEL_DEFAULT_KEYS)
  if (value.kind !== "loop" && value.kind !== "external") {
    fail("model kind must be loop or external")
  }
  const request = {
    kind: value.kind,
    provider: id(value.provider, "model provider"),
    model: text(value.model, "model id", 512),
  }
  const loopRoute = request.provider.startsWith(LOOP_MODEL_ROUTE_PREFIX)
  if ((request.kind === "loop") !== loopRoute) {
    fail("model kind must match its provider route")
  }
  if (request.kind === "external") {
    if (MODEL_DEFAULT_LOOP_KEYS.some(key => Object.hasOwn(value, key))) {
      fail("external model requests cannot carry Loop scope fields")
    }
    return request
  }
  request.connectionId = id(value.connectionId, "connectionId")
  request.workspaceId = id(value.workspaceId, "workspaceId")
  request.expectedServerRevision = id(value.expectedServerRevision, "expectedServerRevision")
  request.expectedAccountPrincipal = text(
    value.expectedAccountPrincipal,
    "expectedAccountPrincipal",
    512,
  ).trim()
  if (request.expectedAccountPrincipal === "") fail("expectedAccountPrincipal must not be blank")
  return request
}

const MODEL_ENSURE_KEYS = new Set([
  "connectionId",
  "hostSessionId",
  "modelId",
  "providerId",
  "source",
  "wireApi",
  "purpose",
])
export function validateModelSession(value) {
  object(value, "Loop model session request", MODEL_ENSURE_KEYS)
  const request = {
    connectionId: id(value.connectionId, "connectionId"),
    hostSessionId: id(value.hostSessionId, "hostSessionId"),
    modelId: text(value.modelId, "modelId", 512),
    source: value.source,
    wireApi: value.wireApi,
  }
  if (value.providerId !== undefined) request.providerId = text(value.providerId, "providerId", 512)
  if (!["loop_proxy", "loop_hosted", "loop_personal"].includes(request.source)) {
    fail("source must be loop_proxy, loop_hosted, or loop_personal")
  }
  if (request.source === "loop_personal" &&
      (request.providerId === undefined || request.providerId.trim() === "")) {
    fail("personal model providerId is required")
  }
  if (!["openai-completions", "openai-responses", "anthropic-messages"].includes(request.wireApi)) {
    fail("wireApi is invalid")
  }
  if (value.purpose !== undefined) {
    if (!["conversation", "compaction", "session-title"].includes(value.purpose)) {
      fail("purpose is invalid")
    }
    request.purpose = value.purpose
  }
  return request
}

const MODEL_CLOSE_KEYS = new Set(["hostSessionId"])
export function validateCloseModelSession(value) {
  object(value, "close Loop model session request", MODEL_CLOSE_KEYS)
  return {hostSessionId: id(value.hostSessionId, "hostSessionId")}
}

export function schema(validate) {
  return {
    parse: validate,
    safeParse(value) {
      try {
        return {success: true, data: validate(value)}
      } catch (error) {
        return {success: false, error}
      }
    },
    jsonSchema: {type: "object"},
  }
}

export const workspaceRefSchema = schema(validateWorkspaceRef)
export const beginBindSchema = schema(validateBeginBind)
export const completeBindSchema = schema(validateCompleteBind)
export const unbindSchema = schema(validateUnbind)
export const disconnectAccountSchema = schema(validateDisconnectAccount)
export const sessionRefSchema = schema(validateSessionRef)
export const setSyncSchema = schema(validateSetSync)
export const createProjectSchema = schema(validateCreateProject)
export const globalPageSchema = schema(validateGlobalPage)
export const configureGlobalServerSchema = schema(validateConfigureGlobalServer)
export const configureGlobalServerWorkspaceSchema = schema(validateConfigureGlobalServerWorkspace)
export const openLoopPageSchema = schema(validateOpenLoopPage)
export const projectSyncSettingsSchema = schema(validateProjectSyncSettingsRequest)
export const setProjectSyncSettingsSchema = schema(validateSetProjectSyncSettings)
export const syncProjectsSchema = schema(validateSyncProjects)
export const changeProjectDirectorySchema = schema(validateChangeProjectDirectory)
export const collaborationStatusSchema = schema(validateCollaborationStatus)
export const collaborationSnapshotSchema = schema(validateCollaborationSnapshot)
export const collaborationBoardsSchema = schema(validateCollaborationBoards)
export const collaborationBindSchema = schema(validateCollaborationBind)
export const collaborationDirectorySchema = schema(validateCollaborationDirectory)
export const prepareCollaborationIntentSchema = schema(validatePrepareCollaborationIntent)
export const bindCollaborationIntentSchema = schema(validateBindCollaborationIntent)
export const bindCollaborationContinuationSchema = schema(validateBindCollaborationContinuation)
export const cancelCollaborationIntentSchema = schema(validateCancelCollaborationIntent)
export const followupCollaborationTaskSchema = schema(validateFollowupCollaborationTask)
export const collaborationInspectSchema = schema(validateCollaborationInspect)
export const collaborationReconcileSchema = schema(validateCollaborationReconcile)
export const collaborationEventsSchema = schema(validateCollaborationEvents)
export const skillCatalogSchema = schema(validateSkillCatalog)
export const skillContentSchema = schema(validateSkillContent)
export const modelStatusSchema = schema(validateModelStatus)
export const disconnectModelConnectionSchema = schema(validateDisconnectModelConnection)
export const setDefaultModelSchema = schema(validateSetDefaultModel)
export const modelSessionSchema = schema(validateModelSession)
export const closeModelSessionSchema = schema(validateCloseModelSession)

export function validateConnectAccount(value) {
 object(value, "connect account request", new Set(["workspaceId", "principalId", "expectedServerRevision", "locale", "recoverCredentials","accessToken","requestPageAccess"]))
 const result = {expectedServerRevision: id(value.expectedServerRevision, "expectedServerRevision")}
 if (value.workspaceId !== undefined) result.workspaceId = id(value.workspaceId, "workspaceId")
 if (value.principalId !== undefined) result.principalId = id(value.principalId, "principalId")
 if (value.locale !== undefined) {
  if (!["zh", "en"].includes(value.locale)) fail("locale must be zh or en")
  result.locale = value.locale
 }
 if (value.requestPageAccess !== undefined) {
   if (value.requestPageAccess !== true || value.accessToken !== undefined || value.recoverCredentials) fail("Invalid page authorization request")
   result.requestPageAccess = true
 }
 if(value.accessToken !== undefined){
   if(typeof value.accessToken!=="string" || !/^loop_dsh_[A-Za-z0-9_-]{43}$/u.test(value.accessToken) || value.recoverCredentials) fail("A personal assistant DSH token is required")
   result.accessToken=value.accessToken
 }
 if (value.recoverCredentials !== undefined) {
  if (value.recoverCredentials !== true) fail("recoverCredentials must be true when specified")
  result.recoverCredentials = true
 }
 return result
}
export const connectAccountSchema = schema(validateConnectAccount)

export function validateKnowledgeCatalog(value) {
  object(value, "knowledge catalog request", new Set(["workspaceId", "sessionId", "cursor", "kbId"]))
  return {
    workspaceId: id(value.workspaceId, "workspaceId"),
    sessionId: id(value.sessionId, "sessionId"),
    ...(value.cursor === undefined ? {} : {cursor: text(value.cursor, "cursor", 16)}),
    ...(value.kbId === undefined ? {} : {kbId: text(value.kbId, "kbId", 255)}),
  }
}
export const knowledgeCatalogSchema = schema(validateKnowledgeCatalog)

function humanConnection(value) {
  if (value.connection !== "business" && value.connection !== "apps") fail("Select a Human connection")
  return {connection: value.connection}
}

export const humanTaskSessionSchema = schema(value => {
  object(value, "Task", new Set(["sessionId"]))
  return {sessionId: id(value.sessionId, "sessionId")}
})
export const humanTaskDecisionSchema = schema(value => {
  object(value, "Task authorization", new Set(["sessionId", "requestId", "decision"]))
  if (!["reuse", "cancel"].includes(value.decision)) fail("Unknown task authorization decision")
  return {sessionId: id(value.sessionId, "sessionId"), requestId: id(value.requestId, "requestId"), decision: value.decision}
})

export const humanConnectionSchema = schema(value => {
  return humanConnection(object(value, "Human connection", new Set(["connection"])))
})

export const humanChallengeSchema = schema(value => {
  object(value, "Human connection challenge", new Set(["connection", "challengeId"]))
  return {...humanConnection(value), challengeId: id(value.challengeId, "challengeId")}
})

function selectors(value, label, pattern, min) {
  if (!Array.isArray(value) || value.length < min || value.length > 128 ||
      value.some(item => typeof item !== "string" || Buffer.byteLength(item) > 512 || !pattern.test(item)) ||
      new Set(value).size !== value.length) fail(`${label} must contain distinct exact identifiers`)
  return [...value]
}

export const humanLoginSchema = schema(value => {
  object(value, "Human delegation request", new Set(["connection", "allowedActions", "resourceConstraints", "manage"]))
  const connection = humanConnection(value)
  if (value.manage !== undefined && typeof value.manage !== "boolean") fail("manage must be a boolean")
  return {...connection, manage: value.manage === true,
    allowedActions: selectors(value.allowedActions, "allowedActions", /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u, 1),
    resourceConstraints: selectors(value.resourceConstraints ?? [], "resourceConstraints", /^[a-z][a-z0-9-]*:[^,:*?\x00-\x1f\x7f]+$/u, 0)}
})

export const syncPreferencesSchema = schema(value => {
  object(value, "sync preferences", new Set(["uploadDisconnectedHistory"]))
  if (typeof value.uploadDisconnectedHistory !== "boolean") fail("uploadDisconnectedHistory must be boolean")
  return {uploadDisconnectedHistory: value.uploadDisconnectedHistory}
})

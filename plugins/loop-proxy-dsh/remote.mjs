import {
  syncPreferencesSchema,
  humanConnectionSchema,
  humanTaskSessionSchema,
  humanTaskDecisionSchema,
  humanChallengeSchema,
  humanLoginSchema,
  beginBindSchema,
  connectAccountSchema,
  bindCollaborationContinuationSchema,
  bindCollaborationIntentSchema,
  cancelCollaborationIntentSchema,
  changeProjectDirectorySchema,
  collaborationBindSchema,
  collaborationBoardsSchema,
  collaborationDirectorySchema,
  collaborationEventsSchema,
  collaborationInspectSchema,
  collaborationReconcileSchema,
  collaborationSnapshotSchema,
  collaborationStatusSchema,
  completeBindSchema,
  configureGlobalServerSchema,
  configureGlobalServerWorkspaceSchema,
  createProjectSchema,
  disconnectModelConnectionSchema,
  globalPageSchema,
  modelStatusSchema,
  openLoopPageSchema,
  prepareCollaborationIntentSchema,
  projectSyncSettingsSchema,
  sessionRefSchema,
  setDefaultModelSchema,
  setProjectSyncSettingsSchema,
  setSyncSchema,
  knowledgeCatalogSchema,
  skillCatalogSchema,
  skillContentSchema,
  syncProjectsSchema,
  unbindSchema,
  disconnectAccountSchema,
  workspaceRefSchema,
  followupCollaborationTaskSchema,
} from "./host-protocol.mjs"

const PACKAGE = "@pingkai/loop-dsh"
const SERVICE = "loopHostService"
const NAMESPACE = "loopHost"

function codec(create, typeSymbol) {
  return {
    mode: "strict",
    typeSymbol,
    create: () => schemaValue(create),
  }
}

function schemaValue(create) {
  const value = create()
  return {
    parse: input => value.parse(input),
    safeParse: input => value.safeParse(input),
    jsonSchema: value.jsonSchema,
  }
}

function method(name, requestSchema, requestType) {
  return {
    service: SERVICE,
    invocation: {kind: "direct"},
    parameters: [{
      name: "request",
      wire: "request",
      source: "json",
      codec: codec(() => requestSchema, requestType),
      strictCodec: codec(() => requestSchema, requestType),
    }],
    cancellation: {parameter: "signal"},
    result: codec(() => genericResult, "unknown"),
  }
}

function streamMethod(name, requestSchema, requestType) {
  return {
    ...method(name, requestSchema, requestType),
    mode: "stream",
    cancellation: {parameter: "signal"},
  }
}

const genericResult = {
  parse: value => value,
  safeParse(value) {
    try {
      return {success: true, data: value}
    } catch (error) {
      return {success: false, error}
    }
  },
  jsonSchema: {},
}

const descriptors = []
const methods = Object.create(null)

for (const [name, requestSchema, requestType, isStream = false] of [
  ["status", workspaceRefSchema, "WorkspaceRef"],
  ["connectAccount", connectAccountSchema, "ConnectAccountRequest"],
  ["beginBind", beginBindSchema, "BeginBindRequest"],
  ["completeBind", completeBindSchema, "CompleteBindRequest"],
  ["unbind", unbindSchema, "UnbindRequest"],
  ["disconnectAccount", disconnectAccountSchema, "DisconnectAccountRequest"],
  ["sessionContext", sessionRefSchema, "SessionRef"],
  ["syncStatus", sessionRefSchema, "SessionRef"],
  ["setSync", setSyncSchema, "SetSyncRequest"],
  ["createProject", createProjectSchema, "CreateProjectRequest"],
  ["globalServerStatus", globalPageSchema, "GlobalServerStatusRequest"],
  ["globalServerWorkspaceStatus", globalPageSchema, "GlobalServerWorkspaceStatusRequest"],
  ["configureGlobalServer", configureGlobalServerSchema, "ConfigureGlobalServerRequest"],
  ["configureGlobalServerWorkspace", configureGlobalServerWorkspaceSchema, "ConfigureGlobalServerWorkspaceRequest"],
  ["globalPage", globalPageSchema, "GlobalPageRequest"],
  ["openLoopPage", openLoopPageSchema, "OpenLoopPageRequest"],
  ["retrySync", sessionRefSchema, "SessionRef"],
  ["humanTaskEvents", humanTaskSessionSchema, "HumanTaskSession", true],
  ["decideHumanTask", humanTaskDecisionSchema, "HumanTaskDecision"],
  ["humanStatus", humanConnectionSchema, "HumanConnectionRequest"],
  ["beginHumanLogin", humanLoginSchema, "BeginHumanLoginRequest"],
  ["completeHumanLogin", humanChallengeSchema, "HumanChallengeRequest"],
  ["cancelHumanLogin", humanChallengeSchema, "HumanChallengeRequest"],
  ["disconnectHuman", humanConnectionSchema, "HumanConnectionRequest"],
  ["getSyncPreferences", globalPageSchema, "SyncPreferencesRequest"],
  ["setSyncPreferences", syncPreferencesSchema, "SyncPreferences"],
  ["projectSyncSettings", projectSyncSettingsSchema, "ProjectSyncSettingsRequest"],
  ["setProjectSyncSettings", setProjectSyncSettingsSchema, "SetProjectSyncSettingsRequest"],
  ["syncProjects", syncProjectsSchema, "SyncProjectsRequest"],
  ["changeProjectDirectory", changeProjectDirectorySchema, "ChangeProjectDirectoryRequest"],
  ["collaborationStatus", collaborationStatusSchema, "CollaborationStatusRequest"],
  ["collaborationSnapshot", collaborationSnapshotSchema, "CollaborationSnapshotRequest"],
  ["collaborationBoards", collaborationBoardsSchema, "CollaborationBoardsRequest"],
  ["collaborationBind", collaborationBindSchema, "CollaborationBindRequest"],
  ["collaborationDirectory", collaborationDirectorySchema, "CollaborationDirectoryRequest"],
  ["prepareCollaborationIntent", prepareCollaborationIntentSchema, "PrepareCollaborationIntentRequest"],
  ["bindCollaborationIntent", bindCollaborationIntentSchema, "BindCollaborationIntentRequest"],
  ["bindCollaborationContinuation", bindCollaborationContinuationSchema, "BindCollaborationContinuationRequest"],
  ["cancelCollaborationIntent", cancelCollaborationIntentSchema, "CancelCollaborationIntentRequest"],
  ["followupCollaborationTask", followupCollaborationTaskSchema, "FollowupCollaborationTaskRequest"],
  ["collaborationInspect", collaborationInspectSchema, "CollaborationInspectRequest"],
  ["collaborationReconcile", collaborationReconcileSchema, "CollaborationReconcileRequest"],
  ["collaborationEvents", collaborationEventsSchema, "CollaborationEventsRequest", true],
  ["knowledgeCatalog", knowledgeCatalogSchema, "KnowledgeCatalogRequest"],
  ["skillCatalog", skillCatalogSchema, "SkillCatalogRequest"],
  ["skillContent", skillContentSchema, "SkillContentRequest"],
  ["skillCatalogEvents", sessionRefSchema, "SessionRef", true],
  ["modelStatus", modelStatusSchema, "ModelStatusRequest"],
  ["refreshModelConnections", modelStatusSchema, "RefreshModelConnectionsRequest"],
  ["disconnectModelConnection", disconnectModelConnectionSchema, "DisconnectModelConnectionRequest"],
  ["setDefaultModel", setDefaultModelSchema, "SetDefaultModelRequest"],
]) {
  const definition = isStream
    ? streamMethod(name, requestSchema, requestType)
    : method(name, requestSchema, requestType)
  const endpoint = `${NAMESPACE}/${name}`
  const descriptor = {
    ...definition,
    id: `${PACKAGE}#${endpoint}`,
    namespace: NAMESPACE,
    method: name,
    result: {
      ...codec(() => genericResult, "unknown"),
      description: `${name} result`,
    },
  }
  const strictInput = {
    parse: input => validateNamedRequest(input, requestSchema),
    safeParse(input) {
      try {
        return {success: true, data: validateNamedRequest(input, requestSchema)}
      } catch (error) {
        return {success: false, error}
      }
    },
    create: () => ({
      parse: input => validateNamedRequest(input, requestSchema),
      safeParse(input) {
        try {
          return {success: true, data: validateNamedRequest(input, requestSchema)}
        } catch (error) {
          return {success: false, error}
        }
      },
      jsonSchema: {
        type: "object",
        properties: {request: requestSchema.jsonSchema},
        required: ["request"],
        additionalProperties: false,
      },
    }),
    jsonSchema: {
      type: "object",
      properties: {request: requestSchema.jsonSchema},
      required: ["request"],
      additionalProperties: false,
    },
  }
  descriptor.input = () => strictInput
  descriptor.invoke = (remote, input, signal) => {
    const receiver = remote.loopHost
    return receiver[name](requestSchema.parse(input.request), signal)
  }
  descriptors.push(descriptor)
  methods[endpoint] = descriptor
}

function validateNamedRequest(input, requestSchema) {
  if (input === null || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).length !== 1 || !Object.hasOwn(input, "request")) {
    throw new TypeError("Loop Host input requires exactly one request field")
  }
  return {request: requestSchema.parse(input.request)}
}

/**
 * Client-safe Remote declaration shared by the installed Host and UI.
 * The descriptors contain no credentials or live binding state.
 */
export const TYPERT_REMOTE = Object.freeze({
  package: PACKAGE,
  descriptors: Object.freeze(descriptors),
  methods: Object.freeze(methods),
})

export default TYPERT_REMOTE

/* Client declaration for the Host-owned Loop Remote methods. */
import type {
  RemoteStreamHandle,
  RemoteResult,
  TypertRemoteInfo,
  TypertRemoteMethod,
} from "@deepseek-ai/dsh-typert-protocol"

export type BindingState =
  | "unbound"
  | "needs_auth"
  | "waiting_for_access"
  | "target_unavailable"
  | "revoked"
  | "active"

export type WorkspaceRef = {
  readonly workspaceId: string
  readonly path: string
  readonly displayTitle: string
}

export type BindingView = {
  readonly state: BindingState
  readonly revision: string
  readonly workspace: WorkspaceRef
  readonly loop?: {
    readonly serviceBaseUrl: string
    readonly workspaceId: string
    readonly workspaceName: string
    readonly projectId: string
    readonly projectName: string
    readonly defaultChannelId: string
    readonly webUrl: string
  }
  readonly account?: { readonly displayName: string }
  readonly agent?: { readonly id: string; readonly displayName: string }
  readonly reason?: string
}

export type BeginBindRequest = WorkspaceRef & {
  readonly mode?: "bind" | "switch"
  readonly locale?: "zh" | "en"
  readonly choice?: { readonly projectId: string; readonly agentId: string }
}

export type BeginBindValue = {
  readonly state: "needs_auth" | "select_target" | "active"
  readonly binding: BindingView
  readonly challenge?: {
    readonly id: string
    readonly loginUrl: string
    readonly expiresAt: string
  }
  readonly projects?: readonly {
    readonly workspaceId: string
    readonly workspaceName: string
    readonly projectId: string
    readonly projectName: string
    readonly defaultChannelId: string
    readonly role: string
  }[]
  readonly agents?: readonly {
    readonly agentId: string
    readonly displayName: string
  }[]
  readonly reason?: string
}

export type CompleteBindRequest = WorkspaceRef & {
  readonly challengeId: string
  readonly projectId: string
  readonly agentId: string
  readonly expectedRevision?: string | null
}

export type UnbindRequest = WorkspaceRef & {
  readonly expectedRevision: string
  readonly recoveryMode?: "human_confirmed"
}
export type DisconnectAccountRequest = { readonly recoveryMode?: "human_confirmed" }
export type DisconnectAccountValue = {
  readonly state: "signed_out" | "needs_confirmation"
  readonly challenge?: {readonly id: string; readonly loginUrl: string; readonly expiresAt: string; readonly recoveryMode?: "human_confirmed"}
}
export type SessionRef = { readonly workspaceId: string; readonly sessionId: string }
export type CreateProjectRequest = WorkspaceRef & {
  readonly challengeId: string
  readonly name: string
  readonly prefix: string
}
export type ProjectChoice = {
  readonly workspaceId: string
  readonly workspaceName: string
  readonly projectId: string
  readonly projectName: string
  readonly defaultChannelId?: string
  readonly role: string
}
export type ConfirmedProjectChoice = ProjectChoice & { readonly defaultChannelId: string }
export type GlobalPageRequest = Record<never, never>
export type GlobalPage = { readonly url: string }
export type GlobalServerStatusRequest = Record<never, never>
export interface AccountLoginStatus {
  readonly reason?: 'refresh_outcome_unknown'
  readonly deviceOnly?: boolean
  readonly state: 'signed_in' | 'signed_out' | 'needs_auth' | 'signing_out' | 'unavailable'
  readonly grantId?: string
  readonly accountPrincipal?: string
  readonly workspaceId?: string
}

export type GlobalServerStatus = {
  readonly connection?: AccountLoginStatus
  readonly serverUrl: string | null
  readonly serverRevision: string
}
export type GlobalServerWorkspaceStatus = { readonly loopWorkspaceId: string | null }
export type ConfigureGlobalServerRequest = { readonly serverUrl: string }
export type ConfigureGlobalServerResult = {
  readonly serverUrl: string
  readonly serverRevision: string
  readonly page: GlobalPage
}
export type ConfigureGlobalServerWorkspaceRequest = {
  readonly workspaceId: string
  readonly expectedServerRevision: string
}
export type ConfigureGlobalServerWorkspaceResult = { readonly loopWorkspaceId: string }
export type OpenLoopPageRequest = WorkspaceRef & {
  readonly sessionId?: string
  readonly projectId?: string
  readonly pagePath?: string
}
export type PageSession = {
  readonly url: string
  readonly expiresAt: string
}

export type SessionContextValue = SessionRef & {
  readonly state: "inherited" | "blocked" | "unbound" | "needs_auth"
  readonly bindingRevision: string
  readonly projectId?: string
  readonly defaultChannelId?: string
  readonly reason?: string
}

export type SyncStatusValue = {
  readonly state: "off" | "on" | "pending" | "retrying" | "error" | "needs_auth"
  readonly destination?: {
    readonly channelId: string
    readonly topicId?: string
    readonly webUrl?: string
  }
  readonly pending: number
  readonly health?: "idle" | "pending" | "retrying" | "error" | "unsupported"
  readonly canEnable?: boolean
  readonly historyPartial: boolean
  readonly reason?: string
  readonly challenge?: {
    readonly id: string
    readonly loginUrl: string
    readonly expiresAt: string
  }
  readonly lastReceipt?: {
    readonly sourceSequence: number
    readonly acceptedAt: string
  }
}

export type SetSyncRequest = SessionRef & {
  readonly enabled: boolean
  readonly confirmedSourceSequence?: number
}

export type ProjectSyncState =
  | "off"
  | "needs_config"
  | "needs_auth"
  | "ready"
  | "partial"
  | "error"

export type ManagedProject = {
  readonly projectId: string
  readonly projectName: string
  readonly agentId: string
  readonly workspaceId?: string
  readonly workspacePath: string
  readonly workspaceTitle: string
  readonly bindingRevision?: string
  readonly defaultChannelId?: string
  readonly state: "pending" | "synced" | "error" | "workspace_missing"
  readonly reason?: string
  readonly updatedAt: string
}

export type ProjectSyncSettings = {
  readonly canDisconnect?: boolean
  /** @deprecated Older Hosts exposed this capability for a manual repair button. */
  readonly canRepairWorkspaceBindings?: boolean
  readonly canReconnectWorkspaceBindings?: boolean
  readonly disconnectPending?: boolean
  readonly enabled: boolean
  readonly defaultRoot: string
  readonly serverUrl: string | null
  readonly loopWorkspaceId: string | null
  readonly state: ProjectSyncState
  readonly account?: { readonly displayName: string }
  readonly lastSyncedAt?: string
  readonly reason?: string
  readonly projects: readonly ManagedProject[]
}

export type ProjectSyncSettingsRequest = Record<never, never>
export type SetProjectSyncSettingsRequest = {
  readonly enabled?: boolean
  readonly defaultRoot?: string
}
export type SyncProjectsRequest = {readonly reconcileWorkspaceBinding?: never; readonly expectedServerRevision?: never}
  /** @deprecated Normal Workspace sync reconciles eligible legacy bindings automatically. */
  | {readonly reconcileWorkspaceBinding: true; readonly expectedServerRevision: string; readonly expectedGrantId?: string}
export type SyncProjectsValue = ProjectSyncSettings & {
  readonly imported: number
  readonly updated: number
  readonly skipped: number
  readonly challenge?: {
    readonly id: string
    readonly loginUrl: string
    readonly expiresAt: string
  }
}
export type ChangeProjectDirectoryRequest = {
  readonly projectId: string
  readonly path: string
  readonly expectedBindingRevision?: string
}
export type ChangeProjectDirectoryValue = {
  readonly state: "ready" | "needs_auth" | "error"
  readonly project?: ManagedProject
  readonly settings: ProjectSyncSettings
  readonly challenge?: {
    readonly id: string
    readonly loginUrl: string
    readonly expiresAt: string
  }
  readonly reason?: string
}

export type CollaborationCapability = {
  readonly assignable?: boolean
  readonly available: boolean
  readonly delegable: boolean
  readonly notifiable: boolean
  readonly conditionalNotify: boolean

  readonly followup: boolean

  readonly cancel: boolean
  readonly reason?: string
}

export type CollaborationScope = {
  readonly serverBaseUrl: string
  readonly workspaceId: string
  readonly workspaceName?: string
  readonly accountId: string
  readonly accountName?: string
  readonly installationId: string
  readonly coordinatorAgentId: string
  readonly coordinatorAgentName?: string
  readonly bindingId: string
  readonly bindingRevision: string
  readonly bindingEpoch: string
  readonly projectId?: string
  readonly projectName?: string
  readonly boardId?: string
  readonly boardName?: string
}

export type CollaborationSubscription = {
  readonly state: "connecting" | "live" | "replaying" | "snapshot-required" | "backoff" | "revoked" | "stopped"
  readonly subscriptionId: string
  readonly generation?: string
  readonly lastEventSeq: number
  readonly snapshotRequired: boolean
  readonly retryAt?: string
  readonly reason?: string
}

export type CollaborationActiveWork = {
  readonly taskId: string
  readonly taskTitle?: string
  readonly revision: string



  readonly state: string
  readonly nextAction: "none" | "wait" | "reconcile" | "retry-cancel" | "open-loop"

  readonly resultUnknown: boolean
  readonly updatedAt?: string
  readonly reason?: string
}

export type CollaborationDelivery = {
  readonly deliveryId: string
  readonly eventId: string
  readonly eventSeq?: number
  readonly eventKind: string
  readonly sessionId: string
  readonly bindingId?: string
  readonly sourceSessionId?: string
  readonly bindingEpoch?: string
  readonly taskId?: string




  readonly contentHash?: string
  readonly state:
    | "pending"
    | "claimed"
    | "committed"
    | "canceled"
    | "needs-auth"
    | "reconcile"
    | "revoked"
    | "retired-route"
    | "binding-conflict"
    | "blocked"
  readonly payloadHash: string
  readonly messageId?: string
  readonly sessionSeq?: number
  readonly receivedAt: string
  readonly committedAt?: string
  readonly reason?: string
  readonly event?: Readonly<Record<string, unknown>>
}

export type CollaborationStatusValue = {
  readonly state:
    | "unbound"
    | "needs-auth"
    | "needs-board"
    | "target-unavailable"
    | "revoked"
    | "binding-conflict"
    | "ready"
    | "degraded"
  readonly scope?: CollaborationScope
  readonly capability: CollaborationCapability
  readonly subscription: CollaborationSubscription
  readonly active: readonly CollaborationActiveWork[]
  readonly deliveries: readonly CollaborationDelivery[]
  readonly reason?: string
}

export type CollaborationStatusRequest = {
  readonly sessionId: string
  readonly workspaceId?: string
}

export type CollaborationSnapshotRequest = CollaborationStatusRequest & {
  readonly bindingRevision?: string
  readonly sessionGeneration?: number
}

export type CollaborationSnapshot = {
  readonly status: CollaborationStatusValue["state"]
  readonly binding: CollaborationScope | null
  readonly board: CollaborationBoard | null
  readonly sharePreview: CollaborationSharePreview | null
  readonly activeTasks: readonly CollaborationActiveWork[]

  readonly capabilities: CollaborationCapability
  readonly subscription: CollaborationSubscription
  readonly revision: string
  readonly statusValue: CollaborationStatusValue
}

export type CollaborationBoard = {
  readonly boardId: string
  readonly boardName: string
  readonly projectId: string
  readonly projectName: string
  readonly revision: string
  readonly capability: CollaborationCapability
}

export type CollaborationBoardsRequest = {
  readonly sessionId: string
  readonly query?: string
  readonly cursor?: string
  readonly limit?: number
}

export type CollaborationBoardsValue = {
  readonly boards: readonly CollaborationBoard[]
  readonly nextCursor?: string
  readonly revision: string
  readonly capability?: CollaborationCapability
}

export type CollaborationBindRequest = {
  readonly sessionId: string
  readonly workspaceId?: string
  readonly boardId: string
  readonly coordinatorAgentId: string
  readonly expectedRevision?: string | null
  readonly expectedBindingEpoch?: number | null
  readonly sourceGeneration?: number
  readonly shareScope?: CollaborationShareScope
}

export type CollaborationBindValue = {
  readonly scope: CollaborationScope
  readonly capability: CollaborationCapability
  readonly subscription: CollaborationSubscription
}

export type CollaborationDirectoryEntry = {
  readonly mention?: string
  readonly targetId: string
  readonly targetType: "agent" | "human"
  readonly displayName: string
  readonly description?: string
  readonly stableRef: string
  readonly visible: boolean
  readonly notifiable: boolean
  readonly delegable: boolean
  readonly needsAccess: boolean
  readonly capability: CollaborationCapability
  readonly projectId?: string
  readonly projectName?: string
  readonly workspaceName?: string
  readonly revision: string
  readonly staleReason?: string
}

export type CollaborationDirectoryRequest = {
  readonly sessionId: string
  readonly workspaceId?: string
  readonly bindingRevision?: string
  readonly scopeGeneration?: string
  readonly query?: string
  readonly kinds?: readonly ("agent" | "human")[]
  readonly cursor?: string
  readonly limit?: number
}

export type CollaborationDirectoryValue = {
  readonly entries: readonly CollaborationDirectoryEntry[]
  readonly groups?: Readonly<Record<"agent" | "human", readonly CollaborationDirectoryEntry[]>>
  readonly items?: readonly CollaborationDirectoryEntry[]
  readonly nextCursor?: string
  readonly revision: string
  readonly freshness: "live" | "cached" | "stale"
  readonly cacheKey: string
  readonly truncated?: boolean
  readonly needsAccessCount?: number
}

export type CollaborationShareScope = {
  readonly scope: "task-description" | "selected-resources" | "task-discussion"
  readonly resourceRefs: readonly string[]
  readonly expandedAudience: boolean
}

export type CollaborationSharePreview = {
  readonly scope: string
  readonly resourceRefs: readonly string[]
  readonly targetIds: readonly string[]
  readonly firstExpansion: boolean
  readonly confirmationToken?: string
}

export type PrepareCollaborationIntentRequest = {
  readonly sessionId: string
  readonly workspaceId?: string
  readonly bindingRevision: string
  readonly sessionGeneration?: number
  readonly serializedText: string
  readonly payloadDigest?: string
  readonly references?: readonly {
    readonly targetId: string
    readonly targetType: "agent" | "human"
    readonly stableRef: string
    readonly intendedActions: readonly string[]
  }[]
  readonly shareScope: CollaborationShareScope
  readonly activateOnClaim?: boolean
  readonly expiresAt?: string
}

export type PrepareCollaborationIntentValue = {
  readonly activationOwner?: "host" | "client"
  readonly intentRef: string
  readonly payloadDigest: string
  readonly state: "prepared"
  readonly expiresAt: string
  readonly sharePreview: CollaborationSharePreview
}

export type BindCollaborationIntentRequest = {
  readonly intentRef: string
  readonly requestId: string
  readonly payloadDigest: string
  readonly acceptedSerializedText?: string
  readonly sessionId: string
  readonly sessionGeneration?: number
  readonly bindingRevision?: string
}

export type BindCollaborationContinuationRequest = {
  readonly sessionId: string
  readonly requestId: string
  readonly continuationRef: string
  readonly bindingRevision: string
  readonly payloadDigest: string
  readonly acceptedSerializedText: string
}

export type CollaborationContinuation = {
  readonly continuationRef: string
  readonly state: "ready" | "no-active-work" | "needs-explicit-target" | "stale"
  readonly localIntentId?: string
  readonly userIntentId?: string
  readonly bindingId: string
  readonly bindingRevision: string
  readonly bindingEpoch: string
  readonly sessionId: string
  readonly sessionGeneration: string
  readonly acceptedMessageId: string
  readonly acceptedSequence: number
  readonly acceptedTextDigest: string
  readonly tasks: readonly {
    readonly taskId: string
    readonly revision: string
    readonly taskTitle?: string
    readonly targetIds: readonly string[]
    readonly allowedActions: readonly ("followup" | "cancel")[]
    readonly question?: {




    }
  }[]
  readonly expiresAt: string
  readonly reason?: string
}

export type CollaborationIntentResult = {
  readonly intentRef: string
  readonly state: "prepared" | "bound" | "accepted" | "activating" | "activated" | "expired" | "cancelled" | "failed"
  readonly receiptId?: string
  readonly boundAt?: string
}

export type CancelCollaborationIntentRequest = {
  readonly sessionId: string
  readonly intentRef?: string
  readonly clientRequestId?: string
  readonly reason?: string
  readonly expectedStatus?: string
}


export type CollaborationCancelValue = {
  readonly state: "cancel-pending-delivery" | "cancel-requested" | "stopped" | "not-dispatched" | "already-terminal" | "unknown"
  readonly receipt?: Readonly<Record<string, unknown>>
}


export type FollowupCollaborationTaskRequest = {
  readonly sessionId: string
  readonly taskId: string
  readonly targetId?: string
  readonly expectedRevision?: string
  readonly goal: string
  readonly inputRefs?: readonly string[]
  readonly shareScope?: CollaborationShareScope
  readonly clientRequestId?: string
}

export type CollaborationActionValue = {
  readonly receipt?: Readonly<Record<string, unknown>>
  readonly task?: Readonly<Record<string, unknown>>
  readonly replayed?: boolean
}

export type CollaborationInspectRequest = {
  readonly sessionId: string
  readonly taskId: string
  readonly messageId?: string
}

export type CollaborationReconcileRequest = {
  readonly sessionId: string
  readonly clientRequestIds?: readonly string[]
  readonly eventIds?: readonly string[]
}

export type CollaborationEvent = {
  readonly eventId: string
  readonly sequence?: number
  readonly kind: string
  readonly occurredAt?: string
  readonly scope?: CollaborationScope
  readonly status?: Readonly<Record<string, unknown>>
  readonly directory?: Readonly<Record<string, unknown>>
  readonly intent?: Readonly<Record<string, unknown>>
  readonly delivery?: CollaborationDelivery
  readonly receipt?: Readonly<Record<string, unknown>>
  readonly active?: CollaborationActiveWork
}

export type CollaborationEventFrame =
  | {
    readonly type: "ready"
    readonly sequence: number
    readonly subscription: CollaborationSubscription
    readonly status: CollaborationStatusValue
  }
  | {
    readonly type: "change"
    readonly sequence: number
    readonly event: CollaborationEvent
  }
  | {
    readonly type: "error"
    readonly sequence: number
    readonly error: { readonly code: string; readonly message: string; readonly retryable: boolean }
  }

export type SkillCatalogRequest = {
  readonly workspaceId: string
  readonly sessionId: string
  readonly query?: string
  readonly cursor?: string
  readonly limit?: number
}

export type SkillCatalogEntry = {
  readonly skillId: string
  readonly librarySlug?: string
  readonly libraryName: string
  readonly libraryDescription?: string
  readonly name: string
  readonly description?: string
  readonly path: string
  readonly versionId?: string
  readonly commitSha?: string
  readonly sourceRevision: string
}

export type SkillCatalogValue = {
  readonly scope: {
    readonly installationId: string
    readonly accountId: string
    readonly serverBaseUrl: string
    readonly workspaceId: string
    readonly hostWorkspaceId: string
    readonly sessionId: string
    readonly catalog: "skills"
    readonly projectId?: string
    readonly agentId?: string
    readonly bindingRevision?: string
    readonly identityFingerprint: string
  }
  readonly data: {
    readonly items: readonly SkillCatalogEntry[]
    readonly nextCursor?: string
    readonly revision: string
    readonly hasMore: boolean
    readonly truncated: boolean
  }
}

export type SkillContentRequest = {
  readonly workspaceId: string
  readonly sessionId: string
  readonly skillId: string
  readonly path: string
  readonly expectedVersionId?: string
  readonly expectedCommitSha?: string
  readonly offset?: number
  readonly maxBytes?: number
}

export type SkillContentValue = {
  readonly scope: SkillCatalogValue["scope"]
  readonly data: {
    readonly skillId: string
    readonly path: string
    readonly versionId?: string
    readonly commitSha?: string
    readonly sizeBytes: number
    readonly offset: number
    readonly content?: string
    readonly contentBase64: string
    readonly contentSha256: string
    readonly nextOffset: number
    readonly hasMore: boolean
  }
}

export type SkillCatalogEventFrame =
  | {
    readonly type: "ready"
    readonly sequence: number
    readonly subscription: {
      readonly state: "connecting" | "live" | "backoff" | "revoked" | "stopped"
      readonly lastEventSeq: number
      readonly snapshotRequired: boolean
    }
  }
  | {
    readonly type: "change"
    readonly event: {
      readonly sequence?: number
      readonly eventId: string
      readonly kind: "catalog.changed" | "directory.changed" | "subscription.changed"
      readonly eventType?: string
      readonly revision?: number
      readonly occurredAt: string
      readonly sessionId: string
      readonly workspaceId: string
      readonly installationId: string
      readonly accountId: string
      readonly serverBaseUrl: string
      readonly hostWorkspaceId?: string
      readonly bindingRevision?: string
      readonly projectId?: string
      readonly agentId?: string
      readonly identityFingerprint?: string
      readonly eventSeq?: number
      readonly localSequence?: number
      readonly durableEventSeq?: number
      readonly status?: Readonly<Record<string, unknown>>
      readonly reason?: string
    }
  }

export type LoopModelDescriptor = {
  readonly id: string
  readonly name: string
  readonly source: "loop_proxy" | "loop_hosted" | "loop_personal"
  readonly providerId?: string
  readonly providerName?: string
  readonly presetKey?: string
  readonly wireApi: "openai-completions" | "openai-responses" | "anthropic-messages"
  readonly contextWindow?: number
  readonly maxOutputTokens?: number
  readonly inputModalities?: readonly string[]
  readonly reasoningEfforts?: readonly string[]
}

export type LoopModelConnection = {
  readonly connectionId: string
  readonly workspaceId: string
  readonly workspaceName?: string
  readonly providerName: string
  readonly accountName?: string
  readonly accountPrincipal?: string
  readonly models: readonly LoopModelDescriptor[]
  readonly status: "active" | "needs_auth" | "error"
  readonly reason?: string
  readonly updatedAt: string
}

export type LoopModelStatus = {
  readonly state: "needs_auth" | "active" | "error" | "unavailable"
  readonly connections: readonly LoopModelConnection[]
  readonly accountPrincipal?: string
  readonly reason?: string
}
export type ModelStatusRequest = Record<never, never>
export type DisconnectModelConnectionRequest = { readonly connectionId: string }
export type SetDefaultModelRequest =
  | {
      readonly kind: "external"
      readonly provider: string
      readonly model: string
    }
  | {
      readonly kind: "loop"
      readonly provider: string
      readonly model: string
      readonly connectionId: string
      readonly workspaceId: string
      readonly expectedServerRevision: string
      readonly expectedAccountPrincipal: string
    }
export type SetDefaultModelValue = {
  readonly selection: {
    readonly provider: string
    readonly model: string
    readonly reasoningEffort?: string
  }
}

export type HumanTaskSession = {readonly sessionId:string}
export type HumanTaskDecision = HumanTaskSession & {readonly requestId:string; readonly decision:"cancel"|"reuse"}
export type HumanTaskFrame = {readonly state:"idle"} | ({
  readonly requestId:string; readonly summary:string; readonly agentDenied?:boolean; readonly action:string; readonly resources:readonly string[]; readonly manage:boolean
} & ({readonly state:"browser"; readonly loginUrl:string} | {readonly state:"reuse"; readonly expiresAt:string}))
export interface HumanConnectionRequest { readonly connection: "business" | "apps" }
export interface HumanChallengeRequest extends HumanConnectionRequest { readonly challengeId: string }
export interface BeginHumanLoginRequest extends HumanConnectionRequest {
  readonly allowedActions: readonly string[]
  readonly resourceConstraints?: readonly string[]
  readonly manage?: boolean
}
export interface HumanConnectionStatus extends HumanConnectionRequest {
  readonly state: "signed_out" | "needs_auth" | "connected"
  readonly accountPrincipal?: string
  readonly workspaceId?: string
  readonly challenge?: { readonly id: string; readonly loginUrl: string; readonly expiresAt: string }
}

interface LoopHostNamespace {
  humanTaskEvents(request: HumanTaskSession, signal?: AbortSignal): RemoteStreamHandle<HumanTaskFrame, never>
  decideHumanTask(request: HumanTaskDecision, signal?: AbortSignal): Promise<RemoteResult<Record<never, never>>>
  humanStatus(request: HumanConnectionRequest, signal?: AbortSignal): Promise<RemoteResult<HumanConnectionStatus>>
  beginHumanLogin(request: BeginHumanLoginRequest, signal?: AbortSignal): Promise<RemoteResult<HumanConnectionStatus>>
  completeHumanLogin(request: HumanChallengeRequest, signal?: AbortSignal): Promise<RemoteResult<HumanConnectionStatus>>
  cancelHumanLogin(request: HumanChallengeRequest, signal?: AbortSignal): Promise<RemoteResult<Record<never, never>>>
  disconnectHuman(request: HumanConnectionRequest, signal?: AbortSignal): Promise<RemoteResult<HumanConnectionStatus>>
  status(request: WorkspaceRef, signal?: AbortSignal): Promise<RemoteResult<BindingView>>
  beginBind(request: BeginBindRequest, signal?: AbortSignal): Promise<RemoteResult<BeginBindValue>>
  completeBind(request: CompleteBindRequest, signal?: AbortSignal): Promise<RemoteResult<{ readonly binding: BindingView }>>
  disconnectAccount(request: DisconnectAccountRequest, signal?: AbortSignal): Promise<RemoteResult<DisconnectAccountValue>>
  unbind(request: UnbindRequest, signal?: AbortSignal): Promise<RemoteResult<{ readonly binding: BindingView }>>
  sessionContext(request: SessionRef, signal?: AbortSignal): Promise<RemoteResult<SessionContextValue>>
  syncStatus(request: SessionRef, signal?: AbortSignal): Promise<RemoteResult<SyncStatusValue>>
  setSync(request: SetSyncRequest, signal?: AbortSignal): Promise<RemoteResult<{ readonly sync: SyncStatusValue }>>
  createProject(request: CreateProjectRequest, signal?: AbortSignal): Promise<RemoteResult<ConfirmedProjectChoice>>
  globalServerStatus(request: GlobalServerStatusRequest, signal?: AbortSignal): Promise<RemoteResult<GlobalServerStatus>>
  globalServerWorkspaceStatus(request: GlobalServerStatusRequest, signal?: AbortSignal): Promise<RemoteResult<GlobalServerWorkspaceStatus>>
  configureGlobalServer(request: ConfigureGlobalServerRequest, signal?: AbortSignal): Promise<RemoteResult<ConfigureGlobalServerResult>>
  connectAccount(request: ConnectAccountRequest, signal?: AbortSignal): Promise<RemoteResult<ConnectAccountResult>>
  configureGlobalServerWorkspace(request: ConfigureGlobalServerWorkspaceRequest, signal?: AbortSignal): Promise<RemoteResult<ConfigureGlobalServerWorkspaceResult>>
  globalPage(request: GlobalPageRequest, signal?: AbortSignal): Promise<RemoteResult<GlobalPage>>
  openLoopPage(request: OpenLoopPageRequest, signal?: AbortSignal): Promise<RemoteResult<PageSession>>
  retrySync(request: SessionRef, signal?: AbortSignal): Promise<RemoteResult<SyncStatusValue>>
  getSyncPreferences(request: SyncPreferencesRequest, signal?: AbortSignal): Promise<RemoteResult<SyncPreferences>>
  setSyncPreferences(request: SyncPreferences, signal?: AbortSignal): Promise<RemoteResult<SyncPreferences>>
  projectSyncSettings(request: ProjectSyncSettingsRequest, signal?: AbortSignal): Promise<RemoteResult<ProjectSyncSettings>>
  setProjectSyncSettings(request: SetProjectSyncSettingsRequest, signal?: AbortSignal): Promise<RemoteResult<{ readonly settings: ProjectSyncSettings }>>
  syncProjects(request: SyncProjectsRequest, signal?: AbortSignal): Promise<RemoteResult<SyncProjectsValue>>
  changeProjectDirectory(request: ChangeProjectDirectoryRequest, signal?: AbortSignal): Promise<RemoteResult<ChangeProjectDirectoryValue>>
  collaborationStatus(request: CollaborationStatusRequest, signal?: AbortSignal): Promise<RemoteResult<CollaborationStatusValue>>
  collaborationSnapshot(request: CollaborationSnapshotRequest, signal?: AbortSignal): Promise<RemoteResult<CollaborationSnapshot>>
  collaborationBoards(request: CollaborationBoardsRequest, signal?: AbortSignal): Promise<RemoteResult<CollaborationBoardsValue>>
  collaborationBind(request: CollaborationBindRequest, signal?: AbortSignal): Promise<RemoteResult<CollaborationBindValue>>
  collaborationDirectory(request: CollaborationDirectoryRequest, signal?: AbortSignal): Promise<RemoteResult<CollaborationDirectoryValue>>
  prepareCollaborationIntent(request: PrepareCollaborationIntentRequest, signal?: AbortSignal): Promise<RemoteResult<PrepareCollaborationIntentValue>>
  bindCollaborationIntent(request: BindCollaborationIntentRequest, signal?: AbortSignal): Promise<RemoteResult<CollaborationIntentResult>>
  bindCollaborationContinuation(request: BindCollaborationContinuationRequest, signal?: AbortSignal): Promise<RemoteResult<CollaborationContinuation>>
  cancelCollaborationIntent(request: CancelCollaborationIntentRequest, signal?: AbortSignal): Promise<RemoteResult<CollaborationCancelValue>>
  followupCollaborationTask(request: FollowupCollaborationTaskRequest, signal?: AbortSignal): Promise<RemoteResult<CollaborationActionValue>>
  collaborationInspect(request: CollaborationInspectRequest, signal?: AbortSignal): Promise<RemoteResult<Readonly<Record<string, unknown>>>>
  collaborationReconcile(request: CollaborationReconcileRequest, signal?: AbortSignal): Promise<RemoteResult<Readonly<Record<string, unknown>>>>
  collaborationEvents(request: { readonly sessionId: string; readonly afterEventId?: string }, signal?: AbortSignal): RemoteStreamHandle<CollaborationEventFrame, never>
  knowledgeCatalog(request: KnowledgeCatalogRequest, signal?: AbortSignal): Promise<RemoteResult<KnowledgeCatalogValue>>
  skillCatalog(request: SkillCatalogRequest, signal?: AbortSignal): Promise<RemoteResult<SkillCatalogValue>>
  skillContent(request: SkillContentRequest, signal?: AbortSignal): Promise<RemoteResult<SkillContentValue>>
  skillCatalogEvents(request: SessionRef, signal?: AbortSignal): RemoteStreamHandle<SkillCatalogEventFrame, never>
  modelStatus(request: ModelStatusRequest, signal?: AbortSignal): Promise<RemoteResult<LoopModelStatus>>
  refreshModelConnections(request: ModelStatusRequest, signal?: AbortSignal): Promise<RemoteResult<LoopModelStatus>>
  disconnectModelConnection(request: DisconnectModelConnectionRequest, signal?: AbortSignal): Promise<RemoteResult<LoopModelStatus>>
  setDefaultModel(request: SetDefaultModelRequest, signal?: AbortSignal): Promise<RemoteResult<SetDefaultModelValue>>
}

declare module "@deepseek-ai/dsh-typert-protocol" {
  interface LoopHostRemoteNamespace extends LoopHostNamespace {}
  interface TypertRemoteNamespaceMap {
    loopHost: LoopHostRemoteNamespace
  }
  interface TypertRemoteMap {
    "loopHost/status": TypertRemoteMethod<{ readonly request: WorkspaceRef }, BindingView>
    "loopHost/beginBind": TypertRemoteMethod<{ readonly request: BeginBindRequest }, BeginBindValue>
    "loopHost/completeBind": TypertRemoteMethod<{ readonly request: CompleteBindRequest }, { readonly binding: BindingView }>
    "loopHost/disconnectAccount": TypertRemoteMethod<{ readonly request: DisconnectAccountRequest }, DisconnectAccountValue>
    "loopHost/unbind": TypertRemoteMethod<{ readonly request: UnbindRequest }, { readonly binding: BindingView }>
    "loopHost/sessionContext": TypertRemoteMethod<{ readonly request: SessionRef }, SessionContextValue>
    "loopHost/syncStatus": TypertRemoteMethod<{ readonly request: SessionRef }, SyncStatusValue>
    "loopHost/setSync": TypertRemoteMethod<{ readonly request: SetSyncRequest }, { readonly sync: SyncStatusValue }>
    "loopHost/createProject": TypertRemoteMethod<{ readonly request: CreateProjectRequest }, ConfirmedProjectChoice>
    "loopHost/globalServerStatus": TypertRemoteMethod<{ readonly request: GlobalServerStatusRequest }, GlobalServerStatus>
    "loopHost/globalServerWorkspaceStatus": TypertRemoteMethod<{ readonly request: GlobalServerStatusRequest }, GlobalServerWorkspaceStatus>
    "loopHost/configureGlobalServer": TypertRemoteMethod<{ readonly request: ConfigureGlobalServerRequest }, ConfigureGlobalServerResult>
    "loopHost/connectAccount": TypertRemoteMethod<{ readonly request: ConnectAccountRequest }, ConnectAccountResult>
    "loopHost/configureGlobalServerWorkspace": TypertRemoteMethod<{ readonly request: ConfigureGlobalServerWorkspaceRequest }, ConfigureGlobalServerWorkspaceResult>
    "loopHost/globalPage": TypertRemoteMethod<{ readonly request: GlobalPageRequest }, GlobalPage>
    "loopHost/openLoopPage": TypertRemoteMethod<{ readonly request: OpenLoopPageRequest }, PageSession>
    "loopHost/retrySync": TypertRemoteMethod<{ readonly request: SessionRef }, SyncStatusValue>
    "loopHost/humanTaskEvents": TypertRemoteMethod<{ readonly request: HumanTaskSession }, HumanTaskFrame, "stream">
    "loopHost/decideHumanTask": TypertRemoteMethod<{ readonly request: HumanTaskDecision }, Record<never, never>>
    "loopHost/humanStatus": TypertRemoteMethod<{ readonly request: HumanConnectionRequest }, HumanConnectionStatus>
  "loopHost/beginHumanLogin": TypertRemoteMethod<{ readonly request: BeginHumanLoginRequest }, HumanConnectionStatus>
  "loopHost/completeHumanLogin": TypertRemoteMethod<{ readonly request: HumanChallengeRequest }, HumanConnectionStatus>
  "loopHost/cancelHumanLogin": TypertRemoteMethod<{ readonly request: HumanChallengeRequest }, Record<never, never>>
  "loopHost/disconnectHuman": TypertRemoteMethod<{ readonly request: HumanConnectionRequest }, HumanConnectionStatus>
  "loopHost/getSyncPreferences": TypertRemoteMethod<{ readonly request: SyncPreferencesRequest }, SyncPreferences>
    "loopHost/setSyncPreferences": TypertRemoteMethod<{ readonly request: SyncPreferences }, SyncPreferences>
    "loopHost/projectSyncSettings": TypertRemoteMethod<{ readonly request: ProjectSyncSettingsRequest }, ProjectSyncSettings>
    "loopHost/setProjectSyncSettings": TypertRemoteMethod<{ readonly request: SetProjectSyncSettingsRequest }, { readonly settings: ProjectSyncSettings }>
    "loopHost/syncProjects": TypertRemoteMethod<{ readonly request: SyncProjectsRequest }, SyncProjectsValue>
    "loopHost/changeProjectDirectory": TypertRemoteMethod<{ readonly request: ChangeProjectDirectoryRequest }, ChangeProjectDirectoryValue>
    "loopHost/collaborationStatus": TypertRemoteMethod<{ readonly request: CollaborationStatusRequest }, CollaborationStatusValue>
    "loopHost/collaborationSnapshot": TypertRemoteMethod<{ readonly request: CollaborationSnapshotRequest }, CollaborationSnapshot>
    "loopHost/collaborationBoards": TypertRemoteMethod<{ readonly request: CollaborationBoardsRequest }, CollaborationBoardsValue>
    "loopHost/collaborationBind": TypertRemoteMethod<{ readonly request: CollaborationBindRequest }, CollaborationBindValue>
    "loopHost/collaborationDirectory": TypertRemoteMethod<{ readonly request: CollaborationDirectoryRequest }, CollaborationDirectoryValue>
    "loopHost/prepareCollaborationIntent": TypertRemoteMethod<{ readonly request: PrepareCollaborationIntentRequest }, PrepareCollaborationIntentValue>
    "loopHost/bindCollaborationIntent": TypertRemoteMethod<{ readonly request: BindCollaborationIntentRequest }, CollaborationIntentResult>
    "loopHost/bindCollaborationContinuation": TypertRemoteMethod<{ readonly request: BindCollaborationContinuationRequest }, CollaborationContinuation>
    "loopHost/cancelCollaborationIntent": TypertRemoteMethod<{ readonly request: CancelCollaborationIntentRequest }, CollaborationCancelValue>
    "loopHost/followupCollaborationTask": TypertRemoteMethod<{ readonly request: FollowupCollaborationTaskRequest }, CollaborationActionValue>
    "loopHost/collaborationInspect": TypertRemoteMethod<{ readonly request: CollaborationInspectRequest }, Readonly<Record<string, unknown>>>
    "loopHost/collaborationReconcile": TypertRemoteMethod<{ readonly request: CollaborationReconcileRequest }, Readonly<Record<string, unknown>>>
    "loopHost/collaborationEvents": TypertRemoteMethod<{ readonly request: { readonly sessionId: string; readonly afterEventId?: string } }, CollaborationEventFrame, "stream">
    "loopHost/knowledgeCatalog": TypertRemoteMethod<{ readonly request: KnowledgeCatalogRequest }, KnowledgeCatalogValue>
    "loopHost/skillCatalog": TypertRemoteMethod<{ readonly request: SkillCatalogRequest }, SkillCatalogValue>
    "loopHost/skillContent": TypertRemoteMethod<{ readonly request: SkillContentRequest }, SkillContentValue>
    "loopHost/skillCatalogEvents": TypertRemoteMethod<{ readonly request: SessionRef }, SkillCatalogEventFrame, "stream">
    "loopHost/modelStatus": TypertRemoteMethod<{ readonly request: ModelStatusRequest }, LoopModelStatus>
    "loopHost/refreshModelConnections": TypertRemoteMethod<{ readonly request: ModelStatusRequest }, LoopModelStatus>
    "loopHost/disconnectModelConnection": TypertRemoteMethod<{ readonly request: DisconnectModelConnectionRequest }, LoopModelStatus>
    "loopHost/setDefaultModel": TypertRemoteMethod<{ readonly request: SetDefaultModelRequest }, SetDefaultModelValue>
  }
}

export declare const TYPERT_REMOTE: TypertRemoteInfo<{
  "loopHost/status": TypertRemoteMethod<{ readonly request: WorkspaceRef }, BindingView>
  "loopHost/beginBind": TypertRemoteMethod<{ readonly request: BeginBindRequest }, BeginBindValue>
  "loopHost/completeBind": TypertRemoteMethod<{ readonly request: CompleteBindRequest }, { readonly binding: BindingView }>
  "loopHost/disconnectAccount": TypertRemoteMethod<{ readonly request: DisconnectAccountRequest }, DisconnectAccountValue>
  "loopHost/unbind": TypertRemoteMethod<{ readonly request: UnbindRequest }, { readonly binding: BindingView }>
  "loopHost/sessionContext": TypertRemoteMethod<{ readonly request: SessionRef }, SessionContextValue>
  "loopHost/syncStatus": TypertRemoteMethod<{ readonly request: SessionRef }, SyncStatusValue>
  "loopHost/setSync": TypertRemoteMethod<{ readonly request: SetSyncRequest }, { readonly sync: SyncStatusValue }>
  "loopHost/createProject": TypertRemoteMethod<{ readonly request: CreateProjectRequest }, ConfirmedProjectChoice>
  "loopHost/globalServerStatus": TypertRemoteMethod<{ readonly request: GlobalServerStatusRequest }, GlobalServerStatus>
  "loopHost/globalServerWorkspaceStatus": TypertRemoteMethod<{ readonly request: GlobalServerStatusRequest }, GlobalServerWorkspaceStatus>
  "loopHost/configureGlobalServer": TypertRemoteMethod<{ readonly request: ConfigureGlobalServerRequest }, ConfigureGlobalServerResult>
  "loopHost/connectAccount": TypertRemoteMethod<{ readonly request: ConnectAccountRequest }, ConnectAccountResult>
  "loopHost/configureGlobalServerWorkspace": TypertRemoteMethod<{ readonly request: ConfigureGlobalServerWorkspaceRequest }, ConfigureGlobalServerWorkspaceResult>
  "loopHost/globalPage": TypertRemoteMethod<{ readonly request: GlobalPageRequest }, GlobalPage>
  "loopHost/openLoopPage": TypertRemoteMethod<{ readonly request: OpenLoopPageRequest }, PageSession>
  "loopHost/retrySync": TypertRemoteMethod<{ readonly request: SessionRef }, SyncStatusValue>
  "loopHost/humanTaskEvents": TypertRemoteMethod<{ readonly request: HumanTaskSession }, HumanTaskFrame, "stream">
  "loopHost/decideHumanTask": TypertRemoteMethod<{ readonly request: HumanTaskDecision }, Record<never, never>>
  "loopHost/humanStatus": TypertRemoteMethod<{ readonly request: HumanConnectionRequest }, HumanConnectionStatus>
  "loopHost/beginHumanLogin": TypertRemoteMethod<{ readonly request: BeginHumanLoginRequest }, HumanConnectionStatus>
  "loopHost/completeHumanLogin": TypertRemoteMethod<{ readonly request: HumanChallengeRequest }, HumanConnectionStatus>
  "loopHost/cancelHumanLogin": TypertRemoteMethod<{ readonly request: HumanChallengeRequest }, Record<never, never>>
  "loopHost/disconnectHuman": TypertRemoteMethod<{ readonly request: HumanConnectionRequest }, HumanConnectionStatus>
  "loopHost/getSyncPreferences": TypertRemoteMethod<{ readonly request: SyncPreferencesRequest }, SyncPreferences>
  "loopHost/setSyncPreferences": TypertRemoteMethod<{ readonly request: SyncPreferences }, SyncPreferences>
  "loopHost/projectSyncSettings": TypertRemoteMethod<{ readonly request: ProjectSyncSettingsRequest }, ProjectSyncSettings>
  "loopHost/setProjectSyncSettings": TypertRemoteMethod<{ readonly request: SetProjectSyncSettingsRequest }, { readonly settings: ProjectSyncSettings }>
  "loopHost/syncProjects": TypertRemoteMethod<{ readonly request: SyncProjectsRequest }, SyncProjectsValue>
  "loopHost/changeProjectDirectory": TypertRemoteMethod<{ readonly request: ChangeProjectDirectoryRequest }, ChangeProjectDirectoryValue>
  "loopHost/collaborationStatus": TypertRemoteMethod<{ readonly request: CollaborationStatusRequest }, CollaborationStatusValue>
  "loopHost/collaborationSnapshot": TypertRemoteMethod<{ readonly request: CollaborationSnapshotRequest }, CollaborationSnapshot>
  "loopHost/collaborationBoards": TypertRemoteMethod<{ readonly request: CollaborationBoardsRequest }, CollaborationBoardsValue>
  "loopHost/collaborationBind": TypertRemoteMethod<{ readonly request: CollaborationBindRequest }, CollaborationBindValue>
  "loopHost/collaborationDirectory": TypertRemoteMethod<{ readonly request: CollaborationDirectoryRequest }, CollaborationDirectoryValue>
  "loopHost/prepareCollaborationIntent": TypertRemoteMethod<{ readonly request: PrepareCollaborationIntentRequest }, PrepareCollaborationIntentValue>
  "loopHost/bindCollaborationIntent": TypertRemoteMethod<{ readonly request: BindCollaborationIntentRequest }, CollaborationIntentResult>
  "loopHost/bindCollaborationContinuation": TypertRemoteMethod<{ readonly request: BindCollaborationContinuationRequest }, CollaborationContinuation>
  "loopHost/cancelCollaborationIntent": TypertRemoteMethod<{ readonly request: CancelCollaborationIntentRequest }, CollaborationCancelValue>
  "loopHost/followupCollaborationTask": TypertRemoteMethod<{ readonly request: FollowupCollaborationTaskRequest }, CollaborationActionValue>
  "loopHost/collaborationInspect": TypertRemoteMethod<{ readonly request: CollaborationInspectRequest }, Readonly<Record<string, unknown>>>
  "loopHost/collaborationReconcile": TypertRemoteMethod<{ readonly request: CollaborationReconcileRequest }, Readonly<Record<string, unknown>>>
  "loopHost/collaborationEvents": TypertRemoteMethod<{ readonly request: { readonly sessionId: string; readonly afterEventId?: string } }, CollaborationEventFrame, "stream">
  "loopHost/knowledgeCatalog": TypertRemoteMethod<{ readonly request: KnowledgeCatalogRequest }, KnowledgeCatalogValue>
  "loopHost/skillCatalog": TypertRemoteMethod<{ readonly request: SkillCatalogRequest }, SkillCatalogValue>
  "loopHost/skillContent": TypertRemoteMethod<{ readonly request: SkillContentRequest }, SkillContentValue>
  "loopHost/skillCatalogEvents": TypertRemoteMethod<{ readonly request: SessionRef }, SkillCatalogEventFrame, "stream">
  "loopHost/modelStatus": TypertRemoteMethod<{ readonly request: ModelStatusRequest }, LoopModelStatus>
  "loopHost/refreshModelConnections": TypertRemoteMethod<{ readonly request: ModelStatusRequest }, LoopModelStatus>
  "loopHost/disconnectModelConnection": TypertRemoteMethod<{ readonly request: DisconnectModelConnectionRequest }, LoopModelStatus>
  "loopHost/setDefaultModel": TypertRemoteMethod<{ readonly request: SetDefaultModelRequest }, SetDefaultModelValue>
}>

export default TYPERT_REMOTE

export interface ConnectAccountRequest {
 readonly workspaceId?: string
 readonly principalId?: string
 readonly expectedServerRevision: string
 readonly locale?: 'zh' | 'en'
 readonly requestPageAccess?: true
 readonly accessToken?: string
 readonly recoverCredentials?: true
}
export type ConnectAccountResult =
 | {readonly state: 'connected'; readonly accountPrincipal: string; readonly workspaceId?: string}
 | {readonly state: 'needs_auth'; readonly challenge: {readonly id: string; readonly loginUrl: string; readonly expiresAt: string}}

export type KnowledgeCatalogRequest = SessionRef & {readonly workspaceId: string; readonly cursor?: string; readonly kbId?: string}
export type KnowledgeCatalogValue = {readonly scope: SkillCatalogValue["scope"]; readonly data: {readonly items: readonly {readonly kbId: string; readonly name: string}[]; readonly nextCursor?: string; readonly hasMore: boolean}}

export interface SyncPreferences { readonly uploadDisconnectedHistory: boolean }
export type SyncPreferencesRequest = Record<never, never>

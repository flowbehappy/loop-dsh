/** Browser-safe client vocabulary owned by the trusted Loop Host Remote. */

import type {HumanTaskDecision, HumanTaskFrame, BeginHumanLoginRequest, HumanChallengeRequest, HumanConnectionRequest, HumanConnectionStatus} from "../../remote.mjs"

export interface WorkspaceRef {
  readonly workspaceId: string
  readonly path: string
  readonly displayTitle: string
}

export interface RemoteFailure {
  readonly code: string
  readonly message: string
  readonly details?: unknown
}

export type RemoteResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: RemoteFailure }

export type BindingState =
  | 'unbound'
  | 'needs_auth'
  | 'waiting_for_access'
  | 'target_unavailable'
  | 'revoked'
  | 'active'

export interface LoopTarget {
  readonly serviceBaseUrl: string
  readonly workspaceId: string
  readonly projectId: string
  readonly defaultChannelId: string
  readonly workspaceName: string
  readonly projectName: string
  readonly webUrl: string
}

export interface BindingView {
  readonly state: BindingState
  readonly revision: string
  readonly workspace: WorkspaceRef
  readonly loop?: LoopTarget
  readonly account?: { readonly displayName: string }
  readonly agent?: { readonly id: string; readonly displayName: string }
  readonly reason?: string
}

export interface ProjectChoice {
  readonly workspaceId: string
  readonly workspaceName: string
  readonly projectId: string
  readonly projectName: string
  readonly defaultChannelId?: string
  readonly role: string
}

export interface ConfirmedProjectChoice extends ProjectChoice {
  readonly defaultChannelId: string
}

export interface AgentChoice {
  readonly agentId: string
  readonly displayName: string
}

export interface LoginChallenge {
  readonly id: string
  readonly loginUrl: string
  readonly expiresAt: string
}

export interface BeginBindResult {
  readonly state: 'needs_auth' | 'select_target' | 'active'
  readonly binding: BindingView
  readonly challenge?: LoginChallenge
  readonly projects?: readonly ProjectChoice[]
  readonly agents?: readonly AgentChoice[]
}

export interface SessionContext {
  readonly sessionId: string
  readonly state: 'inherited' | 'blocked' | 'unbound' | 'needs_auth'
  readonly bindingRevision: string
  readonly projectId?: string
  readonly defaultChannelId?: string
  readonly reason?: string
}

export interface SyncDestination {
  readonly channelId: string
  readonly topicId?: string
  readonly webUrl?: string
}

export interface SyncReceipt {
  readonly sourceSequence: number
  readonly acceptedAt: string
}

export interface SyncState {
  readonly state: 'off' | 'on' | 'pending' | 'retrying' | 'error' | 'needs_auth'
  readonly destination?: SyncDestination
  readonly pending: number
  readonly health?: 'idle' | 'pending' | 'retrying' | 'error' | 'unsupported'
  readonly canEnable?: boolean
  readonly historyPartial: boolean
  readonly reason?: string
  readonly challenge?: LoginChallenge
  readonly lastReceipt?: SyncReceipt
}

export interface GlobalPageSession {
  readonly url: string
}

export interface AccountLoginStatus {
  readonly reason?: 'refresh_outcome_unknown'
  readonly deviceOnly?: boolean
  readonly state: 'signed_in' | 'signed_out' | 'needs_auth' | 'signing_out' | 'unavailable'
  readonly grantId?: string
  readonly accountPrincipal?: string
  readonly accountName?: string
  readonly workspaceId?: string
  readonly workspaceName?: string
}

export interface GlobalServerStatus {
  readonly connection?: AccountLoginStatus
  readonly serverUrl: string | null
  readonly serverRevision: string
}

export interface ConfigureGlobalServerResult {
  readonly serverUrl: string
  readonly serverRevision: string
  readonly page: GlobalPageSession
}

export interface GlobalServerWorkspaceStatus {
  readonly loopWorkspaceId: string | null
}

export interface ConfigureGlobalServerWorkspaceResult {
  readonly loopWorkspaceId: string
}

export type ProjectSyncState =
  | 'off'
  | 'needs_config'
  | 'needs_auth'
  | 'ready'
  | 'partial'
  | 'error'

export interface ManagedProject {
  readonly projectId: string
  readonly projectName: string
  readonly agentId: string
  readonly workspaceId?: string
  readonly workspacePath: string
  readonly workspaceTitle: string
  readonly bindingRevision?: string
  readonly state: 'pending' | 'synced' | 'error' | 'workspace_missing'
  readonly reason?: string
  readonly updatedAt: string
}

export interface ProjectSyncChallenge {
  readonly recoveryMode?: 'human_confirmed'
  readonly id: string
  readonly loginUrl: string
  readonly expiresAt: string
}

export interface ProjectSyncSettings {
  readonly canDisconnect?: boolean
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

export interface SyncProjectsResult extends ProjectSyncSettings {
  readonly imported: number
  readonly updated: number
  readonly skipped: number
  readonly challenge?: ProjectSyncChallenge
}

export interface ChangeProjectDirectoryResult {
  readonly state: 'ready' | 'needs_auth' | 'error'
  readonly project?: ManagedProject
  readonly settings: ProjectSyncSettings
  readonly challenge?: ProjectSyncChallenge
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

export interface CollaborationScope {
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

export interface CollaborationBoard {
  readonly boardId: string
  readonly boardName: string
  readonly projectId: string
  readonly projectName: string
  readonly revision: string
  readonly capability: CollaborationCapability
}

export interface CollaborationDirectoryEntry {
  readonly mention?: string
  readonly targetId: string
  readonly targetType: 'agent' | 'human'
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

export interface CollaborationShareScope {
  readonly scope: 'task-description' | 'selected-resources' | 'task-discussion'
  readonly resourceRefs: readonly string[]
  readonly expandedAudience: boolean
}

export interface CollaborationSharePreview {
  readonly scope: CollaborationShareScope['scope']
  readonly resourceRefs: readonly string[]
  readonly targetIds: readonly string[]
  readonly firstExpansion: boolean
  readonly confirmationToken?: string
}

export type CollaborationIntentState =
  | 'prepared'
  | 'bound'
  | 'accepted'
  | 'activating'
  | 'activated'
  | 'expired'
  | 'cancelled'
  | 'failed'

export type CollaborationActionState =
  | 'recorded'
  | 'dispatching'
  | 'accepted'
  | 'running'
  | 'waiting'
  | 'succeeded'
  | 'in_review'
  | 'completed'
  | 'cancel-requested'
  | 'canceled'
  | 'failed'
  | 'unreachable'
  | 'unknown'

export interface CollaborationActiveWork {
  readonly managementState?: string
  readonly taskStatus?: string
  readonly taskAvailable?: boolean
  readonly acceptanceState?: string
  readonly assigneeMemberId?: string
  readonly taskId: string
  readonly taskTitle?: string
  readonly revision: string



  readonly state: string
  readonly nextAction:
    | 'none'
    | 'wait'


    | 'reconcile'
    | 'retry-cancel'
    | 'open-loop'

  readonly resultUnknown: boolean
  readonly updatedAt?: string
  readonly reason?: string
}

export interface CollaborationDelivery {
  readonly deliveryId: string
  readonly eventId: string
  readonly eventSeq?: number
  readonly eventKind: string
  readonly sessionId: string
  readonly bindingId?: string
  readonly sourceSessionId?: string
  readonly bindingEpoch?: string
  readonly state:
    | 'pending'
    | 'claimed'
    | 'committed'
    | 'canceled'
    | 'needs-auth'
    | 'reconcile'
    | 'revoked'
    | 'retired-route'
    | 'binding-conflict'
    | 'blocked'
  readonly taskId?: string




  readonly contentHash?: string
  readonly payloadHash: string
  readonly messageId?: string
  readonly sessionSeq?: number
  readonly receivedAt: string
  readonly committedAt?: string
  readonly reason?: string
  readonly event?: Readonly<Record<string, unknown>>
}

export interface CollaborationSubscriptionStatus {
  readonly state:
    | 'connecting'
    | 'live'
    | 'replaying'
    | 'snapshot-required'
    | 'backoff'
    | 'revoked'
    | 'stopped'
  readonly subscriptionId: string
  readonly generation?: string
  readonly lastEventSeq: number
  readonly snapshotRequired: boolean
  readonly retryAt?: string
  readonly reason?: string
}

export interface CollaborationStatus {
  readonly deliveryGap?: {
    readonly afterEventSeq: number
    readonly retainedFromEventSeq: number
    readonly reason: 'event_history_expired'
  } | null
  readonly state:
    | 'unbound'
    | 'needs-auth'
    | 'needs-board'
    | 'target-unavailable'
    | 'revoked'
    | 'binding-conflict'
    | 'ready'
    | 'degraded'
  readonly scope?: CollaborationScope
  readonly capability: CollaborationCapability
  readonly subscription: CollaborationSubscriptionStatus
  readonly active: readonly CollaborationActiveWork[]
  readonly deliveries: readonly CollaborationDelivery[]
  readonly worksite?: CollaborationWorksiteStatus
  readonly reason?: string
}

export interface CollaborationWorksiteStatus {
  readonly state:
    | 'stopped'
    | 'connecting'
    | 'connected'
    | 'needs_enable'
    | 'registration_conflict'
    | 'state_changed'
    | 'blocked'
    | 'offline'
  readonly error?: {
    readonly code: string
    readonly message: string
  }
}

export interface CollaborationBoardsResult {
  readonly boards: readonly CollaborationBoard[]
  readonly nextCursor?: string
  readonly revision: string
  readonly capability?: CollaborationCapability
}

export interface CollaborationDirectoryResult {
  readonly entries: readonly CollaborationDirectoryEntry[]
  readonly nextCursor?: string
  readonly revision: string
  readonly freshness: 'live' | 'cached' | 'stale'
  readonly cacheKey: string
  readonly truncated?: boolean
}

export interface SkillCatalogScope {
  readonly installationId: string
  readonly accountId: string
  readonly serverBaseUrl: string
  readonly workspaceId: string
  readonly hostWorkspaceId: string
  readonly sessionId: string
  readonly catalog: 'skills'
  readonly projectId?: string
  readonly agentId?: string
  readonly bindingRevision?: string
  readonly identityFingerprint: string
}

export interface SkillCatalogEntry {
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

export interface KnowledgeCatalogValue {
  readonly scope: SkillCatalogScope
  readonly data: {
    readonly items: readonly {readonly kbId: string; readonly name: string}[]
    readonly nextCursor?: string
    readonly hasMore: boolean
  }
}

export interface SkillCatalogValue {
  readonly scope: SkillCatalogScope
  readonly data: {
    readonly items: readonly SkillCatalogEntry[]
    readonly nextCursor?: string
    readonly revision: string
    readonly hasMore: boolean
    readonly truncated: boolean
  }
}

export interface SkillContentValue {
  readonly scope: SkillCatalogScope
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
      readonly type: 'ready'
      readonly sequence: number
      readonly subscription: {
        readonly state: 'connecting' | 'live' | 'backoff' | 'revoked' | 'stopped'
        readonly lastEventSeq: number
        readonly snapshotRequired: boolean
      }
    }
  | {
      readonly type: 'change'
      readonly event: {
        readonly sequence?: number
        readonly eventId: string
        readonly kind: 'catalog.changed' | 'directory.changed' | 'subscription.changed'
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

export interface CollaborationPrepareIntentResult {
  readonly activationOwner?: "host" | "client"
  readonly intentRef: string
  readonly payloadDigest: string
  readonly state: CollaborationIntentState
  readonly expiresAt: string
  readonly sharePreview: CollaborationSharePreview
}

export interface CollaborationBindIntentResult {
  readonly intentRef: string
  readonly state: CollaborationIntentState
  readonly boundAt: string
  readonly receipt?: {
    readonly clientRequestId: string
    readonly action: string
    readonly payloadHash: string
    readonly state: CollaborationActionState
    readonly recordedAt: string
  }
}

export interface CollaborationCancelResult {
  readonly state:
    | 'cancel-pending-delivery'
    | 'cancel-requested'
    | 'stopped'
    | 'not-dispatched'
    | 'already-terminal'
    | 'unknown'
  readonly receipt?: {
    readonly clientRequestId: string
    readonly action: string
    readonly payloadHash: string
    readonly state: CollaborationActionState
    readonly recordedAt: string
  }
}

export interface CollaborationContinuationResult {
  readonly continuationRef: string
  readonly state: 'ready' | 'no-active-work' | 'needs-explicit-target' | 'stale'
  readonly localIntentId?: string
  readonly userIntentId?: string
  readonly bindingId?: string
  readonly bindingRevision?: string
  readonly bindingEpoch?: string
  readonly sessionId?: string
  readonly sessionGeneration?: string
  readonly acceptedMessageId?: string
  readonly acceptedSequence?: number
  readonly acceptedTextDigest?: string
  readonly tasks?: readonly {
    readonly taskId: string
    readonly revision: string
    readonly taskTitle?: string
    readonly targetIds: readonly string[]
    readonly allowedActions: readonly ('followup' | 'cancel')[]
    readonly question?: {




    }
  }[]
  readonly expiresAt?: string
  readonly reason?: string
}

export type CollaborationEventFrame =
  | {
      readonly type: 'ready'
      readonly sequence: number
      readonly subscription: CollaborationSubscriptionStatus
      readonly status: CollaborationStatus
    }
  | {
      readonly type: 'change'
      readonly sequence: number
      readonly event: {
        readonly eventId: string
        readonly kind:
          | 'binding.changed'
          | 'capability.changed'
          | 'subscription.changed'
          | 'directory.changed'
          | 'intent.changed'
          | 'delivery.changed'
          | 'action.changed'

        readonly occurredAt: string
        readonly status?: Readonly<Record<string, unknown>>
        readonly worksite?: CollaborationWorksiteStatus
        readonly directory?: {
          readonly revision: string
          readonly cacheKey: string
          readonly invalidatedKinds?: readonly string[]
        }
        readonly intent?: {
          readonly sourceIntentRef?: string
          readonly intentRef: string
          readonly state: string
          readonly reason?: string
        }
        readonly delivery?: CollaborationDelivery
          readonly active?: CollaborationActiveWork
      }
    }
  | {
      readonly type: 'error'
      readonly sequence: number
      readonly error: RemoteFailure
    }

export interface LoopModelDescriptor {
  readonly id: string
  readonly name: string
  readonly source: 'loop_proxy' | 'loop_hosted' | 'loop_personal'
  readonly providerId: string
  readonly providerName: string
  readonly wireApi: 'openai-completions' | 'openai-responses' | 'anthropic-messages'
  readonly contextWindow?: number
  readonly maxOutputTokens?: number
  readonly inputModalities?: readonly ('text' | 'image')[]
  readonly reasoningEfforts?: readonly string[]
}

export interface LoopModelConnection {
  readonly connectionId: string
  readonly workspaceId: string
  readonly workspaceName?: string
  readonly providerName: string
  readonly accountName?: string
  readonly accountPrincipal?: string
  readonly models: readonly LoopModelDescriptor[]
  readonly status: 'active' | 'needs_auth' | 'error'
  readonly reason?: string
  readonly updatedAt: string
}

export interface LoopModelStatus {
  readonly state: 'needs_auth' | 'active' | 'error' | 'unavailable'
  readonly connections: readonly LoopModelConnection[]
  readonly accountPrincipal?: string
  readonly reason?: string
}

export type SetDefaultModelRequest =
  | {
      readonly kind: 'external'
      readonly provider: string
      readonly model: string
    }
  | {
      readonly kind: 'loop'
      readonly provider: string
      readonly model: string
      readonly connectionId: string
      readonly workspaceId: string
      readonly expectedServerRevision: string
      readonly expectedAccountPrincipal: string
    }

export interface SetDefaultModelValue {
  readonly selection: {
    readonly provider: string
    readonly model: string
    readonly reasoningEffort?: string
  }
}

/**
 * The UI-facing slice of the generated `loopHost` Remote.
 *
 * `globalPage`, `createProject`, and `retrySync` are optional
 * Host capabilities for client compatibility; their absence is rendered as an
 * explicit capability failure rather than as a successful local action.
 */
export interface LoopHostClient {
  collaborationStatus?(
    input: { readonly sessionId: string; readonly workspaceId?: string },
    signal?: AbortSignal,
  ): Promise<RemoteResult<CollaborationStatus>>
  collaborationBoards?(
    input: {
      readonly sessionId: string
      readonly query?: string
      readonly cursor?: string
      readonly limit?: number
    },
    signal?: AbortSignal,
  ): Promise<RemoteResult<CollaborationBoardsResult>>
  collaborationBind?(
    input: {
      readonly sessionId: string
      readonly workspaceId: string
      readonly boardId: string
      readonly coordinatorAgentId: string
      readonly expectedRevision: string
      readonly shareScope?: CollaborationShareScope
    },
    signal?: AbortSignal,
  ): Promise<RemoteResult<{
    readonly scope: CollaborationScope
    readonly capability: CollaborationCapability
    readonly subscription: CollaborationSubscriptionStatus
  }>>
  collaborationDirectory?(
    input: {
      readonly sessionId: string
      readonly query?: string
      readonly kinds?: readonly ('agent' | 'human')[]
      readonly cursor?: string
      readonly limit?: number
      readonly bindingRevision?: string
    },
    signal?: AbortSignal,
  ): Promise<RemoteResult<CollaborationDirectoryResult>>
  prepareCollaborationIntent?(
    input: {
      readonly sessionId: string
      readonly bindingRevision: string
      readonly serializedText: string
      readonly references: readonly {
        readonly targetId: string
        readonly targetType: 'agent' | 'human'
        readonly stableRef: string
        readonly intendedActions: readonly ('dispatch' | 'notify' | 'followup')[]
      }[]
      readonly payloadDigest: string
      readonly shareScope: CollaborationShareScope
      readonly activateOnClaim?: boolean
      readonly expiresAt: string
    },
    signal?: AbortSignal,
  ): Promise<RemoteResult<CollaborationPrepareIntentResult>>
  bindCollaborationIntent?(
    input: {
      readonly intentRef: string
      readonly sessionId: string
      readonly requestId: string
      readonly payloadDigest: string
      readonly acceptedSerializedText: string
      readonly bindingRevision: string
    },
    signal?: AbortSignal,
  ): Promise<RemoteResult<CollaborationBindIntentResult>>
  cancelCollaborationIntent?(
    input: {
      readonly sessionId: string
      readonly intentRef: string
      readonly clientRequestId: string
      readonly reason: string
      readonly expectedStatus: string
    },
    signal?: AbortSignal,
  ): Promise<RemoteResult<CollaborationCancelResult>>
  collaborationReconcile?(
    input: {
      readonly sessionId: string
      readonly clientRequestIds?: readonly string[]
      readonly eventIds?: readonly string[]
    },
    signal?: AbortSignal,
  ): Promise<RemoteResult<unknown>>
  bindCollaborationContinuation?(
    input: {
      readonly sessionId: string
      readonly requestId: string
      readonly continuationRef: string
      readonly bindingRevision: string
      readonly payloadDigest: string
      readonly acceptedSerializedText: string
    },
    signal?: AbortSignal,
  ): Promise<RemoteResult<CollaborationContinuationResult>>
  collaborationEvents?(
    input: { readonly sessionId: string; readonly afterEventId?: string },
    signal?: AbortSignal,
  ): AsyncIterable<CollaborationEventFrame>
  knowledgeCatalog?(
    input: {readonly workspaceId: string; readonly sessionId: string; readonly cursor?: string; readonly kbId?: string},
    signal?: AbortSignal,
  ): Promise<RemoteResult<KnowledgeCatalogValue>>
  skillCatalog?(
    input: {
      readonly workspaceId: string
      readonly sessionId: string
      readonly query?: string
      readonly cursor?: string
      readonly limit?: number
    },
    signal?: AbortSignal,
  ): Promise<RemoteResult<SkillCatalogValue>>
  skillContent?(
    input: {
      readonly workspaceId: string
      readonly sessionId: string
      readonly skillId: string
      readonly path: string
      readonly expectedVersionId?: string
      readonly expectedCommitSha?: string
      readonly offset?: number
      readonly maxBytes?: number
    },
    signal?: AbortSignal,
  ): Promise<RemoteResult<SkillContentValue>>
  skillCatalogEvents?(
    input: { readonly workspaceId: string; readonly sessionId: string },
    signal?: AbortSignal,
  ): AsyncIterable<SkillCatalogEventFrame>
  modelStatus?(
    input: Record<never, never>,
    signal?: AbortSignal,
  ): Promise<RemoteResult<LoopModelStatus>>
  refreshModelConnections?(
    input: Record<never, never>,
    signal?: AbortSignal,
  ): Promise<RemoteResult<LoopModelStatus>>
  disconnectModelConnection?(
    input: { readonly connectionId: string },
    signal?: AbortSignal,
  ): Promise<RemoteResult<LoopModelStatus>>
  setDefaultModel?(
    input: SetDefaultModelRequest,
    signal?: AbortSignal,
  ): Promise<RemoteResult<SetDefaultModelValue>>
  humanTaskEvents?(input: {sessionId:string}, signal:AbortSignal): AsyncIterable<HumanTaskFrame>
  decideHumanTask?(input: HumanTaskDecision, signal?:AbortSignal): Promise<RemoteResult<Record<never, never>>>
  humanStatus?(input: HumanConnectionRequest, signal?: AbortSignal): Promise<RemoteResult<HumanConnectionStatus>>
  beginHumanLogin?(input: BeginHumanLoginRequest, signal?: AbortSignal): Promise<RemoteResult<HumanConnectionStatus>>
  completeHumanLogin?(input: HumanChallengeRequest, signal?: AbortSignal): Promise<RemoteResult<HumanConnectionStatus>>
  cancelHumanLogin?(input: HumanChallengeRequest, signal?: AbortSignal): Promise<RemoteResult<Record<never, never>>>
  disconnectHuman?(input: HumanConnectionRequest, signal?: AbortSignal): Promise<RemoteResult<HumanConnectionStatus>>
  getSyncPreferences(input: Record<never, never>, signal?: AbortSignal): Promise<RemoteResult<{readonly uploadDisconnectedHistory: boolean}>>
  setSyncPreferences(input: {readonly uploadDisconnectedHistory: boolean}, signal?: AbortSignal): Promise<RemoteResult<{readonly uploadDisconnectedHistory: boolean}>>
  projectSyncSettings?(
    input: Record<never, never>,
    signal?: AbortSignal,
  ): Promise<RemoteResult<ProjectSyncSettings>>
  setProjectSyncSettings?(
    input: {
      readonly enabled?: boolean
      readonly defaultRoot?: string
    },
    signal?: AbortSignal,
  ): Promise<RemoteResult<{ readonly settings: ProjectSyncSettings }>>
  disconnectAccount?(
    input: {readonly recoveryMode?: 'human_confirmed'},
    signal?: AbortSignal,
  ): Promise<RemoteResult<{readonly state: 'signed_out' | 'needs_confirmation'; readonly challenge?: ProjectSyncChallenge}>>
  syncProjects?(
    input: {readonly reconcileWorkspaceBinding?: never; readonly expectedServerRevision?: never}
      | {readonly reconcileWorkspaceBinding: true; readonly expectedServerRevision: string; readonly expectedGrantId?: string},
    signal?: AbortSignal,
  ): Promise<RemoteResult<SyncProjectsResult>>
  changeProjectDirectory?(
    input: {
      readonly projectId: string
      readonly path: string
      readonly expectedBindingRevision?: string
    },
    signal?: AbortSignal,
  ): Promise<RemoteResult<ChangeProjectDirectoryResult>>
  globalServerWorkspaceStatus?(
    input: Record<never, never>,
    signal?: AbortSignal,
  ): Promise<RemoteResult<GlobalServerWorkspaceStatus>>
  configureGlobalServerWorkspace?(
    input: {
      readonly workspaceId: string
      readonly expectedServerRevision: string
    },
    signal?: AbortSignal,
  ): Promise<RemoteResult<ConfigureGlobalServerWorkspaceResult>>
  globalServerStatus?(
    input: Record<never, never>,
    signal?: AbortSignal,
  ): Promise<RemoteResult<GlobalServerStatus>>
  configureGlobalServer?(
    input: { readonly serverUrl: string },
    signal?: AbortSignal,
  ): Promise<RemoteResult<ConfigureGlobalServerResult>>
  globalPage?(
    input: Record<never, never>,
    signal?: AbortSignal,
  ): Promise<RemoteResult<GlobalPageSession>>
  status(input: WorkspaceRef, signal?: AbortSignal): Promise<RemoteResult<BindingView>>
  connectAccount?(input: ConnectAccountRequest, signal?: AbortSignal): Promise<RemoteResult<ConnectAccountResult>>
  beginBind(
    input: WorkspaceRef & {
      readonly mode?: 'bind' | 'switch'
      readonly locale?: 'zh' | 'en'
    },
    signal?: AbortSignal,
  ): Promise<RemoteResult<BeginBindResult>>
  completeBind(
    input: WorkspaceRef & {
      readonly challengeId: string
      readonly projectId: string
      readonly agentId: string
      readonly expectedRevision?: string
    },
    signal?: AbortSignal,
  ): Promise<RemoteResult<{ readonly binding: BindingView }>>
  unbind(
    input: WorkspaceRef & {
      readonly expectedRevision: string
      readonly recoveryMode?: 'human_confirmed'
    },
    signal?: AbortSignal,
  ): Promise<RemoteResult<{ readonly binding: BindingView }>>
  createProject?(
    input: WorkspaceRef & {
      readonly challengeId: string
      readonly name: string
      readonly prefix: string
    },
    signal?: AbortSignal,
  ): Promise<RemoteResult<ConfirmedProjectChoice>>
  sessionContext(
    input: { readonly workspaceId: string; readonly sessionId: string },
    signal?: AbortSignal,
  ): Promise<RemoteResult<SessionContext>>
  syncStatus(
    input: { readonly workspaceId: string; readonly sessionId: string },
    signal?: AbortSignal,
  ): Promise<RemoteResult<SyncState>>
  setSync(
    input: {
      readonly workspaceId: string
      readonly sessionId: string
      readonly enabled: boolean
      readonly confirmedSourceSequence?: number
    },
    signal?: AbortSignal,
  ): Promise<RemoteResult<{ readonly sync: SyncState }>>
  retrySync?(
    input: { readonly workspaceId: string; readonly sessionId: string },
    signal?: AbortSignal,
  ): Promise<RemoteResult<SyncState>>
}

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

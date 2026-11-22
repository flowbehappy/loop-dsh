/** Native collaborator status and the explicit board/share review surface. */

import { useSyncExternalStore, type ReactNode } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRuntime,
  StandardSourceBinding,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {
  CollaborationNotice,
  CollaborationSessionRuntime,
  CollaborationUiState,
} from './collaboration-runtime.ts'
import { collaborationFailureText, safeFailureText } from './failure-text.ts'
import type { LoopKey, NS } from './locales.ts'
import type {
  CollaborationActionState,
  CollaborationDelivery,
  CollaborationStatus,
  CollaborationWorksiteStatus,
} from './types.ts'
import {
  collaborationAccountName,
  boardPickerPresentation,
  collaborationConnectionAction,
} from './collaboration-connection.ts'
import css from './loop-ui.module.css'

export interface CollaborationDockInjected {
  readonly runtime: CollaborationSessionRuntime
  readonly hooks: { readonly collaboration: HostObservable<CollaborationUiState> }
}

export type CollaborationDockProps =
  PropsRuntime<'conversation.composer.dock'>
  & PropsLocale<typeof NS>
  & InjectFace<CollaborationDockInjected>

const actionKeys: Record<CollaborationActionState, LoopKey> = {
  recorded: 'collab.state.recorded',
  dispatching: 'collab.state.dispatching',
  accepted: 'collab.state.accepted',
  running: 'collab.state.running',
  waiting: 'collab.state.waiting',
  succeeded: 'collab.state.succeeded',
  in_review: 'collab.task.inReview',
  completed: 'collab.state.completed',
  'cancel-requested': 'collab.state.cancelRequested',
  canceled: 'collab.state.canceled',
  failed: 'collab.state.failed',
  unreachable: 'collab.state.unreachable',
  unknown: 'collab.state.unknown',
}

const deliveryKeys: Record<CollaborationDelivery['state'], LoopKey> = {
  pending: 'collab.delivery.pending',
  claimed: 'collab.delivery.claimed',
  committed: 'collab.delivery.committed',
  canceled: 'collab.delivery.canceled',
  'needs-auth': 'collab.delivery.needsAuth',
  reconcile: 'collab.delivery.reconcile',
  revoked: 'collab.delivery.revoked',
  'retired-route': 'collab.delivery.retiredRoute',
  'binding-conflict': 'collab.delivery.bindingConflict',
  blocked: 'collab.delivery.blocked',
}

const worksiteKeys: Record<CollaborationWorksiteStatus['state'], LoopKey> = {
  stopped: 'collab.worksite.stopped',
  connecting: 'collab.worksite.connecting',
  connected: 'collab.worksite.connected',
  needs_enable: 'collab.worksite.needsEnable',
  registration_conflict: 'collab.worksite.registrationConflict',
  state_changed: 'collab.worksite.stateChanged',
  blocked: 'collab.worksite.blocked',
  offline: 'collab.worksite.offline',
}

function actionText(
  t: CollaborationDockProps['t'],
  state: string,
): string {
  return t(actionKeys[state as CollaborationActionState] ?? 'collab.state.unknown')
}

const taskKeys: Record<string, LoopKey> = {
  todo: 'collab.task.todo',
  in_progress: 'collab.task.inProgress',
  in_review: 'collab.task.inReview',
  done: 'collab.task.done',
}

const noticeKeys: Record<CollaborationNotice, LoopKey> = {
  connected: 'collab.notice.connected',
  'share-confirmed': 'collab.notice.shareConfirmed',
  'intent-discarded': 'collab.notice.intentDiscarded',
  'intent-bound': 'collab.notice.intentBound',
  'cancel-pending-delivery': 'collab.notice.cancelPending',
  'cancel-requested': 'collab.notice.cancelRequested',
  stopped: 'collab.notice.stopped',
  'not-dispatched': 'collab.notice.notDispatched',
  'already-terminal': 'collab.notice.alreadyTerminal',
  'cancel-unknown': 'collab.notice.cancelUnknown',
  reconciled: 'collab.notice.reconciled',
  'continuation-linked': 'collab.notice.continuationLinked',
  'continuation-needs-target': 'collab.notice.continuationNeedsTarget',
  'continuation-unavailable': 'collab.notice.continuationUnavailable',
  'continuation-failed': 'collab.notice.continuationFailed',
}

function statusLabel(
  t: CollaborationDockProps['t'],
  status: CollaborationStatus | null,
  screen: CollaborationUiState['screen'],
): string {
  if (screen === 'idle' || screen === 'loading') return t('collab.status.waiting')
  if (screen === 'error') return t('collab.status.unavailable')
  switch (status?.state) {
    case 'ready':
    case 'degraded': {
      const activeCount = status.active.filter(work =>
        work.taskAvailable !== false && work.state !== 'completed' && work.state !== 'canceled' && work.state !== 'failed',
      ).length
      return status.scope?.boardName === undefined || activeCount === 0
        ? t('collab.status.ready')
        : t('collab.status.connected', {
            board: status.scope.boardName,
            count: activeCount,
          })
    }
    case 'needs-auth': return t('collab.status.needsAuth')
    case 'needs-board': return t('collab.status.needsBoard')
    case 'unbound': return t('collab.status.unbound')
    case 'binding-conflict': return t('collab.status.unavailable')
    default: return t('collab.status.unavailable')
  }
}

function WorksiteStatus({
  status,
  runtime,
  t,
}: {
  readonly status: CollaborationWorksiteStatus | undefined
  readonly runtime: CollaborationSessionRuntime
  readonly t: CollaborationDockProps['t']
}): ReactNode {
  if (status === undefined) return null
  const needsSetupAction =
    status.state === 'needs_enable' ||
    status.state === 'connecting' ||
    status.state === 'state_changed' ||
    status.state === 'blocked' ||
    status.state === 'offline'
  return (
    <section className={css.collaborationSection}>
      <h3 className={css.sectionTitle}>{t('collab.worksite.title')}</h3>
      <p className={css.hint}>{t(worksiteKeys[status.state])}</p>
      {needsSetupAction && (
        <Button size="sm" variant="outline" onClick={runtime.openWorksiteSetup}>
          {t('collab.worksite.openStartWork')}
        </Button>
      )}
    </section>
  )
}

function ShareScopeChoices({
  state,
  runtime,
  t,
}: {
  readonly state: CollaborationUiState
  readonly runtime: CollaborationSessionRuntime
  readonly t: CollaborationDockProps['t']
}): ReactNode {
  return (
    <fieldset className={css.collaborationChoices}>
      <legend>{t('collab.dialog.shareTitle')}</legend>
      {([
        ['task-description', 'collab.dialog.shareTask'],
        ['selected-resources', 'collab.dialog.shareSelected'],
        ['task-discussion', 'collab.dialog.shareDiscussion'],
      ] as const).map(([value, key]) => (
        <label className={css.choice} key={value}>
          <input
            type="radio"
            name="loop-collaboration-share"
            checked={state.shareScope.scope === value}
            onChange={() => { runtime.setShareScope(value) }}
          />
          <span className={css.choiceText}>
            <span className={css.choiceTitle}>{t(key)}</span>
          </span>
        </label>
      ))}
      <p className={css.hint}>{t('collab.dialog.shareHint')}</p>
    </fieldset>
  )
}

function ActiveWork({
  state,
  runtime,
  focusComposer,
  t,
}: {
  readonly state: CollaborationUiState
  readonly runtime: CollaborationSessionRuntime
  readonly focusComposer: () => void
  readonly t: CollaborationDockProps['t']
}): ReactNode {
  const workspaceId = state.status?.scope?.workspaceId
  return (
    <section className={css.collaborationSection} aria-labelledby="loop-collaboration-active">
      <h3 id="loop-collaboration-active" className={css.sectionTitle}>{t('collab.dialog.activeTitle')}</h3>
      {state.status?.active.length === 0
        ? <p className={css.hint}>{t('collab.dialog.activeEmpty')}</p>
        : (
            <ul className={css.collaborationList}>
              {state.status?.active.map(work => {

                const needsReconcile = work.resultUnknown || work.nextAction === 'reconcile'
                return (
                  <li key={work.taskId} className={css.collaborationItem}>
                    <div className={css.collaborationItemText}>
                      <strong>{work.taskAvailable === false ? t('collab.dialog.task') : work.taskTitle?.trim() || t('collab.dialog.task')}</strong>
                      <span>{work.taskAvailable === false
                        ? t('collab.task.unavailable')
                        : work.taskStatus && taskKeys[work.taskStatus]
                          ? t(taskKeys[work.taskStatus])
                          : actionText(t, work.state)}</span>
                      {work.managementState && <span className={css.hint}>{t(work.managementState === 'closed' ? 'collab.management.closed' : work.managementState === 'active' ? 'collab.management.active' : 'collab.management.unavailable')}</span>}
                      {work.taskAvailable !== false && work.acceptanceState === 'accepted' && (
                        <span className={css.hint}>{t('collab.task.accepted')}</span>
                      )}
                      {work.reason !== undefined && (
                        <span className={css.hint}>{safeFailureText(work.reason)}</span>
                      )}
                      {needsReconcile && (
                        <span className={css.warning}>{t('collab.dialog.unknownResult')}</span>
                      )}

                    </div>
                    <div className={css.collaborationItemActions}>
                      {workspaceId !== undefined && work.taskAvailable !== false && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { runtime.openTask(workspaceId, work.taskId) }}
                        >
                          {t('collab.dialog.openTask')}
                        </Button>
                      )}
                      {needsReconcile && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={state.busy !== null}
                          onClick={() => { void runtime.reconcile() }}
                        >
                          {state.busy === 'reconcile'
                            ? t('collab.dialog.reconciling')
                            : t('collab.dialog.reconcile')}
                        </Button>
                      )}

                    </div>
                  </li>
                )
              })}
            </ul>
          )}
    </section>
  )
}

function Details({
  state,
  runtime,
  focusComposer,
  t,
}: {
  readonly state: CollaborationUiState
  readonly runtime: CollaborationSessionRuntime
  readonly focusComposer: () => void
  readonly t: CollaborationDockProps['t']
}): ReactNode {
  const status = state.status
  const canWork = status?.state === 'ready' || status?.state === 'degraded'
  const hasScopeDetails = status?.scope !== undefined &&
    (status.scope.boardId !== undefined && status.scope.boardId !== '' ||
      status.scope.accountId !== '' ||
      status.scope.coordinatorAgentId !== '')
  const connectionAction = collaborationConnectionAction(status, state.screen)
  const boardSetup =
    status?.state === 'unbound' || status?.state === 'needs-board'
  return (
    <>
      {state.screen === 'loading' && <p className={css.status}>{t('collab.dialog.loading')}</p>}
      {state.error !== null && (
        <div className={css.errorBlock} role="alert">
          <strong>{t('collab.dialog.error')}</strong>
          <span>{collaborationFailureText(t, state.error)}</span>
        </div>
      )}
      {canWork
        ? (
            <>
              <ActiveWork
                state={state}
                runtime={runtime}
                focusComposer={focusComposer}
                t={t}
              />
              {(state.continuation.state !== 'idle' &&
                state.continuation.state !== 'no-active-work' ||
                (state.continuation.failedCount ?? 0) > 0) && (
                <div className={css.collaborationContinuation} role="status">
                  <span>
                    {state.continuation.state === 'binding'
                      ? t('collab.dialog.continuationBinding')
                      : state.continuation.state === 'ready'
                        ? t('collab.dialog.continuationReady', {
                            count: state.continuation.taskCount,
                          })
                        : state.continuation.state === 'needs-explicit-target'
                          ? t(noticeKeys['continuation-needs-target'])
                          : state.continuation.state === 'unavailable'
                            ? t(noticeKeys['continuation-unavailable'])
                            : t(noticeKeys['continuation-failed'])}
                  </span>
                  {(state.continuation.failedCount ?? 0) > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={state.busy !== null}
                      onClick={() => { void runtime.retryContinuation() }}
                    >
                      {t('collab.dialog.retryContinuation')}
                    </Button>
                  )}
                </div>
              )}
              {status?.deliveryGap && (
                <p className={css.warning} role="status">{t('collab.task.deliveryGap')}</p>
              )}
              <details className={css.collaborationSection}>
                <summary className={css.sectionTitle}>
                  {t('collab.dialog.deliveryTitle')}
                </summary>
                {status?.deliveries.length === 0
                  ? <p className={css.hint}>{t('collab.dialog.deliveryEmpty')}</p>
                  : (
                      <ul className={css.collaborationList}>
                        {status?.deliveries.map(delivery => (
                          <li key={delivery.deliveryId} className={css.collaborationItem}>
                            <span>{t(deliveryKeys[delivery.state])}</span>
                            {delivery.taskId !== undefined && (
                              <span className={css.hint}>{delivery.taskId}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
              </details>
              <details className={css.collaborationSection}>
                <summary className={css.sectionTitle}>{t('collab.dialog.connectionTitle')}</summary>
                {status?.scope !== undefined && hasScopeDetails && (
                  <dl className={css.metadata}>
                    <div>
                      <dt>{t('collab.dialog.scope')}</dt>
                      <dd>{status.scope.boardName ?? status.scope.boardId ?? ''}</dd>
                    </div>
                    <div>
                      <dt>{t('collab.dialog.account')}</dt>
                      <dd>{collaborationAccountName(
                        status.scope,
                        t('collab.dialog.accountUnavailable'),
                      )}</dd>
                    </div>
                    <div>
                      <dt>{t('collab.dialog.coordinator')}</dt>
                      <dd>{status.scope.coordinatorAgentName ?? status.scope.coordinatorAgentId}</dd>
                    </div>
                  </dl>
                )}
                <WorksiteStatus status={status?.worksite} runtime={runtime} t={t} />
              </details>
              <div className={css.footerActions}>
                <Button size="sm" variant="outline" onClick={() => { void runtime.loadBoards() }}>
                  {t('collab.dialog.bindTitle')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={state.busy !== null}
                  onClick={() => { void runtime.reconcile() }}
                >
                  {t('collab.dialog.retry')}
                </Button>
                {state.pendingIntent && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={state.busy !== null}
                    onClick={() => { void runtime.discardPreparedIntent() }}
                  >
                    {t('collab.dialog.discard')}
                  </Button>
                )}
              </div>
            </>
          )
        : (
            <>
              <section className={css.collaborationSection}>
                <h3 className={css.sectionTitle}>
                  {t(boardSetup
                    ? 'collab.dialog.boardSetupTitle'
                    : 'collab.dialog.connectionTitle')}
                </h3>
                <p className={css.hint}>
                  {t(boardSetup
                    ? 'collab.dialog.boardSetupBody'
                    : 'collab.dialog.connectionDistinction')}
                </p>
              </section>
              <div className={css.footerActions}>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={connectionAction.disabled}
                  onClick={connectionAction.target === 'boards'
                    ? () => { void runtime.loadBoards() }
                    : runtime.openExistingBindingForSession}
                >
                  {t(connectionAction.label)}
                </Button>
                {status?.state === 'needs-auth' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={state.busy !== null}
                    onClick={() => { void runtime.refreshStatus(true).catch(() => undefined) }}
                  >
                    {t('collab.dialog.retry')}
                  </Button>
                )}
              </div>
            </>
          )}
    </>
  )
}

function Boards({
  state,
  runtime,
  t,
}: {
  readonly state: CollaborationUiState
  readonly runtime: CollaborationSessionRuntime
  readonly t: CollaborationDockProps['t']
}): ReactNode {
  const presentation = boardPickerPresentation(state)
  return (
    <>
      <p className={css.hint}>{t('collab.dialog.bindBody')}</p>
      {state.error !== null && (
        <div className={css.errorBlock} role="alert">
          <strong>{t('collab.dialog.error')}</strong>
          <span>{collaborationFailureText(t, state.error)}</span>
          <div className={css.inlineActions}>
            <Button
              size="sm"
              variant="outline"
              disabled={state.busy !== null}
              onClick={() => { void runtime.loadBoards() }}
            >
              {t('collab.dialog.retry')}
            </Button>
          </div>
        </div>
      )}
      {presentation === 'loading' && <p className={css.status}>{t('collab.dialog.loading')}</p>}
      {presentation === 'empty'
        ? (
            <div className={css.errorBlock} role="status">
              <span>{t('collab.dialog.noBoards')}</span>
              <Button size="sm" variant="outline" onClick={runtime.openLoopProject}>
                {t('collab.dialog.openLoop')}
              </Button>
            </div>
          )
        : presentation === 'choices'
          ? (
            <fieldset className={css.collaborationChoices}>
              <legend>{t('collab.dialog.chooseBoard')}</legend>
              {state.boards.map(board => (
                <label className={css.choice} key={board.boardId}>
                  <input
                    type="radio"
                    name="loop-collaboration-board"
                    checked={state.selectedBoardId === board.boardId}
                    onChange={() => { runtime.selectBoard(board.boardId) }}
                  />
                  <span className={css.choiceText}>
                    <span className={css.choiceTitle}>{board.boardName}</span>
                    <span className={css.choiceCaption}>
                      {board.projectName}
                      {board.capability.available ? '' : ` · ${t('collab.error.unsupported')}`}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          )
          : null}
      {presentation === 'choices' && <ShareScopeChoices state={state} runtime={runtime} t={t} />}
      <div className={css.footerActions}>
        <Button size="sm" variant="outline" onClick={runtime.openLoopProject}>
          {t('collab.dialog.openLoop')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={
            presentation !== 'choices' ||
            state.busy !== null ||
            state.selectedBoardId === ''
          }
          onClick={() => { void runtime.bindBoard(state.selectedBoardId) }}
        >
          {state.busy === 'bind' ? t('collab.dialog.binding') : t('collab.dialog.bind')}
        </Button>
      </div>
    </>
  )
}

function ShareReview({
  state,
  runtime,
  t,
}: {
  readonly state: CollaborationUiState
  readonly runtime: CollaborationSessionRuntime
  readonly t: CollaborationDockProps['t']
}): ReactNode {
  const preview = state.sharePreview
  return (
    <>
      <section className={css.section}>
        <h3 className={css.sectionTitle}>{t('collab.dialog.shareTitle')}</h3>
        <p className={css.warning}>{t('collab.dialog.shareFirst')}</p>
        <p>{t(`collab.dialog.share${state.shareScope.scope === 'task-description'
          ? 'Task'
          : state.shareScope.scope === 'selected-resources'
            ? 'Selected'
            : 'Discussion'}` as LoopKey)}</p>
        <p className={css.hint}>
          {t('collab.dialog.shareTargets', { count: preview?.targetIds.length ?? 0 })}
          {' · '}
          {t('collab.dialog.shareResources', { count: preview?.resourceRefs.length ?? 0 })}
        </p>
        {state.shareTargetNames.length > 0 && (
          <ul className={css.collaborationList}>
            {state.shareTargetNames.map((name, index) => (
              <li key={`${name}:${index}`} className={css.collaborationItem}>{name}</li>
            ))}
          </ul>
        )}
      </section>
      <div className={css.footerActions}>
        <Button size="sm" variant="outline" onClick={runtime.closeOverlay}>
          {t('dialog.cancel')}
        </Button>
        <Button size="sm" variant="primary" onClick={runtime.confirmShare}>
          {t('collab.dialog.shareConfirm')}
        </Button>
      </div>
    </>
  )
}

function ReferencePreview({
  state,
  t,
}: {
  readonly state: CollaborationUiState
  readonly t: CollaborationDockProps['t']
}): ReactNode {
  const reference = state.reference
  if (reference === null) return null
  return (
    <section className={css.section}>
      <h3 className={css.sectionTitle}>{reference.displayName}</h3>
      <p>
        {t(reference.targetType === 'agent'
          ? 'collab.dialog.referenceTypeAgent'
          : 'collab.dialog.referenceTypeHuman')}
      </p>
      <p className={css.hint}>{t('collab.dialog.referenceBody')}</p>
    </section>
  )
}

/**
 * Ambient composer status plus one modal surface for binding, share review,
 * active work, and read-only reference inspection.
 */
export function CollaborationDock({
  useCollaboration,
  runtime,
  t,
}: CollaborationDockProps): ReactNode {
  const state = useCollaboration(value => value)
  const label = statusLabel(t, state.status, state.screen)
  return (
    <div className={css.collaborationDock}>
      <Button
        size="sm"
        variant="ghost"
        aria-label={t('collab.status.details')}
        onClick={() => {
          if (state.status?.state === 'needs-board') {
            void runtime.loadBoards()
          } else {
            void runtime.openDetails()
          }
        }}
      >
        {label}
      </Button>
      {state.notice !== null && (
        <span role="status" className={css.collaborationNotice}>{t(noticeKeys[state.notice])}</span>
      )}
    </div>
  )
}

export interface CollaborationOverlayHostInjected {
  readonly forSession: (sessionId: string) => {
    readonly runtime: CollaborationSessionRuntime
    readonly focusComposer: () => void
  }
  readonly hooks: { readonly sessionBinding: HostObservable<StandardSourceBinding> }
}

type CollaborationOverlayHostProps = PropsRuntime<'shell.overlay'>
  & PropsLocale<typeof NS> & InjectFace<CollaborationOverlayHostInjected>

/** The empty-chat composer has no dock slot; confirmation belongs to the shell. */
export function CollaborationOverlayHost({useSessionBinding, forSession, t}: CollaborationOverlayHostProps): ReactNode {
  const sessionId = useSessionBinding(binding => binding.key)
  if (sessionId === undefined) return null
  return <CollaborationOverlay key={sessionId} {...forSession(sessionId)} t={t} />
}

export function CollaborationOverlay({runtime, focusComposer, t}: {
  readonly runtime: CollaborationSessionRuntime
  readonly focusComposer: () => void
  readonly t: CollaborationDockProps['t']
}): ReactNode {
  const state = useSyncExternalStore(runtime.store.subscribe, runtime.store.getSnapshot)
  return (
    <Modal
      open={state.overlay !== 'closed'}
      headless
      title={t('collab.dialog.title')}
      className={css.modal as string}
      contentClassName={css.modalContent as string}
      onClose={() => { runtime.closeOverlay() }}
    >
      <div className={css.panel}>
        <header className={css.header}>
          <div className={css.workspaceHeading}>
            <span className={css.eyebrow}>{t('collab.dialog.eyebrow')}</span>
            <h2>{t('collab.dialog.title')}</h2>
          </div>
          <Button size="sm" variant="ghost" onClick={() => { runtime.closeOverlay() }}>
            {t('collab.dialog.close')}
          </Button>
        </header>
        <div className={css.body}>
          {state.overlay === 'details' && (
            <Details
              state={state}
              runtime={runtime}
              focusComposer={focusComposer}
              t={t}
            />
          )}
          {state.overlay === 'boards' && (
            <Boards state={state} runtime={runtime} t={t} />
          )}
          {state.overlay === 'share' && (
            <ShareReview state={state} runtime={runtime} t={t} />
          )}
          {state.overlay === 'reference' && <ReferencePreview state={state} t={t} />}
        </div>
      </div>
    </Modal>
  )
}

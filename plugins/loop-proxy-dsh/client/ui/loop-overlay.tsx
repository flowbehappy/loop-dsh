/** Modal projection for binding, project switching, binding removal, and sync. */

import type { ReactNode } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { LoopUiActions, LoopUiState } from './controller.ts'
import type { LoopKey, NS } from './locales.ts'
import { failureText, safeFailureText } from './failure-text.ts'
import { showTargetSelection as hasTargetSelection } from './selection.ts'
import { SyncControl } from './sync-control.tsx'
import type { ProjectChoice, WorkspaceRef } from './types.ts'
import css from './loop-ui.module.css'

export interface LoopOverlayInjected {
  readonly actions: LoopUiActions
  readonly hooks: {
    readonly loop: HostObservable<LoopUiState>
  }
}

export type LoopOverlayProps = PropsLocale<typeof NS> & InjectFace<LoopOverlayInjected>

function identityName(value: string | undefined, fallback: string): string {
  return value === undefined || value === '' ? fallback : value
}

function ProjectBindingDetail({
  binding,
  actions,
  busy,
  t,
}: {
  readonly binding: NonNullable<LoopUiState['binding']>
  readonly actions: LoopUiActions
  readonly busy: boolean
  readonly t: LoopOverlayProps['t']
}): ReactNode {
  const loop = binding.loop
  if (binding.state !== 'active' || loop === undefined) return null
  return (
    <div className={css.bindingDetail}>
      <dl className={css.metadata}>
        <div>
          <dt>{t('dialog.localWorkspace')}</dt>
          <dd>{binding.workspace.displayTitle}</dd>
        </div>
        <div>
          <dt>{t('dialog.loopWorkspace')}</dt>
          <dd>{loop.workspaceName}</dd>
        </div>
        <div>
          <dt>{t('dialog.projectLabel')}</dt>
          <dd>{loop.projectName}</dd>
        </div>
        <div>
          <dt>{t('global.serverLabel')}</dt>
          <dd>{loop.serviceBaseUrl}</dd>
        </div>
        <div>
          <dt>{t('dialog.currentAccount')}</dt>
          <dd>{identityName(binding.account?.displayName, t('dialog.notConnected'))}</dd>
        </div>
        <div>
          <dt>{t('dialog.superAgent')}</dt>
          <dd>{identityName(binding.agent?.displayName, t('dialog.notConnected'))}</dd>
        </div>
      </dl>
      {binding.reason !== undefined && binding.reason !== '' && (
        <p className={css.warning}>{safeFailureText(binding.reason)}</p>
      )}
      <div className={css.inlineActions}>
        <Button
          variant="primary"
          disabled={busy}
          onClick={actions.openProject}
        >
          {t('dialog.viewLoop')}
        </Button>
      </div>
    </div>
  )
}

function roleLabel(t: LoopOverlayProps['t'], role: ProjectChoice['role']): string {
  const key: Record<ProjectChoice['role'], LoopKey> = {
    view: 'dialog.role.view',
    edit: 'dialog.role.edit',
    manage: 'dialog.role.manage',
    owner: 'dialog.role.owner',
  }
  return t(key[role])
}

function StatusError({
  error,
  actions,
  t,
}: {
  readonly error: NonNullable<LoopUiState['error']>
  readonly actions: LoopUiActions
  readonly t: LoopOverlayProps['t']
}): ReactNode {
  const challengeExpired = error.code === 'loop-host/challenge-expired'
  const connectionFailure =
    error.code === 'loop/transport' ||
    error.code === 'loop-host/backend-unavailable' ||
    error.code === 'loop-host/timeout'
  const waitingForAccess = error.code === 'loop-host/waiting-for-access'
  return (
    <div className={css.errorBlock} role="alert">
      <strong>{t('error.title')}</strong>
      <span>{failureText(t, error)}</span>
      <div className={css.inlineActions}>
        {challengeExpired && (
          <Button size="sm" variant="outline" onClick={actions.connect}>
            {t('dialog.reloadChoices')}
          </Button>
        )}
        {connectionFailure && (
          <Button size="sm" variant="outline" onClick={actions.connect}>
            {t('dialog.retryConnection')}
          </Button>
        )}
        {waitingForAccess && (
          <Button size="sm" variant="outline" onClick={actions.retry}>
            {t('dialog.retryAccess')}
          </Button>
        )}
        {error.code === 'loop-host/workspace-required' && (
          <Button size="sm" variant="outline" onClick={actions.openLoopModules}>
            {t('dialog.chooseLoopWorkspace')}
          </Button>
        )}
      </div>
    </div>
  )
}

function WorkspaceHeading({ workspace, t }: { readonly workspace: WorkspaceRef; readonly t: LoopOverlayProps['t'] }): ReactNode {
  return (
    <div className={css.workspaceHeading}>
      <span className={css.eyebrow}>{t('dialog.title')}</span>
      <h2>{workspace.displayTitle}</h2>
    </div>
  )
}

function ProjectChoices({
  state,
  actions,
  t,
}: {
  readonly state: LoopUiState
  readonly actions: LoopUiActions
  readonly t: LoopOverlayProps['t']
}): ReactNode {
  const hasCurrentBinding =
    state.binding?.state === 'active' && state.binding.loop !== undefined
  const challengeExpired = state.error?.code === 'loop-host/challenge-expired'
  return (
    <>
      <section className={css.section} aria-labelledby="loop-project-title">
        <h3 id="loop-project-title" className={css.sectionTitle}>
          {t(hasCurrentBinding ? 'dialog.currentBindingTitle' : 'dialog.projectTitle')}
        </h3>
        {state.binding !== null && (
          <ProjectBindingDetail
            binding={state.binding}
            actions={actions}
            busy={state.busy !== null}
            t={t}
          />
        )}
        <h4 className={css.subsectionTitle}>
          {t(hasCurrentBinding ? 'dialog.chooseAnotherProject' : 'dialog.chooseProject')}
        </h4>
        <fieldset className={css.choiceList}>
          <legend className={css.visuallyHidden}>{t('dialog.chooseProject')}</legend>
          {state.projects.map(project => (
            <label key={project.projectId} className={css.choice}>
              <input
                type="radio"
                name="loop-project"
                checked={state.selectedProjectId === project.projectId}
                onChange={() => { actions.selectProject(project.projectId) }}
              />
              <span className={css.choiceText}>
                <span className={css.choiceTitle}>{project.workspaceName} / {project.projectName}</span>
                <span className={css.choiceCaption}>{roleLabel(t, project.role)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </section>
      <section className={css.section} aria-labelledby="loop-agent-title">
        <h3 id="loop-agent-title" className={css.sectionTitle}>{t('dialog.agentTitle')}</h3>
        <p className={css.hint}>{t('dialog.chooseAgent')}</p>
        {state.agents.length === 0
          ? (
              <div className={css.agentMissing}>
                <p className={css.warning}>{t('dialog.noAgents')}</p>
                <Button size="sm" variant="outline" onClick={actions.connect}>
                  {t('dialog.agentSignIn')}
                </Button>
              </div>
            )
          : <select
              className={css.select}
              aria-label={t('dialog.agentTitle')}
              value={state.selectedAgentId}
              onChange={event => { actions.selectAgent(event.currentTarget.value) }}
            >
              {state.agents.map(agent => (
                <option key={agent.agentId} value={agent.agentId}>{agent.displayName}</option>
              ))}
            </select>}
      </section>
      <details className={css.createProject}>
        <summary>{t('dialog.createProject')}</summary>
        <div className={css.createRow}>
          <label className={css.field}>
            <span>{t('dialog.projectName')}</span>
            <Input
              value={state.newProjectName}
              maxLength={255}
              placeholder={t('dialog.projectPlaceholder')}
              onChange={event => { actions.changeNewProjectName(event.currentTarget.value) }}
            />
          </label>
          <label className={css.field}>
            <span>{t('dialog.projectPrefix')}</span>
            <Input
              value={state.newProjectPrefix}
              maxLength={32}
              placeholder={t('dialog.projectPrefixPlaceholder')}
              onChange={event => { actions.changeNewProjectPrefix(event.currentTarget.value) }}
            />
            <span className={css.hint}>{t('dialog.projectPrefixHint')}</span>
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={
              state.busy !== null ||
              challengeExpired ||
              state.newProjectName.trim() === '' ||
              !/^[A-Za-z]{1,32}$/.test(state.newProjectPrefix.trim())
            }
            onClick={actions.createProject}
          >
            {t('dialog.create')}
          </Button>
        </div>
      </details>
      <div className={css.footerActions}>
        <span className={css.footerHint}>
          {state.selectedProjectId === '' || state.selectedAgentId === '' ? t('dialog.selectRequired') : ''}
        </span>
        <Button
          variant="primary"
          disabled={
            state.busy !== null ||
            challengeExpired ||
            state.selectedProjectId === '' ||
            state.selectedAgentId === ''
          }
          onClick={actions.completeBind}
        >
          {t('dialog.bind')}
        </Button>
      </div>
    </>
  )
}

/**
 * Render the active Loop UI for one captured Workspace.
 * @param props - observable controller state, stable actions, and locale.
 * @returns nothing while closed, otherwise one binding modal.
 */
export function LoopOverlay({ useLoop, actions, t }: LoopOverlayProps): ReactNode {
  const state = useLoop(value => value)
  if (state.screen === 'closed' || state.workspace === null) return null
  const binding = state.binding
  // A successful sign-in can legitimately return zero Projects. The target
  // selector must remain visible so the user can create the first Project;
  // only an unconsumed login challenge owns the sign-in surface.
  const showTargetSelection = hasTargetSelection(state)
  const showLogin = state.loginUrl !== null || (!showTargetSelection && binding?.state === 'needs_auth')
  return (
    <Modal
      open
      headless
      title={t('dialog.title')}
      className={css.modal as string}
      contentClassName={css.modalContent as string}
      onClose={actions.close}
    >
      <div className={css.panel}>
        <header className={css.header}>
          <WorkspaceHeading workspace={state.workspace} t={t} />
          <Button size="sm" variant="ghost" onClick={actions.close}>{t('dialog.close')}</Button>
        </header>
        <div className={css.body}>
          {state.error !== null && (
            <StatusError
              error={state.error}
              actions={actions}
              t={t}
            />
          )}
          {state.screen === 'loading' && <p className={css.status}>{t('dialog.loading')}</p>}
          {state.screen === 'binding' && showTargetSelection && (
            <ProjectChoices state={state} actions={actions} t={t} />
          )}
          {state.screen === 'binding' && showLogin && (
            <>
              <section className={css.section}>
                <h3 className={css.sectionTitle}>{t('dialog.loginTitle')}</h3>
                <p className={css.hint}>{t('dialog.loginBody')}</p>
              </section>
              <div className={css.footerActions}>
                {!state.loginOpened && (
                  <Button variant="primary" onClick={actions.openLogin}>{t('dialog.openLogin')}</Button>
                )}
                {state.loginOpened && (
                  <>
                    <span className={css.footerHint}>{t('dialog.loginOpened')}</span>
                    <Button
                      variant="primary"
                      disabled={state.busy !== null}
                      onClick={actions.continueAfterLogin}
                    >
                      {t('dialog.continue')}
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
          {state.screen === 'binding' && !showTargetSelection && !showLogin && (
            <BindingRecovery state={state} actions={actions} t={t} />
          )}
          {state.screen === 'active' && binding !== null && (
            state.confirmUnbind
              ? <UnbindConfirmation state={state} actions={actions} t={t} />
              : <ActiveBinding state={state} actions={actions} t={t} />
          )}
        </div>
      </div>
    </Modal>
  )
}

function BindingRecovery({
  state,
  actions,
  t,
}: {
  readonly state: LoopUiState
  readonly actions: LoopUiActions
  readonly t: LoopOverlayProps['t']
}): ReactNode {
  const binding = state.binding
  if (binding === null || binding.state === 'needs_auth') {
    return (
      <section className={css.section}>
        <h3 className={css.sectionTitle}>{t('dialog.loginTitle')}</h3>
        <p className={css.hint}>{t('dialog.loginBody')}</p>
        <div className={css.inlineActions}>
          <Button variant="primary" onClick={actions.openLogin}>{t('dialog.openLogin')}</Button>
          {state.loginOpened && <Button variant="outline" onClick={actions.continueAfterLogin}>{t('dialog.continue')}</Button>}
        </div>
      </section>
    )
  }
  if (binding.state === 'waiting_for_access') {
    return (
      <section className={css.section}>
        <h3 className={css.sectionTitle}>{t('dialog.waitingTitle')}</h3>
        <p className={css.hint}>
          {binding.reason === undefined ? t('dialog.waitingBody') : safeFailureText(binding.reason)}
        </p>
        <div className={css.inlineActions}>
          <Button variant="outline" onClick={actions.retry}>{t('dialog.retry')}</Button>
        </div>
      </section>
    )
  }
  if (binding.state === 'target_unavailable' || binding.state === 'revoked') {
    return (
      <section className={css.section}>
        <h3 className={css.sectionTitle}>
          {t(binding.state === 'revoked' ? 'dialog.revokedTitle' : 'dialog.unavailableTitle')}
        </h3>
        <p className={css.hint}>{binding.reason === undefined
          ? t(binding.state === 'revoked' ? 'dialog.revokedBody' : 'dialog.unavailableBody')
          : safeFailureText(binding.reason)}</p>
        <Button variant="primary" onClick={actions.connect}>{t('dialog.reconnect')}</Button>
      </section>
    )
  }
  return (
    <section className={css.section}>
      <h3 className={css.sectionTitle}>{t('dialog.unboundTitle')}</h3>
      <p className={css.hint}>{t('dialog.unboundBody')}</p>
      <Button variant="primary" onClick={actions.connect}>{t('dialog.connect')}</Button>
    </section>
  )
}

function ActiveBinding({
  state,
  actions,
  t,
}: {
  readonly state: LoopUiState
  readonly actions: LoopUiActions
  readonly t: LoopOverlayProps['t']
}): ReactNode {
  const binding = state.binding
  if (binding === null || binding.loop === undefined) return null
  return (
    <>
      <section className={css.summary} aria-labelledby="loop-current-binding-title">
        <h3 id="loop-current-binding-title" className={css.sectionTitle}>
          {t('dialog.currentBindingTitle')}
        </h3>
        <ProjectBindingDetail
          binding={binding}
          actions={actions}
          busy={state.busy !== null}
          t={t}
        />
      </section>
      <div className={css.inlineActions}>
        <Button variant="outline" disabled={state.busy !== null} onClick={actions.switchProject}>
          {t('dialog.switchProject')}
        </Button>
        <Button variant="ghost" disabled={state.busy !== null} onClick={actions.requestUnbind}>
          {t('dialog.unbindProject')}
        </Button>
      </div>
      {state.sessionId !== null && (
        <SyncControl
          context={state.syncContext}
          sync={state.sync}
          error={state.syncError}
          loginOpened={state.syncLoginOpened}
          busy={state.busy === 'sync'}
          actions={actions}
          t={t}
        />
      )}
    </>
  )
}

function UnbindConfirmation({
  state,
  actions,
  t,
}: {
  readonly state: LoopUiState
  readonly actions: LoopUiActions
  readonly t: LoopOverlayProps['t']
}): ReactNode {
  if (state.disconnectChallenge !== null) {
    return (
      <section className={css.section} role="status">
        <h3 className={css.sectionTitle}>{t('dialog.disconnectLoginTitle')}</h3>
        <p className={css.hint}>{t('dialog.disconnectLoginBody')}</p>
        <div className={css.inlineActions}>
          {!state.disconnectLoginOpened ? (
            <Button variant="primary" onClick={actions.openDisconnectLogin}>
              {t('dialog.disconnectLoginOpen')}
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={state.busy !== null}
              onClick={actions.checkDisconnect}
            >
              {state.busy === 'unbind'
                ? t('dialog.disconnectChecking')
                : t('dialog.disconnectCheck')}
            </Button>
          )}
          <Button variant="ghost" disabled={state.busy !== null} onClick={actions.cancelUnbind}>
            {t('dialog.disconnectLater')}
          </Button>
        </div>
      </section>
    )
  }
  return (
    <section className={css.section}>
      <h3 className={css.sectionTitle}>{t('dialog.unbindTitle')}</h3>
      <p className={css.hint}>{t('dialog.unbindBody')}</p>
      <div className={css.footerActions}>
        <span />
        <div className={css.inlineActions}>
          <Button variant="ghost" disabled={state.busy !== null} onClick={actions.cancelUnbind}>
            {t('dialog.cancel')}
          </Button>
          <Button variant="primary" disabled={state.busy !== null} onClick={actions.confirmUnbind}>
            {t('dialog.confirmUnbind')}
          </Button>
        </div>
      </div>
    </section>
  )
}

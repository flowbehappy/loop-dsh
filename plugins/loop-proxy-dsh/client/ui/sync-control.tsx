/** Per-session visible-sync status, toggle, receipt, and recovery surface. */

import type { ReactNode } from 'react'
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { LoopUiActions, UiFailure } from './controller.ts'
import type { LoopKey, NS } from './locales.ts'
import type { SessionContext, SyncState } from './types.ts'
import { failureText, syncReasonText } from './failure-text.ts'
import css from './loop-ui.module.css'

export interface SyncControlProps extends PropsLocale<typeof NS> {
  readonly context: SessionContext | null
  readonly sync: SyncState | null
  readonly error: UiFailure | null
  readonly loginOpened: boolean
  readonly busy: boolean
  readonly actions: LoopUiActions
}

function syncStatusKey(sync: SyncState): LoopKey {
  switch (sync.state) {
    case 'off': return 'dialog.syncOff'
    case 'on': return 'dialog.syncOn'
    case 'pending': return 'dialog.syncPending'
    case 'retrying': return 'dialog.syncRetrying'
    case 'error': return 'dialog.syncError'
    case 'needs_auth': return 'dialog.syncNeedsAuth'
  }
}

function syncEnabled(sync: SyncState | null): boolean {
  return sync !== null && sync.state !== 'off'
}

/**
 * Render one Session's sync section.
 * @param props - authoritative sync state and controller actions.
 * @returns the compact sync section.
 */
export function SyncControl({
  context,
  sync,
  error,
  loginOpened,
  busy,
  actions,
  t,
}: SyncControlProps): ReactNode {
  if (busy && context === null && sync === null && error === null) {
    return (
      <section className={css.section} aria-labelledby="loop-sync-title">
        <h3 id="loop-sync-title" className={css.sectionTitle}>{t('dialog.syncTitle')}</h3>
        <p className={css.status}>{t('dialog.syncSaving')}</p>
      </section>
    )
  }
  if (context === null && sync === null && error === null) {
    return (
      <section className={css.section} aria-labelledby="loop-sync-title">
        <h3 id="loop-sync-title" className={css.sectionTitle}>{t('dialog.syncTitle')}</h3>
        <p className={css.hint}>{t('dialog.syncUnavailable')}</p>
      </section>
    )
  }
  if (sync?.state === 'off' && sync.canEnable === false) {
    return (
      <section className={css.section} aria-labelledby="loop-sync-title">
        <h3 id="loop-sync-title" className={css.sectionTitle}>{t('dialog.syncTitle')}</h3>
        <p className={css.hint}>{t('dialog.syncNoChannel')}</p>
      </section>
    )
  }
  const reason = context !== null && context.state !== 'inherited'
    ? context.reason === undefined
      ? t('dialog.syncUnavailable')
      : syncReasonText(t, context.reason)
    : error === null
      ? undefined
      : failureText(t, error)
  const status = sync === null ? undefined : t(syncStatusKey(sync))
  const syncReason = sync?.reason === undefined || sync.reason === ''
    ? undefined
    : syncReasonText(t, sync.reason)
  return (
    <section className={css.section} aria-labelledby="loop-sync-title">
      <div className={css.sectionHeading}>
        <div>
          <h3 id="loop-sync-title" className={css.sectionTitle}>{t('dialog.syncTitle')}</h3>
          <p className={css.hint}>{t('dialog.syncDescription')}</p>
        </div>
        {sync !== null && <Switch
          checked={syncEnabled(sync)}
          label={t('dialog.syncToggle')}
          disabled={busy}
          onChange={actions.toggleSync}
        />}
      </div>
      {busy && <p className={css.status}>{t('dialog.syncSaving')}</p>}
      {reason !== undefined && (
        <p className={css.error} role="alert">{reason}</p>
      )}
      {sync !== null && (
        <dl className={css.metadata}>
          <div>
            <dt>{t('dialog.syncDestination')}</dt>
            <dd>{sync.destination?.topicId === undefined
              ? t('dialog.syncTopicPending')
              : t('dialog.syncTopicReady')}</dd>
          </div>
          <div>
            <dt>{t('dialog.syncStatus')}</dt>
            <dd>{status}</dd>
          </div>
          {sync.pending > 0 && (
            <div>
              <dt>{t('dialog.syncPending')}</dt>
              <dd>{t('dialog.syncPendingCount', { count: sync.pending })}</dd>
            </div>
          )}
          {sync.lastReceipt !== undefined && (
            <div>
              <dt>{t('dialog.syncLastReceiptLabel')}</dt>
              <dd>{t('dialog.syncLastReceipt', { sequence: sync.lastReceipt.sourceSequence })}</dd>
            </div>
          )}
        </dl>
      )}
      {sync?.historyPartial === true && <p className={css.warning}>{t('dialog.syncPartial')}</p>}
      {syncReason !== undefined && syncReason !== status && (
        <p className={css.warning}>{syncReason}</p>
      )}
      {sync?.state === 'needs_auth' && sync.challenge === undefined && (
        <div className={css.authPrompt}>
          <p className={css.hint}>{t('dialog.syncNeedsAuthHint')}</p>
          <Button
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={actions.authorizeSync}
          >
            {t('dialog.syncAuthorize')}
          </Button>
        </div>
      )}
      {sync?.challenge !== undefined && (
        <div className={css.authPrompt}>
          <p className={css.hint}>{t('dialog.syncAuthPrompt')}</p>
          <div className={css.inlineActions}>
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={actions.authorizeSync}
            >
              {t('dialog.syncAuthorize')}
            </Button>
          </div>
          {loginOpened && <p className={css.status}>{t('dialog.syncAuthOpened')}</p>}
        </div>
      )}
      <div className={css.inlineActions}>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={actions.refreshSync}
        >
          {t('dialog.syncCheck')}
        </Button>
      </div>
    </section>
  )
}

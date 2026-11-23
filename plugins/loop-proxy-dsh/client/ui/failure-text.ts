/** Convert controller failures into localized, secret-safe user copy. */

import type { UiFailure } from './controller.ts'
import type { RemoteFailure } from './types.ts'
import type { LoopMenuTranslate } from './workspace-menu.ts'

/**
 * Keep server text useful without rendering URLs or credential-shaped values.
 * @param value - untrusted failure copy.
 * @returns bounded display text.
 */
export function safeFailureText(value: string): string {
  return value
    .slice(0, 320)
    .replace(/\b(?:https?|wss?):\/\/\S+/giu, '[link hidden]')
    .replace(/\b(token|cookie|authorization|code|secret)\s*[=:]\s*\S+/giu, '$1 [hidden]')
    .replace(/[A-Za-z0-9_-]{24,}/gu, '[value hidden]')
    .trim()
}

/**
 * Localize a controller failure by stable code.
 * @param t - namespace translator.
 * @param failure - controller failure.
 * @returns user-visible failure text.
 */
export function failureText(t: LoopMenuTranslate, failure: UiFailure): string {
  switch (failure.code) {
    case 'loop/transport': return t('error.transport')
    case 'loop-host/backend-unavailable': return t('error.backendUnavailable')
    case 'loop-host/credential-recovery-disabled': return t('error.credentialRecoveryDisabled')
    case 'loop-host/credential-unavailable': return t('error.credentialUnavailable')
    case 'loop-host/timeout': return t('error.timeout')
    case 'loop-host/recovery-unavailable': return t('error.recoveryUnavailable')
    case 'loop-host/login-discovery': return t('error.loginDiscovery')
    case 'loop/server-url-invalid': return t('error.serverUrl')
    case 'loop-host/workspace-required': return t('error.workspaceRequired')
    case 'loop/host-update-required': return t('error.hostUpdate')
    case 'loop/selection-required': return t('error.selection')
    case 'loop/popup-blocked': return t('error.popup')
    case 'loop/challenge-required': return t('error.challenge')
    case 'loop-host/challenge-expired': return t('error.challengeExpired')
    case 'loop-host/needs-auth': return t('error.needsAuth')
    case 'loop-host/waiting-for-access': return t('dialog.waitingBody')
    case 'loop/sync-error': return t('error.sync')
    case 'loop/project-prefix-invalid': return t('error.projectPrefix')
    case 'loop/project-target': return t('error.projectTarget')
    case 'loop/sync-unbound': return t('dialog.syncUnavailable')
    case 'loop/sync-needs_auth': return t('dialog.syncAuth')
    default: return t('error.generic')
  }
}

/**
 * Turn durable Sync reasons into localized next steps without exposing Host
 * transport or API wording.
 * @param t - namespace translator.
 * @param reason - Host-provided Sync reason.
 * @returns actionable user copy.
 */
export function syncReasonText(t: LoopMenuTranslate, reason: string): string {
  switch (reason.trim()) {
    case 'Continue enabling sync for this Session':
    case 'Authorization was not granted':
      return t('dialog.syncNeedsAuth')
    case 'This Session was created before the current Workspace binding':
      return t('dialog.syncCreatedBefore')
    case 'The Session keeps its original project binding':
      return t('dialog.syncOriginalBinding')
    case 'The Session is not bound':
      return t('dialog.syncUnavailable')
    default:
      return failureText(t, { code: 'loop/sync-error', message: reason })
  }
}

/**
 * Localize known project-sync reasons while preserving other bounded Host text.
 * @param t - namespace translator.
 * @param reason - durable project-sync reason.
 * @returns localized user-visible reason.
 */
export function settingsReasonText(t: LoopMenuTranslate, reason: string): string {
  switch (reason.trim()) {
    case 'Select a Loop server and workspace':
    case 'Select a Loop server and workspace in Loop settings':
      return t('settings.connectNeedsConfig')
    default:
      return safeFailureText(reason)
  }
}

/**
 * Keep collaboration failures actionable without rendering transport text.
 * @param t - Loop dictionary translator.
 * @param failure - stable Host/Proxy failure.
 * @returns localized user-facing failure.
 */
export function collaborationFailureText(t: LoopMenuTranslate, failure: RemoteFailure): string {
  switch (failure.code) {
    case 'loop-host/waiting-for-access': return t('collab.error.permission')
    case 'loop-host/needs-auth':
    case 'loop-host/revoked': return t('collab.error.auth')
    case 'loop-host/timeout':
    case 'loop-host/backend-unavailable': return t('collab.error.offline')
    case 'loop-collaboration/cancelled': return t('collab.notice.intentDiscarded')
    case 'loop-collaboration/human-disabled': return t('collab.error.humanDisabled')
    case 'loop-collaboration/not-bound': return t('collab.error.notBound')
    case 'loop-collaboration/access-required':
    case 'loop-collaboration/permission-denied': return t('collab.error.needsAccess')
    case 'loop-collaboration/auth-required': return t('collab.error.auth')
    case 'loop-collaboration/binding-stale': return t('collab.error.bindingStale')
    case 'loop-collaboration/intent-expired': return t('collab.error.intentExpired')
    case 'loop-collaboration/intent-already-bound':
    case 'loop-collaboration/action-conflict': return t('collab.error.intentConflict')
    case 'loop-collaboration/intent-digest-mismatch':
    case 'loop-collaboration/intent-not-accepted': return t('collab.error.payloadMismatch')
    case 'loop-collaboration/capability-unsupported':
    case 'loop-collaboration/target-unavailable': return t('collab.error.unsupported')
    case 'loop-host/conflict':
    case 'loop-host/invalid-request': return t('collab.error.bindFailed')
    case 'loop-collaboration/result-unknown':
    case 'loop-collaboration/action-unknown': return t('collab.error.resultUnknown')
    case 'loop-collaboration/queue-full': return t('collab.error.queue')
    case 'loop-collaboration/storage-full': return t('collab.error.storage')
    case 'loop-collaboration/proxy-offline':
    case 'loop-collaboration/server-unavailable': return t('collab.error.offline')
    case 'loop-collaboration/session-unavailable': return t('collab.error.session')
    default: return t('collab.error.internal')
  }
}

/** Localize Loop Skill catalog/body failures by stable Host or protocol code. */
export function skillCatalogFailureText(t: LoopMenuTranslate, failure: RemoteFailure): string {
  switch (failure.code) {
    case 'loop-host/needs-auth':
    case 'loop-host/revoked':
      return t('skill.error.auth')
    case 'loop-host/capability-unsupported':
      return t('skill.error.hostUpdate')
    case 'loop-host/backend-unavailable':
    case 'loop-host/timeout':
      return t('skill.error.offline')
    case 'loop-host/queue-full':
      return t('skill.error.busy')
    case 'loop-host/workspace-required':
    case 'loop-host/session-unavailable':
    case 'loop-skill/session-mismatch':
    case 'loop-skill/session-inactive':
      return t('skill.error.session')
    case 'loop-host/cancelled':
      return t('skill.error.cancelled')
    case 'loop-host/conflict':
    case 'loop-skill/binding-stale':
      return t('skill.error.bindingStale')
    case 'loop-skill/content-too-large':
      return t('skill.error.tooLarge')
    case 'loop-skill/invalid-reference':
    case 'loop-skill/invalid-version-handle':
    case 'loop-skill/reference-too-large':
      return t('skill.error.reference')
    case 'loop-skill/unsupported-path':
      return t('skill.error.path')
    case 'loop-host/invalid-request':
    case 'loop-host/backend-invalid':
    case 'loop-host/action-failed':
    case 'loop-skill/content-empty':
      return t('skill.error.unavailable')
    default:
      return t('error.loopSkills')
  }
}

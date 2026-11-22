import test from 'node:test'
import assert from 'node:assert/strict'
import {
  collaborationFailureText,
  failureText,
  safeFailureText,
  settingsReasonText,
  skillCatalogFailureText,
  syncReasonText,
} from '../failure-text.ts'
import { en, zh } from '../locales.ts'

const t = (key: keyof typeof en): string => en[key]

test('server failure copy cannot expose URLs or credential-shaped values', () => {
  const text = safeFailureText(
    'token=secret-value https://loop.synthetic.test/callback?code=abc abcdefghijklmnopqrstuvwxyz0123456789',
  )
  assert.doesNotMatch(text, /secret-value|https:\/\/|abcdefghijklmnopqrstuvwxyz0123456789/)
  assert.match(text, /\[hidden\]/)
})

test('known controller failures use localized copy instead of transport text', () => {
  assert.equal(
    failureText(t, { code: 'loop/transport', message: 'socket closed' }),
    en['error.transport'],
  )
  assert.equal(
    failureText(t, { code: 'loop/host-update-required', message: '' }),
    en['error.hostUpdate'],
  )
  assert.equal(
    failureText(t, { code: 'loop/challenge-required', message: '' }),
    en['error.challenge'],
  )
  assert.equal(
    failureText(t, { code: 'loop-host/needs-auth', message: 'page session expired' }),
    en['error.needsAuth'],
  )
  assert.equal(
    failureText(t, { code: 'loop-host/challenge-expired', message: 'stale challenge' }),
    en['error.challengeExpired'],
  )
  assert.equal(
    failureText(t, { code: 'loop-host/timeout', message: 'request timed out' }),
    en['error.timeout'],
  )
  assert.equal(
    failureText(t, { code: 'loop-host/waiting-for-access', message: 'access required' }),
    en['dialog.waitingBody'],
  )
  assert.equal(
    collaborationFailureText(t, { code: 'loop-host/conflict', message: 'workspace changed' }),
    en['collab.error.bindFailed'],
  )
  assert.equal(
    failureText(t, { code: 'loop-host/backend-unavailable', message: 'offline' }),
    en['error.backendUnavailable'],
  )
  assert.equal(
    failureText(t, { code: 'loop/server-url-invalid', message: '' }),
    en['error.serverUrl'],
  )
  assert.equal(
    failureText(t, { code: 'loop-host/workspace-required', message: '' }),
    en['error.workspaceRequired'],
  )
  assert.equal(
    failureText(t, { code: 'loop/project-target', message: '' }),
    en['error.projectTarget'],
  )
})

test('the Agent-only composer explains how to recover an old Human reference', () => {
  const text = collaborationFailureText(t, {
    code: 'loop-collaboration/human-disabled',
    message: 'raw transport detail',
  })
  assert.match(text, /Select a Loop Agent/u)
  assert.doesNotMatch(text, /raw transport detail/u)
})

test('Skill catalog failures use localized stable codes instead of protocol text', () => {
  assert.equal(
    skillCatalogFailureText(t, {code: 'loop-host/needs-auth', message: 'raw auth'}),
    en['skill.error.auth'],
  )
  assert.equal(
    skillCatalogFailureText(t, {code: 'loop-skill/binding-stale', message: 'raw version'}),
    en['skill.error.bindingStale'],
  )
  assert.equal(
    skillCatalogFailureText(t, {code: 'loop-host/backend-unavailable', message: 'https://loop.test'}),
    en['skill.error.offline'],
  )
  assert.equal(
    skillCatalogFailureText(t, {code: 'loop-host/capability-unsupported', message: 'raw host detail'}),
    en['skill.error.hostUpdate'],
  )
  assert.equal(
    skillCatalogFailureText(t, {code: 'loop-skill/invalid-reference', message: 'raw reference detail'}),
    en['skill.error.reference'],
  )
  assert.equal(
    skillCatalogFailureText(t, {code: 'loop-skill/invalid-version-handle', message: 'raw version detail'}),
    en['skill.error.reference'],
  )
  assert.equal(
    skillCatalogFailureText(t, {code: 'loop-skill/unsupported-path', message: 'raw path detail'}),
    en['skill.error.path'],
  )
  assert.equal(
    skillCatalogFailureText(t, {code: 'loop-skill/session-inactive', message: 'raw session detail'}),
    en['skill.error.session'],
  )
  assert.equal(
    skillCatalogFailureText(t, {code: 'loop-skill/internal', message: 'raw backend detail'}),
    en['error.loopSkills'],
  )
})

test('first-run auth and connection failures use truthful recovery guidance', () => {
  assert.doesNotMatch(en['error.needsAuth'], /expired/u)
  assert.doesNotMatch(zh['error.needsAuth'], /过期/u)
  assert.match(en['error.challengeExpired'], /Reload the choices/u)
  assert.match(zh['error.challengeExpired'], /重新载入选项/u)
  assert.match(en['error.transport'], /Settings → Loop/u)
  assert.match(zh['error.transport'], /设置 → Loop/u)
  assert.match(en['dialog.reloadChoices'], /projects and Agents/u)
  assert.match(zh['dialog.reloadChoices'], /项目和智能体/u)
})

test('known project-sync reason is localized instead of leaking Host English', () => {
  assert.equal(
    settingsReasonText(t, 'Select a Loop server and workspace'),
    en['settings.connectNeedsConfig'],
  )
  assert.equal(
    settingsReasonText(t, 'Another bounded Host reason'),
    'Another bounded Host reason',
  )
})

test('unknown failures and sync reasons do not expose Host transport wording', () => {
  assert.equal(
    failureText(t, { code: 'loop-host/http-error', message: 'host-sync API returned HTTP 409' }),
    en['error.generic'],
  )
  assert.equal(
    syncReasonText(t, 'This Session was created before the current Workspace binding'),
    en['dialog.syncCreatedBefore'],
  )
  assert.equal(
    syncReasonText(t, 'host-sync API returned HTTP 409'),
    en['error.sync'],
  )
})

test('credential access failure does not suggest a network retry or expose host details', () => {
  assert.equal(failureText(t, {
    code: 'loop-host/credential-unavailable', message: 'read keyring secret=value',
  }), en['error.credentialUnavailable'])
})

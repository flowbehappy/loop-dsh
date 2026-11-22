/** Pure Workspace context-menu projection over one Host status result. */

import type { UiMode } from './controller.ts'
import type { BindingView, RemoteResult, WorkspaceRef } from './types.ts'
import type { LoopKey } from './locales.ts'
import { safeFailureText } from './failure-text.ts'

export type LoopMenuAction = {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean
  readonly separatorBefore?: boolean
  readonly failureLabel?: string
  readonly run?: () => void | Promise<void>
}

export type LoopMenuTranslate = (key: LoopKey, values?: Record<string, string | number>) => string

export interface LoopMenuActions {
  readonly open: (workspace: WorkspaceRef, mode: UiMode) => void
  readonly openProject: (target: {
    readonly projectId: string
    readonly loopWorkspaceId: string
    readonly serviceBaseUrl: string
  }) => void
}

/**
 * Build menu rows without touching DOM, Remote, or localized global state.
 * @param result - authoritative status for the captured Workspace.
 * @param t - namespace-bound translator.
 * @param actions - captured-target dialog entry.
 * @returns data rows accepted by the shared context menu.
 */
export function buildWorkspaceMenu(
  workspace: WorkspaceRef,
  result: RemoteResult<BindingView>,
  t: LoopMenuTranslate,
  actions: LoopMenuActions,
): readonly LoopMenuAction[] {
  if (!result.ok) {
    return [{
      id: 'inspect',
      label: t('menu.statusError'),
      failureLabel: t('menu.failure'),
      run: () => actions.open(workspace, 'inspect'),
    }]
  }
  const binding = result.value
  const captured = binding.workspace
  const reason = binding.reason === undefined || binding.reason === ''
    ? null
    : safeFailureText(binding.reason)
  if (binding.state === 'active' && binding.loop !== undefined) {
    return [
      {
        id: 'summary',
        label: t('menu.activeSummary', {
          workspace: captured.displayTitle,
          loopWorkspace: binding.loop.workspaceName,
          project: binding.loop.projectName,
        }),
        disabled: true,
      },
      {
        id: 'open',
        label: t('menu.openProject'),
        failureLabel: t('menu.failure'),
        run: () => actions.openProject({
          projectId: binding.loop!.projectId,
          loopWorkspaceId: binding.loop!.workspaceId,
          serviceBaseUrl: binding.loop!.serviceBaseUrl,
        }),
      },
      {
        id: 'inspect',
        label: t('menu.inspect'),
        failureLabel: t('menu.failure'),
        run: () => actions.open(workspace, 'inspect'),
      },
      {
        id: 'switch',
        label: t('menu.switch'),
        failureLabel: t('menu.failure'),
        run: () => actions.open(workspace, 'switch'),
      },
      {
        id: 'unbind',
        label: t('menu.unbind'),
        separatorBefore: true,
        failureLabel: t('menu.failure'),
        run: () => actions.open(workspace, 'unbind'),
      },
    ]
  }
  if (binding.state === 'unbound') {
    return [{
      id: 'bind',
      label: t('menu.connect'),
      failureLabel: t('menu.failure'),
      run: () => actions.open(workspace, 'bind'),
    }]
  }
  const stateLabel = binding.state === 'needs_auth'
    ? t('menu.needsAuth')
    : binding.state === 'waiting_for_access'
      ? t('menu.waiting')
      : binding.state === 'revoked'
        ? t('menu.revoked')
        : t('menu.unavailable')
  return [
    ...(reason === null ? [] : [{ id: 'reason', label: reason, disabled: true }]),
    {
      id: 'recover',
      label: stateLabel,
      failureLabel: t('menu.failure'),
      run: () => actions.open(
        workspace,
        binding.state === 'needs_auth' || binding.state === 'target_unavailable' || binding.state === 'revoked'
          ? 'bind'
          : 'inspect',
      ),
    },
  ]
}

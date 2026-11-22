import type { LoopKey } from './locales.ts'
import type { CollaborationStatus, CollaborationWorksiteStatus } from './types.ts'

export function collaborationAccountName(
  scope: Pick<NonNullable<CollaborationStatus['scope']>, 'accountName'> | undefined,
  unavailable: string,
): string {
  const name = scope?.accountName?.trim()
  return name === undefined || name === '' ? unavailable : name
}

export interface CollaborationConnectionAction {
  readonly label: LoopKey
  readonly target: 'canonical' | 'boards'
  readonly disabled: boolean
}

export type BoardPickerPresentation = 'loading' | 'error' | 'empty' | 'choices'

export function worksiteCollapsedStatus(
  state: CollaborationWorksiteStatus['state'] | undefined,
): 'needs_enable' | 'attention' | null {
  if (state === 'needs_enable') return 'needs_enable'
  if (state === 'registration_conflict' ||
      state === 'state_changed' ||
      state === 'blocked' ||
      state === 'offline') {
    return 'attention'
  }
  return null
}

export function boardPickerPresentation(state: {
  readonly busy: string | null
  readonly error: unknown | null
  readonly boards: readonly unknown[]
}): BoardPickerPresentation {
  if (state.busy === 'boards') return 'loading'
  if (state.error !== null) return 'error'
  return state.boards.length === 0 ? 'empty' : 'choices'
}

export function collaborationConnectionAction(
  status: CollaborationStatus | null,
  screen: 'idle' | 'loading' | 'ready' | 'error',
): CollaborationConnectionAction {
  if (screen === 'loading') {
    return { label: 'collab.dialog.openConnection', target: 'canonical', disabled: true }
  }
  if (screen === 'error') {
    return { label: 'collab.dialog.openConnection', target: 'canonical', disabled: false }
  }
  switch (status?.state) {
    case 'needs-auth':
      return { label: 'collab.dialog.connectSignIn', target: 'canonical', disabled: false }
    case 'needs-board':
      return { label: 'collab.dialog.chooseBoardAction', target: 'boards', disabled: false }
    case 'unbound':
      return { label: 'collab.dialog.chooseBoardAction', target: 'boards', disabled: false }
    case 'target-unavailable':
    case 'revoked':
      return { label: 'collab.dialog.repairConnection', target: 'canonical', disabled: false }
    default:
      return { label: 'collab.dialog.openConnection', target: 'canonical', disabled: false }
  }
}

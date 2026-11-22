import type { LoopUiState } from './controller.ts'

/**
 * A completed sign-in may expose zero Projects. Keep the target surface alive
 * whenever the Host returned an Agent choice and a selection challenge so the
 * user can create the first Project instead of falling back to sign-in.
 */
export function showTargetSelection(
  state: Pick<LoopUiState, 'projects' | 'challengeId' | 'agents'>,
): boolean {
  return state.projects.length > 0 ||
    (state.challengeId !== null && state.agents.length > 0)
}

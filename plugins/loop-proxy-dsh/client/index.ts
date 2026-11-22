/** Browser entry that mounts the Host Remote before exposing the Loop UI. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'

import remote from '../remote.mjs'
import { applyLoopUi } from './ui/index.ts'

export const name = '@pingkai/loop-dsh/client'
export const inject = ['remote']

/**
 * Mount the Loop Host Remote and bind its namespace to the menu and dialogs.
 * @param ctx - DSH browser plugin context.
 * @returns disposer that withdraws UI and Remote contributions together.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const unmountRemote = await ctx.remote.$mount(remote)
  const ui = ctx.inject(
    [
      'remote.loopHost',
      'remote.session',
      'modules',
      'slots',
      'locale',
      'contextMenus',
      'workspaces',
      'layout',
      'sessions',
      'inputTriggers',
      'uiSession',
      'uiConversation',
    ],
    child => { applyLoopUi(child, child.remote.loopHost) },
  )
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await unmountRemote()
    throw error
  }
  return async () => {
    await ui.dispose()
    await unmountRemote()
  }
}

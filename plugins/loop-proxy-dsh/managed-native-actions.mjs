import {createLoopHostActions} from "./host-actions-core.mjs"
import {createLoopProxyBridge} from "./host.mjs"
import {assertManagedWorkspace} from "./managed-config.mjs"
import {NativeHostActions} from "./backend/dist/adapter.mjs"

export const name = "loop-managed-native-actions"
export const inject = ["credentials", "loopManagedConfig", "loopHostService", "webServer", "workspaceRegistry", "tools"]

/** Official profile entry using the DSH credential provider. */
export function apply(ctx) {
  const config = ctx.loopManagedConfig
  for (const workspace of ctx.workspaceRegistry.list()) assertManagedWorkspace(config, workspace.root ?? workspace.path)
  const actions = createLoopHostActions({
    managed: true,
    stateHome: config.actionsHome,
    serviceBaseUrl: "",
    loopWorkspaceId: "",
    pageOrigin: config.kind === "desktop" ? "dsh-app://app" : new URL(process.env.DSH_LOOP_PROXY_WORKSITE_URL || ctx.get("webApp")?.getAdvertisedUrl?.() || ctx.webServer.getOrigin()).origin,
    installationId: config.installationId,
    syncProfile: config.syncProfile,
  }, {
    nativeWorkspaceReconciliation: true,
    createHelper: selected => new NativeHostActions(selected, {
      provider: ctx.get("credentials"), syncHome: config.syncHome,
      canResumeProjectUpload: route => ctx.loopHostService.canResumeProjectUpload(route),
    }),
    onAccountPrincipal: principal => ctx.loopHostService.setAccountPrincipal(principal),
  })
  ctx.provide("loopHostActions", actions)
  ctx.provide("loopNativeSyncWriterFactory", resolved => actions.createSyncWriter(resolved,
    (sessionId, status) => ctx.loopHostService.setSessionUploadStatus?.(sessionId, status)))
  ctx.loopHostService.setActions(actions)
  createLoopProxyBridge(ctx)
  ctx.effect(() => () => actions.dispose(), "Loop native Host")
}

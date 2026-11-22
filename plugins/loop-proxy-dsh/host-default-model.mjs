/** Persist one explicit user model choice through the official Host default owner. */

import {createHash} from "node:crypto"

import {
  LOOP_MODEL_ROUTE_PREFIX,
  loopModelPickerID,
  loopModelRouteInput,
  loopModelRouteFromDigest,
} from "./model-identity.mjs"

function failure(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function sameSelection(left, right) {
  return left?.provider === right?.provider &&
    left?.model === right?.model &&
    left?.reasoningEffort === right?.reasoningEffort
}

function activeLoopConnection(
  request,
  status,
  currentServerRevision,
  currentAccountPrincipal,
  currentWorkspaceId,
) {
  if (request.kind !== "loop") return
  const provider = loopModelRouteFromDigest(createHash("sha256")
    .update(loopModelRouteInput(request.workspaceId, request.connectionId)).digest("hex"))
  if (request.provider !== provider) {
    throw failure("loop-host/model-default-scope", "The selected provider does not belong to this Loop connection")
  }
  if (currentWorkspaceId !== request.workspaceId ||
      currentServerRevision !== request.expectedServerRevision ||
      String(currentAccountPrincipal ?? "").trim() !== request.expectedAccountPrincipal ||
      status?.state !== "active" ||
      String(status.accountPrincipal ?? "").trim() !== request.expectedAccountPrincipal) {
    throw failure("loop-host/model-default-scope", "The selected Loop identity is no longer current")
  }
  const connection = status.connections.find(candidate =>
    candidate?.status === "active" &&
    candidate.connectionId === request.connectionId &&
    candidate.workspaceId === request.workspaceId)
  const model = connection?.models.find(candidate =>
    loopModelPickerID(candidate) === request.model)
  if (connection === undefined || model === undefined) {
    throw failure("loop-host/model-default-unavailable", "The selected Loop model is no longer available")
  }
}

/**
 * Validate and persist an explicit default-model request through the public
 * DSH LLM resolver and agentDefaultModel service. A no-op save is rejected by
 * the required currentSelection() readback, so missing or read-only editors
 * can never masquerade as persisted success.
 */
export async function saveExplicitDefaultModel({
  request,
  status,
  currentServerRevision,
  currentAccountPrincipal,
  currentWorkspaceId,
  getCurrentIdentity,
  llm,
  agentDefaultModel,
  configEditor,
  signal,
}) {
  if (signal?.aborted) throw failure("loop-host/cancelled", "Default model selection was cancelled")
  const loopRoute = request.provider.startsWith(LOOP_MODEL_ROUTE_PREFIX)
  if ((request.kind === "loop") !== loopRoute) {
    throw failure("loop-host/model-default-scope", "The selected model kind does not match its provider route")
  }
  const requireCurrentConnection = () => {
    const identity = getCurrentIdentity?.() ?? {currentServerRevision, currentAccountPrincipal, currentWorkspaceId}
    activeLoopConnection(request, status, identity.currentServerRevision, identity.currentAccountPrincipal, identity.currentWorkspaceId)
  }
  requireCurrentConnection()
  if (llm?.resolveCallConfig === undefined) {
    throw failure("loop-host/model-default-unavailable", "Host model validation is unavailable")
  }
  if (configEditor === undefined) {
    throw failure("loop-host/model-default-readonly", "The active composition does not expose a writable configuration editor")
  }
  if (agentDefaultModel?.saveSelection === undefined ||
      agentDefaultModel?.currentSelection === undefined) {
    throw failure("loop-host/model-default-unavailable", "The Host default-model owner is unavailable")
  }

  let resolved
  try {
    resolved = await llm.resolveCallConfig({
      provider: request.provider,
      model: request.model,
    }, signal)
  } catch {
    throw failure("loop-host/model-default-unavailable", "The selected model is not routable")
  }
  if (resolved.provider !== request.provider || resolved.model !== request.model) {
    throw failure("loop-host/model-default-unavailable", "The selected model resolved to a different route")
  }
  const next = {
    provider: resolved.provider,
    model: resolved.model,
    ...resolved.reasoningEffort === undefined
      ? {}
      : {reasoningEffort: resolved.reasoningEffort},
  }
  requireCurrentConnection()
  if (signal?.aborted) throw failure("loop-host/cancelled", "Default model selection was cancelled")
  const previous = agentDefaultModel.currentSelection()
  try {
    await agentDefaultModel.saveSelection(next)
  } catch {
    // Config Editor can update live configuration before its file write fails.
    // Only an unchanged, non-target readback proves this attempt did not apply.
    let current
    try { current = agentDefaultModel.currentSelection() } catch {}
    if (current === undefined || sameSelection(current, next) || !sameSelection(current, previous)) {
      throw failure("loop-host/model-default-unknown", "The default model may have changed; persistence is unconfirmed. Retry the same selection.")
    }
    throw failure("loop-host/model-default-save", "The default model could not be saved")
  }
  let current
  try {
    current = agentDefaultModel.currentSelection()
  } catch {
    throw failure(
      "loop-host/model-default-unknown",
      "The active Host configuration could not prove the saved default",
    )
  }
  try {
    requireCurrentConnection()
  } catch {
    throw failure("loop-host/model-default-unknown", "The Loop identity changed while saving. Select a model for the current account and workspace.")
  }
  if (signal?.aborted) {
    throw failure("loop-host/model-default-unknown", "The default model save finished after cancellation. Check or retry the selection.")
  }
  if (!sameSelection(current, next)) {
    throw failure(
      sameSelection(current, previous) ? "loop-host/model-default-not-persisted" : "loop-host/model-default-unknown",
      "The default model did not persist in the active Host configuration",
    )
  }
  return {selection: current}
}

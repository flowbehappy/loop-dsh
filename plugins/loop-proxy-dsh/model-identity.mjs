/** Shared Loop model route and picker identity without a crypto implementation. */

export const LOOP_MODEL_ROUTE_PREFIX = "loop-model-"
export const LOOP_MODEL_ROUTE_HEX_LENGTH = 20

/**
 * @param {string} workspaceId
 * @param {string} connectionId
 * @returns {string} exact preimage used by both Host and client route hashing.
 */
export function loopModelRouteInput(workspaceId, connectionId) {
  return `${workspaceId}\0${connectionId}`
}

/**
 * @param {string} digestHex SHA-256 hex digest.
 * @returns {string} the provider route registered by the Loop adapter.
 */
export function loopModelRouteFromDigest(digestHex) {
  return `${LOOP_MODEL_ROUTE_PREFIX}${digestHex.slice(0, LOOP_MODEL_ROUTE_HEX_LENGTH)}`
}

/**
 * @param {{wireApi: string, source: string, providerId?: string, id: string}} model
 * @returns {string} the exact model ID exposed to the DSH picker.
 */
export function loopModelPickerID(model) {
  return [
    model.wireApi,
    model.source,
    encodeURIComponent(model.providerId ?? ""),
    encodeURIComponent(model.id),
  ].join(":")
}

/**
 * @param {string} value picker model ID.
 * @returns {{wireApi: string, source: string, providerId: string, modelId: string} | null}
 */
export function parseLoopModelPickerID(value) {
  const parts = value.split(":")
  if (parts.length !== 4) return null
  const [wireApi, source, encodedProviderID, encodedModelID] = parts
  if (wireApi === undefined || wireApi === "" || source === undefined || source === "") return null
  try {
    const providerId = decodeURIComponent(encodedProviderID)
    const modelId = decodeURIComponent(encodedModelID)
    if (modelId === "") return null
    return {wireApi, source, providerId, modelId}
  } catch {
    return null
  }
}

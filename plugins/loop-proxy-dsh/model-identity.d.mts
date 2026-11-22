export const LOOP_MODEL_ROUTE_PREFIX: "loop-model-"
export const LOOP_MODEL_ROUTE_HEX_LENGTH: 20

export function loopModelRouteInput(workspaceId: string, connectionId: string): string
export function loopModelRouteFromDigest(digestHex: string): string

export function loopModelPickerID(model: {
  readonly wireApi: string
  readonly source: string
  readonly providerId?: string
  readonly id: string
}): string

export function parseLoopModelPickerID(value: string): {
  readonly wireApi: string
  readonly source: string
  readonly providerId: string
  readonly modelId: string
} | null

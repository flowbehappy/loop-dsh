/** Public errors never contain request bodies, credentials or native exceptions. */
export class LoopError extends Error {
  readonly code: string
  readonly status: number
  readonly outcomeUnknown: boolean
  challenge?:{id:string;loginUrl:string;expiresAt:string}
  constructor(code: string, message: string, status = 0, outcomeUnknown = false) {
    super(message)
    this.name = "LoopError"
    this.code = code
    this.status = status
    this.outcomeUnknown = outcomeUnknown
  }
}

export function requireActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new LoopError("loop-host/cancelled", "Loop request cancelled")
}

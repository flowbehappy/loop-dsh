/** Public errors never contain request bodies, credentials or native exceptions. */
export class LoopError extends Error {
  readonly code: string
  readonly status: number
  readonly outcomeUnknown: boolean
  serverCode?: string
  hint?: string
  details?: unknown
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

/** Share a bounded, credential-redacted error contract across HTTP transports. */
export function serverError(body: any, status: number, fallback: string, secrets: string[] = []): LoopError {
  const source = body?.error
  const redact = (value: string) => secrets.filter(Boolean).reduce((text, secret) => text.split(secret).join("[redacted]"), value).slice(0, 2048)
  const validCode = typeof source?.code === "string" && /^[a-z][a-z0-9_/-]{0,95}$/u.test(source.code) && redact(source.code) === source.code
  const error = new LoopError(fallback, validCode && typeof source?.message === "string" ? redact(source.message) : `Loop Host request was rejected (HTTP ${status}; ${fallback.replace("loop-host/", "")})`, status,
    status >= 500 || [408,429].includes(status))
  if (validCode) error.serverCode = source.code
  if (validCode && typeof source?.hint === "string") error.hint = redact(source.hint)
  // Never forward arbitrary response fields, stacks, headers or URLs. Validation
  // violations are public protocol data; retain them without flattening paths.
  if (validCode && Array.isArray(source?.details?.violations)) {
    error.details = {violations: source.details.violations.slice(0, 20).map((item: any) => ({
      ...(typeof item?.path === "string" ? {path: redact(item.path)} : {}),
      ...(typeof item?.message === "string" ? {message: redact(item.message)} : {}),
    }))}
  }
  if (error.serverCode === "validation" && error.details) {
    const violations = (error.details as {violations: {path?:string;message?:string}[]}).violations
    error.message = (error.message + violations.slice(0, 3).map(item => " " + [item.path,item.message].filter(Boolean).join(" ")).join("")).slice(0, 2048)
  }
  return error
}

import {LoopHTTP} from "./http.ts"
import {LoopError} from "./errors.ts"

export interface Action {id: string; [field: string]: unknown}
function actionPath(id: string): string {
  if (!id || id === "." || id === "..") throw new LoopError("loop-host/invalid-request", "Action ID is required")
  return "/actions/" + encodeURIComponent(id)
}
/** Public action protocol, shared by discovery and tool invocation. */
export class ActionClient {
  private http: LoopHTTP
  constructor(http: LoopHTTP) { this.http = http }
  async actions(signal?: AbortSignal): Promise<Action[]> {
    const actions: Action[] = []
    const seen = new Set<string>()
    let cursor = ""
    for (let page = 0; page < 200; page++) {
      const query = new URLSearchParams({limit: "50", available: "true"})
      if (cursor) query.set("cursor", cursor)
      const result = await this.http.request("GET", "/actions?" + query, undefined, signal)
      if (!Array.isArray(result?.actions) || result.actions.some((a: any) => typeof a?.id !== "string" || !a.id)) {
        throw new LoopError("loop-host/backend-invalid", "Invalid Loop action catalog")
      }
      actions.push(...result.actions)
      if (!result.hasMore) return actions
      if (typeof result.nextCursor !== "string" || !result.nextCursor || seen.has(result.nextCursor)) {
        throw new LoopError("loop-host/backend-invalid", "Loop action catalog cursor did not advance")
      }
      cursor = result.nextCursor
      seen.add(cursor)
    }
    throw new LoopError("loop-host/backend-invalid", "Loop action catalog exceeds its page budget")
  }
  delegationPreview(id: string, args: Record<string,unknown> | undefined, signal?: AbortSignal) {
    return this.http.request(args === undefined ? "GET" : "POST", actionPath(id) + "/delegation-preview", args, signal)
  }
  describe(id: string, signal?: AbortSignal): Promise<Action> {
    return this.http.request("GET", actionPath(id), undefined, signal)
  }
  invoke(id: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<any> {
    if (!args || typeof args !== "object" || Array.isArray(args) || Object.getPrototypeOf(args) !== Object.prototype && Object.getPrototypeOf(args) !== null) {
      throw new LoopError("loop-host/invalid-request", "Action arguments must be one JSON object")
    }
    return this.http.request("POST", actionPath(id) + "/invocations", args, signal)
  }
}

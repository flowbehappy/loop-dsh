/** Confirm an explicit model choice on an existing Session. */

import type {
  ModelSelection,
  ModelSelectionProjection,
} from '@deepseek-ai/dsh-api-session-controller/types'
import type {SessionId} from '@deepseek-ai/dsh-session/types'
import type {ModelChoice} from './model-controller.ts'
import type {RemoteResult} from './types.ts'

export interface SessionModelSelectionInput {
  readonly sessionId: string
  readonly choice: ModelChoice
}

export interface SessionModelSelectionPorts {
  selectModel(
    input: {
      readonly sessionId: string
      readonly provider: string
      readonly model: string
    },
    signal?: AbortSignal,
  ): Promise<RemoteResult<{readonly selected: ModelSelection}>>
  observeModelSelection(
    sessionId: string,
    signal?: AbortSignal,
  ): ModelSelectionObservation
  projectionTimeoutMs?: number
}

export interface ModelSelectionObservation {
  getSnapshot(): unknown
  subscribe(listener: () => void): () => void
  release(): void
}

export interface RetainedSessionSource {
  retain(
    sessionId: SessionId,
    options: {
      readonly source: 'controllerOperation'
      readonly signal?: AbortSignal
    },
  ): {
    readonly binding: {
      readonly session: {
        readonly projections: {
          faceOf(key: string): {
            getSnapshot(): unknown
            subscribe(listener: () => void): () => void
          }
        }
      }
    }
    release(): void
  }
}

/** Retain only long enough to observe the Session-owned model selection. */
export function retainModelSelectionObservation(
  sessions: RetainedSessionSource,
  sessionId: SessionId,
  signal?: AbortSignal,
): ModelSelectionObservation {
  const reference = sessions.retain(sessionId, {
    source: 'controllerOperation',
    signal,
  })
  try {
    const projection = reference.binding.session.projections.faceOf('modelSelection')
    return {
      getSnapshot: () => projection.getSnapshot(),
      subscribe: listener => projection.subscribe(listener),
      release: () => { reference.release() },
    }
  } catch (error) {
    reference.release()
    throw error
  }
}

function exactProjectedSelection(value: unknown, choice: ModelChoice): boolean {
  const projection = value as ModelSelectionProjection | undefined
  return projection?.next?.provider === choice.providerId &&
    projection.next.model === choice.modelId
}

/**
 * Existing Sessions keep the official session.selectModel owner. The adapter
 * never creates or activates a Session and only waits for that Session's
 * durable modelSelection projection before reporting confirmation.
 */
export class SessionModelSelectionAdapter {
  private readonly ports: SessionModelSelectionPorts

  constructor(ports: SessionModelSelectionPorts) {
    this.ports = ports
  }

  async select(
    input: SessionModelSelectionInput,
    signal?: AbortSignal,
  ): Promise<RemoteResult<void>> {
    if (signal?.aborted) {
      return {ok: false, error: {code: 'loop/transport', message: ''}}
    }

    const selected = await this.ports.selectModel({
      sessionId: input.sessionId,
      provider: input.choice.providerId,
      model: input.choice.modelId,
    }, signal)
    if (!selected.ok) return selected
    if (signal?.aborted) {
      return {ok: false, error: {code: 'loop/transport', message: ''}}
    }
    if (selected.value.selected.provider !== input.choice.providerId ||
        selected.value.selected.model !== input.choice.modelId) {
      return {ok: false, error: {code: 'loop/model-selection-mismatch', message: ''}}
    }
    return await this.awaitProjection(input.sessionId, input.choice, signal)
  }

  private async awaitProjection(
    sessionId: string,
    choice: ModelChoice,
    signal?: AbortSignal,
  ): Promise<RemoteResult<void>> {
    let observation: ModelSelectionObservation
    try {
      observation = this.ports.observeModelSelection(sessionId, signal)
    } catch {
      return {ok: false, error: {code: 'loop/transport', message: ''}}
    }
    return await new Promise(resolve => {
      let settled = false
      let unsubscribe = (): void => {}
      const timeout = this.ports.projectionTimeoutMs ?? 15_000
      const finish = (result: RemoteResult<void>): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        try {
          unsubscribe()
        } catch {}
        try {
          observation.release()
        } catch {}
        resolve(result)
      }
      const check = (): void => {
        let snapshot: unknown
        try {
          snapshot = observation.getSnapshot()
        } catch {
          finish({ok: false, error: {code: 'loop/transport', message: ''}})
          return
        }
        if (exactProjectedSelection(snapshot, choice)) {
          finish({ok: true, value: undefined})
        }
      }
      const onAbort = (): void => {
        finish({ok: false, error: {code: 'loop/transport', message: ''}})
      }
      const timer = setTimeout(() => {
        finish({
          ok: false,
          error: {code: 'loop/model-selection-not-saved', message: ''},
        })
      }, timeout)
      try {
        unsubscribe = observation.subscribe(check)
      } catch {
        finish({ok: false, error: {code: 'loop/transport', message: ''}})
        return
      }
      signal?.addEventListener('abort', onAbort, {once: true})
      if (signal?.aborted) {
        onAbort()
        return
      }
      check()
    })
  }
}

import type {InputTriggerServiceContract, InputTriggerSource} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import {InputCatalogCache} from './input-catalog-cache.ts'
import {loopCatalogDisplayName} from './loop-catalog-display.ts'
import type {LoopHostClient, SkillCatalogEventFrame, WorkspaceRef} from './types.ts'

type Entry = {readonly kbId: string; readonly name: string}
type Reference = Entry & {readonly sessionId: string; readonly version: 1}
const sourceName = 'loop-knowledge'

export function encodeKnowledgeReference(ref: Reference): string {
  const bytes = new TextEncoder().encode(JSON.stringify(ref))
  return `<loop-knowledge-ref>${btoa(String.fromCharCode(...bytes)).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')}</loop-knowledge-ref>`
}

export function decodeKnowledgeReference(value: string): Reference {
  const match = /^<loop-knowledge-ref>([A-Za-z0-9_-]{1,8192})<\/loop-knowledge-ref>$/u.exec(value)
  if (match === null) throw new Error('Invalid Loop knowledge reference')
  const encoded = match[1]!.replace(/-/gu, '+').replace(/_/gu, '/')
  const ref = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')), c => c.charCodeAt(0))))
  if (ref?.version !== 1 || typeof ref.sessionId !== 'string' || !ref.sessionId ||
      typeof ref.kbId !== 'string' || !ref.kbId || ref.kbId.length > 255 ||
      typeof ref.name !== 'string' || !ref.name || ref.name.length > 1024) throw new Error('Invalid Loop knowledge reference')
  return {version: 1, sessionId: ref.sessionId, kbId: ref.kbId, name: ref.name}
}

interface Options {
  readonly remote: LoopHostClient
  readonly workspaceForSession: (sessionId: string) => WorkspaceRef | undefined
  readonly catalogEvents: (sessionId: string, signal: AbortSignal) => AsyncIterable<SkillCatalogEventFrame>
  readonly failureText: string
  readonly showFailure: (message: string) => void
}

/** KB metadata shares the Skill/Agent stream and common generation-fenced cache. */
export class LoopKnowledgeRuntime {
  private readonly sessions = new Map<string, {workspaceId: string; cache: InputCatalogCache<Entry>; controller: AbortController}>()
  private readonly options: Options
  constructor(options: Options) { this.options = options }

  private session(sessionId: string) {
    const workspaceId = this.options.workspaceForSession(sessionId)?.workspaceId
    if (!workspaceId) throw new Error(this.options.failureText)
    const previous = this.sessions.get(sessionId)
    if (previous?.workspaceId === workspaceId && !previous.controller.signal.aborted) return previous
    previous?.controller.abort()
    if (this.sessions.size >= 64) {
      const oldest = this.sessions.keys().next().value
      if (oldest !== undefined) { this.sessions.get(oldest)?.controller.abort(); this.sessions.delete(oldest) }
    }
    const controller = new AbortController()
    const cache = new InputCatalogCache<Entry>({serverBaseUrl: '', accountId: '', installationId: '', workspaceId}, async (cursor, signal) => {
      if (!this.options.remote.knowledgeCatalog) throw new Error(this.options.failureText)
      const result = await this.options.remote.knowledgeCatalog({workspaceId, sessionId, ...(cursor ? {cursor} : {})}, signal)
      if (!result.ok) throw new Error(`${this.options.failureText} (${result.error.code}) ${result.error.message}`)
      const {scope, data} = result.value
      if (scope.sessionId !== sessionId || scope.hostWorkspaceId !== workspaceId) throw new Error(this.options.failureText)
      return {...data, revision: '', identity: scope}
    })
    const entry = {workspaceId, cache, controller}
    this.sessions.set(sessionId, entry)
    void (async () => {
      try {
        for await (const frame of this.options.catalogEvents(sessionId, controller.signal)) {
          if (controller.signal.aborted) break
          // Metadata is only fetched on the next explicit request. Never mutate an open menu.
          if (frame.type === 'ready' || frame.event.kind === 'catalog.changed' || frame.event.kind === 'subscription.changed') cache.invalidate()
        }
      } catch {} finally {
        cache.invalidate()
        controller.abort()
      }
    })()
    return entry
  }

  registerSource(inputTriggers: InputTriggerServiceContract, section: string): () => void {
    const owner = this
    const source: InputTriggerSource = {
      trigger: '/', name: sourceName, order: 26, showGroupTitle: true,
      codec: {
        clipboardText: value => { try { return `/${decodeKnowledgeReference(value).name}` } catch { return '' } },
        serialize: async (value, signal) => {
          signal.throwIfAborted()
          try {
            const ref = decodeKnowledgeReference(value)
            if (!owner.sessions.has(ref.sessionId)) throw new Error()
            return encodeKnowledgeReference(ref)
          } catch { throw new Error(owner.options.failureText) }
        },
      },
      async candidates(session, request) {
        try {
          const {cache} = owner.session(session.sessionId)
          const entries = await cache.find(request.query.replace(/^loop(?:\s*[·:]\s*|\s+|$)/iu, ''),
            (entry, query) => loopCatalogDisplayName(entry.name).toLocaleLowerCase().includes(query) || entry.kbId.toLocaleLowerCase().includes(query), request.signal, 2)
          return [...entries].sort((a,b) => a.name.localeCompare(b.name) || a.kbId.localeCompare(b.kbId)).map(entry => ({
            name: loopCatalogDisplayName(entry.name), label: loopCatalogDisplayName(entry.name), section,
            description: section, hint: entry.kbId,
            value: encodeKnowledgeReference({...entry, sessionId: session.sessionId, version: 1}),
          }))
        } catch (error) {
          if (request.signal.aborted) return []
          owner.options.showFailure(error instanceof Error ? error.message : owner.options.failureText)
          throw error
        }
      },
      onPick(pick) {
        if (pick.action !== 'pick' || typeof pick.candidate.value !== 'string') return
        try {
          const ref = decodeKnowledgeReference(pick.candidate.value)
          if (ref.sessionId !== pick.session.sessionId) return
          return {insert: {source: sourceName, ref: encodeKnowledgeReference(ref), label: loopCatalogDisplayName(ref.name), appearance: 'skill', clipboardText: `/${ref.name}`}}
        } catch { owner.options.showFailure(owner.options.failureText) }
      },
    }
    return inputTriggers.registerSource(source)
  }

  dispose(): void {
    for (const entry of this.sessions.values()) entry.controller.abort()
    this.sessions.clear()
  }
}

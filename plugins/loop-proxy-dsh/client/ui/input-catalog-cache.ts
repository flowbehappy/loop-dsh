/** Small shared cache mechanics for local-first `@` directories and Loop `/` Skills. */

export interface CatalogScopeIdentity {
  readonly serverBaseUrl: string
  readonly accountId: string
  readonly installationId: string
  readonly workspaceId: string
  readonly hostWorkspaceId?: string
  readonly bindingId?: string
  readonly bindingRevision?: string
  readonly bindingEpoch?: string
  readonly projectId?: string
  readonly agentId?: string
  readonly identityFingerprint?: string
}

export interface CatalogPage<T> {
  readonly items: readonly T[]
  readonly revision: string
  readonly nextCursor?: string
  readonly hasMore: boolean
  readonly truncated?: boolean
  readonly identity?: CatalogScopeIdentity
}

export interface CatalogCacheState {
  readonly loaded: boolean
  readonly dirty: boolean
  readonly complete: boolean
  readonly loadedPages: number
  readonly revision: string
}

export function catalogScopeKey(
  catalog: string,
  sessionId: string,
  scope: CatalogScopeIdentity,
): string {
  return JSON.stringify([
    catalog,
    sessionId,
    scope.serverBaseUrl,
    scope.accountId,
    scope.installationId,
    scope.workspaceId,
    scope.hostWorkspaceId ?? "",
    scope.bindingId ?? "",
    scope.bindingRevision ?? "",
    scope.bindingEpoch ?? "",
    scope.projectId ?? "",
    scope.agentId ?? "",
    scope.identityFingerprint ?? "",
  ])
}

export class InputCatalogCache<T> {
  private readonly fetchPage: (
    cursor: string | undefined,
    signal: AbortSignal,
  ) => Promise<CatalogPage<T>>
  private identity: CatalogScopeIdentity
  private entries: T[] = []
  private nextCursor: string | undefined
  private complete = false
  private revision = ''
  private dirty = false
  private loaded = false
  private loadedPages = 0
  private generation = 0
  private firstLoad: {readonly generation: number; readonly promise: Promise<void>} | null = null
  private nextLoad: {
    readonly generation: number
    readonly cursor: string
    readonly promise: Promise<boolean>
  } | null = null

  constructor(
    identity: CatalogScopeIdentity,
    fetchPage: (
      cursor: string | undefined,
      signal: AbortSignal,
    ) => Promise<CatalogPage<T>>,
  ) {
    this.identity = identity
    this.fetchPage = fetchPage
  }

  setIdentity(identity: CatalogScopeIdentity): boolean {
    if (sameIdentity(this.identity, identity)) return false
    this.identity = identity
    this.reset()
    return true
  }

  private adoptAcceptedIdentity(identity: CatalogScopeIdentity, generation: number): boolean {
    if (generation !== this.generation) return false
    if (sameIdentity(this.identity, identity)) return false
    this.identity = identity
    if (this.loaded) {
      // The in-flight response that established this identity is itself the
      // authoritative first page for the new scope. Keep its generation fence,
      // but discard entries from the previous scope.
      this.entries = []
      this.nextCursor = undefined
      this.complete = false
      this.revision = ''
      this.loaded = false
      this.loadedPages = 0
      // Preserve an invalidation that arrived while this authoritative page
      // was in flight; a second read is cheap compared with serving stale data.
    }
    return true
  }

  scopeIdentity(): CatalogScopeIdentity {
    return this.identity
  }

  reset(): void {
    this.generation += 1
    this.entries = []
    this.nextCursor = undefined
    this.complete = false
    this.revision = ''
    this.dirty = false
    this.loaded = false
    this.loadedPages = 0
    this.firstLoad = null
    this.nextLoad = null
  }

  invalidate(): boolean {
    this.generation += 1
    this.dirty = true
    this.firstLoad = null
    this.nextLoad = null
    return true
  }

  state(): CatalogCacheState {
    return {
      loaded: this.loaded,
      dirty: this.dirty,
      complete: this.complete,
      loadedPages: this.loadedPages,
      revision: this.revision,
    }
  }

  async ensureLoaded(signal: AbortSignal): Promise<readonly T[]> {
    if (this.loaded && !this.dirty) return this.entries
    if (this.firstLoad !== null) {
      try {
        await this.firstLoad.promise
      } catch (error) {
        if (signal.aborted) throw error
        return await this.ensureLoaded(signal)
      }
      if (this.dirty) return await this.ensureLoaded(signal)
      return this.entries
    }
    const generation = this.generation
    const promise = this.loadFirst(signal, generation).finally(() => {
      if (this.firstLoad?.promise === promise) this.firstLoad = null
    })
    this.firstLoad = {generation, promise}
    await promise
    if (generation !== this.generation) return await this.ensureLoaded(signal)
    if (this.dirty) return await this.ensureLoaded(signal)
    return this.entries
  }

  async find(
    query: string,
    matches: (entry: T, foldedQuery: string) => boolean,
    signal: AbortSignal,
    maxAdditionalPages = 2,
  ): Promise<readonly T[]> {
    let entries = await this.ensureLoaded(signal)
    const folded = query.trim().toLocaleLowerCase()
    if (folded === '') return entries
    let found = entries.filter(entry => matches(entry, folded))
    let pages = 0
    while (found.length === 0 && !this.complete && pages < maxAdditionalPages) {
      pages += 1
      const loaded = await this.loadNext(signal)
      if (!loaded) {
        entries = await this.ensureLoaded(signal)
        found = entries.filter(entry => matches(entry, folded))
        continue
      }
      signal.throwIfAborted()
      entries = this.entries
      found = entries.filter(entry => matches(entry, folded))
    }
    return found
  }

  private async loadFirst(signal: AbortSignal, generation: number): Promise<void> {
    signal.throwIfAborted()
    const page = await this.fetchPage(undefined, signal)
    signal.throwIfAborted()
    if (generation !== this.generation) return
    if (page.identity !== undefined) this.adoptAcceptedIdentity(page.identity, generation)
    this.entries = [...page.items]
    this.revision = page.revision
    this.nextCursor = page.nextCursor
    this.complete = !page.hasMore && page.nextCursor === undefined && page.truncated !== true
    this.loaded = true
    this.loadedPages = 1
    this.dirty = false
  }

  private async loadNext(signal: AbortSignal): Promise<boolean> {
    signal.throwIfAborted()
    if (this.complete || this.nextCursor === undefined) return true
    const cursor = this.nextCursor
    const generation = this.generation
    if (this.nextLoad !== null &&
        this.nextLoad.generation === generation &&
        this.nextLoad.cursor === cursor) {
      try {
        return await this.nextLoad.promise
      } catch (error) {
        if (signal.aborted) throw error
        return await this.loadNext(signal)
      }
    }
    const promise = (async () => {
      const page = await this.fetchPage(cursor, signal)
      signal.throwIfAborted()
      if (generation !== this.generation) return false
      if ((page.identity !== undefined && !sameIdentity(page.identity, this.identity)) ||
          (page.revision !== '' && this.revision !== '' && page.revision !== this.revision)) {
        // A cursor page belongs to the first page's identity and revision.
        // Rebuild after a change rather than retaining removed/stale entries.
        this.generation += 1
        this.dirty = true
        return false
      }
      this.entries = [...this.entries, ...page.items]
      this.revision = page.revision || this.revision
      this.nextCursor = page.nextCursor
      this.complete = !page.hasMore && page.nextCursor === undefined && page.truncated !== true
      this.loadedPages += 1
      return true
    })().finally(() => {
      if (this.nextLoad?.promise === promise) this.nextLoad = null
    })
    this.nextLoad = {generation, cursor, promise}
    return await promise
  }
}

function sameIdentity(left: CatalogScopeIdentity, right: CatalogScopeIdentity): boolean {
  return left.serverBaseUrl === right.serverBaseUrl &&
    left.accountId === right.accountId &&
    left.installationId === right.installationId &&
    left.workspaceId === right.workspaceId &&
    left.hostWorkspaceId === right.hostWorkspaceId &&
    left.bindingId === right.bindingId &&
    left.bindingRevision === right.bindingRevision &&
    left.bindingEpoch === right.bindingEpoch &&
    left.projectId === right.projectId &&
    left.agentId === right.agentId &&
    left.identityFingerprint === right.identityFingerprint
}

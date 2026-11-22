import test from 'node:test'
import assert from 'node:assert/strict'

import {InputCatalogCache, catalogScopeKey} from '../input-catalog-cache.ts'

const identity = {
  serverBaseUrl: 'https://loop.test',
  accountId: 'usr_1',
  installationId: 'ins_1',
  workspaceId: 'wsp_1',
  bindingRevision: 'rev_1',
  agentId: 'agt_1',
}
type ScopedPage = {
  items: string[]
  revision: string
  hasMore: boolean
  identity?: typeof identity
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return {promise, resolve, reject}
}

test('warm first page is single-flight and a warm read performs no second fetch', async () => {
  let calls = 0
  const cache = new InputCatalogCache(identity, async () => {
    calls += 1
    return {items: ['a'], revision: 'r1', hasMore: false}
  })
  const signal = new AbortController().signal
  assert.deepEqual(await cache.ensureLoaded(signal), ['a'])
  assert.deepEqual(await cache.find('a', entry => entry.includes('a'), signal), ['a'])
  assert.equal(calls, 1)
})

test('repeated invalidations coalesce into one authoritative refresh', async () => {
  let calls = 0
  const cache = new InputCatalogCache(identity, async () => {
    calls += 1
    return {items: [calls === 1 ? 'old' : 'new'], revision: `r${calls}`, hasMore: false}
  })
  const signal = new AbortController().signal
  assert.deepEqual(await cache.ensureLoaded(signal), ['old'])
  assert.equal(cache.invalidate(), true)
  assert.equal(cache.invalidate(), true)
  assert.deepEqual(await cache.ensureLoaded(signal), ['new'])
  assert.equal(calls, 2)
})

test('invalidation during an in-flight page fences the old response', async () => {
  const first = deferred<{items: string[]; revision: string; hasMore: boolean}>()
  let calls = 0
  const cache = new InputCatalogCache(identity, async () => {
    calls += 1
    if (calls === 1) return await first.promise
    return {items: ['fresh'], revision: 'r2', hasMore: false}
  })
  const signal = new AbortController().signal
  const loading = cache.ensureLoaded(signal)
  cache.invalidate()
  first.resolve({items: ['stale'], revision: 'r1', hasMore: false})
  assert.deepEqual(await loading, ['fresh'])
  assert.equal(calls, 2)
})

test('repeated invalidations rebuild once and preserve duplicate coalescing', async () => {
  let calls = 0
  const cache = new InputCatalogCache(identity, async () => {
    calls += 1
    return {items: [`v${calls}`], revision: `r${calls}`, hasMore: false}
  })
  const signal = new AbortController().signal
  assert.deepEqual(await cache.ensureLoaded(signal), ['v1'])
  assert.equal(cache.invalidate(), true)
  assert.deepEqual(await cache.ensureLoaded(signal), ['v2'])
  assert.equal(cache.invalidate(), true)
  assert.equal(cache.state().loaded, true)
  assert.deepEqual(await cache.ensureLoaded(signal), ['v3'])
})

test('identity changes and reset reject old cache state', async () => {
  let calls = 0
  const cache = new InputCatalogCache(identity, async () => {
    calls += 1
    return {items: [`v${calls}`], revision: `r${calls}`, hasMore: false}
  })
  const signal = new AbortController().signal
  assert.deepEqual(await cache.ensureLoaded(signal), ['v1'])
  cache.setIdentity({...identity, workspaceId: 'wsp_2'})
  assert.deepEqual(await cache.ensureLoaded(signal), ['v2'])
  cache.reset()
  assert.deepEqual(await cache.ensureLoaded(signal), ['v3'])
  assert.equal(catalogScopeKey('skills', 'ses_1', identity).includes('wsp_1'), true)
})

test('local query searches loaded entries before requesting another page', async () => {
  const cursors: Array<string | undefined> = []
  const cache = new InputCatalogCache(identity, async cursor => {
    cursors.push(cursor)
    return cursor === undefined
      ? {items: ['alpha'], revision: 'r1', nextCursor: 'next', hasMore: true}
      : {items: ['beta'], revision: 'r1', hasMore: false}
  })
  const signal = new AbortController().signal
  assert.deepEqual(await cache.find('alpha', entry => entry.includes('alpha'), signal), ['alpha'])
  assert.deepEqual(cursors, [undefined])
  assert.deepEqual(await cache.find('beta', entry => entry.includes('beta'), signal), ['beta'])
  assert.deepEqual(cursors, [undefined, 'next'])
})

test('concurrent searches single-flight the same next cursor and generation', async () => {
  const releases: Array<(value: ScopedPage) => void> = []
  const cursors: Array<string | undefined> = []
  const cache = new InputCatalogCache(identity, async cursor => {
    cursors.push(cursor)
    if (cursor === undefined) {
      return {items: ['alpha'], revision: 'r1', nextCursor: 'next', hasMore: true}
    }
    return await new Promise(resolve => releases.push(value => resolve({
      ...value,
      identity,
    })))
  })
  const signal = new AbortController().signal
  await cache.ensureLoaded(signal)
  const left = cache.find('missing-a', () => false, signal, 1)
  const right = cache.find('missing-b', () => false, signal, 1)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(releases.length, 1)
  releases[0]!({items: ['beta'], revision: 'r1', hasMore: false})
  await Promise.all([left, right])
  assert.deepEqual(cursors, [undefined, 'next'])
  assert.equal(cache.state().loadedPages, 2)
  assert.equal(cache.state().complete, true)
})

test('late response from an old generation cannot replace or clear the new scope', async () => {
  let releaseOld!: (value: ScopedPage) => void
  const oldGate = new Promise<ScopedPage>(resolve => { releaseOld = resolve })
  let calls = 0
  const cache = new InputCatalogCache(identity, async () => {
    calls += 1
    if (calls === 1) return await oldGate
    return {
      items: ['new'],
      revision: 'new',
      hasMore: false,
      identity: {...identity, workspaceId: 'wsp_new'},
    }
  })
  const signal = new AbortController().signal
  const oldLoad = cache.ensureLoaded(signal)
  cache.invalidate()
  assert.deepEqual(await cache.ensureLoaded(signal), ['new'])
  releaseOld({
    items: ['old-late'],
    revision: 'old',
    hasMore: false,
    identity: {...identity, workspaceId: 'wsp_old'},
  })
  await oldLoad
  assert.deepEqual(await cache.ensureLoaded(signal), ['new'])
  assert.equal(cache.scopeIdentity().workspaceId, 'wsp_new')
  assert.equal(cache.state().revision, 'new')
})

test('an aborted page can be rebuilt from a new request signal', async () => {
  let calls = 0
  const cache = new InputCatalogCache(identity, async (_cursor, signal) => {
    calls += 1
    if (calls === 1) {
      await new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {once: true})
      })
    }
    return {items: ['fresh'], revision: 'fresh', hasMore: false, identity}
  })
  const first = new AbortController()
  const loading = cache.ensureLoaded(first.signal)
  first.abort(new Error('cancel search'))
  await assert.rejects(loading)
  assert.deepEqual(await cache.ensureLoaded(new AbortController().signal), ['fresh'])
  assert.equal(calls, 2)
})

test('a concurrent first-page waiter survives the original request abort', async () => {
  let calls = 0
  const cache = new InputCatalogCache(identity, async (_cursor, signal) => {
    calls += 1
    if (calls === 1) {
      await new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {once: true})
      })
    }
    return {items: ['fresh'], revision: 'fresh', hasMore: false, identity}
  })
  const first = new AbortController()
  const second = new AbortController()
  const firstLoad = cache.ensureLoaded(first.signal)
  const secondLoad = cache.ensureLoaded(second.signal)
  first.abort(new Error('first menu closed'))
  await assert.rejects(firstLoad)
  assert.deepEqual(await secondLoad, ['fresh'])
  assert.equal(calls, 2)
})

test('a concurrent next-page waiter survives the original request abort', async () => {
  let nextCalls = 0
  const cache = new InputCatalogCache(identity, async (cursor, signal) => {
    if (cursor === undefined) {
      return {items: ['alpha'], revision: 'r1', nextCursor: 'next', hasMore: true}
    }
    nextCalls += 1
    if (nextCalls === 1) {
      await new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {once: true})
      })
    }
    return {items: ['beta'], revision: 'r1', hasMore: false, identity}
  })
  await cache.ensureLoaded(new AbortController().signal)
  const first = new AbortController()
  const second = new AbortController()
  const firstFind = cache.find('missing-a', () => false, first.signal, 1)
  const secondFind = cache.find('beta', entry => entry === 'beta', second.signal, 1)
  while (nextCalls === 0) await new Promise(resolve => setTimeout(resolve, 0))
  first.abort(new Error('first menu closed'))
  await assert.rejects(firstFind)
  assert.deepEqual(await secondFind, ['beta'])
  assert.equal(nextCalls, 2)
  assert.equal(cache.state().loadedPages, 2)
})

test('a changed catalog revision rebuilds instead of mixing pages from different snapshots', async () => {
  const cursors: (string | undefined)[] = []
  const cache = new InputCatalogCache(identity, async cursor => {
    cursors.push(cursor)
    if (cursors.length === 1) return {
      items: ['retired'], revision: 'r1', hasMore: true, nextCursor: 'page-2',
    }
    if (cursor !== undefined) return {
      items: ['new-second-page'], revision: 'r2', hasMore: false,
    }
    return {items: ['new-first-page'], revision: 'r2', hasMore: false}
  })
  const signal = new AbortController().signal
  await cache.ensureLoaded(signal)
  assert.deepEqual(await cache.find('new', (entry, query) => entry.includes(query), signal), ['new-first-page'])
  assert.deepEqual(cursors, [undefined, 'page-2', undefined])
  assert.deepEqual(await cache.ensureLoaded(signal), ['new-first-page'])
  assert.equal(cache.state().revision, 'r2')
})

test('catalog changes during pagination cannot exceed the search page-attempt budget', async () => {
  let calls = 0
  let revision = 0
  const cache = new InputCatalogCache(identity, async cursor => {
    calls += 1
    if (cursor !== undefined) revision += 1
    return {items: ['unrelated'], revision: `r${revision}`, hasMore: true, nextCursor: 'next'}
  })
  const found = await cache.find('missing', (entry, query) => entry.includes(query), new AbortController().signal, 2)
  assert.deepEqual(found, [])
  assert.equal(calls, 5, 'one first page plus at most two next-page attempts and their rebuilds')
  assert.equal(cache.state().revision, 'r2')
})

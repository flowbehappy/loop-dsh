/** Tiny framework-neutral immutable snapshot store used by the Loop UI. */

export interface ObservableSnapshot<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

export interface MutableSnapshotStore<T> extends ObservableSnapshot<T> {
  set(next: T): void
}

/**
 * Create one immutable snapshot source.
 * @param initial - initial state.
 * @returns snapshot and replacement writer.
 */
export function createSnapshotStore<T>(initial: T): MutableSnapshotStore<T> {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set(next) {
      if (Object.is(next, current)) return
      current = next
      for (const listener of [...listeners]) listener()
    },
  }
}

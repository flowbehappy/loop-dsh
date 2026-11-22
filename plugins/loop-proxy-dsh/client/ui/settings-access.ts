/** Public Settings-shell callbacks captured from the live launcher owner. */

export interface SettingsAccessSnapshot {
  readonly settingsOpen: boolean
}

export interface SettingsAccess {
  bind(openSettings: () => void): () => void
  setSettingsOpen(open: boolean): void
  openApiKey(): void
  getSnapshot(): SettingsAccessSnapshot
  subscribe(listener: () => void): () => void
}

/**
 * Keep Desktop onboarding independent of DOM lookup while the public
 * `settings.launcher` registration supplies the shell-owned settings actions.
 * A later launcher remount replaces the callbacks; its cleanup only clears the
 * binding it still owns.
 */
export class LoopSettingsAccess implements SettingsAccess {
  private openSettingsAction: (() => void) | null = null
  private snapshot: SettingsAccessSnapshot = Object.freeze({settingsOpen: false})
  private readonly listeners = new Set<() => void>()
  private generation = 0

  bind(openSettings: () => void): () => void {
    const generation = ++this.generation
    this.openSettingsAction = openSettings
    return () => {
      if (generation !== this.generation) return
      this.openSettingsAction = null
    }
  }

  setSettingsOpen(settingsOpen: boolean): void {
    if (settingsOpen === this.snapshot.settingsOpen) return
    this.snapshot = Object.freeze({settingsOpen})
    for (const listener of this.listeners) listener()
  }

  openApiKey(): void {
    this.openSettingsAction?.()
  }

  getSnapshot(): SettingsAccessSnapshot {
    return this.snapshot
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}

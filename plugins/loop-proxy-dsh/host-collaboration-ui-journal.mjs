import {createHash} from "node:crypto"
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs"
import {join} from "node:path"

const MAX_EVENTS = 512
const MAX_JOURNAL_BYTES = 1 << 20

/**
 * Bounded fsync-before-publish UI journal. It only carries presentation state;
 * Loop remains authoritative and Proxy delivery/queries reconstruct truth.
 */
export class CollaborationUIJournal {
  constructor(stateHome) {
    this.root = join(stateHome, "collaboration-ui")
    mkdirSync(this.root, {recursive: true, mode: 0o700})
  }

  path(scope) {
    const digest = createHash("sha256").update(JSON.stringify(scope)).digest("hex")
    return join(this.root, `${digest}.jsonl`)
  }

  append(scope, event) {
    const path = this.path(scope)
    const fd = openSync(path, "a", 0o600)
    try {
      writeSync(fd, `${JSON.stringify(event)}\n`)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    if (statSync(path).size > MAX_JOURNAL_BYTES) this.compact(path)
  }

  load(scope, afterEventId) {
    const path = this.path(scope)
    if (!existsSync(path)) return {events: [], complete: afterEventId === undefined}
    const events = readFileSync(path, "utf8")
      .split("\n")
      .filter(Boolean)
      .slice(-MAX_EVENTS)
      .map(line => {
        try { return JSON.parse(line) } catch { return undefined }
      })
      .filter(Boolean)
    if (afterEventId === undefined) return {events: [], complete: true}
    const index = events.findIndex(event => event.eventId === afterEventId)
    return index < 0
      ? {events: [], complete: false}
      : {events: events.slice(index + 1), complete: true}
  }

  compact(path) {
    const bounded = readFileSync(path, "utf8")
      .split("\n")
      .filter(Boolean)
      .slice(-MAX_EVENTS)
    const temporary = `${path}.tmp-${process.pid}`
    try {
      const fd = openSync(temporary, "wx", 0o600)
      try {
        writeSync(fd, bounded.length === 0 ? "" : `${bounded.join("\n")}\n`)
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
      renameSync(temporary, path)
    } catch (error) {
      try { unlinkSync(temporary) } catch {}
      throw error
    }
  }
}

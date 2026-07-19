import type { PmResourceRow } from './pm-resource-catalog'

const MAX_HISTORY = 50

export function cloneResourceRows(rows: readonly PmResourceRow[]): PmResourceRow[] {
  return rows.map((row) => ({ ...row }))
}

/** In-memory undo/redo stack for resource table edits (before persist). */
export class ResourceHistoryStack {
  private undo: PmResourceRow[][] = []
  private redo: PmResourceRow[][] = []
  private lastPushAt = 0

  get canUndo(): boolean {
    return this.undo.length > 0
  }

  get canRedo(): boolean {
    return this.redo.length > 0
  }

  clear(): void {
    this.undo = []
    this.redo = []
    this.lastPushAt = 0
  }

  /**
   * Capture state before a mutation.
   * When `coalesceMs` is set and a push happened recently, skip adding a frame so
   * rapid cell typing undoes as one edit.
   */
  pushBeforeChange(snapshot: PmResourceRow[], options?: { coalesceMs?: number }): void {
    const now = Date.now()
    const coalesceMs = options?.coalesceMs
    if (
      coalesceMs != null &&
      coalesceMs > 0 &&
      this.undo.length > 0 &&
      now - this.lastPushAt < coalesceMs
    ) {
      this.redo = []
      this.lastPushAt = now
      return
    }
    this.undo.push(snapshot)
    if (this.undo.length > MAX_HISTORY) this.undo.shift()
    this.redo = []
    this.lastPushAt = now
  }

  popUndo(current: PmResourceRow[]): PmResourceRow[] | null {
    const previous = this.undo.pop()
    if (!previous) return null
    this.redo.push(current)
    if (this.redo.length > MAX_HISTORY) this.redo.shift()
    this.lastPushAt = 0
    return previous
  }

  popRedo(current: PmResourceRow[]): PmResourceRow[] | null {
    const next = this.redo.pop()
    if (!next) return null
    this.undo.push(current)
    if (this.undo.length > MAX_HISTORY) this.undo.shift()
    this.lastPushAt = 0
    return next
  }
}

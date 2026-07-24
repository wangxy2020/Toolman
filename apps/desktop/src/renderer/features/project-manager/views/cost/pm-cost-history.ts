import type { PmCostRow } from './pm-cost-catalog'

const MAX_HISTORY = 50

export function cloneCostRows(rows: readonly PmCostRow[]): PmCostRow[] {
  return rows.map((row) => ({ ...row }))
}

/** In-memory undo/redo stack for cost table edits (before persist). */
export class CostHistoryStack {
  private undo: PmCostRow[][] = []
  private redo: PmCostRow[][] = []
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

  pushBeforeChange(snapshot: PmCostRow[], options?: { coalesceMs?: number }): void {
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

  popUndo(current: PmCostRow[]): PmCostRow[] | null {
    const previous = this.undo.pop()
    if (!previous) return null
    this.redo.push(current)
    if (this.redo.length > MAX_HISTORY) this.redo.shift()
    this.lastPushAt = 0
    return previous
  }

  popRedo(current: PmCostRow[]): PmCostRow[] | null {
    const next = this.redo.pop()
    if (!next) return null
    this.undo.push(current)
    if (this.undo.length > MAX_HISTORY) this.undo.shift()
    this.lastPushAt = 0
    return next
  }
}

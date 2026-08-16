import type { PmWorkItem, PmWorkItemRelation, PmWorkItemRelationType } from '@toolman/shared'

export const DAY_MS = 24 * 60 * 60 * 1000

export function startOfLocalDay(ms: number): number {
  const date = new Date(ms)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function addDays(ms: number, days: number): number {
  return startOfLocalDay(ms) + days * DAY_MS
}

/** Inclusive calendar-day span (start==finish → 1 day). */
export function durationDaysBetween(startMs: number, finishMs: number): number {
  const start = startOfLocalDay(startMs)
  const finish = startOfLocalDay(finishMs)
  return Math.max(1, Math.round((finish - start) / DAY_MS) + 1)
}

/** Inclusive finish: duration 1 keeps start==finish. */
export function finishFromStartAndDuration(startMs: number, durationDays: number): number {
  return addDays(startMs, Math.max(1, durationDays) - 1)
}

/**
 * OpenProject-style constraint: lag 0 on FS means successor starts
 * the next calendar day after the predecessor finishes.
 */
export function constrainStartByRelation(
  type: PmWorkItemRelationType,
  lagDays: number,
  predStart: number,
  predFinish: number,
  durationDays: number,
): { startMs: number; finishMs: number } {
  const lag = lagDays
  switch (type) {
    case 'SS': {
      const startMs = addDays(predStart, lag)
      return { startMs, finishMs: finishFromStartAndDuration(startMs, durationDays) }
    }
    case 'FF': {
      const finishMs = addDays(predFinish, lag)
      const startMs = addDays(finishMs, -(durationDays - 1))
      return { startMs, finishMs }
    }
    case 'SF': {
      const finishMs = addDays(predStart, lag)
      const startMs = addDays(finishMs, -(durationDays - 1))
      return { startMs, finishMs }
    }
    case 'FS':
    default: {
      // lag 0 → next day after finish; lag N → N extra days after that
      const startMs = addDays(predFinish, 1 + lag)
      return { startMs, finishMs: finishFromStartAndDuration(startMs, durationDays) }
    }
  }
}

export type ScheduledRange = {
  startMs: number
  finishMs: number
  durationDays: number
  autoScheduled: boolean
}

/** True when `ancestorId` appears on `nodeId`'s parent chain. */
export function isAncestorOf(
  ancestorId: string,
  nodeId: string,
  byId: Map<string, PmWorkItem>,
): boolean {
  let current = byId.get(nodeId)
  const seen = new Set<string>()
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true
    if (seen.has(current.parentId)) break
    seen.add(current.parentId)
    current = byId.get(current.parentId)
  }
  return false
}

/**
 * Relations that participate in forward schedule / critical-path math.
 * Ancestor→descendant links are excluded: after 降级 the previous sibling often
 * becomes both parent and FS predecessor; keeping that edge creates resolve
 * cycles and wrong float.
 */
export function isSchedulableRelation(
  relation: Pick<PmWorkItemRelation, 'fromWorkItemId' | 'toWorkItemId'>,
  byId: Map<string, PmWorkItem>,
): boolean {
  if (!byId.has(relation.fromWorkItemId) || !byId.has(relation.toWorkItemId)) return false
  if (isAncestorOf(relation.fromWorkItemId, relation.toWorkItemId, byId)) return false
  if (isAncestorOf(relation.toWorkItemId, relation.fromWorkItemId, byId)) return false
  return true
}

/** Build early ranges from stored dates only (no predecessor push / no parent rollup). */
export function rangesFromStoredItems(
  items: readonly PmWorkItem[],
): Map<string, ScheduledRange> {
  const result = new Map<string, ScheduledRange>()
  for (const item of items) {
    if (item.type === 'milestone') {
      const startMs = startOfLocalDay(
        item.startDate ?? item.dueDate ?? item.updatedAt ?? Date.now(),
      )
      result.set(item.id, {
        startMs,
        finishMs: startMs,
        durationDays: 1,
        autoScheduled: false,
      })
      continue
    }
    const durationDays =
      item.startDate != null && item.dueDate != null
        ? durationDaysBetween(item.startDate, item.dueDate)
        : 7
    const startMs = startOfLocalDay(
      item.startDate ?? item.dueDate ?? item.updatedAt ?? Date.now(),
    )
    const finishMs =
      item.dueDate != null
        ? startOfLocalDay(item.dueDate)
        : finishFromStartAndDuration(startMs, durationDays)
    result.set(item.id, {
      startMs: Math.min(startMs, finishMs),
      finishMs: Math.max(startMs, finishMs),
      durationDays,
      autoScheduled: false,
    })
  }
  return result
}

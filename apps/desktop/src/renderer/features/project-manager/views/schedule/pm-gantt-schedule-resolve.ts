import type { PmWorkItem, PmWorkItemRelation } from '@toolman/shared'
import {
  addDays,
  constrainStartByRelation,
  durationDaysBetween,
  finishFromStartAndDuration,
  isSchedulableRelation,
  startOfLocalDay,
  type ScheduledRange,
} from './pm-gantt-schedule-dates'

/**
 * Compute effective dates for all items:
 * - leaf tasks with predecessors are auto-scheduled (OpenProject automatic mode)
 * - parents roll up to children envelope
 *
 * Ancestor↔descendant predecessor links are ignored. After 降级, the previous
 * sibling often becomes both parent and FS predecessor; using that link with
 * parent rollup creates a resolve cycle that shifts dates by one day on every
 * auto-schedule persist.
 */
export function scheduleWorkItems(
  items: PmWorkItem[],
  relations: PmWorkItemRelation[],
): Map<string, ScheduledRange> {
  const byId = new Map(items.map((item) => [item.id, item]))
  const childrenByParent = new Map<string, string[]>()
  for (const item of items) {
    if (!item.parentId) continue
    const list = childrenByParent.get(item.parentId) ?? []
    list.push(item.id)
    childrenByParent.set(item.parentId, list)
  }

  const incoming = new Map<string, PmWorkItemRelation[]>()
  for (const relation of relations) {
    if (!isSchedulableRelation(relation, byId)) continue
    const list = incoming.get(relation.toWorkItemId) ?? []
    list.push(relation)
    incoming.set(relation.toWorkItemId, list)
  }

  const result = new Map<string, ScheduledRange>()
  const visiting = new Set<string>()

  const baseDuration = (item: PmWorkItem): number => {
    if (item.type === 'milestone') return 1
    if (item.startDate != null && item.dueDate != null) {
      return durationDaysBetween(item.startDate, item.dueDate)
    }
    return 7
  }

  const baseRange = (item: PmWorkItem): ScheduledRange => {
    if (item.type === 'milestone') {
      const startMs = startOfLocalDay(item.startDate ?? item.dueDate ?? item.updatedAt ?? Date.now())
      return {
        startMs,
        finishMs: startMs,
        durationDays: 1,
        autoScheduled: false,
      }
    }
    const durationDays = baseDuration(item)
    const startMs = startOfLocalDay(item.startDate ?? item.dueDate ?? item.updatedAt ?? Date.now())
    const finishMs =
      item.dueDate != null
        ? startOfLocalDay(item.dueDate)
        : finishFromStartAndDuration(startMs, durationDays)
    return {
      startMs: Math.min(startMs, finishMs),
      finishMs: Math.max(startMs, finishMs),
      durationDays,
      autoScheduled: false,
    }
  }

  const resolve = (id: string): ScheduledRange => {
    const cached = result.get(id)
    if (cached) return cached
    if (visiting.has(id)) {
      const item = byId.get(id)!
      const fallback = baseRange(item)
      result.set(id, fallback)
      return fallback
    }
    visiting.add(id)

    const item = byId.get(id)
    if (!item) {
      visiting.delete(id)
      const empty: ScheduledRange = {
        startMs: startOfLocalDay(Date.now()),
        finishMs: addDays(Date.now(), 7),
        durationDays: 7,
        autoScheduled: false,
      }
      return empty
    }

    const childIds = childrenByParent.get(id) ?? []
    if (childIds.length > 0) {
      const childRanges = childIds.map((childId) => resolve(childId))
      const startMs = Math.min(...childRanges.map((range) => range.startMs))
      const finishMs = Math.max(...childRanges.map((range) => range.finishMs))
      const scheduled: ScheduledRange = {
        startMs,
        finishMs,
        durationDays: durationDaysBetween(startMs, finishMs),
        autoScheduled: true,
      }
      result.set(id, scheduled)
      visiting.delete(id)
      return scheduled
    }

    let scheduled = baseRange(item)
    const preds = incoming.get(id) ?? []
    if (preds.length > 0) {
      let constrainedStart = Number.NEGATIVE_INFINITY
      let constrainedFinish = Number.NEGATIVE_INFINITY
      const durationDays = scheduled.durationDays

      for (const relation of preds) {
        const pred = resolve(relation.fromWorkItemId)
        const next = constrainStartByRelation(
          relation.type,
          relation.lagDays,
          pred.startMs,
          pred.finishMs,
          durationDays,
        )
        constrainedStart = Math.max(constrainedStart, next.startMs)
        constrainedFinish = Math.max(constrainedFinish, next.finishMs)
      }

      if (Number.isFinite(constrainedStart)) {
        scheduled = {
          startMs: constrainedStart,
          finishMs: finishFromStartAndDuration(constrainedStart, durationDays),
          durationDays,
          autoScheduled: true,
        }
        // Prefer finish constraint when FF/SF pushed finish later
        if (Number.isFinite(constrainedFinish) && constrainedFinish > scheduled.finishMs) {
          scheduled = {
            startMs: addDays(constrainedFinish, -(durationDays - 1)),
            finishMs: constrainedFinish,
            durationDays,
            autoScheduled: true,
          }
        }
      }
    }

    result.set(id, scheduled)
    visiting.delete(id)
    return scheduled
  }

  for (const item of items) {
    resolve(item.id)
  }
  return result
}

export function applyScheduledRangesToItems(
  items: PmWorkItem[],
  scheduled: Map<string, ScheduledRange>,
): PmWorkItem[] {
  return items.map((item) => {
    const range = scheduled.get(item.id)
    if (!range) return item
    return {
      ...item,
      startDate: range.startMs,
      dueDate: range.finishMs,
    }
  })
}

/** Diff items that need persistence after auto-scheduling. */
export function collectScheduleUpdates(
  items: PmWorkItem[],
  scheduled: Map<string, ScheduledRange>,
): Array<{ id: string; startDate: number; dueDate: number }> {
  const updates: Array<{ id: string; startDate: number; dueDate: number }> = []
  for (const item of items) {
    const range = scheduled.get(item.id)
    if (!range || !range.autoScheduled) continue
    const start = item.startDate != null ? startOfLocalDay(item.startDate) : null
    const due = item.dueDate != null ? startOfLocalDay(item.dueDate) : null
    if (start === range.startMs && due === range.finishMs) continue
    updates.push({ id: item.id, startDate: range.startMs, dueDate: range.finishMs })
  }
  return updates
}

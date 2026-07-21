import type { PmWorkItem, PmWorkItemRelation, PmWorkItemRelationType } from '@toolman/shared'

const DAY_MS = 24 * 60 * 60 * 1000

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

/**
 * Critical-path (zero total float) from forward schedule + relation backward pass.
 * Includes leaf tasks/milestones and summary (parent) rows whose rolled-up float is 0.
 *
 * When the dependency graph has multiple weakly-connected components (common after
 * AI plans omit a link between phases), float is computed against each component's
 * own finish — not only the global project finish. Otherwise the early phase looks
 * non-critical while a mid-project dangling chain is marked critical.
 */
export function computeCriticalTaskIds(
  items: PmWorkItem[],
  relations: PmWorkItemRelation[],
  scheduled: Map<string, ScheduledRange>,
): Set<string> {
  const byId = new Map(items.map((item) => [item.id, item]))
  const childrenByParent = new Map<string, string[]>()
  for (const item of items) {
    if (!item.parentId) continue
    const list = childrenByParent.get(item.parentId) ?? []
    list.push(item.id)
    childrenByParent.set(item.parentId, list)
  }

  const leafIds = items
    .filter((item) => !(childrenByParent.get(item.id)?.length))
    .map((item) => item.id)

  if (leafIds.length === 0) return new Set()

  const validRelations = relations.filter((relation) => isSchedulableRelation(relation, byId))

  const parent = new Map<string, string>()
  const find = (id: string): string => {
    const current = parent.get(id) ?? id
    if (current === id) return id
    const root = find(current)
    parent.set(id, root)
    return root
  }
  const union = (a: string, b: string) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootA, rootB)
  }
  for (const item of items) parent.set(item.id, item.id)
  for (const relation of validRelations) {
    union(relation.fromWorkItemId, relation.toWorkItemId)
  }

  const componentOf = new Map<string, string>()
  for (const item of items) {
    componentOf.set(item.id, find(item.id))
  }

  let globalFinish = Number.NEGATIVE_INFINITY
  for (const id of leafIds) {
    const range = scheduled.get(id)
    if (range) globalFinish = Math.max(globalFinish, range.finishMs)
  }
  if (!Number.isFinite(globalFinish)) return new Set()

  const componentHasEdge = new Set<string>()
  for (const relation of validRelations) {
    componentHasEdge.add(componentOf.get(relation.fromWorkItemId)!)
  }

  const componentFinish = new Map<string, number>()
  for (const id of leafIds) {
    const range = scheduled.get(id)
    if (!range) continue
    const componentId = componentOf.get(id)!
    // Isolated tasks (no deps): only the global finisher is critical.
    // Linked components: use the component's own finish for float.
    const finish = componentHasEdge.has(componentId) ? range.finishMs : globalFinish
    const prev = componentFinish.get(componentId)
    componentFinish.set(
      componentId,
      prev == null ? finish : Math.max(prev, finish),
    )
  }
  // Components that only contain summary rows still need a finish anchor.
  for (const item of items) {
    const componentId = componentOf.get(item.id)!
    if (componentFinish.has(componentId)) continue
    const range = scheduled.get(item.id)
    if (!range) continue
    componentFinish.set(
      componentId,
      componentHasEdge.has(componentId) ? range.finishMs : globalFinish,
    )
  }

  const outgoing = new Map<string, PmWorkItemRelation[]>()
  for (const relation of validRelations) {
    const out = outgoing.get(relation.fromWorkItemId) ?? []
    out.push(relation)
    outgoing.set(relation.fromWorkItemId, out)
  }

  type LateRange = { lateStart: number; lateFinish: number }
  const late = new Map<string, LateRange>()
  const visiting = new Set<string>()

  const resolveLate = (id: string): LateRange => {
    const cached = late.get(id)
    if (cached) return cached
    const componentId = componentOf.get(id)!
    const localFinish = componentFinish.get(componentId) ?? globalFinish
    if (visiting.has(id)) {
      const early = scheduled.get(id)
      const fallback: LateRange = {
        lateStart: early?.startMs ?? localFinish,
        lateFinish: early?.finishMs ?? localFinish,
      }
      late.set(id, fallback)
      return fallback
    }
    visiting.add(id)

    const early = scheduled.get(id)
    if (!early) {
      visiting.delete(id)
      const empty: LateRange = { lateStart: localFinish, lateFinish: localFinish }
      late.set(id, empty)
      return empty
    }

    const childIds = childrenByParent.get(id) ?? []
    const successors = outgoing.get(id) ?? []
    let lateFinish = localFinish

    if (childIds.length > 0) {
      // Summary rollup: late finish is the latest child late finish, then tightened by successors.
      let childLateFinish = Number.NEGATIVE_INFINITY
      for (const childId of childIds) {
        const childLate = resolveLate(childId)
        childLateFinish = Math.max(childLateFinish, childLate.lateFinish)
      }
      lateFinish = Number.isFinite(childLateFinish) ? childLateFinish : localFinish
      for (const relation of successors) {
        const succLate = resolveLate(relation.toWorkItemId)
        let viaSucc = succLate.lateFinish
        switch (relation.type) {
          case 'SS':
            viaSucc = addDays(
              addDays(succLate.lateStart, -relation.lagDays),
              early.durationDays - 1,
            )
            break
          case 'FF':
          case 'SF':
            viaSucc = addDays(succLate.lateFinish, -relation.lagDays)
            break
          case 'FS':
          default:
            viaSucc = addDays(succLate.lateStart, -(1 + relation.lagDays))
            break
        }
        lateFinish = Math.min(lateFinish, viaSucc)
      }
    } else if (successors.length > 0) {
      lateFinish = Number.POSITIVE_INFINITY
      for (const relation of successors) {
        const succLate = resolveLate(relation.toWorkItemId)
        let predLateFinish = succLate.lateStart
        switch (relation.type) {
          case 'SS':
            predLateFinish = addDays(
              addDays(succLate.lateStart, -relation.lagDays),
              early.durationDays - 1,
            )
            break
          case 'FF':
            predLateFinish = addDays(succLate.lateFinish, -relation.lagDays)
            break
          case 'SF':
            predLateFinish = addDays(succLate.lateFinish, -relation.lagDays)
            break
          case 'FS':
          default:
            // Invert FS: predecessor late finish = successor late start - 1 - lag
            predLateFinish = addDays(succLate.lateStart, -(1 + relation.lagDays))
            break
        }
        lateFinish = Math.min(lateFinish, predLateFinish)
      }
      if (!Number.isFinite(lateFinish)) lateFinish = localFinish
    }

    const lateStart = addDays(lateFinish, -(early.durationDays - 1))
    const resolved: LateRange = { lateStart, lateFinish }
    late.set(id, resolved)
    visiting.delete(id)
    return resolved
  }

  for (const item of items) {
    resolveLate(item.id)
  }

  const critical = new Set<string>()
  for (const item of items) {
    const early = scheduled.get(item.id)
    const lateRange = late.get(item.id)
    if (!early || !lateRange) continue
    const startFloat = Math.round((lateRange.lateStart - early.startMs) / DAY_MS)
    const finishFloat = Math.round((lateRange.lateFinish - early.finishMs) / DAY_MS)
    if (Math.min(startFloat, finishFloat) <= 0) critical.add(item.id)
  }

  // Summaries that contain critical work should also show as critical.
  let grew = true
  while (grew) {
    grew = false
    for (const [parentId, childIds] of childrenByParent) {
      if (critical.has(parentId)) continue
      if (childIds.some((childId) => critical.has(childId))) {
        critical.add(parentId)
        grew = true
      }
    }
  }

  return critical
}

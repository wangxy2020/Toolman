import type { PmWorkItem, PmWorkItemRelation } from '@toolman/shared'
import {
  DAY_MS,
  addDays,
  isSchedulableRelation,
  type ScheduledRange,
} from './pm-gantt-schedule-dates'

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

/** Duration-weighted progress rollup for summary (parent) tasks. */

import { buildPmWorkItemForest, type PmWorkItemTreeNode } from '@toolman/shared'
import type { PmWorkItem } from '@toolman/shared'

import { durationDaysBetween } from './pm-gantt-schedule'

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

function progressWeight(item: PmWorkItem): number {
  if (item.type === 'milestone') return 1
  if (item.startDate != null && item.dueDate != null) {
    return durationDaysBetween(item.startDate, item.dueDate)
  }
  return 1
}

/**
 * Bottom-up progress for every node. Leaves keep stored %, parents are
 * duration-weighted averages of children (MS Project–style).
 */
export function buildProgressPercentById(items: ReadonlyArray<PmWorkItem>): Map<string, number> {
  const byId = new Map<string, number>()
  const forest = buildPmWorkItemForest([...items])

  const walk = (node: PmWorkItemTreeNode): number => {
    if (node.children.length === 0) {
      const leaf = clampProgress(node.item.progressPercent ?? 0)
      byId.set(node.item.id, leaf)
      return leaf
    }
    let weighted = 0
    let totalWeight = 0
    for (const child of node.children) {
      const childProgress = walk(child)
      const weight = progressWeight(child.item)
      weighted += childProgress * weight
      totalWeight += weight
    }
    const rolled = totalWeight === 0 ? 0 : clampProgress(weighted / totalWeight)
    byId.set(node.item.id, rolled)
    return rolled
  }

  for (const root of forest) walk(root)
  return byId
}

/** Parent rows whose stored progressPercent differs from the rolled-up value. */
export function collectProgressRollupUpdates(
  items: ReadonlyArray<PmWorkItem>,
): Array<{ id: string; progressPercent: number }> {
  const rolled = buildProgressPercentById(items)
  const childIds = new Set(
    items.map((item) => item.parentId).filter((id): id is string => Boolean(id)),
  )
  const updates: Array<{ id: string; progressPercent: number }> = []
  for (const item of items) {
    if (!childIds.has(item.id)) continue
    const next = rolled.get(item.id)
    if (next == null) continue
    const prev = clampProgress(item.progressPercent ?? 0)
    if (next !== prev) updates.push({ id: item.id, progressPercent: next })
  }
  return updates
}

import type { PmWorkItem, PmWorkItemTreeNode } from '@toolman/shared'

import { GANTT_MAX_DEPTH } from './pm-gantt-prefs'

export type GanttTreeRow = {
  item: PmWorkItem
  depth: number
  hasChildren: boolean
  expanded: boolean
  /** Stable outline number from the full (uncollapsed) tree order. */
  rowNumber: number
}

/** Full DFS order used for stable 序号 / 前置任务 references. */
export function buildStableRowNumberById(
  roots: PmWorkItemTreeNode[],
  options?: { skipIds?: ReadonlySet<string> },
): Map<string, number> {
  const map = new Map<string, number>()
  const skipIds = options?.skipIds
  let index = 0
  const walk = (nodes: PmWorkItemTreeNode[]) => {
    for (const node of nodes) {
      if (skipIds?.has(node.item.id)) {
        // Display-only rows (e.g. project summary) keep 序号 for real tasks stable.
        map.set(node.item.id, 0)
        walk(node.children)
        continue
      }
      index += 1
      map.set(node.item.id, index)
      walk(node.children)
    }
  }
  walk(roots)
  return map
}

export function flattenPmWorkItemForestCollapsed(
  roots: PmWorkItemTreeNode[],
  collapsedIds: ReadonlySet<string>,
  rowNumberById: Map<string, number>,
): GanttTreeRow[] {
  const rows: GanttTreeRow[] = []

  const walk = (nodes: PmWorkItemTreeNode[], depth: number) => {
    for (const node of nodes) {
      const hasChildren = node.children.length > 0
      const expanded = hasChildren && !collapsedIds.has(node.item.id)
      rows.push({
        item: node.item,
        depth,
        hasChildren,
        expanded,
        rowNumber: rowNumberById.get(node.item.id) ?? rows.length + 1,
      })
      if (expanded) {
        walk(node.children, depth + 1)
      }
    }
  }

  walk(roots, 0)
  return rows
}

/**
 * 降级：自身大纲级别 +1。新父任务是「同级」中的前一个任务，
 * 而不是可见列表里的上一行（上一行可能是更深的子任务）。
 * 最多 5 级（depth 0..GANTT_MAX_DEPTH）。
 */
export function findDemoteParentId(
  rows: Array<{ item: { id: string; parentId?: string | null }; depth: number }>,
  selectedIndex: number,
  maxDepth = GANTT_MAX_DEPTH,
): string | null {
  const selected = rows[selectedIndex]
  if (!selected || selectedIndex <= 0) return null
  if (selected.depth >= maxDepth) return null
  const depth = selected.depth
  for (let i = selectedIndex - 1; i >= 0; i -= 1) {
    const row = rows[i]!
    if (row.depth === depth) {
      return row.item.id === selected.item.parentId ? null : row.item.id
    }
    if (row.depth < depth) {
      return null
    }
  }
  return null
}

export type GanttTaskKind = 'task' | 'milestone' | 'summary' | 'critical'

/**
 * Structural kind for shape/label. Critical path overrides milestone so CP
 * milestones classify as 关键任务. Summaries keep `summary` even on the CP.
 */
export function resolveGanttTaskKind(
  item: Pick<PmWorkItem, 'type'>,
  hasChildren: boolean,
  isCritical = false,
): GanttTaskKind {
  if (hasChildren) return 'summary'
  if (isCritical) return 'critical'
  if (item.type === 'milestone') return 'milestone'
  return 'task'
}

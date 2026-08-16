/** Cost catalog grouping and allocation totals for task assignments. */

import type { PmCostRow, PmCostType } from '../cost/pm-cost-catalog'
import { catalogCostAmountLimit } from './pm-gantt-cost-assignment-compute'
import {
  readTaskCostAssignments,
  resolveCostAssignmentAgainstCatalog,
} from './pm-gantt-cost-assignment-metadata'
import type {
  CostSectionalGroup,
  TaskCostAssignment,
} from './pm-gantt-cost-assignment-types'

/** Options for a name picker — named rows only, optionally filtered by type. */
export function costCatalogRowsForType(
  catalog: readonly PmCostRow[],
  type: PmCostType | null,
): PmCostRow[] {
  const named = catalog.filter((row) => row.name.trim().length > 0)
  if (!type) return named
  return named.filter((row) => row.type === type)
}

/**
 * Group named catalog rows by 分部工程 for cascading name pickers.
 * Groups follow first appearance order in the price list (top → bottom).
 * Rows within a group keep catalog order.
 */
export function groupCostCatalogBySectionalWork(
  catalog: readonly PmCostRow[],
  type: PmCostType | null = null,
): CostSectionalGroup[] {
  const named = costCatalogRowsForType(catalog, type)
  const byKey = new Map<string, PmCostRow[]>()
  const keyOrder: string[] = []
  for (const row of named) {
    const key = row.sectionalWork?.trim() ?? ''
    const list = byKey.get(key)
    if (list) {
      list.push(row)
    } else {
      byKey.set(key, [row])
      keyOrder.push(key)
    }
  }
  return keyOrder.map((key) => ({
    key,
    rows: byKey.get(key) ?? [],
  }))
}

function resolveAssignmentCostId(
  assignment: TaskCostAssignment,
  catalog: readonly PmCostRow[],
): string | null {
  const resolved = resolveCostAssignmentAgainstCatalog(assignment, catalog)
  if (resolved.costId) return resolved.costId
  const name = resolved.name.trim()
  if (!name) return null
  const matched = catalog.find(
    (row) =>
      row.name.trim() === name &&
      (resolved.type == null || row.type === resolved.type),
  )
  return matched?.id ?? null
}

/**
 * Sum assigned amounts for each price-list row id across all tasks.
 * Used to gray out fully allocated items in the cost name cascade.
 */
export function buildCostAllocatedAmountById(
  items: ReadonlyArray<{ metadata?: Record<string, unknown> | null }>,
  catalog: readonly PmCostRow[] = [],
): Map<string, number> {
  const totals = new Map<string, number>()
  for (const item of items) {
    for (const raw of readTaskCostAssignments(item.metadata)) {
      const costId = resolveAssignmentCostId(raw, catalog)
      if (!costId) continue
      const amount = raw.amount
      if (amount == null || !Number.isFinite(amount)) continue
      totals.set(costId, (totals.get(costId) ?? 0) + amount)
    }
  }
  return totals
}

/** True when assigned amounts cover the catalog 合价 / quantity (null = unlimited). */
export function isCostQuantityFullyAllocated(
  row: PmCostRow,
  allocatedById: ReadonlyMap<string, number>,
  catalog: readonly PmCostRow[] = [],
): boolean {
  const limit = catalogCostAmountLimit(row, catalog)
  if (limit == null || !Number.isFinite(limit)) return false
  if (limit <= 0) return true
  const allocated = allocatedById.get(row.id) ?? 0
  return allocated + 1e-9 >= limit
}

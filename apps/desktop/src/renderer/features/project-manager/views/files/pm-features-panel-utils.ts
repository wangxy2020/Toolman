/** Pure helpers local to the 实务 (Files) panel — extracted from ProjectManagementFilesPanel. */

import type { readFeatureVersionCatalog } from '@toolman/shared'

import { costFeatureRowOrderKey } from './pm-feature-gantt-rollup'
import {
  featureTypeMenuRank,
  isPmFeatureCostPrimaryType,
  isPmFeatureType,
  PM_FEATURE_SCHEDULE_TYPES,
  type PmFeatureRow,
  type PmFeatureType,
  type PmFeatureViewFilter,
} from './pm-features-catalog'

export {
  computeFundsTotals,
  computeResourceStatTotals,
  type FeaturesFundsTotals,
  type ResourceStatTotals,
} from './pm-features-panel-totals'

/** Convert a version-history snapshot back into live editable feature rows. */
export function snapshotToRows(
  snapshot: NonNullable<ReturnType<typeof readFeatureVersionCatalog>>,
): PmFeatureRow[] {
  return snapshot
    .filter((row) => isPmFeatureType(row.type))
    .map((row) => ({
      id: row.id,
      type: row.type as PmFeatureType,
      name: row.name,
      unit: row.unit,
      pricingUnit: typeof row.pricingUnit === 'string' ? row.pricingUnit : '',
      purchaseCycle:
        typeof row.purchaseCycle === 'number' && Number.isFinite(row.purchaseCycle)
          ? row.purchaseCycle
          : null,
      transportCycle:
        typeof row.transportCycle === 'number' && Number.isFinite(row.transportCycle)
          ? row.transportCycle
          : null,
      quantity: row.quantity,
      remark: row.remark ?? '',
      code: typeof row.code === 'string' ? row.code : '',
      featureDescription:
        typeof row.featureDescription === 'string' ? row.featureDescription : '',
      sectionalWork: typeof row.sectionalWork === 'string' ? row.sectionalWork : '',
      unitPrice:
        typeof row.unitPrice === 'number' && Number.isFinite(row.unitPrice)
          ? row.unitPrice
          : null,
      applicable: row.applicable,
      sortOrder: row.sortOrder,
      parentId: row.parentId,
    }))
}

/** Expand a delete selection to include every descendant row (cascade delete). */
export function collectCascadeDeleteIds(
  rows: readonly PmFeatureRow[],
  ids: ReadonlySet<string>,
): Set<string> {
  const remove = new Set(ids)
  let changed = true
  while (changed) {
    changed = false
    for (const row of rows) {
      if (remove.has(row.id)) continue
      if (row.parentId && remove.has(row.parentId)) {
        remove.add(row.id)
        changed = true
      }
    }
  }
  return remove
}

/** Filter + order rows for the active menu view (schedule types / funds / a single type). */
export function computeVisibleRows(
  rows: readonly PmFeatureRow[],
  viewFilter: PmFeatureViewFilter,
  costCatalogOrder: ReadonlyMap<string, number>,
): PmFeatureRow[] {
  if (viewFilter === 'scheduleAll') {
    const allowed = new Set<string>(PM_FEATURE_SCHEDULE_TYPES)
    return rows
      .filter((row) => allowed.has(row.type))
      .slice()
      .sort((left, right) => {
        const typeDelta = featureTypeMenuRank(left.type) - featureTypeMenuRank(right.type)
        if (typeDelta !== 0) return typeDelta
        return left.sortOrder - right.sortOrder
      })
  }
  if (viewFilter === 'funds') {
    return rows
      .filter((row) => isPmFeatureCostPrimaryType(row.type))
      .slice()
      .sort((left, right) => {
        const leftCostId = left.id.startsWith('gantt-cost:id:')
          ? left.id.slice('gantt-cost:id:'.length)
          : null
        const rightCostId = right.id.startsWith('gantt-cost:id:')
          ? right.id.slice('gantt-cost:id:'.length)
          : null
        const leftKey = costFeatureRowOrderKey(left.type, left.name, leftCostId)
        const rightKey = costFeatureRowOrderKey(right.type, right.name, rightCostId)
        const leftIndex = costCatalogOrder.get(leftKey)
        const rightIndex = costCatalogOrder.get(rightKey)
        // Fallback to name-only key when id is missing from the index.
        const leftResolved =
          leftIndex ?? costCatalogOrder.get(costFeatureRowOrderKey(left.type, left.name))
        const rightResolved =
          rightIndex ?? costCatalogOrder.get(costFeatureRowOrderKey(right.type, right.name))
        if (leftResolved != null && rightResolved != null && leftResolved !== rightResolved) {
          return leftResolved - rightResolved
        }
        if (leftResolved != null && rightResolved == null) return -1
        if (leftResolved == null && rightResolved != null) return 1
        const typeDelta = featureTypeMenuRank(left.type) - featureTypeMenuRank(right.type)
        if (typeDelta !== 0) return typeDelta
        return left.sortOrder - right.sortOrder
      })
  }
  return rows.filter((row) => row.type === viewFilter)
}

/** Position for the row / table right-click context menu, clamped to the viewport. */
export function computeContextMenuPosition(clientX: number, clientY: number): {
  left: number
  top: number
} {
  const margin = 8
  const menuWidth = 200
  const menuHeight = 200
  let left = clientX
  let top = clientY
  if (left + menuWidth > window.innerWidth - margin) {
    left = Math.max(margin, clientX - menuWidth)
  }
  if (top + menuHeight > window.innerHeight - margin) {
    top = Math.max(margin, clientY - menuHeight)
  }
  return { left, top }
}

/** Position for the column-visibility menu, clamped to the viewport. */
export function computeColumnMenuPosition(clientX: number, clientY: number): {
  left: number
  top: number
} {
  const menuWidth = 200
  const menuHeight = 280
  const gap = 4
  let left = clientX + gap
  let top = clientY + gap
  if (left + menuWidth > window.innerWidth - 8) {
    left = Math.max(8, clientX - menuWidth - gap)
  }
  if (top + menuHeight > window.innerHeight - 8) {
    top = Math.max(8, clientY - menuHeight)
  }
  return { left, top }
}

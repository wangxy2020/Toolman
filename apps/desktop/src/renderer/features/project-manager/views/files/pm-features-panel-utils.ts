/** Pure helpers local to the 实务 (Files) panel — extracted from ProjectManagementFilesPanel. */

import type { readFeatureVersionCatalog } from '@toolman/shared'

import {
  costFeatureRowOrderKey,
  type FeatureGanttRollup,
} from './pm-feature-gantt-rollup'
import {
  featureTypeMenuRank,
  isPmFeatureCostPrimaryType,
  isPmFeatureType,
  PM_FEATURE_SCHEDULE_TYPES,
  type PmFeatureRow,
  type PmFeatureType,
  type PmFeatureViewFilter,
} from './pm-features-catalog'

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

export type FeaturesFundsTotals = {
  /** Sum of allocated 工程数量 across visible funds rows. */
  amount: number
  /** Sum of 合价 (工程数量 × 单价) across visible funds rows. */
  totalPrice: number | null
  monthly: Record<string, number>
  startDate: number | null
  finishDate: number | null
}

/** Sum funds-view rollups (工程数量 / 合价 / monthly money / date span). */
export function computeFundsTotals(
  visibleRows: readonly PmFeatureRow[],
  rollups: ReadonlyMap<string, FeatureGanttRollup>,
): FeaturesFundsTotals {
  let amount = 0
  let totalPrice = 0
  let hasTotalPrice = false
  const monthly: Record<string, number> = {}
  let startDate: number | null = null
  let finishDate: number | null = null
  for (const row of visibleRows) {
    const rollup = rollups.get(row.id)
    const qty = rollup?.quantity
    if (qty != null && Number.isFinite(qty)) amount += qty
    if (
      qty != null &&
      Number.isFinite(qty) &&
      row.unitPrice != null &&
      Number.isFinite(row.unitPrice)
    ) {
      totalPrice += qty * row.unitPrice
      hasTotalPrice = true
    }
    if (rollup?.startDate != null) {
      startDate = startDate == null ? rollup.startDate : Math.min(startDate, rollup.startDate)
    }
    if (rollup?.finishDate != null) {
      finishDate = finishDate == null ? rollup.finishDate : Math.max(finishDate, rollup.finishDate)
    }
    for (const [monthKey, value] of Object.entries(rollup?.monthly ?? {})) {
      if (!Number.isFinite(value)) continue
      monthly[monthKey] = (monthly[monthKey] ?? 0) + value
    }
  }
  return {
    amount,
    totalPrice: hasTotalPrice ? Math.round(totalPrice * 100) / 100 : null,
    monthly,
    startDate,
    finishDate,
  }
}

export type ResourceStatTotals = {
  /** Sum of 合价 (pricingQuantity × unitPrice). Always aggregated when finite. */
  totalPrice: number | null
  /**
   * Sum of 数量. Only when every row shares the same type and 计量单位.
   * Otherwise null (do not mix unlike units / types).
   */
  quantity: number | null
  /**
   * Sum of 计价数量. Only when every row shares the same type and 计价单位.
   * Otherwise null.
   */
  pricingQuantity: number | null
}

function effectivePricingUnit(row: Pick<PmFeatureRow, 'unit' | 'pricingUnit'>): string {
  return row.pricingUnit.trim() || row.unit.trim()
}

/**
 * Bottom totals for 资源统计.
 * - `sumQuantities=false` (全部类型): only 合价 is summed.
 * - `sumQuantities=true` (单分类): also sum 数量 / 计价数量 when type+unit match.
 */
export function computeResourceStatTotals(
  visibleRows: readonly PmFeatureRow[],
  rollups: ReadonlyMap<string, FeatureGanttRollup>,
  options: { sumQuantities: boolean },
): ResourceStatTotals {
  let totalPrice = 0
  let hasTotalPrice = false
  let quantitySum = 0
  let hasQuantity = false
  let pricingQuantitySum = 0
  let hasPricingQuantity = false

  let sharedType: string | null = null
  let sharedUnit: string | null = null
  let sharedPricingUnit: string | null = null
  let typeUniform = true
  let unitUniform = true
  let pricingUnitUniform = true

  for (const row of visibleRows) {
    const rollup = rollups.get(row.id)
    const pricingQty = rollup?.pricingQuantity
    const unitPrice = row.unitPrice
    if (
      pricingQty != null &&
      Number.isFinite(pricingQty) &&
      unitPrice != null &&
      Number.isFinite(unitPrice)
    ) {
      totalPrice += pricingQty * unitPrice
      hasTotalPrice = true
    }

    const type = row.type
    const unit = row.unit.trim()
    const pricingUnit = effectivePricingUnit(row)
    if (sharedType == null) sharedType = type
    else if (sharedType !== type) typeUniform = false
    if (sharedUnit == null) sharedUnit = unit
    else if (sharedUnit !== unit) unitUniform = false
    if (sharedPricingUnit == null) sharedPricingUnit = pricingUnit
    else if (sharedPricingUnit !== pricingUnit) pricingUnitUniform = false

    if (rollup?.quantity != null && Number.isFinite(rollup.quantity)) {
      quantitySum += rollup.quantity
      hasQuantity = true
    }
    if (pricingQty != null && Number.isFinite(pricingQty)) {
      pricingQuantitySum += pricingQty
      hasPricingQuantity = true
    }
  }

  const canSumByTypeAndUnit = options.sumQuantities && typeUniform && unitUniform
  const canSumByTypeAndPricingUnit =
    options.sumQuantities && typeUniform && pricingUnitUniform

  return {
    totalPrice: hasTotalPrice ? totalPrice : null,
    quantity: canSumByTypeAndUnit && hasQuantity ? quantitySum : null,
    pricingQuantity:
      canSumByTypeAndPricingUnit && hasPricingQuantity ? pricingQuantitySum : null,
  }
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

import type { FeatureGanttRollup } from './pm-feature-gantt-rollup'
import type { PmFeatureRow } from './pm-features-catalog'

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

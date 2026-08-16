/** Cost assignment money / quantity / percent helpers. */

import {
  computeCostRowTotalPrice,
  computeCostTotalPrice,
  type PmCostRow,
} from '../cost/pm-cost-catalog'
import {
  DEFAULT_COST_ASSIGNMENT_PERCENT,
  type DefaultCostAssignmentAmountOptions,
  type TaskCostAssignment,
} from './pm-gantt-cost-assignment-types'

/**
 * Monetary amount from price-list 合价 × 百分比.
 * Missing percent is treated as {@link DEFAULT_COST_ASSIGNMENT_PERCENT}.
 */
export function computeCostAssignmentMoney(
  catalogAmount: number | null | undefined,
  percent: number | null | undefined,
): number | null {
  if (catalogAmount == null || !Number.isFinite(catalogAmount)) return null
  const ratio =
    percent != null && Number.isFinite(percent) ? percent : DEFAULT_COST_ASSIGNMENT_PERCENT
  return Math.round(catalogAmount * ratio * 100) / 100
}

/** Price-list row 工程数量 (null when unset). */
export function catalogCostQuantity(
  row: Pick<PmCostRow, 'quantity'> | null | undefined,
): number | null {
  if (!row) return null
  if (row.quantity == null || !Number.isFinite(row.quantity)) return null
  return row.quantity
}

/**
 * Allocated 工程数量 = catalog quantity × percent (0–1).
 * Missing percent is treated as {@link DEFAULT_COST_ASSIGNMENT_PERCENT}.
 */
export function computeCostAssignmentQuantity(
  catalogQuantity: number | null | undefined,
  percent: number | null | undefined,
): number | null {
  if (catalogQuantity == null || !Number.isFinite(catalogQuantity)) return null
  const ratio =
    percent != null && Number.isFinite(percent) ? percent : DEFAULT_COST_ASSIGNMENT_PERCENT
  return Math.round(catalogQuantity * ratio * 1e6) / 1e6
}

/** Format a 0–1 percent ratio for the 百分比 input. */
export function formatCostPercentRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return ''
  return String(Math.round(ratio * 1e6) / 1e6)
}

/**
 * Parse the 百分比 column as a 0–1 ratio.
 * Empty → default `1`. A trailing `%` is treated as percentage points (`50%` → `0.5`).
 */
export function parseCostPercentRatioInput(raw: string): number {
  const trimmed = raw.trim().replace(/,/g, '')
  if (!trimmed) return DEFAULT_COST_ASSIGNMENT_PERCENT
  const hasPercentSign = trimmed.includes('%')
  const parsed = Number(trimmed.replace(/%/g, ''))
  if (!Number.isFinite(parsed)) return DEFAULT_COST_ASSIGNMENT_PERCENT
  const ratio = hasPercentSign ? parsed / 100 : parsed
  return Math.round(ratio * 1e6) / 1e6
}

/**
 * Effective percent ratio (0–1) for display/edit.
 * = allocated 工程数量 ÷ price-list 工程数量.
 *
 * Legacy rows may store either money (合价 × share) or engineering quantity in `amount`.
 * When both catalog quantity and 合价 are known, pick the interpretation that yields a
 * sensible 0–1 share (qty-like amounts such as `8.37` against 合价 must not become ~0.002).
 */
export function resolveCostAssignmentPercent(
  assignment: Pick<TaskCostAssignment, 'percent' | 'amount'>,
  catalogAmount?: number | null,
  catalogQuantity?: number | null,
): number {
  const amount = assignment.amount
  const hasQty =
    catalogQuantity != null && Number.isFinite(catalogQuantity) && catalogQuantity !== 0
  const hasMoney =
    catalogAmount != null && Number.isFinite(catalogAmount) && catalogAmount !== 0

  const near = (left: number, right: number) =>
    Math.abs(left - right) <= Math.max(1e-6, Math.abs(right) * 1e-4)

  // amount stored as the catalog 工程数量 → full allocation, even if percent was
  // previously mis-inferred as amount÷合价.
  if (
    hasQty &&
    amount != null &&
    Number.isFinite(amount) &&
    near(amount, catalogQuantity!)
  ) {
    return 1
  }

  if (assignment.percent != null && Number.isFinite(assignment.percent)) {
    if (
      hasQty &&
      hasMoney &&
      amount != null &&
      Number.isFinite(amount) &&
      amount <= catalogQuantity! + 1e-9
    ) {
      const qtyShare = Math.round((amount / catalogQuantity!) * 1e6) / 1e6
      const impliedQty = catalogQuantity! * assignment.percent
      if (Math.abs(impliedQty - amount) > Math.max(1e-6, Math.abs(amount) * 0.05)) {
        return qtyShare
      }
    }
    return assignment.percent
  }

  if (amount == null || !Number.isFinite(amount)) {
    return DEFAULT_COST_ASSIGNMENT_PERCENT
  }

  if (hasQty && hasMoney) {
    const qtyRatio = amount / catalogQuantity!
    const moneyRatio = amount / catalogAmount!
    const qtyShare =
      qtyRatio > 0 && qtyRatio <= 1 + 1e-6 ? Math.round(qtyRatio * 1e6) / 1e6 : null
    const moneyShare = Math.round(moneyRatio * 1e6) / 1e6
    // Prefer eng-qty interpretation when amount looks like a quantity share
    // (e.g. amount === catalog quantity) rather than a tiny money/合价 ratio.
    if (qtyShare != null && Math.abs(moneyShare) < Math.abs(qtyShare) * 0.5) {
      return qtyShare
    }
    return moneyShare
  }

  if (hasQty) {
    return Math.round((amount / catalogQuantity!) * 1e6) / 1e6
  }
  if (hasMoney) {
    return Math.round((amount / catalogAmount!) * 1e6) / 1e6
  }
  return DEFAULT_COST_ASSIGNMENT_PERCENT
}

/**
 * Derive percent from an edited 工程数量 value (cost column / popup).
 */
export function resolveCostPercentFromQuantity(
  nextQuantity: number | null,
  catalogQuantity: number | null,
  fallbackPercent: number | null,
): number | null {
  return nextQuantity != null &&
    catalogQuantity != null &&
    Number.isFinite(nextQuantity) &&
    Number.isFinite(catalogQuantity) &&
    catalogQuantity !== 0
    ? Math.round((nextQuantity / catalogQuantity) * 1e6) / 1e6
    : fallbackPercent
}

/** Catalog 合价 / unit price / quantity — whichever is available. */
export function catalogCostAmountLimit(
  row: Pick<PmCostRow, 'id' | 'quantity' | 'unitPrice'>,
  catalog?: readonly PmCostRow[],
): number | null {
  if (catalog && catalog.length > 0) {
    const full = catalog.find((entry) => entry.id === row.id) ?? (row as PmCostRow)
    const rolled = computeCostRowTotalPrice(full, catalog)
    if (rolled != null) return rolled
  }
  const total = computeCostTotalPrice(row.quantity, row.unitPrice)
  if (total != null) return total
  if (row.unitPrice != null && Number.isFinite(row.unitPrice)) {
    return Math.round(row.unitPrice * 100) / 100
  }
  if (row.quantity != null && Number.isFinite(row.quantity)) {
    return Math.round(row.quantity * 100) / 100
  }
  return null
}

/**
 * Default 金额 when picking a price-list row: remaining 合价
 * (catalog total minus amounts already allocated), falling back to unit price
 * or quantity when only one is set.
 */
export function defaultCostAssignmentAmount(
  row: Pick<PmCostRow, 'id' | 'quantity' | 'unitPrice'> | Pick<PmCostRow, 'quantity' | 'unitPrice'>,
  options?: DefaultCostAssignmentAmountOptions,
): number | null {
  const rowId = 'id' in row && typeof row.id === 'string' ? row.id : null
  const limit = catalogCostAmountLimit(
    rowId ? { ...row, id: rowId } : { id: '', quantity: row.quantity, unitPrice: row.unitPrice },
    options?.catalog,
  )
  if (limit == null) return null
  const allocated =
    rowId && options?.allocatedById ? (options.allocatedById.get(rowId) ?? 0) : 0
  const exclude =
    options?.excludeAllocated != null && Number.isFinite(options.excludeAllocated)
      ? options.excludeAllocated
      : 0
  const remaining = Math.round((limit - allocated + exclude) * 100) / 100
  if (remaining <= 0) return null
  return remaining
}

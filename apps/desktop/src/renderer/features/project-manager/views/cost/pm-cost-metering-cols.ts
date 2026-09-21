import { formatPmDecimalDisplay } from '../../PmDecimalTableInput'
import {
  collectCostRollupLeafRows,
  computeCostTotalPrice,
  formatCostFixed2IfDecimal,
  type PmCostRow,
} from './pm-cost-catalog'

export const COST_METERING_COLUMNS = [
  'periodQuantity',
  'priorQuantity',
  'cumulativeQuantity',
  'periodAmount',
  'cumulativeAmount',
  'cumulativePercent',
] as const

export type CostMeteringColumn = (typeof COST_METERING_COLUMNS)[number]

export const COST_METERING_QTY_COLUMNS = [
  'periodQuantity',
  'priorQuantity',
  'cumulativeQuantity',
] as const satisfies readonly CostMeteringColumn[]

export function isCostMeteringQtyColumn(column: CostMeteringColumn): boolean {
  return (COST_METERING_QTY_COLUMNS as readonly string[]).includes(column)
}

export function costMeteringColClass(column: CostMeteringColumn): string {
  return isCostMeteringQtyColumn(column)
    ? 'tm-pm-resource-table-col-metering tm-pm-resource-table-col-metering-qty'
    : 'tm-pm-resource-table-col-metering tm-pm-resource-table-col-metering-amount'
}

export type CostMeteringProgress = {
  periodQuantity: number | null
  priorQuantity: number
  cumulativeQuantity: number
  periodAmount: number | null
  cumulativeAmount: number | null
  cumulativePercent: number | null
}

/** Zero / empty factors are excluded from amount and percent formulas. */
export function isCostMeteringFactor(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value !== 0
}

export function computeCostMeteringProduct(
  quantity: number | null | undefined,
  unitPrice: number | null | undefined,
): number | null {
  if (!isCostMeteringFactor(quantity) || !isCostMeteringFactor(unitPrice)) return null
  return computeCostTotalPrice(quantity, unitPrice)
}

export function computeCostMeteringProgress(
  row: Pick<PmCostRow, 'quantity' | 'unitPrice' | 'periodQuantity' | 'priorQuantity'>,
): CostMeteringProgress {
  const periodQuantity = row.periodQuantity ?? null
  const priorQuantity = row.priorQuantity ?? 0
  const periodForSum = periodQuantity ?? 0
  const cumulativeQuantity = priorQuantity + periodForSum
  const periodAmount = computeCostMeteringProduct(periodQuantity, row.unitPrice)
  const cumulativeAmount = computeCostMeteringProduct(cumulativeQuantity, row.unitPrice)
  const rawPercent =
    isCostMeteringFactor(cumulativeQuantity) && isCostMeteringFactor(row.quantity)
      ? (cumulativeQuantity / row.quantity) * 100
      : null
  const cumulativePercent =
    rawPercent == null ? null : Math.min(100, rawPercent)
  return {
    periodQuantity,
    priorQuantity,
    cumulativeQuantity,
    periodAmount,
    cumulativeAmount,
    cumulativePercent,
  }
}

/**
 * Section / grand-total metering rollup.
 * Uses leaf rows (same as 合价) and amount-weighted 累计完成百分比:
 * sum(累计完成金额) / sum(合价).
 */
export function sumCostMeteringProgress(
  rows: readonly PmCostRow[],
  contractAmount?: number | null,
): CostMeteringProgress {
  const leaves = collectCostRollupLeafRows(rows)
  let periodAmount: number | null = null
  let cumulativeAmount: number | null = null
  let leafContractAmount: number | null = null
  let quantityPercent: number | null = null

  for (const row of leaves) {
    const progress = computeCostMeteringProgress(row)
    if (progress.periodAmount != null) {
      periodAmount = (periodAmount ?? 0) + progress.periodAmount
    }
    if (progress.cumulativeAmount != null) {
      cumulativeAmount = (cumulativeAmount ?? 0) + progress.cumulativeAmount
    }
    const rowContract = computeCostTotalPrice(row.quantity, row.unitPrice)
    if (rowContract != null) {
      leafContractAmount = (leafContractAmount ?? 0) + rowContract
    }
    if (quantityPercent == null && progress.cumulativePercent != null) {
      quantityPercent = progress.cumulativePercent
    }
  }

  if (leaves.length > 1) quantityPercent = null
  const denominator =
    contractAmount != null && Number.isFinite(contractAmount)
      ? contractAmount
      : leafContractAmount
  const cumulativePercent =
    quantityPercent ??
    (isCostMeteringFactor(cumulativeAmount) && isCostMeteringFactor(denominator)
      ? Math.min(100, (cumulativeAmount / denominator) * 100)
      : null)

  return {
    periodQuantity: null,
    priorQuantity: 0,
    cumulativeQuantity: 0,
    periodAmount,
    cumulativeAmount,
    cumulativePercent,
  }
}

/** Close the current period: fold 本期 into 往期, clear 本期, and snapshot that IPC. */
export function rollCostMeteringPeriodIntoPrior(
  rows: readonly PmCostRow[],
  ipcId?: string,
): PmCostRow[] {
  return rows.map((row) => {
    const priorQuantity = (row.priorQuantity ?? 0) + (row.periodQuantity ?? 0)
    const ipcQuantities =
      ipcId && row.periodQuantity != null
        ? { ...row.ipcQuantities, [ipcId]: row.periodQuantity }
        : row.ipcQuantities
    if (
      row.priorQuantity === priorQuantity &&
      row.periodQuantity == null &&
      ipcQuantities === row.ipcQuantities
    ) {
      return row
    }
    return { ...row, priorQuantity, periodQuantity: null, ipcQuantities }
  })
}

export function formatCostMeteringQuantity(value: number | null): string {
  return formatPmDecimalDisplay(value)
}

export function formatCostMeteringAmount(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return ''
  return formatCostFixed2IfDecimal(value)
}

export function formatCostMeteringPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return ''
  return `${formatCostFixed2IfDecimal(value)}%`
}

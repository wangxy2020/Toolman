import type { PmCostRow } from './pm-cost-catalog'
import {
  computeCostMeteringProduct,
  computeCostMeteringProgress,
  isCostMeteringFactor,
} from './pm-cost-metering-cols'
import {
  parseMeteringPeriodNameIndex,
  type MeteringBaseline,
} from './pm-metering-baselines'

export type CostIpcColumn = {
  id: string
  label: string
  index: number
}

export function formatCostIpcColumnLabel(index: number): string {
  return `IPC${index}`
}

export function parseCostIpcQuantities(raw: unknown): Record<string, number | null> | undefined {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const next: Record<string, number | null> = {}
  let any = false
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key.trim()) continue
    if (value == null) {
      next[key] = null
      any = true
      continue
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      next[key] = value
      any = true
    }
  }
  return any ? next : undefined
}

export function sortBaselinesForIpcColumns(
  baselines: readonly MeteringBaseline[],
): MeteringBaseline[] {
  return [...baselines].sort((left, right) => {
    const leftIndex = parseMeteringPeriodNameIndex(left.name)
    const rightIndex = parseMeteringPeriodNameIndex(right.name)
    if (leftIndex != null && rightIndex != null && leftIndex !== rightIndex) {
      return leftIndex - rightIndex
    }
    if (leftIndex != null && rightIndex == null) return -1
    if (leftIndex == null && rightIndex != null) return 1
    if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt
    return left.name.localeCompare(right.name, 'zh-CN')
  })
}

/** One column per captured metering period, labeled IPC1…IPCn. */
export function costIpcColumns(baselines: readonly MeteringBaseline[]): CostIpcColumn[] {
  return sortBaselinesForIpcColumns(baselines).map((entry, index) => ({
    id: entry.id,
    label: formatCostIpcColumnLabel(index + 1),
    index: index + 1,
  }))
}

export type CostIpcStatement = {
  amounts: Array<number | null>
  cumulativeAmount: number | null
  cumulativePercent: number | null
}

function sumAmounts(values: readonly (number | null)[]): number | null {
  let sum: number | null = null
  for (const value of values) {
    if (value == null) continue
    sum = (sum ?? 0) + value
  }
  return sum
}

function statementPercent(
  cumulativeAmount: number | null,
  contractAmount: number | null,
  fallbackPercent: number | null,
): number | null {
  if (isCostMeteringFactor(cumulativeAmount) && isCostMeteringFactor(contractAmount)) {
    return (cumulativeAmount / contractAmount) * 100
  }
  return fallbackPercent
}

export function computeCostIpcAmount(
  row: Pick<PmCostRow, 'unitPrice' | 'ipcQuantities'>,
  ipcId: string,
): number | null {
  return computeCostMeteringProduct(row.ipcQuantities?.[ipcId], row.unitPrice)
}

export function computeCostIpcStatement(
  row: Pick<PmCostRow, 'quantity' | 'unitPrice' | 'periodQuantity' | 'priorQuantity' | 'ipcQuantities'>,
  ipcColumns: readonly CostIpcColumn[],
  contractAmount: number | null,
): CostIpcStatement {
  const amounts = ipcColumns.map((column) => computeCostIpcAmount(row, column.id))
  const hasIpc = amounts.some((value) => value != null)
  const metering = computeCostMeteringProgress(row)
  const cumulativeAmount = hasIpc ? sumAmounts(amounts) : metering.cumulativeAmount
  return {
    amounts,
    cumulativeAmount,
    cumulativePercent: statementPercent(
      cumulativeAmount,
      contractAmount,
      hasIpc ? null : metering.cumulativePercent,
    ),
  }
}

export function sumCostIpcStatements(
  rows: readonly PmCostRow[],
  ipcColumns: readonly CostIpcColumn[],
  contractAmount: number | null,
): CostIpcStatement {
  const amounts = ipcColumns.map((column) => {
    let sum: number | null = null
    for (const row of rows) {
      const value = computeCostIpcAmount(row, column.id)
      if (value == null) continue
      sum = (sum ?? 0) + value
    }
    return sum
  })
  const hasIpc = amounts.some((value) => value != null)
  if (hasIpc) {
    const cumulativeAmount = sumAmounts(amounts)
    return {
      amounts,
      cumulativeAmount,
      cumulativePercent: statementPercent(cumulativeAmount, contractAmount, null),
    }
  }
  let cumulativeAmount: number | null = null
  let fallbackPercent: number | null = null
  for (const row of rows) {
    const progress = computeCostMeteringProgress(row)
    if (progress.cumulativeAmount != null) {
      cumulativeAmount = (cumulativeAmount ?? 0) + progress.cumulativeAmount
    }
    if (fallbackPercent == null && progress.cumulativePercent != null) {
      fallbackPercent = progress.cumulativePercent
    }
  }
  if (rows.length > 1) fallbackPercent = null
  return {
    amounts,
    cumulativeAmount,
    cumulativePercent: statementPercent(cumulativeAmount, contractAmount, fallbackPercent),
  }
}

export function stripCostIpcQuantities(
  rows: readonly PmCostRow[],
  ipcId: string,
): PmCostRow[] {
  return rows.map((row) => {
    if (!row.ipcQuantities || !(ipcId in row.ipcQuantities)) return row
    const next = { ...row.ipcQuantities }
    delete next[ipcId]
    return {
      ...row,
      ipcQuantities: Object.keys(next).length > 0 ? next : undefined,
    }
  })
}

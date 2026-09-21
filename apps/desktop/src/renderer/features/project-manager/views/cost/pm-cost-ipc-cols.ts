import { collectCostRollupLeafRows, type PmCostRow } from './pm-cost-catalog'
import {
  computeCostMeteringProduct,
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

/** Parse `IPC007` / `7` / `ipc-3` into a positive period index. */
export function parseCostIpcNoIndex(value: string): number | null {
  const match = /(\d+)/.exec(value.trim())
  if (!match) return null
  const n = Number.parseInt(match[1]!, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Stable ipcAmounts map key so `1`, `IPC1`, and `ipc-01` collapse to one column.
 * Prefer the numeric index string when present.
 */
export function normalizeCostIpcAmountKey(ipcNo: string): string {
  const trimmed = ipcNo.trim()
  if (!trimmed) return ''
  const index = parseCostIpcNoIndex(trimmed)
  return index != null ? String(index) : trimmed
}

/** Column header is `IPC` + ipc_no (e.g. ipc_no `1` → `IPC1`; `IPC007` stays `IPC007`). */
export function formatCostIpcColumnLabelFromNo(ipcNo: string, fallbackIndex: number): string {
  const trimmed = ipcNo.trim()
  if (!trimmed) return formatCostIpcColumnLabel(fallbackIndex)
  const index = parseCostIpcNoIndex(trimmed)
  if (index != null) return formatCostIpcColumnLabel(index)
  if (/^ipc/i.test(trimmed)) return `IPC${trimmed.replace(/^ipc/i, '')}`
  return `IPC${trimmed}`
}

export function sortCostIpcNos(ipcNos: readonly string[]): string[] {
  return [...ipcNos].sort((left, right) => {
    const leftIndex = parseCostIpcNoIndex(left)
    const rightIndex = parseCostIpcNoIndex(right)
    if (leftIndex != null && rightIndex != null && leftIndex !== rightIndex) {
      return leftIndex - rightIndex
    }
    if (leftIndex != null && rightIndex == null) return -1
    if (leftIndex == null && rightIndex != null) return 1
    return left.localeCompare(right, 'zh-CN')
  })
}

export function collectCostIpcNos(rows: readonly PmCostRow[]): string[] {
  const nos = new Set<string>()
  for (const row of rows) {
    if (!row.ipcAmounts) continue
    for (const key of Object.keys(row.ipcAmounts)) {
      const ipcNo = normalizeCostIpcAmountKey(key)
      if (ipcNo) nos.add(ipcNo)
    }
  }
  return sortCostIpcNos([...nos])
}

export function costIpcColumnsFromNos(ipcNos: readonly string[]): CostIpcColumn[] {
  const normalized = [
    ...new Set(ipcNos.map((ipcNo) => normalizeCostIpcAmountKey(ipcNo)).filter(Boolean)),
  ]
  return sortCostIpcNos(normalized).map((ipcNo, index) => ({
    id: ipcNo,
    label: formatCostIpcColumnLabelFromNo(ipcNo, index + 1),
    index: parseCostIpcNoIndex(ipcNo) ?? index + 1,
  }))
}

/**
 * Prefer fetched ipc_no columns. Do not fall back to captured metering baselines
 * for the 中期计量表 — those use UUID ids and render empty amount cells.
 */
export function resolveCostIpcColumns(
  rows: readonly PmCostRow[],
  baselines: readonly MeteringBaseline[] = [],
  options?: { allowBaselineFallback?: boolean },
): CostIpcColumn[] {
  const fromRows = costIpcColumnsFromNos(collectCostIpcNos(rows))
  if (fromRows.length > 0) return fromRows
  if (options?.allowBaselineFallback === false) return []
  return costIpcColumns(baselines)
}

export function parseCostIpcQuantities(raw: unknown): Record<string, number | null> | undefined {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const next: Record<string, number | null> = {}
  let any = false
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const normalized = normalizeCostIpcAmountKey(key)
    if (!normalized) continue
    if (value == null) {
      if (!(normalized in next) || next[normalized] == null) next[normalized] = null
      any = true
      continue
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      next[normalized] = value
      any = true
    }
  }
  return any ? next : undefined
}

/** Normalize legacy `IPC1` / `1` keys on a row so lookup and totals stay aligned. */
export function normalizeCostIpcAmounts(
  amounts: Record<string, number | null> | undefined,
): Record<string, number | null> | undefined {
  return parseCostIpcQuantities(amounts)
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
    return Math.min(100, (cumulativeAmount / contractAmount) * 100)
  }
  return fallbackPercent == null ? null : Math.min(100, fallbackPercent)
}

export function computeCostIpcAmount(
  row: Pick<PmCostRow, 'unitPrice' | 'ipcQuantities' | 'ipcAmounts'>,
  ipcId: string,
): number | null {
  const amounts = row.ipcAmounts
  if (amounts) {
    const direct = amounts[ipcId]
    if (typeof direct === 'number' && Number.isFinite(direct)) return direct
    const normalized = normalizeCostIpcAmountKey(ipcId)
    if (normalized && Object.prototype.hasOwnProperty.call(amounts, normalized)) {
      const amount = amounts[normalized]
      return typeof amount === 'number' && Number.isFinite(amount) ? amount : null
    }
    // Legacy rows may still store `IPC1` while columns use `1`.
    for (const [key, value] of Object.entries(amounts)) {
      if (normalizeCostIpcAmountKey(key) !== normalized) continue
      return typeof value === 'number' && Number.isFinite(value) ? value : null
    }
  }
  const qty = row.ipcQuantities?.[ipcId] ?? row.ipcQuantities?.[normalizeCostIpcAmountKey(ipcId)]
  return computeCostMeteringProduct(qty, row.unitPrice)
}

export function computeCostIpcStatement(
  row: Pick<
    PmCostRow,
    'quantity' | 'unitPrice' | 'periodQuantity' | 'priorQuantity' | 'ipcQuantities' | 'ipcAmounts'
  >,
  ipcColumns: readonly CostIpcColumn[],
  contractAmount: number | null,
): CostIpcStatement {
  const amounts = ipcColumns.map((column) => computeCostIpcAmount(row, column.id))
  const hasIpc = amounts.some((value) => value != null)
  const ipcSum = hasIpc ? sumAmounts(amounts) : null
  // 中期计量表累计完成金额 = IPCx 之和（或 ipcQuantities×单价）。
  // 不要回退到 本期/往期×单价：无 IPCx 的行会误显示累计金额（如仅有残留本期数量）。
  const cumulativeAmount = hasIpc ? ipcSum : null
  const cumulativePercent = hasIpc
    ? statementPercent(cumulativeAmount, contractAmount, null)
    : null
  return {
    amounts,
    cumulativeAmount,
    cumulativePercent,
  }
}

export function sumCostIpcStatements(
  rows: readonly PmCostRow[],
  ipcColumns: readonly CostIpcColumn[],
  contractAmount: number | null,
): CostIpcStatement {
  // Align with 合价: only leaf rows within this 子项目+分部工程 group.
  const leaves = collectCostRollupLeafRows(rows)
  const amounts = ipcColumns.map((column) => {
    let sum: number | null = null
    for (const row of leaves) {
      const value = computeCostIpcAmount(row, column.id)
      if (value == null) continue
      sum = (sum ?? 0) + value
    }
    return sum
  })
  let cumulativeAmount: number | null = null
  for (const row of leaves) {
    // Same per-row 累计完成金额 as detail cells — IPC only, never 本期/往期 fallback.
    const statement = computeCostIpcStatement(row, ipcColumns, null)
    if (statement.cumulativeAmount != null) {
      cumulativeAmount = (cumulativeAmount ?? 0) + statement.cumulativeAmount
    }
  }
  return {
    amounts,
    cumulativeAmount,
    cumulativePercent: statementPercent(cumulativeAmount, contractAmount, null),
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

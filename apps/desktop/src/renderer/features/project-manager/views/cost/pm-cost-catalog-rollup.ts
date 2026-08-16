/** Cost catalog totals, codes, and baseline ratio helpers. */

import { PM_COST_APPLICABLE_ALL, costMatchKey, type PmCostRow } from './pm-cost-catalog-types'

export function computeCostTotalPrice(
  quantity: number | null | undefined,
  unitPrice: number | null | undefined,
): number | null {
  if (
    quantity == null ||
    unitPrice == null ||
    !Number.isFinite(quantity) ||
    !Number.isFinite(unitPrice)
  ) {
    return null
  }
  return Math.round(quantity * unitPrice * 100) / 100
}

/**
 * 合价 for a row: if it has children, sum of child 合价 (recursive);
 * otherwise quantity × unitPrice.
 */
export function computeCostRowTotalPrice(
  row: PmCostRow,
  rows: readonly PmCostRow[],
  childIndex?: ReadonlyMap<string, PmCostRow[]>,
): number | null {
  const children =
    childIndex?.get(row.id) ?? rows.filter((entry) => entry.parentId === row.id)
  if (children.length > 0) {
    let sum = 0
    let hasAmount = false
    for (const child of children) {
      const amount = computeCostRowTotalPrice(child, rows, childIndex)
      if (amount != null) {
        sum += amount
        hasAmount = true
      }
    }
    return hasAmount ? Math.round(sum * 100) / 100 : null
  }
  return computeCostTotalPrice(row.quantity, row.unitPrice)
}

/** Build parentId → children list for O(n) rollups. */
export function buildCostChildrenIndex(
  rows: readonly PmCostRow[],
): Map<string, PmCostRow[]> {
  const index = new Map<string, PmCostRow[]>()
  for (const row of rows) {
    const parentId = row.parentId
    if (!parentId) continue
    const list = index.get(parentId)
    if (list) list.push(row)
    else index.set(parentId, [row])
  }
  return index
}

/**
 * Sum 合价 without double-counting: only roots whose parent is outside `rows`
 * (or null), each using child rollup when present.
 */
export function sumCostRowsTotalPrice(rows: readonly PmCostRow[]): number | null {
  if (rows.length === 0) return null
  const idSet = new Set(rows.map((row) => row.id))
  const childIndex = buildCostChildrenIndex(rows)
  let sum = 0
  let hasAmount = false
  for (const row of rows) {
    const parentId = row.parentId ?? null
    if (parentId && idSet.has(parentId)) continue
    const amount = computeCostRowTotalPrice(row, rows, childIndex)
    if (amount != null) {
      sum += amount
      hasAmount = true
    }
  }
  return hasAmount ? Math.round(sum * 100) / 100 : null
}

/**
 * Suggest the next 编码 from the previous row: increment the trailing number
 * while preserving prefix and zero-padding (e.g. `1.01` → `1.02`, `A-9` → `A-10`).
 */
export function suggestNextCostCode(previousCode: string): string {
  const trimmed = previousCode.trim()
  if (!trimmed) return ''
  const match = trimmed.match(/^(.*?)(\d+)$/)
  if (!match) return ''
  const prefix = match[1] ?? ''
  const digits = match[2] ?? ''
  const next = String(Number(digits) + 1)
  return `${prefix}${next.padStart(digits.length, '0')}`
}

export function formatCostTotalPrice(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

export function costRowDepth(
  row: PmCostRow,
  byId: ReadonlyMap<string, PmCostRow>,
): number {
  let depth = 0
  let parentId = row.parentId ?? null
  const seen = new Set<string>()
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) break
    depth += 1
    parentId = parent.parentId ?? null
  }
  return depth
}

export function buildBaselinePriceIndex(baselineRows: readonly PmCostRow[]): {
  byId: Map<string, number | null>
  byKey: Map<string, number | null>
} {
  const byId = new Map<string, number | null>()
  const byKey = new Map<string, number | null>()
  for (const row of baselineRows) {
    byId.set(row.id, row.unitPrice)
    const name = row.name.trim()
    if (!name) continue
    const key = costMatchKey(row.type, name)
    if (!byKey.has(key)) byKey.set(key, row.unitPrice)
  }
  return { byId, byKey }
}

export function lookupBaselineUnitPrice(
  row: PmCostRow,
  index: { byId: Map<string, number | null>; byKey: Map<string, number | null> },
): number | null {
  if (index.byId.has(row.id)) return index.byId.get(row.id) ?? null
  const name = row.name.trim()
  if (!name) return null
  return index.byKey.get(costMatchKey(row.type, name)) ?? null
}

export function computeCostBaselineRatio(
  projectPrice: number | null,
  baselinePrice: number | null,
): number | null {
  if (
    projectPrice == null ||
    baselinePrice == null ||
    !Number.isFinite(projectPrice) ||
    !Number.isFinite(baselinePrice) ||
    baselinePrice === 0
  ) {
    return null
  }
  return projectPrice / baselinePrice
}

export function formatCostBaselineRatio(ratio: number): string {
  return ratio.toFixed(2)
}

export function isCostBaselineRatioOff(ratio: number | null): boolean {
  return ratio != null && Number.isFinite(ratio) && Math.abs(ratio - 1) > 0.001
}

export function deriveCostApplicable(
  row: PmCostRow,
  baseline: ReturnType<typeof buildBaselinePriceIndex> | null,
  projectId: string,
): string {
  if (!baseline) return projectId
  const baselinePrice = lookupBaselineUnitPrice(row, baseline)
  if (baselinePrice == null) return projectId
  if (
    row.unitPrice != null &&
    Number.isFinite(row.unitPrice) &&
    Math.abs(row.unitPrice - baselinePrice) < 1e-9
  ) {
    return PM_COST_APPLICABLE_ALL
  }
  return projectId
}

export function withDerivedCostApplicable(
  rows: readonly PmCostRow[],
  baseline: ReturnType<typeof buildBaselinePriceIndex>,
  projectId: string,
): PmCostRow[] {
  return rows.map((row) => ({
    ...row,
    applicable: deriveCostApplicable(row, baseline, projectId),
  }))
}

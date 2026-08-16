/** Cost summary row types, metadata persistence, and formula-ref editing helpers. */

import type { CostSectionalSummary } from './pm-cost-catalog'
import { DEFAULT_COST_CURRENCY } from './pm-cost-currency'

/** Project metadata key for top-level 汇总 rows (may be one per currency). */
export const COST_SUMMARY_ROWS_META_KEY = 'costSummaryRows'

export type CostSummaryRow = {
  id: string
  code: string
  name: string
  featureDescription: string
  /** Empty = auto-sum sections that share this row's currency. */
  totalFormula: string
  /** Currency this summary row is associated with (for auto-sum + label). */
  currency: string
  sortOrder: number
}

export type CostSectionRollupSummary = CostSectionalSummary & {
  name: string
  featureDescription: string
  totalFormula: string
  /** Auto sum of detail rows (ignores formula). */
  autoTotal: number | null
  currency: string
}

export type CostRollupDisplayEntry =
  | { kind: 'summary'; row: CostSummaryRow; total: number | null }
  | { kind: 'section'; summary: CostSectionRollupSummary }

export function createEmptyCostSummaryRow(
  sortOrder: number,
  currency: string = DEFAULT_COST_CURRENCY,
  id?: string,
): CostSummaryRow {
  return {
    id: id ?? crypto.randomUUID(),
    code: '',
    name: '',
    featureDescription: '',
    totalFormula: '',
    currency: currency.trim() || DEFAULT_COST_CURRENCY,
    sortOrder,
  }
}

export function parseCostSummaryRows(raw: unknown): CostSummaryRow[] {
  if (!Array.isArray(raw)) return []
  const rows: CostSummaryRow[] = []
  for (const entry of raw) {
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) continue
    const row = entry as Record<string, unknown>
    const id = typeof row.id === 'string' && row.id.trim() ? row.id : crypto.randomUUID()
    const code = typeof row.code === 'string' ? row.code : ''
    const name = typeof row.name === 'string' ? row.name : ''
    const featureDescription =
      typeof row.featureDescription === 'string' ? row.featureDescription : ''
    const totalFormula = typeof row.totalFormula === 'string' ? row.totalFormula : ''
    const currency =
      typeof row.currency === 'string' && row.currency.trim()
        ? row.currency.trim()
        : DEFAULT_COST_CURRENCY
    const sortOrder =
      typeof row.sortOrder === 'number' && Number.isFinite(row.sortOrder)
        ? Math.floor(row.sortOrder)
        : rows.length
    rows.push({
      id,
      code,
      name,
      featureDescription,
      totalFormula,
      currency,
      sortOrder,
    })
  }
  return rows
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((row, index) => ({ ...row, sortOrder: index }))
}

export function readCostSummaryRows(
  metadata: Record<string, unknown> | null | undefined,
): CostSummaryRow[] {
  if (!metadata) return []
  return parseCostSummaryRows(metadata[COST_SUMMARY_ROWS_META_KEY])
}

/**
 * Append a 分部工程 reference while editing a 合价 formula (⌘/Ctrl-click pick).
 * Starts with `=` when empty; inserts `+ref` unless the formula already ends with an operator.
 */
export function appendCostFormulaRef(formula: string, refName: string): string {
  const ref = refName.trim()
  if (!ref) return formula
  let base = formula.trim().replace(/＝/g, '=')
  if (!base || base === '=') return `=${ref}`
  if (!base.startsWith('=')) base = `=${base}`
  if (/[=+\-*/(]\s*$/.test(base)) return `${base}${ref}`
  return `${base}+${ref}`
}

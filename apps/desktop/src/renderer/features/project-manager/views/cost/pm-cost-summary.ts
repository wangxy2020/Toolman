/** Cost rollup (汇总) summary rows + 合价 formula evaluation. */

import type { PmCostRow } from './pm-cost-catalog'
import {
  buildCostSectionalDisplayEntries,
  costSectionalWorkKey,
  type CostSectionalSummary,
} from './pm-cost-catalog'
import {
  costSectionCurrencyKey,
  DEFAULT_COST_CURRENCY,
  getCostCardCurrency,
  readCostCurrencyState,
} from './pm-cost-currency'

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

/**
 * CSP-safe arithmetic evaluator (+ - * / and parentheses).
 * Electron's CSP blocks `new Function` / `eval` (`script-src` has no unsafe-eval).
 */
function evaluateArithmeticExpression(input: string): number | null {
  const src = input.replace(/\s+/g, '')
  if (!src) return null
  let i = 0

  const peek = () => src[i] ?? ''
  const consume = (ch: string) => {
    if (peek() !== ch) return false
    i += 1
    return true
  }

  const parseNumber = (): number | null => {
    const start = i
    while (peek() >= '0' && peek() <= '9') i += 1
    if (peek() === '.') {
      i += 1
      while (peek() >= '0' && peek() <= '9') i += 1
    }
    if (i === start) return null
    const value = Number(src.slice(start, i))
    return Number.isFinite(value) ? value : null
  }

  const parseFactor = (): number | null => {
    if (consume('+')) return parseFactor()
    if (consume('-')) {
      const value = parseFactor()
      return value == null ? null : -value
    }
    if (consume('(')) {
      const value = parseExpr()
      if (value == null || !consume(')')) return null
      return value
    }
    return parseNumber()
  }

  const parseTerm = (): number | null => {
    let value = parseFactor()
    if (value == null) return null
    while (peek() === '*' || peek() === '/') {
      const op = peek()
      i += 1
      const right = parseFactor()
      if (right == null) return null
      if (op === '*') value *= right
      else {
        if (right === 0) return null
        value /= right
      }
    }
    return value
  }

  const parseExpr = (): number | null => {
    let value = parseTerm()
    if (value == null) return null
    while (peek() === '+' || peek() === '-') {
      const op = peek()
      i += 1
      const right = parseTerm()
      if (right == null) return null
      value = op === '+' ? value + right : value - right
    }
    return value
  }

  const result = parseExpr()
  if (result == null || i !== src.length || !Number.isFinite(result)) return null
  return Math.round(result * 100) / 100
}

/**
 * Evaluate a 合价 formula.
 * Supports `=工程费+安装`, `=A01+B02` (section code/name/key), plain numbers, and + - * / ( ).
 */
export function evaluateCostFormula(
  formula: string,
  refs: ReadonlyMap<string, number>,
): number | null {
  const trimmed = formula.trim().replace(/＝/g, '=')
  if (!trimmed) return null

  if (!trimmed.startsWith('=') && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    const asNumber = Number(trimmed)
    return Number.isFinite(asNumber) ? asNumber : null
  }

  let expr = trimmed.startsWith('=') ? trimmed.slice(1).trim() : trimmed
  if (!expr) return null

  // Normalize full-width operators / spaces users may type with Chinese IME.
  expr = expr
    .replace(/\u3000/g, ' ')
    .replace(/＋/g, '+')
    .replace(/－/g, '-')
    .replace(/−/g, '-')
    .replace(/＊/g, '*')
    .replace(/×/g, '*')
    .replace(/／/g, '/')
    .replace(/÷/g, '/')
    .replace(/（/g, '(')
    .replace(/）/g, ')')

  const keys = [...refs.keys()]
    .filter((key) => key.trim().length > 0)
    .sort((left, right) => right.length - left.length)

  if (keys.length > 0) {
    const escaped = keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    // Longest-first alternation so「工程建设其他费」wins over「工程费」.
    const pattern = new RegExp(escaped.join('|'), 'g')
    expr = expr.replace(pattern, (match) => {
      const value = refs.get(match)
      return value != null && Number.isFinite(value) ? `(${value})` : match
    })
  }

  if (!/^[\d+\-*/().\s]+$/.test(expr)) return null
  return evaluateArithmeticExpression(expr)
}

function addFormulaRefs(
  refs: Map<string, number>,
  value: number | null | undefined,
  ...keys: Array<string | null | undefined>
): void {
  // Missing section amounts count as 0 so formulas like =A+B still resolve.
  const amount = value != null && Number.isFinite(value) ? value : 0
  for (const key of keys) {
    const trimmed = key?.trim()
    if (!trimmed) continue
    if (!refs.has(trimmed)) refs.set(trimmed, amount)
  }
}

export function resolveSectionCurrency(
  sectionKey: string,
  metadata: Record<string, unknown> | null | undefined,
  projectCode?: string,
): string {
  const { costCurrencies, unsetCostCurrency } = readCostCurrencyState(metadata, projectCode)
  return getCostCardCurrency(
    costCurrencies,
    unsetCostCurrency,
    costSectionCurrencyKey(sectionKey),
  )
}

/**
 * Default: a single top-level「汇总」row.
 * Extra summary rows are added manually from the 汇总 menu.
 */
export function buildDefaultCostSummaryRows(
  sectionCurrencies: readonly string[],
  summaryLabel: string,
  _summaryLabelWithCurrency: (currency: string) => string,
): CostSummaryRow[] {
  const currency =
    sectionCurrencies.map((value) => value.trim()).find((value) => value) ||
    DEFAULT_COST_CURRENCY
  return [
    {
      ...createEmptyCostSummaryRow(0, currency, 'cost-summary:default'),
      name: summaryLabel,
    },
  ]
}

/** True when a row still looks like the old auto-generated per-currency default. */
export function isLegacyAutoCostSummaryRow(
  row: CostSummaryRow,
  _summaryLabel: string,
  summaryLabelWithCurrency: (currency: string) => string,
): boolean {
  const untouched =
    !row.code.trim() &&
    !row.featureDescription.trim() &&
    !row.totalFormula.trim()
  if (!untouched) return false

  const name = row.name.trim()
  const currency = row.currency.trim()

  // Old auto ids were `cost-summary:元` / `cost-summary:万元` (not the single default).
  if (row.id.startsWith('cost-summary:') && row.id !== 'cost-summary:default') {
    return true
  }

  // Old auto display names: 汇总（元） / Summary (元)
  if (currency && name === summaryLabelWithCurrency(currency)) return true
  if (/^汇总[（(].+[）)]$/.test(name)) return true
  if (/^Summary\s*\(.+\)$/i.test(name)) return true
  return false
}

/**
 * Collapse legacy “one summary row per currency” defaults into a single row.
 * User-edited or manually added rows are kept as-is.
 */
export function normalizeCostSummaryRows(
  stored: readonly CostSummaryRow[],
  sectionCurrencies: readonly string[],
  summaryLabel: string,
  summaryLabelWithCurrency: (currency: string) => string,
): { rows: CostSummaryRow[]; changed: boolean } {
  if (stored.length === 0) {
    return {
      rows: buildDefaultCostSummaryRows(
        sectionCurrencies,
        summaryLabel,
        summaryLabelWithCurrency,
      ),
      changed: true,
    }
  }
  if (
    stored.length > 1 &&
    stored.every((row) =>
      isLegacyAutoCostSummaryRow(row, summaryLabel, summaryLabelWithCurrency),
    )
  ) {
    return {
      rows: buildDefaultCostSummaryRows(
        sectionCurrencies,
        summaryLabel,
        summaryLabelWithCurrency,
      ),
      changed: true,
    }
  }
  return {
    rows: stored.map((row, index) => ({ ...row, sortOrder: index })),
    changed: false,
  }
}

export function ensureCostSummaryRows(
  stored: readonly CostSummaryRow[],
  sectionCurrencies: readonly string[],
  summaryLabel: string,
  summaryLabelWithCurrency: (currency: string) => string,
): CostSummaryRow[] {
  return normalizeCostSummaryRows(
    stored,
    sectionCurrencies,
    summaryLabel,
    summaryLabelWithCurrency,
  ).rows
}

function buildSectionRollupSummaries(
  rows: readonly PmCostRow[],
  metadata: Record<string, unknown> | null | undefined,
  projectCode?: string,
): CostSectionRollupSummary[] {
  const sections = buildCostSectionalDisplayEntries(rows).flatMap((entry) =>
    entry.kind === 'section' ? [entry.summary] : [],
  )

  const withMeta: CostSectionRollupSummary[] = sections.map((summary) => {
    const groupRows = rows.filter((row) => costSectionalWorkKey(row) === summary.key)
    const head = groupRows[0]
    const name =
      groupRows.map((row) => row.sectionName?.trim() ?? '').find((value) => value) ||
      summary.key
    const featureDescription =
      groupRows.map((row) => row.sectionFeatureDescription?.trim() ?? '').find((value) => value) ||
      ''
    const totalFormula =
      groupRows.map((row) => row.sectionTotalFormula?.trim() ?? '').find((value) => value) ||
      head?.sectionTotalFormula ||
      ''
    return {
      ...summary,
      name,
      featureDescription,
      totalFormula,
      autoTotal: summary.total,
      currency: resolveSectionCurrency(summary.key, metadata, projectCode),
      code: summary.code || head?.sectionCode || '',
      note: summary.note || head?.sectionNote || '',
    }
  })

  // First pass refs: auto totals only (avoids cyclic section formulas).
  const autoRefs = new Map<string, number>()
  for (const summary of withMeta) {
    addFormulaRefs(
      autoRefs,
      summary.autoTotal,
      summary.key,
      summary.code,
      summary.name,
    )
  }

  return withMeta.map((summary) => {
    const formula = summary.totalFormula.trim()
    if (!formula) {
      return { ...summary, total: summary.autoTotal }
    }
    const evaluated = evaluateCostFormula(formula, autoRefs)
    return { ...summary, total: evaluated }
  })
}

/** Sum every 分部工程 total (default 汇总合价). Mixed currencies still sum numerically. */
export function sumAllSectionTotals(
  sections: readonly Pick<CostSectionRollupSummary, 'total'>[],
): number | null {
  let sum = 0
  let hasAmount = false
  for (const section of sections) {
    if (section.total == null || !Number.isFinite(section.total)) continue
    sum += section.total
    hasAmount = true
  }
  return hasAmount ? Math.round(sum * 100) / 100 : null
}

/**
 * Rollup view entries: one or more top summary rows (per currency / user-defined),
 * then each 分部 summary (no detail data rows).
 */
export function buildCostSectionalRollupDisplayEntries(
  rows: readonly PmCostRow[],
  options?: {
    metadata?: Record<string, unknown> | null
    projectCode?: string
    summaryRows?: readonly CostSummaryRow[]
    summaryLabel?: string
    summaryLabelWithCurrency?: (currency: string) => string
  },
): CostRollupDisplayEntry[] {
  const sections = buildSectionRollupSummaries(
    rows,
    options?.metadata,
    options?.projectCode,
  )
  const summaryLabel = options?.summaryLabel ?? '汇总'
  const summaryLabelWithCurrency =
    options?.summaryLabelWithCurrency ?? ((currency: string) => `汇总（${currency}）`)
  const summaryRows = ensureCostSummaryRows(
    options?.summaryRows ?? [],
    sections.map((section) => section.currency),
    summaryLabel,
    summaryLabelWithCurrency,
  )

  const sectionRefs = new Map<string, number>()
  for (const section of sections) {
    addFormulaRefs(sectionRefs, section.total, section.key, section.code, section.name)
  }

  const autoAllSectionsTotal = sumAllSectionTotals(sections)

  const summaryEntries: CostRollupDisplayEntry[] = summaryRows.map((row) => {
    const rawFormula = row.totalFormula.trim()
    // Lone '=' is treated as empty (auto-sum all 分部工程).
    const formula = rawFormula === '=' ? '' : rawFormula
    let total: number | null
    if (formula) {
      const refs = new Map(sectionRefs)
      for (const other of summaryRows) {
        if (other.id === row.id) continue
        const otherRaw = other.totalFormula.trim()
        const otherFormula = otherRaw === '=' ? '' : otherRaw
        const otherTotal = otherFormula
          ? evaluateCostFormula(otherFormula, sectionRefs)
          : autoAllSectionsTotal
        addFormulaRefs(refs, otherTotal, other.code, other.name)
      }
      total = evaluateCostFormula(formula, refs)
    } else {
      // Default: auto-sum all 分部工程 amounts; clear the formula cell to restore this.
      total = autoAllSectionsTotal
    }
    return { kind: 'summary', row, total }
  })

  return [
    ...summaryEntries,
    ...sections.map((summary) => ({ kind: 'section' as const, summary })),
  ]
}

/** Default / legacy cost summary row normalization. */

import {
  costSectionCurrencyKey,
  DEFAULT_COST_CURRENCY,
  getCostCardCurrency,
  readCostCurrencyState,
} from './pm-cost-currency'
import {
  createEmptyCostSummaryRow,
  type CostSummaryRow,
} from './pm-cost-summary-types'

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

/** Cost rollup (汇总) summary rows + 合价 formula evaluation. */

export {
  COST_SUMMARY_ROWS_META_KEY,
  appendCostFormulaRef,
  createEmptyCostSummaryRow,
  parseCostSummaryRows,
  readCostSummaryRows,
  type CostRollupDisplayEntry,
  type CostSectionRollupSummary,
  type CostSummaryRow,
} from './pm-cost-summary-types'

export { evaluateCostFormula } from './pm-cost-summary-formula'

export {
  buildDefaultCostSummaryRows,
  ensureCostSummaryRows,
  isLegacyAutoCostSummaryRow,
  normalizeCostSummaryRows,
  resolveSectionCurrency,
} from './pm-cost-summary-normalize'

export {
  buildCostSectionalRollupDisplayEntries,
  sumAllSectionTotals,
} from './pm-cost-summary-rollup'

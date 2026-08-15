import type { CostColumnVisibility } from '../cost/pm-cost-column-prefs'
import { DEFAULT_COST_COLUMN_VISIBILITY } from '../cost/pm-cost-column-prefs'
import type { FundsDisplayEntry, RollupYearBand } from './pm-feature-gantt-rollup'
import type { PmFeatureRow } from './pm-features-catalog'

export type MatrixLayout = 'horizontal' | 'vertical'

export type YearBandMonthRow = {
  monthKey: string
  monthIndexInBand: number
  year: number
  yearRowSpan: number
  rowNumber: number
}

export function resolveMatrixLayout(
  isMeteringCostView: boolean,
  matrixLayout: MatrixLayout,
): MatrixLayout {
  return isMeteringCostView ? 'horizontal' : matrixLayout
}

export function resolveMeteringColumnVisibility(
  meteringColumnVisibility: CostColumnVisibility | null | undefined,
): CostColumnVisibility {
  return meteringColumnVisibility ?? DEFAULT_COST_COLUMN_VISIBILITY
}

export function resolveMatrixDisplayEntries(
  isFundsView: boolean,
  fundsDisplayEntries: FundsDisplayEntry[] | null | undefined,
  visibleRows: PmFeatureRow[],
): FundsDisplayEntry[] {
  return isFundsView && fundsDisplayEntries
    ? fundsDisplayEntries
    : visibleRows.map((row) => ({ kind: 'row' as const, row }))
}

export function flattenYearBandMonthRows(
  yearBands: readonly RollupYearBand[],
): YearBandMonthRow[] {
  const rows: YearBandMonthRow[] = []
  let rowNumber = 0
  for (const band of yearBands) {
    band.monthKeys.forEach((monthKey, monthIndexInBand) => {
      rowNumber += 1
      rows.push({
        monthKey,
        monthIndexInBand,
        year: band.year,
        yearRowSpan: band.monthKeys.length,
        rowNumber,
      })
    })
  }
  return rows
}

export function formatMonthHeadTitle(
  parsed: { year: number; monthIndex: number } | null,
  monthFromGanttHint: string,
): string {
  return parsed
    ? `${parsed.year}-${String(parsed.monthIndex + 1).padStart(2, '0')} · ${monthFromGanttHint}`
    : monthFromGanttHint
}

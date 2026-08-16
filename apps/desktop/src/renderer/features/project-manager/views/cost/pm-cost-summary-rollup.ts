/** Cost sectional rollup summaries and display entries. */

import type { PmCostRow } from './pm-cost-catalog'
import {
  buildCostSectionalDisplayEntries,
  costSectionalWorkKey,
} from './pm-cost-catalog'
import { addFormulaRefs, evaluateCostFormula } from './pm-cost-summary-formula'
import {
  ensureCostSummaryRows,
  resolveSectionCurrency,
} from './pm-cost-summary-normalize'
import type {
  CostRollupDisplayEntry,
  CostSectionRollupSummary,
  CostSummaryRow,
} from './pm-cost-summary-types'

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

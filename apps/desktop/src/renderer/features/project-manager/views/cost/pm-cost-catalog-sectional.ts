/** Sectional / 分部工程 display helpers for the cost catalog. */

import { sumCostRowsTotalPrice } from './pm-cost-catalog-rollup'
import { type PmCostRow } from './pm-cost-catalog-types'

/** Trimmed 分部工程 key (`''` when blank). */
export function costSectionalWorkKey(row: Pick<PmCostRow, 'sectionalWork'>): string {
  return row.sectionalWork?.trim() ?? ''
}

export type CostSectionalSummary = {
  key: string
  total: number | null
  rowCount: number
  code: string
  note: string
}

/** Section-menu value for the rollup view (各分部汇总再汇总). */
export const COST_SECTION_FILTER_SUMMARY = '__summary__'

export function isCostSectionSummaryFilter(filter: string): boolean {
  return filter === COST_SECTION_FILTER_SUMMARY
}

export type CostSectionalDisplayEntry =
  | { kind: 'grand'; summary: CostSectionalSummary }
  | { kind: 'section'; summary: CostSectionalSummary }
  | { kind: 'row'; row: PmCostRow; index: number }

/**
 * Insert a 分部工程合价 summary before the rows of each sectional group.
 * Groups are keyed by trimmed 分部工程 (first-appearance order), so the same
 * section never produces duplicate summary rows when rows are interleaved
 * (e.g. after type-menu sort or mid-list inserts).
 */
export function buildCostSectionalDisplayEntries(
  rows: readonly PmCostRow[],
): CostSectionalDisplayEntry[] {
  const order: string[] = []
  const groups = new Map<string, { rows: PmCostRow[] }>()
  for (const row of rows) {
    const key = costSectionalWorkKey(row)
    let group = groups.get(key)
    if (!group) {
      group = { rows: [] }
      groups.set(key, group)
      order.push(key)
    }
    group.rows.push(row)
  }

  const entries: CostSectionalDisplayEntry[] = []
  let displayIndex = 0
  for (const key of order) {
    const group = groups.get(key)!
    const total = sumCostRowsTotalPrice(group.rows)
    const code =
      group.rows.map((row) => row.sectionCode?.trim() ?? '').find((value) => value) ?? ''
    const note =
      group.rows.map((row) => row.sectionNote?.trim() ?? '').find((value) => value) ?? ''
    entries.push({
      kind: 'section',
      summary: {
        key,
        total,
        rowCount: group.rows.length,
        code,
        note,
      },
    })
    for (const row of group.rows) {
      entries.push({ kind: 'row', row, index: displayIndex })
      displayIndex += 1
    }
  }
  return entries
}

/** Patch summary-row fields onto every row in the given sectional group. */
export function patchCostSectionMeta(
  rows: readonly PmCostRow[],
  sectionKey: string,
  patch: Partial<
    Pick<
      PmCostRow,
      | 'sectionCode'
      | 'sectionNote'
      | 'sectionName'
      | 'sectionFeatureDescription'
      | 'sectionTotalFormula'
    >
  >,
): PmCostRow[] {
  return rows.map((row) =>
    costSectionalWorkKey(row) === sectionKey ? { ...row, ...patch } : row,
  )
}

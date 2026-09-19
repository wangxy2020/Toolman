/** Sectional / 分部工程 display helpers for the cost catalog. */

import { sumCostRowsTotalPrice } from './pm-cost-catalog-rollup'
import { type PmCostRow } from './pm-cost-catalog-types'

/** Trimmed 分部工程 key (`''` when blank). */
export function costSectionalWorkKey(row: Pick<PmCostRow, 'sectionalWork'>): string {
  return row.sectionalWork?.trim() ?? ''
}

/** Trimmed 子项目 key (`''` when blank). */
export function costSubprojectKey(row: Pick<PmCostRow, 'subproject'>): string {
  return row.subproject?.trim() ?? ''
}

export type CostSectionalGroupBy = 'section' | 'subprojectSection'

const GROUP_KEY_SEP = '\u001f'

/** Group map key: 分部工程 only, or 子项目 + 分部工程. */
export function costSectionalGroupMapKey(
  subproject: string,
  sectionKey: string,
  groupBy: CostSectionalGroupBy = 'section',
): string {
  return groupBy === 'subprojectSection' ? `${subproject}${GROUP_KEY_SEP}${sectionKey}` : sectionKey
}

/** Schedule1 < Schedule2 < Schedule4; blank keys sort last. */
export function compareCostSectionalWorkKeys(left: string, right: string): number {
  const a = left.trim()
  const b = right.trim()
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return a.localeCompare(b, 'zh-CN', { numeric: true, sensitivity: 'base' })
}

export function uniqueSortedSectionalKeys(
  rows: readonly Pick<PmCostRow, 'sectionalWork'>[],
): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const key = costSectionalWorkKey(row)
    if (seen.has(key)) continue
    seen.add(key)
    keys.push(key)
  }
  return keys.sort(compareCostSectionalWorkKeys)
}

export type CostSectionalSummary = {
  key: string
  /** Set when groups are split by 子项目; otherwise empty. */
  subproject: string
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
 * Default groups are keyed by trimmed 分部工程 (first-appearance order).
 * `groupBy: 'subprojectSection'` keeps the same 分部工程 under different
 * 子项目 as separate totals.
 */
export function buildCostSectionalDisplayEntries(
  rows: readonly PmCostRow[],
  options?: {
    groupOrder?: 'appearance' | 'natural'
    groupBy?: CostSectionalGroupBy
  },
): CostSectionalDisplayEntry[] {
  const groupBy = options?.groupBy ?? 'section'
  const order: string[] = []
  const groups = new Map<string, { rows: PmCostRow[]; subproject: string; section: string }>()
  for (const row of rows) {
    const section = costSectionalWorkKey(row)
    const subproject = groupBy === 'subprojectSection' ? costSubprojectKey(row) : ''
    const mapKey = costSectionalGroupMapKey(subproject, section, groupBy)
    let group = groups.get(mapKey)
    if (!group) {
      group = { rows: [], subproject, section }
      groups.set(mapKey, group)
      order.push(mapKey)
    }
    group.rows.push(row)
  }

  const entries: CostSectionalDisplayEntry[] = []
  let displayIndex = 0
  const groupKeys =
    options?.groupOrder === 'natural'
      ? sortSectionalGroupKeys(order, groups, groupBy, rows)
      : order
  for (const mapKey of groupKeys) {
    const group = groups.get(mapKey)!
    const total = sumCostRowsTotalPrice(group.rows)
    const code =
      group.rows.map((row) => row.sectionCode?.trim() ?? '').find((value) => value) ?? ''
    const note =
      group.rows.map((row) => row.sectionNote?.trim() ?? '').find((value) => value) ?? ''
    entries.push({
      kind: 'section',
      summary: {
        key: group.section,
        subproject: group.subproject,
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

function sortSectionalGroupKeys(
  appearanceOrder: readonly string[],
  groups: ReadonlyMap<string, { subproject: string; section: string }>,
  groupBy: CostSectionalGroupBy,
  rows: readonly PmCostRow[],
): string[] {
  if (groupBy !== 'subprojectSection') {
    return [...appearanceOrder].sort((left, right) =>
      compareCostSectionalWorkKeys(groups.get(left)!.section, groups.get(right)!.section),
    )
  }
  const subOrder: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const sub = costSubprojectKey(row)
    if (seen.has(sub)) continue
    seen.add(sub)
    subOrder.push(sub)
  }
  const keys: string[] = []
  for (const sub of subOrder) {
    const sections = [...groups.values()]
      .filter((group) => group.subproject === sub)
      .map((group) => group.section)
    const uniqueSections = [...new Set(sections)].sort(compareCostSectionalWorkKeys)
    for (const section of uniqueSections) {
      keys.push(costSectionalGroupMapKey(sub, section, 'subprojectSection'))
    }
  }
  return keys
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
  options?: { subproject?: string },
): PmCostRow[] {
  return rows.map((row) => {
    if (costSectionalWorkKey(row) !== sectionKey) return row
    if (options != null && costSubprojectKey(row) !== (options.subproject ?? '')) return row
    return { ...row, ...patch }
  })
}

/** Funds section display and cost-assignment rollups. */

import type { PmWorkItem } from '@toolman/shared'

import type { PmCostRow } from '../cost/pm-cost-catalog'
import {
  catalogCostAmountLimit,
  catalogCostQuantity,
  computeCostAssignmentQuantity,
  findCatalogRowForCostAssignment,
  readTaskCostAssignments,
  resolveCostAssignmentPercent,
  type TaskCostAssignment,
} from '../schedule/pm-gantt-cost-assignment'
import {
  isPmFeatureCostPrimaryType,
  type PmFeatureCostPrimaryType,
  type PmFeatureRow,
} from './pm-features-catalog'
import type { GanttCostSeed } from './pm-feature-gantt-seeds'
import {
  allocateQuantityByMonth,
  mergeMonthlyQuantities,
} from './pm-feature-gantt-monthly'
import {
  costFeatureMatchKey,
  EMPTY_FEATURE_GANTT_ROLLUP,
  type FeatureGanttRollup,
} from './pm-feature-gantt-type-map'

export type FundsSectionMeta = {
  sectionalWork: string
  sectionLabel: string
}

export type FundsDisplayEntry =
  | { kind: 'section'; id: string; type: PmFeatureCostPrimaryType; sectionalWork: string; label: string; rollup: FeatureGanttRollup }
  | { kind: 'row'; row: PmFeatureRow }

function liveFundsFeatureId(seed: GanttCostSeed): string {
  return seed.costId?.trim()
    ? `gantt-cost:id:${seed.costId.trim()}`
    : `gantt-cost:${seed.type}:${seed.name}`
}

/** Map live funds feature id → 分部 meta from seeds. */
export function buildFundsSectionMetaByRowId(
  seeds: readonly GanttCostSeed[],
): ReadonlyMap<string, FundsSectionMeta> {
  const map = new Map<string, FundsSectionMeta>()
  for (const seed of seeds) {
    map.set(liveFundsFeatureId(seed), {
      sectionalWork: seed.sectionalWork,
      sectionLabel: seed.sectionLabel || seed.sectionalWork,
    })
  }
  return map
}

function emptyFundsRollup(): FeatureGanttRollup {
  return { quantity: 0, pricingQuantity: 0, startDate: null, finishDate: null, monthly: {} }
}

function mergeFundsRollup(
  target: FeatureGanttRollup,
  addition: FeatureGanttRollup | null | undefined,
): void {
  if (!addition) return
  if (Number.isFinite(addition.quantity)) target.quantity += addition.quantity
  if (Number.isFinite(addition.pricingQuantity)) target.pricingQuantity += addition.pricingQuantity
  if (addition.startDate != null) {
    target.startDate = target.startDate == null
      ? addition.startDate
      : Math.min(target.startDate, addition.startDate)
  }
  if (addition.finishDate != null) {
    target.finishDate = target.finishDate == null
      ? addition.finishDate
      : Math.max(target.finishDate, addition.finishDate)
  }
  mergeMonthlyQuantities(target.monthly, addition.monthly)
}

/**
 * Insert 分部项目名称 rows ahead of each section group in the 资金 list.
 * Rows are assumed pre-sorted by 分类 → 分部 → 顺序.
 */
export function buildFundsDisplayEntries(
  rows: readonly PmFeatureRow[],
  sectionMetaByRowId: ReadonlyMap<string, FundsSectionMeta>,
  rollups: ReadonlyMap<string, FeatureGanttRollup>,
  emptySectionLabel: string,
): FundsDisplayEntry[] {
  const entries: FundsDisplayEntry[] = []
  let lastGroupKey: string | null = null

  for (const row of rows) {
    if (!isPmFeatureCostPrimaryType(row.type)) {
      entries.push({ kind: 'row', row })
      continue
    }
    const meta = sectionMetaByRowId.get(row.id)
    const sectionalWork = meta?.sectionalWork ?? ''
    const label = (meta?.sectionLabel || sectionalWork || emptySectionLabel).trim() || emptySectionLabel
    const groupKey = `${row.type}::${sectionalWork}`

    if (groupKey !== lastGroupKey) {
      const sectionRollup = emptyFundsRollup()
      entries.push({
        kind: 'section',
        id: `funds-section:${groupKey}`,
        type: row.type,
        sectionalWork,
        label,
        rollup: sectionRollup,
      })
      lastGroupKey = groupKey
    }
    entries.push({ kind: 'row', row })
  }

  let currentSection: Extract<FundsDisplayEntry, { kind: 'section' }> | null = null
  for (const entry of entries) {
    if (entry.kind === 'section') {
      currentSection = entry
      continue
    }
    if (!currentSection) continue
    mergeFundsRollup(currentSection.rollup, rollups.get(entry.row.id))
  }

  return entries
}

/**
 * Live 资金 rows from current Gantt cost-assignment seeds.
 * Optional overlays supply id / unit / remark when the same type+name exists.
 */
export function buildLiveFundsFeatureRows(
  seeds: readonly GanttCostSeed[],
  overlays: readonly PmFeatureRow[] = [],
  applicable: string = 'all',
): PmFeatureRow[] {
  const overlayByKey = new Map<string, PmFeatureRow>()
  for (const row of overlays) {
    if (!isPmFeatureCostPrimaryType(row.type)) continue
    const name = row.name.trim()
    if (!name) continue
    overlayByKey.set(costFeatureMatchKey(row.type, name), row)
  }

  return seeds.map((seed, index) => {
    const overlay = overlayByKey.get(costFeatureMatchKey(seed.type, seed.name))
    return {
      id: overlay?.id ?? liveFundsFeatureId(seed),
      type: seed.type,
      name: seed.name,
      unit: overlay?.unit.trim() ? overlay.unit : seed.unit,
      pricingUnit: overlay?.pricingUnit ?? '',
      purchaseCycle: overlay?.purchaseCycle ?? null,
      transportCycle: overlay?.transportCycle ?? null,
      quantity: null,
      remark: overlay?.remark ?? '',
      code: overlay?.code ?? '',
      featureDescription: overlay?.featureDescription ?? '',
      sectionalWork: overlay?.sectionalWork ?? '',
      unitPrice:
        overlay?.unitPrice != null && Number.isFinite(overlay.unitPrice)
          ? overlay.unitPrice
          : seed.unitPrice,
      applicable: overlay?.applicable ?? applicable,
      sortOrder: index,
      parentId: null,
    }
  })
}

function parseFundsFeatureCostId(featureId: string): string | null {
  if (!featureId.startsWith('gantt-cost:id:')) return null
  return featureId.slice('gantt-cost:id:'.length).trim() || null
}

function costAssignmentMatchesFeature(
  assignment: TaskCostAssignment,
  feature: Pick<PmFeatureRow, 'id' | 'type' | 'name'>,
): boolean {
  if (!isPmFeatureCostPrimaryType(feature.type)) return false
  const featureCostId = parseFundsFeatureCostId(feature.id)
  if (featureCostId && assignment.costId?.trim() === featureCostId) return true
  if (assignment.type !== feature.type) return false
  const featureName = feature.name.trim()
  if (!featureName) return false
  return assignment.name.trim() === featureName
}

/**
 * Allocated 工程数量 for one cost assignment against a price-list row.
 * Prefer catalog quantity × percent; else amount ÷ unitPrice; else null.
 */
export function resolveCostAssignmentEngineeringQuantity(
  assignment: Pick<TaskCostAssignment, 'percent' | 'amount'>,
  catalogRow: Pick<PmCostRow, 'id' | 'quantity' | 'unitPrice'> | null | undefined,
  catalog: readonly PmCostRow[] = [],
): number | null {
  if (!catalogRow) return null
  const catalogQty = catalogCostQuantity(catalogRow)
  const catalogAmount = catalogCostAmountLimit(catalogRow, catalog)
  const percent = resolveCostAssignmentPercent(assignment, catalogAmount, catalogQty)
  if (catalogQty != null) {
    return computeCostAssignmentQuantity(catalogQty, percent)
  }
  if (
    assignment.amount != null &&
    Number.isFinite(assignment.amount) &&
    catalogRow.unitPrice != null &&
    Number.isFinite(catalogRow.unitPrice) &&
    catalogRow.unitPrice !== 0
  ) {
    return Math.round((assignment.amount / catalogRow.unitPrice) * 1e6) / 1e6
  }
  return null
}

/**
 * For each 资金 feature row, sum allocated 工程数量 from matching tasks
 * (and day-weight monetary amounts across months for the cash columns).
 */
export function computeFeatureCostRollups(
  items: readonly PmWorkItem[],
  features: readonly PmFeatureRow[],
  costCatalog: readonly PmCostRow[] = [],
): Map<string, FeatureGanttRollup> {
  const result = new Map<string, FeatureGanttRollup>()

  for (const feature of features) {
    if (!isPmFeatureCostPrimaryType(feature.type)) {
      result.set(feature.id, { ...EMPTY_FEATURE_GANTT_ROLLUP, monthly: {} })
      continue
    }

    let quantity = 0
    let pricingMoney = 0
    let startDate: number | null = null
    let finishDate: number | null = null
    const monthly: Record<string, number> = {}

    for (const item of items) {
      const assignments = readTaskCostAssignments(item.metadata)
      let matchedAmount = 0
      let matchedQty = 0
      let matchedOnTask = false
      for (const assignment of assignments) {
        if (!costAssignmentMatchesFeature(assignment, feature)) continue
        matchedOnTask = true
        const catalogRow = findCatalogRowForCostAssignment(assignment, costCatalog)
        const engQty = resolveCostAssignmentEngineeringQuantity(
          assignment,
          catalogRow,
          costCatalog,
        )
        if (assignment.amount != null && Number.isFinite(assignment.amount)) {
          matchedAmount += assignment.amount
          pricingMoney += assignment.amount
        }
        if (engQty != null) {
          matchedQty += engQty
        } else if (assignment.amount != null && Number.isFinite(assignment.amount)) {
          // Legacy fallback when the price list has no quantity/unit price.
          matchedQty += assignment.amount
        }
      }
      if (!matchedOnTask) continue
      quantity += matchedQty

      if (item.startDate != null && Number.isFinite(item.startDate)) {
        startDate = startDate == null ? item.startDate : Math.min(startDate, item.startDate)
      }
      if (item.dueDate != null && Number.isFinite(item.dueDate)) {
        finishDate = finishDate == null ? item.dueDate : Math.max(finishDate, item.dueDate)
      }

      if (matchedAmount === 0) continue
      mergeMonthlyQuantities(
        monthly,
        allocateQuantityByMonth(matchedAmount, item.startDate, item.dueDate),
      )
    }

    result.set(feature.id, {
      quantity,
      pricingQuantity: pricingMoney,
      startDate,
      finishDate,
      monthly,
    })
  }

  return result
}

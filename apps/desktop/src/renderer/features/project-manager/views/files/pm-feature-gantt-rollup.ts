/** Roll up Gantt task resource / cost assignments into 实务 quantity / dates / months. */

import type { PmWorkItem } from '@toolman/shared'

import type { PmCostRow } from '../cost/pm-cost-catalog'
import { isPmCostType } from '../cost/pm-cost-catalog'
import type { PmResourceType } from '../resource/pm-resource-catalog'
import {
  isEmptyCostAssignment,
  readTaskCostAssignments,
  type TaskCostAssignment,
} from '../schedule/pm-gantt-cost-assignment'
import {
  isAssignmentInCatalog,
  isEmptyAssignment,
  readTaskResourceAssignments,
  type TaskResourceAssignment,
} from '../schedule/pm-gantt-resource-assignment'
import type { PmResourceRow } from '../resource/pm-resource-catalog'
import {
  isPmFeatureCostPrimaryType,
  isScheduleFeatureType,
  PM_FEATURE_COST_PRIMARY_TYPES,
  type PmFeatureCostPrimaryType,
  type PmFeatureRow,
  type PmFeatureType,
} from './pm-features-catalog'

export type FeatureGanttRollup = {
  /**
   * Labor / auxiliary: peak of daily summed concurrent quantities.
   * Machinery: peak of daily max task quantities (overlap does not stack).
   * Material: sum of matching assignment quantities.
   */
  quantity: number
  /** Earliest task start among matching assignments. */
  startDate: number | null
  /** Latest task finish among matching assignments. */
  finishDate: number | null
  /**
   * Labor / auxiliary: peak of daily summed concurrent quantities per month.
   * Machinery: peak of daily max task quantities per month.
   * Material: day-weighted quantity by month key (`YYYY-MM`).
   */
  monthly: Record<string, number>
}

const EMPTY_ROLLUP: FeatureGanttRollup = {
  quantity: 0,
  startDate: null,
  finishDate: null,
  monthly: {},
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Map 实务 type → Gantt / resource-catalog type (null = no schedule counterpart). */
export function featureTypeToResourceType(type: PmFeatureType): PmResourceType | null {
  switch (type) {
    case 'labor':
      return 'labor'
    case 'auxiliary':
      return 'auxiliary'
    case 'material':
      return 'material'
    case 'machinery':
      return 'equipment'
    case 'device':
      return 'device'
    case 'instrument':
      return 'instrument'
    case 'procurement':
      // 采购列表 rolls up Gantt「材料」assignments by name.
      return 'material'
    case 'metering':
    case 'node':
      return null
    default:
      if (isPmFeatureCostPrimaryType(type)) return null
      return null
  }
}

/** Map Gantt / resource-catalog type → 实务 type (null = no practice counterpart). */
export function resourceTypeToFeatureType(type: PmResourceType): PmFeatureType | null {
  switch (type) {
    case 'labor':
      return 'labor'
    case 'auxiliary':
      return 'auxiliary'
    case 'material':
      return 'material'
    case 'equipment':
      return 'machinery'
    case 'device':
      return 'device'
    case 'instrument':
      return 'instrument'
    default:
      return null
  }
}

export type GanttFeatureSeed = {
  type: PmFeatureType
  name: string
  unit: string
}

function defaultUnitForFeatureType(type: PmFeatureType): string {
  switch (type) {
    case 'labor':
      return '人'
    case 'machinery':
    case 'device':
    case 'instrument':
      return '台'
    case 'auxiliary':
    case 'material':
      return ''
    default:
      return ''
  }
}

/** Types that roll up by peak quantity (not cumulative sum). */
export function usesPeakConcurrentRollup(type: PmFeatureType): boolean {
  return (
    type === 'labor' ||
    type === 'auxiliary' ||
    type === 'machinery' ||
    type === 'device' ||
    type === 'instrument'
  )
}

/**
 * Machinery / device / instrument: overlapping tasks do not stack (shared plant).
 * Labor / auxiliary: overlapping tasks sum into daily concurrent demand.
 */
export function usesNonStackingPeakRollup(type: PmFeatureType): boolean {
  return type === 'machinery' || type === 'device' || type === 'instrument'
}

function featureMatchKey(type: PmFeatureType, name: string): string {
  return `${type}::${name.trim()}`
}

/** Build `resourceType\0name` → unit from resource catalog rows. */
export function buildResourceUnitLookup(
  catalog: ReadonlyArray<{ type: PmResourceType; name: string; unit: string }>,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const row of catalog) {
    const name = row.name.trim()
    const unit = row.unit.trim()
    if (!name || !unit) continue
    const key = `${row.type}\0${name}`
    if (!map.has(key)) map.set(key, unit)
  }
  return map
}

/** Build `resourceType\0name` → pricingUnit from resource catalog rows. */
export function buildResourcePricingUnitLookup(
  catalog: ReadonlyArray<{ type: PmResourceType; name: string; unit: string; pricingUnit: string }>,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const row of catalog) {
    const name = row.name.trim()
    if (!name) continue
    const pricing = row.pricingUnit.trim() || row.unit.trim()
    if (!pricing) continue
    const key = `${row.type}\0${name}`
    if (!map.has(key)) map.set(key, pricing)
  }
  return map
}

/**
 * Distinct 采购 seeds from Gantt task material assignments.
 * Ordered to match the resource catalog material order when possible.
 */
export function collectGanttProcurementSeeds(
  items: readonly PmWorkItem[],
  resourceCatalog: readonly PmResourceRow[] = [],
): GanttFeatureSeed[] {
  const unitLookup = buildResourceUnitLookup(resourceCatalog)
  const allSeeds = collectGanttFeatureSeeds(items, unitLookup, resourceCatalog)
  const materialSeeds = allSeeds.filter((seed) => seed.type === 'material')
  return orderProcurementSeedsByResourceCatalog(materialSeeds, resourceCatalog)
}

/**
 * Order material seeds like the resource list (top → bottom).
 * Unmatched seeds follow at the end by name.
 */
export function orderProcurementSeedsByResourceCatalog(
  seeds: readonly GanttFeatureSeed[],
  resourceCatalog: readonly PmResourceRow[],
): GanttFeatureSeed[] {
  const catalogIndex = new Map<string, number>()
  resourceCatalog.forEach((row, index) => {
    if (row.type !== 'material') return
    const name = row.name.trim()
    if (!name) return
    if (!catalogIndex.has(name)) catalogIndex.set(name, index)
  })
  return [...seeds].sort((left, right) => {
    const leftIndex = catalogIndex.get(left.name.trim())
    const rightIndex = catalogIndex.get(right.name.trim())
    if (leftIndex != null && rightIndex != null && leftIndex !== rightIndex) {
      return leftIndex - rightIndex
    }
    if (leftIndex != null && rightIndex == null) return -1
    if (leftIndex == null && rightIndex != null) return 1
    return left.name.localeCompare(right.name, 'zh')
  })
}

const LIVE_PROCUREMENT_ID_PREFIX = 'gantt-procurement:'

export function liveProcurementFeatureId(name: string): string {
  return `${LIVE_PROCUREMENT_ID_PREFIX}${name.trim()}`
}

/**
 * Live 采购 rows from Gantt material seeds.
 * Optional overlays supply cycles / remark when a manual procurement row shares the name.
 */
export function buildLiveProcurementFeatureRows(
  seeds: readonly GanttFeatureSeed[],
  resourceCatalog: readonly PmResourceRow[] = [],
  overlays: readonly PmFeatureRow[] = [],
  applicable: string = 'all',
): PmFeatureRow[] {
  const pricingLookup = buildResourcePricingUnitLookup(resourceCatalog)
  const overlayByName = new Map<string, PmFeatureRow>()
  for (const row of overlays) {
    if (row.type !== 'procurement') continue
    const name = row.name.trim()
    if (!name) continue
    if (!overlayByName.has(name)) overlayByName.set(name, row)
  }

  return seeds
    .filter((seed) => seed.type === 'material' && seed.name.trim())
    .map((seed, index) => {
      const name = seed.name.trim()
      const overlay = overlayByName.get(name)
      const catalogKey = `material\0${name}`
      const unit = seed.unit.trim() || overlay?.unit.trim() || ''
      const pricingUnit =
        pricingLookup.get(catalogKey) ||
        overlay?.pricingUnit.trim() ||
        unit
      return {
        id: liveProcurementFeatureId(name),
        type: 'procurement' as const,
        name,
        unit,
        pricingUnit,
        purchaseCycle: overlay?.purchaseCycle ?? null,
        transportCycle: overlay?.transportCycle ?? null,
        quantity: null,
        remark: overlay?.remark ?? '',
        applicable: overlay?.applicable ?? applicable,
        sortOrder: index,
        parentId: null,
      }
    })
}

/** Drop persisted 采购 rows whose names are covered by live Gantt material rows. */
export function excludeProcurementRowsCoveredByLive(
  rows: readonly PmFeatureRow[],
  liveProcurement: readonly PmFeatureRow[],
): PmFeatureRow[] {
  const liveNames = new Set(
    liveProcurement
      .filter((row) => row.type === 'procurement')
      .map((row) => row.name.trim())
      .filter(Boolean),
  )
  if (liveNames.size === 0) return [...rows]
  return rows.filter(
    (row) => !(row.type === 'procurement' && liveNames.has(row.name.trim())),
  )
}

/**
 * Distinct 实务 seeds from Gantt task resource assignments
 * (labor / auxiliary / material / equipment / device / instrument).
 * Only counts non-empty assignments that include a finite quantity.
 * When `catalog` is provided, assignments not present in that list are ignored.
 * `unitLookup` keys are `${resourceType}\0${name}`.
 */
export function collectGanttFeatureSeeds(
  items: readonly PmWorkItem[],
  unitLookup?: ReadonlyMap<string, string>,
  catalog?: readonly PmResourceRow[],
): GanttFeatureSeed[] {
  const byKey = new Map<string, GanttFeatureSeed>()
  for (const item of items) {
    for (const assignment of readTaskResourceAssignments(item.metadata)) {
      if (isEmptyAssignment(assignment)) continue
      if (assignment.type == null) continue
      if (assignment.quantity == null || !Number.isFinite(assignment.quantity)) continue
      if (catalog && catalog.length > 0 && !isAssignmentInCatalog(assignment, catalog)) {
        continue
      }
      const featureType = resourceTypeToFeatureType(assignment.type)
      if (featureType == null) continue
      const name = assignment.name.trim()
      if (!name) continue
      const key = featureMatchKey(featureType, name)
      if (byKey.has(key)) continue
      const unit =
        unitLookup?.get(`${assignment.type}\0${name}`) ?? defaultUnitForFeatureType(featureType)
      byKey.set(key, { type: featureType, name, unit })
    }
  }
  return [...byKey.values()]
}

export type GanttCostSeed = {
  type: PmFeatureCostPrimaryType
  name: string
  unit: string
  /** Price-list row id when known (preferred identity). */
  costId: string | null
  /** 分部工程 key from the price list (for type → section → order sorting). */
  sectionalWork: string
  /** Display label for the section header (sectionName or sectionalWork). */
  sectionLabel: string
}

function costFeatureMatchKey(type: string, name: string): string {
  return `${type}::${name.trim()}`
}

function costFeatureSeedKey(seed: Pick<GanttCostSeed, 'costId' | 'type' | 'name'>): string {
  if (seed.costId?.trim()) return `id:${seed.costId.trim()}`
  return `name:${costFeatureMatchKey(seed.type, seed.name)}`
}

function resolveCostAssignmentFeatureType(
  assignment: TaskCostAssignment,
): PmFeatureCostPrimaryType | null {
  if (assignment.type != null && isPmFeatureCostPrimaryType(assignment.type)) {
    return assignment.type
  }
  if (assignment.type != null && isPmCostType(assignment.type)) {
    // Resource cost types are not shown on the 资金 page type menu.
    return null
  }
  return null
}

type CostCatalogOrderRank = {
  typeRank: number
  sectionRank: number
  rowRank: number
}

function featureCostTypeRank(type: PmFeatureCostPrimaryType): number {
  const index = PM_FEATURE_COST_PRIMARY_TYPES.indexOf(type)
  return index >= 0 ? index : PM_FEATURE_COST_PRIMARY_TYPES.length
}

function compareCostCatalogOrderRanks(
  left: CostCatalogOrderRank,
  right: CostCatalogOrderRank,
): number {
  if (left.typeRank !== right.typeRank) return left.typeRank - right.typeRank
  if (left.sectionRank !== right.sectionRank) return left.sectionRank - right.sectionRank
  if (left.rowRank !== right.rowRank) return left.rowRank - right.rowRank
  return 0
}

/**
 * Order index for 资金名称列: 分类 → 分部名称 → 价格表顺序.
 * Keys: `id:<costId>` and `name:<type>::<name>` share one rank per catalog row.
 */
export function buildCostCatalogOrderIndex(
  costCatalog: readonly PmCostRow[],
): ReadonlyMap<string, number> {
  const sectionRankByType = new Map<string, number>()
  const sectionCountByType = new Map<string, number>()
  const ranked = costCatalog
    .map((row, rowIndex) => {
      if (!isPmFeatureCostPrimaryType(row.type)) return null
      const name = row.name.trim()
      if (!name) return null
      const section = row.sectionalWork?.trim() ?? ''
      const sectionKey = `${row.type}::${section}`
      let sectionRank = sectionRankByType.get(sectionKey)
      if (sectionRank == null) {
        sectionRank = sectionCountByType.get(row.type) ?? 0
        sectionRankByType.set(sectionKey, sectionRank)
        sectionCountByType.set(row.type, sectionRank + 1)
      }
      return {
        row,
        rank: {
          typeRank: featureCostTypeRank(row.type),
          sectionRank,
          rowRank: Number.isFinite(row.sortOrder) ? row.sortOrder : rowIndex,
        } satisfies CostCatalogOrderRank,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null)

  ranked.sort((left, right) => compareCostCatalogOrderRanks(left.rank, right.rank))

  const index = new Map<string, number>()
  let order = 0
  for (const { row } of ranked) {
    const nameKey = `name:${costFeatureMatchKey(row.type, row.name)}`
    if (index.has(nameKey)) {
      const existing = index.get(nameKey)!
      if (row.id.trim()) {
        const idKey = `id:${row.id.trim()}`
        if (!index.has(idKey)) index.set(idKey, existing)
      }
      continue
    }
    index.set(nameKey, order)
    if (row.id.trim()) index.set(`id:${row.id.trim()}`, order)
    order += 1
  }
  return index
}

/**
 * Distinct 资金 seeds from Gantt task cost assignments (price-list primary types).
 * Only counts non-empty assignments with a finite amount.
 */
export function collectGanttCostSeeds(
  items: readonly PmWorkItem[],
  costCatalog: readonly PmCostRow[] = [],
): GanttCostSeed[] {
  const byKey = new Map<string, GanttCostSeed>()
  const catalogById = new Map(costCatalog.map((row) => [row.id, row]))
  for (const item of items) {
    for (const assignment of readTaskCostAssignments(item.metadata)) {
      if (isEmptyCostAssignment(assignment)) continue
      if (assignment.amount == null || !Number.isFinite(assignment.amount)) continue
      const featureType = resolveCostAssignmentFeatureType(assignment)
      if (featureType == null) continue
      const name = assignment.name.trim()
      if (!name) continue
      const catalogRow =
        (assignment.costId ? catalogById.get(assignment.costId) : undefined) ??
        costCatalog.find(
          (row) => row.type === featureType && row.name.trim() === name,
        )
      const sectionalWork = catalogRow?.sectionalWork?.trim() ?? ''
      const sectionLabel =
        catalogRow?.sectionName?.trim() || sectionalWork
      const seed: GanttCostSeed = {
        type: featureType,
        name,
        unit: catalogRow?.unit?.trim() ?? '',
        costId: catalogRow?.id ?? assignment.costId ?? null,
        sectionalWork,
        sectionLabel,
      }
      const key = costFeatureSeedKey(seed)
      if (byKey.has(key)) continue
      byKey.set(key, seed)
    }
  }
  return orderCostSeedsByCatalog([...byKey.values()], costCatalog)
}

/**
 * Order 资金 seeds: 分类 → 分部名称 → 价格表行顺序.
 * Unmatched seeds (not in catalog) follow at the end by type, section, then name.
 */
export function orderCostSeedsByCatalog(
  seeds: readonly GanttCostSeed[],
  costCatalog: readonly PmCostRow[],
): GanttCostSeed[] {
  const catalogIndex = buildCostCatalogOrderIndex(costCatalog)

  const indexFor = (seed: GanttCostSeed): number | null => {
    if (seed.costId?.trim()) {
      const byId = catalogIndex.get(`id:${seed.costId.trim()}`)
      if (byId != null) return byId
    }
    return catalogIndex.get(`name:${costFeatureMatchKey(seed.type, seed.name)}`) ?? null
  }

  return [...seeds].sort((left, right) => {
    const leftIndex = indexFor(left)
    const rightIndex = indexFor(right)
    if (leftIndex != null && rightIndex != null && leftIndex !== rightIndex) {
      return leftIndex - rightIndex
    }
    if (leftIndex != null && rightIndex == null) return -1
    if (leftIndex == null && rightIndex != null) return 1
    const typeDelta = featureCostTypeRank(left.type) - featureCostTypeRank(right.type)
    if (typeDelta !== 0) return typeDelta
    const sectionDelta = left.sectionalWork.localeCompare(right.sectionalWork, 'zh')
    if (sectionDelta !== 0) return sectionDelta
    return left.name.localeCompare(right.name, 'zh')
  })
}

export function costFeatureRowOrderKey(
  type: string,
  name: string,
  costId?: string | null,
): string {
  if (costId?.trim()) return `id:${costId.trim()}`
  return `name:${costFeatureMatchKey(type, name)}`
}

/** Horizontal amount for a funds row: sum of month shares (= allocated when dated). */
export function rollupHorizontalAmount(
  rollup: FeatureGanttRollup | null | undefined,
): number {
  if (!rollup) return 0
  let monthSum = 0
  let hasMonth = false
  for (const value of Object.values(rollup.monthly)) {
    if (!Number.isFinite(value)) continue
    monthSum += value
    hasMonth = true
  }
  if (hasMonth) return Math.round(monthSum * 100) / 100
  // Undated assignments have no month columns; fall back to allocated total.
  return Number.isFinite(rollup.quantity) ? rollup.quantity : 0
}

export type FundsSectionMeta = {
  sectionalWork: string
  sectionLabel: string
}

export type FundsDisplayEntry =
  | {
      kind: 'section'
      id: string
      type: PmFeatureCostPrimaryType
      sectionalWork: string
      label: string
      rollup: FeatureGanttRollup
    }
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
  return { quantity: 0, startDate: null, finishDate: null, monthly: {} }
}

function mergeFundsRollup(
  target: FeatureGanttRollup,
  addition: FeatureGanttRollup | null | undefined,
): void {
  if (!addition) return
  if (Number.isFinite(addition.quantity)) target.quantity += addition.quantity
  if (addition.startDate != null) {
    target.startDate =
      target.startDate == null
        ? addition.startDate
        : Math.min(target.startDate, addition.startDate)
  }
  if (addition.finishDate != null) {
    target.finishDate =
      target.finishDate == null
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
      // Accumulate following rows in this section group (peek ahead via continuing loop state).
      // We'll fill after scanning — see second pass below.
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

  // Fill section rollups from following detail rows until the next section.
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
      applicable: overlay?.applicable ?? applicable,
      sortOrder: index,
      parentId: null,
    }
  })
}

function parseFundsFeatureCostId(featureId: string): string | null {
  const prefix = 'gantt-cost:id:'
  if (!featureId.startsWith(prefix)) return null
  const id = featureId.slice(prefix.length).trim()
  return id || null
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
 * For each 资金 feature row, sum cost-assignment amounts from matching tasks
 * and day-weight them across months (same format as material resource stats).
 */
export function computeFeatureCostRollups(
  items: readonly PmWorkItem[],
  features: readonly PmFeatureRow[],
): Map<string, FeatureGanttRollup> {
  const result = new Map<string, FeatureGanttRollup>()

  for (const feature of features) {
    if (!isPmFeatureCostPrimaryType(feature.type)) {
      result.set(feature.id, { ...EMPTY_ROLLUP, monthly: {} })
      continue
    }

    let quantity = 0
    let startDate: number | null = null
    let finishDate: number | null = null
    const monthly: Record<string, number> = {}

    for (const item of items) {
      const assignments = readTaskCostAssignments(item.metadata)
      let matchedAmount = 0
      let matchedOnTask = false
      for (const assignment of assignments) {
        if (!costAssignmentMatchesFeature(assignment, feature)) continue
        matchedOnTask = true
        if (assignment.amount != null && Number.isFinite(assignment.amount)) {
          matchedAmount += assignment.amount
          quantity += assignment.amount
        }
      }
      if (!matchedOnTask) continue

      if (item.startDate != null && Number.isFinite(item.startDate)) {
        startDate =
          startDate == null ? item.startDate : Math.min(startDate, item.startDate)
      }
      if (item.dueDate != null && Number.isFinite(item.dueDate)) {
        finishDate =
          finishDate == null ? item.dueDate : Math.max(finishDate, item.dueDate)
      }

      if (matchedAmount === 0) continue
      mergeMonthlyQuantities(
        monthly,
        allocateQuantityByMonth(matchedAmount, item.startDate, item.dueDate),
      )
    }

    result.set(feature.id, { quantity, startDate, finishDate, monthly })
  }

  return result
}

/**
 * Live 实务 rows for labor/auxiliary/material/machinery/device/instrument from current Gantt seeds.
 * Optional `overlays` supply id / unit / remark when the same type+name exists in catalog.
 */
export function buildLiveScheduleFeatureRows(
  seeds: readonly GanttFeatureSeed[],
  overlays: readonly PmFeatureRow[] = [],
  applicable: string = 'all',
): PmFeatureRow[] {
  const overlayByKey = new Map<string, PmFeatureRow>()
  for (const row of overlays) {
    if (!isScheduleFeatureType(row.type)) continue
    const name = row.name.trim()
    if (!name) continue
    overlayByKey.set(featureMatchKey(row.type, name), row)
  }

  return seeds.map((seed, index) => {
    const overlay = overlayByKey.get(featureMatchKey(seed.type, seed.name))
    return {
      id: overlay?.id ?? `gantt:${seed.type}:${seed.name}`,
      type: seed.type,
      name: seed.name,
      unit: overlay?.unit.trim() ? overlay.unit : seed.unit,
      pricingUnit: overlay?.pricingUnit ?? '',
      purchaseCycle: overlay?.purchaseCycle ?? null,
      transportCycle: overlay?.transportCycle ?? null,
      quantity: null,
      remark: overlay?.remark ?? '',
      applicable: overlay?.applicable ?? applicable,
      sortOrder: index,
      parentId: null,
    }
  })
}

export function formatMonthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

export function parseMonthKey(key: string): { year: number; monthIndex: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isFinite(year) || month < 1 || month > 12) return null
  return { year, monthIndex: month - 1 }
}

function startOfLocalDay(ms: number): number {
  const date = new Date(ms)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function daysInclusive(startMs: number, endMs: number): number {
  const start = startOfLocalDay(startMs)
  const end = startOfLocalDay(endMs)
  if (end < start) return 1
  return Math.floor((end - start) / MS_PER_DAY) + 1
}

/**
 * Split a quantity across calendar months by overlapping task days.
 * Missing one bound → put all qty in the known month; missing both → {}.
 */
export function allocateQuantityByMonth(
  quantity: number,
  startDate: number | null | undefined,
  finishDate: number | null | undefined,
): Record<string, number> {
  if (!Number.isFinite(quantity) || quantity === 0) return {}

  const hasStart = startDate != null && Number.isFinite(startDate)
  const hasFinish = finishDate != null && Number.isFinite(finishDate)
  if (!hasStart && !hasFinish) return {}

  if (hasStart && !hasFinish) {
    const d = new Date(startDate!)
    return { [formatMonthKey(d.getFullYear(), d.getMonth())]: quantity }
  }
  if (!hasStart && hasFinish) {
    const d = new Date(finishDate!)
    return { [formatMonthKey(d.getFullYear(), d.getMonth())]: quantity }
  }

  let start = startOfLocalDay(startDate!)
  let end = startOfLocalDay(finishDate!)
  if (end < start) {
    const swap = start
    start = end
    end = swap
  }

  const totalDays = daysInclusive(start, end)
  if (totalDays <= 0) return {}

  const monthly: Record<string, number> = {}
  let cursor = new Date(start)
  let assigned = 0
  const keys: string[] = []

  while (cursor.getTime() <= end) {
    const year = cursor.getFullYear()
    const monthIndex = cursor.getMonth()
    const key = formatMonthKey(year, monthIndex)
    const monthStart = new Date(year, monthIndex, 1).getTime()
    const monthEnd = new Date(year, monthIndex + 1, 0).getTime()
    const overlapStart = Math.max(start, monthStart)
    const overlapEnd = Math.min(end, monthEnd)
    const overlapDays = daysInclusive(overlapStart, overlapEnd)
    if (overlapDays > 0) {
      keys.push(key)
      const share = (quantity * overlapDays) / totalDays
      monthly[key] = (monthly[key] ?? 0) + share
      assigned += share
    }
    cursor = new Date(year, monthIndex + 1, 1)
  }

  // Absorb floating error into the last month so monthly sums match total qty.
  if (keys.length > 0) {
    const lastKey = keys[keys.length - 1]!
    const delta = quantity - assigned
    if (Math.abs(delta) > 1e-9) {
      monthly[lastKey] = (monthly[lastKey] ?? 0) + delta
    }
  }

  return monthly
}

export function mergeMonthlyQuantities(
  target: Record<string, number>,
  addition: Record<string, number>,
): void {
  for (const [key, value] of Object.entries(addition)) {
    if (!Number.isFinite(value) || value === 0) continue
    target[key] = (target[key] ?? 0) + value
  }
}

export type HeadcountSpan = {
  quantity: number
  startDate: number | null | undefined
  finishDate: number | null | undefined
}

function resolveInclusiveDaySpan(
  startDate: number | null | undefined,
  finishDate: number | null | undefined,
): { startDay: number; endDay: number } | null {
  const hasStart = startDate != null && Number.isFinite(startDate)
  const hasFinish = finishDate != null && Number.isFinite(finishDate)
  if (!hasStart && !hasFinish) return null

  if (hasStart && !hasFinish) {
    const day = startOfLocalDay(startDate!)
    return { startDay: day, endDay: day }
  }
  if (!hasStart && hasFinish) {
    const day = startOfLocalDay(finishDate!)
    return { startDay: day, endDay: day }
  }

  let startDay = startOfLocalDay(startDate!)
  let endDay = startOfLocalDay(finishDate!)
  if (endDay < startDay) {
    const swap = startDay
    startDay = endDay
    endDay = swap
  }
  return { startDay, endDay }
}

/**
 * Peak quantity by calendar day, then peak within each month.
 * - `sum`: labor / auxiliary — add overlapping task requirements on the same day.
 * - `max`: machinery — take the largest single-task requirement on the same day
 *   (critical + normal work overlapping must not double-count shared plant).
 */
export function allocatePeakHeadcountByMonth(
  spans: readonly HeadcountSpan[],
  mode: 'sum' | 'max' = 'sum',
): { monthly: Record<string, number>; peak: number } {
  const daily = new Map<number, number>()

  for (const span of spans) {
    if (!Number.isFinite(span.quantity) || span.quantity === 0) continue
    const range = resolveInclusiveDaySpan(span.startDate, span.finishDate)
    if (!range) continue

    const cursor = new Date(range.startDay)
    while (cursor.getTime() <= range.endDay) {
      const day = startOfLocalDay(cursor.getTime())
      const prev = daily.get(day) ?? 0
      daily.set(day, mode === 'max' ? Math.max(prev, span.quantity) : prev + span.quantity)
      cursor.setDate(cursor.getDate() + 1)
    }
  }

  const monthly: Record<string, number> = {}
  let peak = 0
  for (const [dayMs, qty] of daily) {
    if (qty > peak) peak = qty
    const date = new Date(dayMs)
    const key = formatMonthKey(date.getFullYear(), date.getMonth())
    const prev = monthly[key] ?? 0
    if (qty > prev) monthly[key] = qty
  }

  return { monthly, peak }
}

/** Sorted unique month keys across rollups (from min start to max finish). */
export function collectRollupMonthKeys(
  rollups: ReadonlyMap<string, FeatureGanttRollup>,
): string[] {
  let minStart: number | null = null
  let maxFinish: number | null = null
  const present = new Set<string>()

  for (const rollup of rollups.values()) {
    for (const [key, value] of Object.entries(rollup.monthly)) {
      if (value !== 0) present.add(key)
    }
    if (rollup.startDate != null) {
      minStart = minStart == null ? rollup.startDate : Math.min(minStart, rollup.startDate)
    }
    if (rollup.finishDate != null) {
      maxFinish = maxFinish == null ? rollup.finishDate : Math.max(maxFinish, rollup.finishDate)
    }
  }

  if (minStart != null && maxFinish != null) {
    let start = startOfLocalDay(minStart)
    let end = startOfLocalDay(maxFinish)
    if (end < start) {
      const swap = start
      start = end
      end = swap
    }
    let cursor = new Date(start)
    while (cursor.getTime() <= end) {
      present.add(formatMonthKey(cursor.getFullYear(), cursor.getMonth()))
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    }
  }

  return [...present].sort()
}

export type RollupYearBand = {
  year: number
  monthKeys: string[]
}

/** Group consecutive `YYYY-MM` keys into year bands for colspan headers. */
export function groupMonthKeysByYear(monthKeys: readonly string[]): RollupYearBand[] {
  const bands: RollupYearBand[] = []
  for (const key of monthKeys) {
    const parsed = parseMonthKey(key)
    if (!parsed) continue
    const last = bands[bands.length - 1]
    if (last && last.year === parsed.year) {
      last.monthKeys.push(key)
    } else {
      bands.push({ year: parsed.year, monthKeys: [key] })
    }
  }
  return bands
}

/** Pretty-print total rollup qty (trim trailing zeros). */
export function formatRollupQuantity(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return '—'
  const rounded = Math.round(value * 1000) / 1000
  if (Number.isInteger(rounded)) return String(rounded)
  return String(rounded)
}

/** Month-column qty: always two decimal places. */
export function formatRollupMonthQuantity(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return '—'
  return (Math.round(value * 100) / 100).toFixed(2)
}

function assignmentMatchesFeature(
  assignment: TaskResourceAssignment,
  feature: Pick<PmFeatureRow, 'type' | 'name'>,
  resourceType: PmResourceType,
): boolean {
  if (assignment.type !== resourceType) return false
  const featureName = feature.name.trim()
  if (!featureName) return false
  return assignment.name.trim() === featureName
}

/**
 * For each feature row, aggregate quantities from tasks whose resource assignments
 * match the row's mapped resource type + name and derive start/finish.
 *
 * Labor / auxiliary: peak of daily summed concurrent quantities.
 * Machinery: peak of daily max task quantities (overlap does not stack).
 * Material: quantity sums with day-weighted month allocation.
 */
export function computeFeatureGanttRollups(
  items: readonly PmWorkItem[],
  features: readonly PmFeatureRow[],
): Map<string, FeatureGanttRollup> {
  const result = new Map<string, FeatureGanttRollup>()

  for (const feature of features) {
    const resourceType = featureTypeToResourceType(feature.type)
    if (resourceType == null) {
      result.set(feature.id, { ...EMPTY_ROLLUP, monthly: {} })
      continue
    }

    const usePeak = usesPeakConcurrentRollup(feature.type)
    const peakMode = usesNonStackingPeakRollup(feature.type) ? 'max' : 'sum'
    let quantity = 0
    let startDate: number | null = null
    let finishDate: number | null = null
    const monthly: Record<string, number> = {}
    const peakSpans: HeadcountSpan[] = []

    for (const item of items) {
      const assignments = readTaskResourceAssignments(item.metadata)
      let matchedQty = 0
      let matchedOnTask = false
      for (const assignment of assignments) {
        if (!assignmentMatchesFeature(assignment, feature, resourceType)) continue
        matchedOnTask = true
        if (assignment.quantity != null && Number.isFinite(assignment.quantity)) {
          matchedQty += assignment.quantity
          if (!usePeak) quantity += assignment.quantity
        }
      }
      if (!matchedOnTask) continue

      if (item.startDate != null && Number.isFinite(item.startDate)) {
        startDate =
          startDate == null ? item.startDate : Math.min(startDate, item.startDate)
      }
      if (item.dueDate != null && Number.isFinite(item.dueDate)) {
        finishDate =
          finishDate == null ? item.dueDate : Math.max(finishDate, item.dueDate)
      }

      if (matchedQty === 0) continue

      if (usePeak) {
        peakSpans.push({
          quantity: matchedQty,
          startDate: item.startDate,
          finishDate: item.dueDate,
        })
      } else {
        mergeMonthlyQuantities(
          monthly,
          allocateQuantityByMonth(matchedQty, item.startDate, item.dueDate),
        )
      }
    }

    if (usePeak) {
      const peak = allocatePeakHeadcountByMonth(peakSpans, peakMode)
      result.set(feature.id, {
        quantity: peak.peak,
        startDate,
        finishDate,
        monthly: peak.monthly,
      })
    } else {
      result.set(feature.id, { quantity, startDate, finishDate, monthly })
    }
  }

  return result
}

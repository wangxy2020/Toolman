/** Map 实务 types to Gantt / resource-catalog types and metering / pricing kinds. */

import type { PmCostRow } from '../cost/pm-cost-catalog'
import type { PmResourceType } from '../resource/pm-resource-catalog'
import {
  isPmFeatureCostPrimaryType,
  PM_FEATURE_COST_PRIMARY_TYPES,
  type PmFeatureCostPrimaryType,
  type PmFeatureType,
} from './pm-features-catalog'

export type FeatureGanttRollup = {
  /**
   * Labor / auxiliary: peak of daily summed concurrent quantities.
   * Machinery: peak of daily max task quantities (overlap does not stack).
   * Material: sum of matching assignment quantities.
   */
  quantity: number
  /**
   * Pricing usage for 合价 (= pricingQuantity × unitPrice):
   * - labor: total workdays (sum of daily concurrent headcount)
   * - auxiliary: peak concurrent quantity
   * - machinery / device / instrument: total machine-shifts (sum of daily max)
   * - material: same as quantity (assignment sum)
   */
  pricingQuantity: number
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

export const EMPTY_FEATURE_GANTT_ROLLUP: FeatureGanttRollup = {
  quantity: 0,
  pricingQuantity: 0,
  startDate: null,
  finishDate: null,
  monthly: {},
}

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

/** How the displayed 数量 column is derived from Gantt assignments. */
export type ResourceQuantityMeteringKind = 'peakStacking' | 'peakNonStacking' | 'sumTotal'

export function resourceQuantityMeteringKind(
  type: PmFeatureType,
): ResourceQuantityMeteringKind | null {
  if (type === 'material' || type === 'procurement') return 'sumTotal'
  if (usesNonStackingPeakRollup(type)) return 'peakNonStacking'
  if (usesPeakConcurrentRollup(type)) return 'peakStacking'
  return null
}

/** How 计价数量 is derived for 合价. */
export type ResourcePricingQuantityKind =
  | 'totalWorkdays'
  | 'peak'
  | 'totalShifts'
  | 'sumTotal'

export function resourcePricingQuantityKind(
  type: PmFeatureType,
): ResourcePricingQuantityKind | null {
  switch (type) {
    case 'labor':
      return 'totalWorkdays'
    case 'auxiliary':
      return 'peak'
    case 'machinery':
    case 'device':
    case 'instrument':
      return 'totalShifts'
    case 'material':
    case 'procurement':
      return 'sumTotal'
    default:
      return null
  }
}

export function resolvePricingQuantity(
  type: PmFeatureType,
  peak: number,
  usageTotal: number,
  sumQuantity: number,
): number {
  switch (resourcePricingQuantityKind(type)) {
    case 'peak':
      return peak
    case 'totalWorkdays':
    case 'totalShifts':
      return usageTotal
    case 'sumTotal':
      return sumQuantity
    default:
      return sumQuantity
  }
}

export function featureMatchKey(type: PmFeatureType, name: string): string {
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

/** Build `resourceType\0name` → unitPrice from resource catalog rows. */
export function buildResourceUnitPriceLookup(
  catalog: ReadonlyArray<{ type: PmResourceType; name: string; unitPrice: number | null }>,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of catalog) {
    const name = row.name.trim()
    if (!name) continue
    if (row.unitPrice == null || !Number.isFinite(row.unitPrice)) continue
    const key = `${row.type}\0${name}`
    if (!map.has(key)) map.set(key, row.unitPrice)
  }
  return map
}

export function costFeatureMatchKey(type: string, name: string): string {
  return `${type}::${name.trim()}`
}

export function featureCostTypeRank(type: PmFeatureCostPrimaryType): number {
  const index = PM_FEATURE_COST_PRIMARY_TYPES.indexOf(type)
  return index >= 0 ? index : PM_FEATURE_COST_PRIMARY_TYPES.length
}

type CostCatalogOrderRank = {
  typeRank: number
  sectionRank: number
  rowRank: number
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

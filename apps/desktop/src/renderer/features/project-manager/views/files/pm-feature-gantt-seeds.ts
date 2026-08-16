/** Collect Gantt feature / procurement / cost seeds and order them. */

import type { PmWorkItem } from '@toolman/shared'

import type { PmCostRow } from '../cost/pm-cost-catalog'
import { isPmCostType } from '../cost/pm-cost-catalog'
import {
  isEmptyCostAssignment,
  readTaskCostAssignments,
  type TaskCostAssignment,
} from '../schedule/pm-gantt-cost-assignment'
import {
  isAssignmentInCatalog,
  isEmptyAssignment,
  readTaskResourceAssignments,
} from '../schedule/pm-gantt-resource-assignment'
import type { PmResourceRow } from '../resource/pm-resource-catalog'
import {
  isPmFeatureCostPrimaryType,
  type PmFeatureCostPrimaryType,
  type PmFeatureRow,
  type PmFeatureType,
} from './pm-features-catalog'
import {
  buildCostCatalogOrderIndex,
  buildResourceUnitLookup,
  costFeatureMatchKey,
  featureCostTypeRank,
  featureMatchKey,
  resourceTypeToFeatureType,
} from './pm-feature-gantt-type-map'

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
  /** Price-list unit price when known. */
  unitPrice: number | null
  /** Price-list row id when known (preferred identity). */
  costId: string | null
  /** 分部工程 key from the price list (for type → section → order sorting). */
  sectionalWork: string
  /** Display label for the section header (sectionName or sectionalWork). */
  sectionLabel: string
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
        unitPrice:
          catalogRow?.unitPrice != null && Number.isFinite(catalogRow.unitPrice)
            ? catalogRow.unitPrice
            : null,
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

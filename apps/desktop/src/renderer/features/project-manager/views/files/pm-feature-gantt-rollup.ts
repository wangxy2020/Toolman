/** Roll up Gantt task resource / cost assignments into 实务 quantity / dates / months. */

import type { PmWorkItem } from '@toolman/shared'

import {
  readTaskResourceAssignments,
  type TaskResourceAssignment,
} from '../schedule/pm-gantt-resource-assignment'
import type { PmResourceRow, PmResourceType } from '../resource/pm-resource-catalog'
import {
  isScheduleFeatureType,
  type PmFeatureRow,
} from './pm-features-catalog'
import {
  allocatePeakHeadcountByMonth,
  allocateQuantityByMonth,
  mergeMonthlyQuantities,
  type HeadcountSpan,
} from './pm-feature-gantt-monthly'
import {
  liveProcurementFeatureId,
  type GanttFeatureSeed,
} from './pm-feature-gantt-seeds'
import {
  buildResourcePricingUnitLookup,
  buildResourceUnitPriceLookup,
  EMPTY_FEATURE_GANTT_ROLLUP,
  featureMatchKey,
  featureTypeToResourceType,
  resolvePricingQuantity,
  usesNonStackingPeakRollup,
  usesPeakConcurrentRollup,
  type FeatureGanttRollup,
} from './pm-feature-gantt-type-map'

export * from './pm-feature-gantt-type-map'
export * from './pm-feature-gantt-seeds'
export * from './pm-feature-gantt-cost-rollup'
export * from './pm-feature-gantt-monthly'
export * from './pm-feature-gantt-node-rollup'

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
        code: overlay?.code ?? '',
        featureDescription: overlay?.featureDescription ?? '',
        sectionalWork: overlay?.sectionalWork ?? '',
        unitPrice: overlay?.unitPrice ?? null,
        applicable: overlay?.applicable ?? applicable,
        sortOrder: index,
        parentId: null,
      }
    })
}

/**
 * Live 实务 rows for labor/auxiliary/material/machinery/device/instrument from current Gantt seeds.
 * Optional `overlays` supply id / unit / remark when the same type+name exists in catalog.
 * `pricingUnit` / `unitPrice` prefer the resource catalog (资源表).
 */
export function buildLiveScheduleFeatureRows(
  seeds: readonly GanttFeatureSeed[],
  resourceCatalog: readonly PmResourceRow[] = [],
  overlays: readonly PmFeatureRow[] = [],
  applicable: string = 'all',
): PmFeatureRow[] {
  const pricingLookup = buildResourcePricingUnitLookup(resourceCatalog)
  const unitPriceLookup = buildResourceUnitPriceLookup(resourceCatalog)
  const overlayByKey = new Map<string, PmFeatureRow>()
  for (const row of overlays) {
    if (!isScheduleFeatureType(row.type)) continue
    const name = row.name.trim()
    if (!name) continue
    overlayByKey.set(featureMatchKey(row.type, name), row)
  }

  return seeds.map((seed, index) => {
    const overlay = overlayByKey.get(featureMatchKey(seed.type, seed.name))
    const resourceType = featureTypeToResourceType(seed.type)
    const catalogKey = resourceType ? `${resourceType}\0${seed.name.trim()}` : ''
    const unit = overlay?.unit.trim() ? overlay.unit : seed.unit
    const catalogPricing = catalogKey ? pricingLookup.get(catalogKey) : undefined
    const catalogUnitPrice = catalogKey ? unitPriceLookup.get(catalogKey) : undefined
    const pricingUnit =
      catalogPricing ||
      overlay?.pricingUnit.trim() ||
      unit.trim() ||
      ''
    const unitPrice =
      catalogUnitPrice != null
        ? catalogUnitPrice
        : overlay?.unitPrice != null && Number.isFinite(overlay.unitPrice)
          ? overlay.unitPrice
          : null
    return {
      id: overlay?.id ?? `gantt:${seed.type}:${seed.name}`,
      type: seed.type,
      name: seed.name,
      unit,
      pricingUnit,
      purchaseCycle: overlay?.purchaseCycle ?? null,
      transportCycle: overlay?.transportCycle ?? null,
      quantity: null,
      remark: overlay?.remark ?? '',
      code: overlay?.code ?? '',
      featureDescription: overlay?.featureDescription ?? '',
      sectionalWork: overlay?.sectionalWork ?? '',
      unitPrice,
      applicable: overlay?.applicable ?? applicable,
      sortOrder: index,
      parentId: null,
    }
  })
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
      result.set(feature.id, { ...EMPTY_FEATURE_GANTT_ROLLUP, monthly: {} })
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
        pricingQuantity: resolvePricingQuantity(
          feature.type,
          peak.peak,
          peak.usageTotal,
          peak.peak,
        ),
        startDate,
        finishDate,
        monthly: peak.monthly,
      })
    } else {
      result.set(feature.id, {
        quantity,
        pricingQuantity: resolvePricingQuantity(feature.type, quantity, quantity, quantity),
        startDate,
        finishDate,
        monthly,
      })
    }
  }

  return result
}

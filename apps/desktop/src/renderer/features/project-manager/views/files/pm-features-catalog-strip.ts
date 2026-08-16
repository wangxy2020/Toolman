/** Strip / prune live and legacy feature catalog rows before persist. */

import { reindexFeatureRows } from './pm-features-catalog-rows'
import {
  featureMatchKey,
  isPmFeatureCostPrimaryType,
  isScheduleFeatureType,
  type PmFeatureRow,
} from './pm-features-catalog-types'

/** Legacy starter rows that should not appear once schedule types auto-sync from Gantt. */
const LEGACY_SCHEDULE_FEATURE_PLACEHOLDERS: ReadonlySet<string> = new Set([
  'labor::现场管理人员配置',
  'material::主材进场计划',
  'machinery::关键机械进场',
])

/** Drop legacy labor/auxiliary/material/machinery placeholders from stored catalogs. */
export function pruneLegacyScheduleFeaturePlaceholders(
  rows: readonly PmFeatureRow[],
): { rows: PmFeatureRow[]; changed: boolean } {
  const next = rows.filter(
    (row) => !LEGACY_SCHEDULE_FEATURE_PLACEHOLDERS.has(featureMatchKey(row.type, row.name)),
  )
  if (next.length === rows.length) {
    return { rows: [...rows], changed: false }
  }
  return { rows: reindexFeatureRows(next), changed: true }
}

/**
 * Remove labor/auxiliary/material/machinery rows from persisted catalogs.
 * Those types are live-derived from Gantt assignments and must not linger in storage.
 */
export function stripScheduleFeatureRows(
  rows: readonly PmFeatureRow[],
): { rows: PmFeatureRow[]; changed: boolean } {
  const next = rows.filter((row) => !isScheduleFeatureType(row.type))
  if (next.length === rows.length) {
    return { rows: [...rows], changed: false }
  }
  return { rows: reindexFeatureRows(next), changed: true }
}

/**
 * Remove price-list / 资金 cost types from persisted catalogs.
 * Those rows are live-derived from Gantt cost assignments.
 */
export function stripLiveCostFeatureRows(
  rows: readonly PmFeatureRow[],
): { rows: PmFeatureRow[]; changed: boolean } {
  const next = rows.filter((row) => !isPmFeatureCostPrimaryType(row.type))
  if (next.length === rows.length) {
    return { rows: [...rows], changed: false }
  }
  return { rows: reindexFeatureRows(next), changed: true }
}

/** Live 采购 rows synced from Gantt materials (id prefix `gantt-procurement:`). */
export function isLiveProcurementFeatureRow(
  row: Pick<PmFeatureRow, 'id' | 'type'>,
): boolean {
  return row.type === 'procurement' && row.id.startsWith('gantt-procurement:')
}

/** Live 节点 rows synced from Gantt milestones (id prefix `gantt-node:`). */
export function isLiveNodeFeatureRow(row: Pick<PmFeatureRow, 'id' | 'type'>): boolean {
  return row.type === 'node' && row.id.startsWith('gantt-node:')
}

/**
 * Remove Gantt-synced 采购 material rows from persisted catalogs.
 */
export function stripLiveProcurementFeatureRows(
  rows: readonly PmFeatureRow[],
): { rows: PmFeatureRow[]; changed: boolean } {
  const next = rows.filter((row) => !isLiveProcurementFeatureRow(row))
  if (next.length === rows.length) {
    return { rows: [...rows], changed: false }
  }
  return { rows: reindexFeatureRows(next), changed: true }
}

/** Remove Gantt-synced 节点 rows from persisted catalogs. */
export function stripLiveNodeFeatureRows(
  rows: readonly PmFeatureRow[],
): { rows: PmFeatureRow[]; changed: boolean } {
  const next = rows.filter(
    (row) =>
      !isLiveNodeFeatureRow(row) &&
      !(row.type === 'node' && row.name.trim() === '关键里程碑节点'),
  )
  if (next.length === rows.length) {
    return { rows: [...rows], changed: false }
  }
  return { rows: reindexFeatureRows(next), changed: true }
}

/** Strip schedule-synced, cost-synced, and Gantt-material procurement live rows before persist. */
export function stripLiveFeatureRows(
  rows: readonly PmFeatureRow[],
): { rows: PmFeatureRow[]; changed: boolean } {
  const schedule = stripScheduleFeatureRows(rows)
  const cost = stripLiveCostFeatureRows(schedule.rows)
  const procurement = stripLiveProcurementFeatureRows(cost.rows)
  const nodes = stripLiveNodeFeatureRows(procurement.rows)
  return {
    rows: nodes.rows,
    changed: schedule.changed || cost.changed || procurement.changed || nodes.changed,
  }
}

/**
 * Persist catalog rows: drop live Gantt rows, but keep 采购周期/运输周期/备注 overlays
 * for materials that are still live-synced into the procurement list.
 */
export function persistFeatureCatalogRows(rows: readonly PmFeatureRow[]): PmFeatureRow[] {
  const stripped = stripLiveFeatureRows(rows).rows
  const liveProcurement = rows.filter(isLiveProcurementFeatureRow)
  if (liveProcurement.length === 0) return stripped

  const next = stripped.map((row) => ({ ...row }))
  const indexByName = new Map<string, number>()
  next.forEach((row, index) => {
    if (row.type !== 'procurement') return
    const name = row.name.trim()
    if (!name || indexByName.has(name)) return
    indexByName.set(name, index)
  })

  let changed = false
  for (const live of liveProcurement) {
    const name = live.name.trim()
    if (!name) continue
    const worthPersisting =
      live.purchaseCycle != null ||
      live.transportCycle != null ||
      live.remark.trim().length > 0
    const existingIndex = indexByName.get(name)
    if (!worthPersisting) {
      if (existingIndex == null) continue
      // Keep existing overlay row but refresh unit fields from live.
      const existing = next[existingIndex]!
      if (
        existing.unit !== live.unit ||
        existing.pricingUnit !== live.pricingUnit
      ) {
        next[existingIndex] = {
          ...existing,
          unit: live.unit,
          pricingUnit: live.pricingUnit,
        }
        changed = true
      }
      continue
    }
    if (existingIndex != null) {
      const existing = next[existingIndex]!
      if (
        existing.unit !== live.unit ||
        existing.pricingUnit !== live.pricingUnit ||
        existing.purchaseCycle !== live.purchaseCycle ||
        existing.transportCycle !== live.transportCycle ||
        existing.remark !== live.remark
      ) {
        next[existingIndex] = {
          ...existing,
          unit: live.unit,
          pricingUnit: live.pricingUnit,
          purchaseCycle: live.purchaseCycle,
          transportCycle: live.transportCycle,
          remark: live.remark,
        }
        changed = true
      }
      continue
    }
    next.push({
      ...live,
      id: crypto.randomUUID(),
      parentId: null,
    })
    changed = true
  }

  return changed ? reindexFeatureRows(next) : stripped
}

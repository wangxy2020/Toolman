/** Roll up Gantt task resource assignments into 实务 quantity / dates / months. */

import type { PmWorkItem } from '@toolman/shared'

import type { PmResourceType } from '../resource/pm-resource-catalog'
import {
  isAssignmentInCatalog,
  isEmptyAssignment,
  readTaskResourceAssignments,
  type TaskResourceAssignment,
} from '../schedule/pm-gantt-resource-assignment'
import type { PmResourceRow } from '../resource/pm-resource-catalog'
import {
  isScheduleFeatureType,
  reindexFeatureRows,
  type PmFeatureRow,
  type PmFeatureType,
} from './pm-features-catalog'

export type FeatureGanttRollup = {
  /**
   * Labor: peak concurrent headcount across the schedule.
   * Material / machinery: sum of matching assignment quantities.
   */
  quantity: number
  /** Earliest task start among matching assignments. */
  startDate: number | null
  /** Latest task finish among matching assignments. */
  finishDate: number | null
  /**
   * Labor: peak concurrent headcount within each calendar month.
   * Material / machinery: day-weighted quantity by month key (`YYYY-MM`).
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
    case 'material':
      return 'material'
    case 'machinery':
      return 'equipment'
    case 'procurement':
    case 'metering':
    case 'node':
    case 'funds':
      return null
    default:
      return null
  }
}

/** Map Gantt / resource-catalog type → 实务 type (null = no practice counterpart). */
export function resourceTypeToFeatureType(type: PmResourceType): PmFeatureType | null {
  switch (type) {
    case 'labor':
      return 'labor'
    case 'material':
      return 'material'
    case 'equipment':
      return 'machinery'
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
      return '台'
    case 'material':
      return ''
    default:
      return ''
  }
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

/**
 * Distinct 实务 seeds from Gantt task resource assignments (labor / material / equipment).
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

/**
 * Live 实务 rows for labor/material/machinery from current Gantt seeds.
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
      quantity: null,
      remark: overlay?.remark ?? '',
      applicable: overlay?.applicable ?? applicable,
      sortOrder: index,
      parentId: null,
    }
  })
}

/**
 * Append missing 实务 rows for Gantt-assigned resources (type + name).
 * @deprecated Prefer `buildLiveScheduleFeatureRows` — schedule types are not persisted.
 */
export function mergeGanttSeedsIntoFeatureRows(
  rows: readonly PmFeatureRow[],
  seeds: readonly GanttFeatureSeed[],
  applicable: string,
): { rows: PmFeatureRow[]; changed: boolean } {
  const existingKeys = new Set<string>()
  for (const row of rows) {
    const name = row.name.trim()
    if (!name) continue
    existingKeys.add(featureMatchKey(row.type, name))
  }

  const additions: PmFeatureRow[] = []
  for (const seed of seeds) {
    const name = seed.name.trim()
    if (!name) continue
    const key = featureMatchKey(seed.type, name)
    if (existingKeys.has(key)) continue
    existingKeys.add(key)
    additions.push({
      id: crypto.randomUUID(),
      type: seed.type,
      name,
      unit: seed.unit,
      quantity: null,
      remark: '',
      applicable,
      sortOrder: rows.length + additions.length,
      parentId: null,
    })
  }

  if (additions.length === 0) {
    return { rows: [...rows], changed: false }
  }
  return {
    rows: reindexFeatureRows([...rows, ...additions]),
    changed: true,
  }
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
 * Labor headcount: for each calendar day, sum concurrent task requirements;
 * month value = peak daily total in that month (not a sum, not people×days).
 */
export function allocatePeakHeadcountByMonth(
  spans: readonly HeadcountSpan[],
): { monthly: Record<string, number>; peak: number } {
  const daily = new Map<number, number>()

  for (const span of spans) {
    if (!Number.isFinite(span.quantity) || span.quantity === 0) continue
    const range = resolveInclusiveDaySpan(span.startDate, span.finishDate)
    if (!range) continue

    const cursor = new Date(range.startDay)
    while (cursor.getTime() <= range.endDay) {
      const day = startOfLocalDay(cursor.getTime())
      daily.set(day, (daily.get(day) ?? 0) + span.quantity)
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
 * Labor uses peak concurrent headcount (daily max within each month).
 * Material / machinery use quantity sums with day-weighted month allocation.
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

    const usePeakHeadcount = feature.type === 'labor'
    let quantity = 0
    let startDate: number | null = null
    let finishDate: number | null = null
    const monthly: Record<string, number> = {}
    const headcountSpans: HeadcountSpan[] = []

    for (const item of items) {
      const assignments = readTaskResourceAssignments(item.metadata)
      let matchedQty = 0
      let matchedOnTask = false
      for (const assignment of assignments) {
        if (!assignmentMatchesFeature(assignment, feature, resourceType)) continue
        matchedOnTask = true
        if (assignment.quantity != null && Number.isFinite(assignment.quantity)) {
          matchedQty += assignment.quantity
          if (!usePeakHeadcount) quantity += assignment.quantity
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

      if (usePeakHeadcount) {
        headcountSpans.push({
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

    if (usePeakHeadcount) {
      const peak = allocatePeakHeadcountByMonth(headcountSpans)
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

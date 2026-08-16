/** Month keys, day-weighted allocation, peak headcount, and quantity formatting. */

import type { FeatureGanttRollup } from './pm-feature-gantt-type-map'

const MS_PER_DAY = 24 * 60 * 60 * 1000

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

export function startOfLocalDay(ms: number): number {
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
 * `usageTotal` is the sum of daily values (总工日 / 总台班).
 */
export function allocatePeakHeadcountByMonth(
  spans: readonly HeadcountSpan[],
  mode: 'sum' | 'max' = 'sum',
): { monthly: Record<string, number>; peak: number; usageTotal: number } {
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
  let usageTotal = 0
  for (const [dayMs, qty] of daily) {
    usageTotal += qty
    if (qty > peak) peak = qty
    const date = new Date(dayMs)
    const key = formatMonthKey(date.getFullYear(), date.getMonth())
    const prev = monthly[key] ?? 0
    if (qty > prev) monthly[key] = qty
  }

  return { monthly, peak, usageTotal }
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

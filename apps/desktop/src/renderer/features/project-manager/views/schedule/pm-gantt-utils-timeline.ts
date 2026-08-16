import type { PmWorkItem } from '@toolman/shared'

import { startOfLocalDay } from './pm-gantt-schedule'
import {
  addCalendarPadding,
  bandPercent,
  GANTT_TIMELINE_PAD_END_DAYS,
  GANTT_TIMELINE_PAD_START_DAYS,
  startOfMonth,
  startOfNextMonth,
  startOfNextWeek,
  startOfNextYear,
  startOfWeek,
  startOfYear,
} from './pm-gantt-utils-calendar'
import { applySparseDayLabels, buildAdaptiveTimelineHeaders } from './pm-gantt-utils-headers'
import {
  DAY_MS,
  GANTT_DAY_WIDTH,
  type GanttDayTickStep,
  type GanttScaleBand,
  type GanttScaleUnit,
  type GanttTimelineHeader,
  type PmScheduleBar,
} from './pm-gantt-utils-types'

export function resolveWorkItemScheduleRange(item: PmWorkItem): { startMs: number; endMs: number } {
  const endRaw = item.dueDate ?? item.startDate ?? item.updatedAt
  const endMs = startOfLocalDay(endRaw)
  const startMs = startOfLocalDay(item.startDate ?? endRaw - 7 * DAY_MS)
  return {
    startMs: Math.min(startMs, endMs),
    endMs: Math.max(startMs, endMs),
  }
}

export function pickGanttScale(_dayCount: number): GanttScaleUnit {
  return 'day'
}

/**
 * Choose bottom-row tick granularity from project span (and optional pane width).
 *
 * Target ~14px+ per tick so day lines/labels stay readable:
 * - short span → 1 day / cell
 * - medium → 5 days / cell
 * - long → 7 days / cell
 *
 * Without pane width, thresholds are ~60d (daily) and ~180d (5-day).
 */
export function resolveGanttDayTickStep(
  dayCount: number,
  paneWidthPx?: number,
): GanttDayTickStep {
  const count = Math.max(1, Math.round(dayCount))
  const minCellPx = 14

  if (paneWidthPx != null && paneWidthPx > 0) {
    const maxTicks = Math.max(1, Math.floor(paneWidthPx / minCellPx))
    if (count <= maxTicks) return 1
    if (Math.ceil(count / 5) <= maxTicks) return 5
    return 7
  }

  if (count <= 60) return 1
  if (count <= 180) return 5
  return 7
}

export function buildYearBands(rangeStart: number, rangeEnd: number): GanttScaleBand[] {
  const totalMs = Math.max(rangeEnd - rangeStart, DAY_MS)
  const bands: GanttScaleBand[] = []
  let cursor = startOfYear(rangeStart)
  let guard = 0
  while (cursor < rangeEnd && guard < 50) {
    guard += 1
    const next = startOfNextYear(cursor)
    const startMs = Math.max(cursor, rangeStart)
    const endMs = Math.min(next, rangeEnd)
    if (endMs > startMs) {
      const { leftPercent, widthPercent } = bandPercent(startMs, endMs, rangeStart, totalMs)
      bands.push({
        key: `year-${cursor}`,
        label: String(new Date(cursor).getFullYear()),
        startMs,
        endMs,
        leftPercent,
        widthPercent,
      })
    }
    cursor = next
  }
  return bands
}

export function buildMonthBands(rangeStart: number, rangeEnd: number): GanttScaleBand[] {
  const totalMs = Math.max(rangeEnd - rangeStart, DAY_MS)
  const bands: GanttScaleBand[] = []
  let cursor = startOfMonth(rangeStart)
  let guard = 0
  while (cursor < rangeEnd && guard < 240) {
    guard += 1
    const next = startOfNextMonth(cursor)
    const startMs = Math.max(cursor, rangeStart)
    const endMs = Math.min(next, rangeEnd)
    if (endMs > startMs) {
      const { leftPercent, widthPercent } = bandPercent(startMs, endMs, rangeStart, totalMs)
      const month = new Date(cursor).getMonth() + 1
      bands.push({
        key: `month-${cursor}`,
        label: String(month),
        startMs,
        endMs,
        leftPercent,
        widthPercent,
      })
    }
    cursor = next
  }
  return bands
}

/** ISO-like week label: W21 or 6/9–6/15 depending on space. */
export function buildWeekBands(
  rangeStart: number,
  rangeEnd: number,
  weekStartsOn: 0 | 1 = 1,
): GanttScaleBand[] {
  const totalMs = Math.max(rangeEnd - rangeStart, DAY_MS)
  const bands: GanttScaleBand[] = []
  let cursor = startOfWeek(rangeStart, weekStartsOn)
  let guard = 0
  while (cursor < rangeEnd && guard < 400) {
    guard += 1
    const next = startOfNextWeek(cursor)
    const startMs = Math.max(cursor, rangeStart)
    const endMs = Math.min(next, rangeEnd)
    if (endMs > startMs) {
      const { leftPercent, widthPercent } = bandPercent(startMs, endMs, rangeStart, totalMs)
      const start = new Date(startMs)
      const end = new Date(endMs - DAY_MS)
      const label =
        start.getMonth() === end.getMonth()
          ? `${start.getMonth() + 1}/${start.getDate()}-${end.getDate()}`
          : `${start.getMonth() + 1}/${start.getDate()}-${end.getMonth() + 1}/${end.getDate()}`
      bands.push({
        key: `week-${cursor}`,
        label,
        startMs,
        endMs,
        leftPercent,
        widthPercent,
      })
    }
    cursor = next
  }
  return bands
}

export function buildScheduleTimeline(
  items: PmWorkItem[],
  options?: {
    dayWidth?: number
    weekStartsOn?: 0 | 1
    dayTickStep?: GanttDayTickStep
    paneWidthPx?: number
  },
): {
  rangeStart: number
  rangeEnd: number
  dayCount: number
  dayTickStep: GanttDayTickStep
  scale: GanttScaleUnit
  dayWidth: number
  canvasWidth: number
  headers: GanttTimelineHeader[]
  yearBands: GanttScaleBand[]
  monthBands: GanttScaleBand[]
  weekBands: GanttScaleBand[]
  bars: PmScheduleBar[]
} {
  const ranges = items.map(resolveWorkItemScheduleRange)
  let rangeStart =
    ranges.length > 0
      ? startOfLocalDay(Math.min(...ranges.map((range) => range.startMs)))
      : startOfLocalDay(Date.now())
  let rangeEnd =
    ranges.length > 0
      ? startOfLocalDay(Math.max(...ranges.map((range) => range.endMs))) + DAY_MS
      : rangeStart + 30 * DAY_MS

  rangeStart = addCalendarPadding(rangeStart, -GANTT_TIMELINE_PAD_START_DAYS)
  rangeEnd = addCalendarPadding(rangeEnd, GANTT_TIMELINE_PAD_END_DAYS)

  const dayCount = Math.max(1, Math.round((rangeEnd - rangeStart) / DAY_MS))
  const scale = pickGanttScale(dayCount)
  const dayTickStep =
    options?.dayTickStep ?? resolveGanttDayTickStep(dayCount, options?.paneWidthPx)
  const totalMs = Math.max(rangeEnd - rangeStart, DAY_MS)
  const dayWidth = options?.dayWidth ?? GANTT_DAY_WIDTH
  const canvasWidth = dayCount * dayWidth

  const bars = items.map((item) => {
    const { startMs, endMs } = resolveWorkItemScheduleRange(item)
    const barEnd = endMs + DAY_MS
    const leftPercent = ((startMs - rangeStart) / totalMs) * 100
    const widthPercent = Math.max(((barEnd - startMs) / totalMs) * 100, 0.8)
    return { item, startMs, endMs, leftPercent, widthPercent }
  })

  const headers = applySparseDayLabels(
    buildAdaptiveTimelineHeaders(rangeStart, rangeEnd, dayTickStep),
    dayWidth * dayTickStep,
    canvasWidth,
  )
  const yearBands = buildYearBands(rangeStart, rangeEnd)
  const monthBands = buildMonthBands(rangeStart, rangeEnd)
  const weekBands = buildWeekBands(rangeStart, rangeEnd, options?.weekStartsOn ?? 1)

  return {
    rangeStart,
    rangeEnd,
    dayCount,
    dayTickStep,
    scale,
    dayWidth,
    canvasWidth,
    headers,
    yearBands,
    monthBands,
    weekBands,
    bars,
  }
}

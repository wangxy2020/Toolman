import type { PmProject, PmWorkItem } from '@toolman/shared'

import { ACTUAL_FINISH_META_KEY, ACTUAL_START_META_KEY, SHOULD_PERCENT_META_KEY } from './pm-gantt-prefs'
import {
  durationDaysBetween,
  finishFromStartAndDuration,
  startOfLocalDay,
} from './pm-gantt-schedule'

const DAY_MS = 24 * 60 * 60 * 1000

export const GANTT_ROW_HEIGHT = 36
/** Default day column width when pane size is unknown. */
export const GANTT_DAY_WIDTH = 28

/** Synthetic first-row summary for the selected project (display-only, not persisted). */
export const GANTT_PROJECT_ROOT_ID = '__pm_gantt_project_root__'

export function isGanttProjectRootId(id: string | null | undefined): boolean {
  return id === GANTT_PROJECT_ROOT_ID
}

/** Build a display-only project summary row spanning the schedule envelope. */
export function buildGanttProjectRootItem(
  project: PmProject,
  items: PmWorkItem[],
): PmWorkItem {
  let startMs: number | undefined
  let dueMs: number | undefined
  for (const item of items) {
    if (item.startDate != null) {
      startMs = startMs == null ? item.startDate : Math.min(startMs, item.startDate)
    }
    if (item.dueDate != null) {
      dueMs = dueMs == null ? item.dueDate : Math.max(dueMs, item.dueDate)
    }
  }

  // Plan start/finish in project metadata are contract targets (项目信息), not the
  // live schedule envelope. Mixing them in pinned 总工期 so predecessor-driven
  // reschedules looked like a no-op when tasks stayed inside the plan window.
  const readMetaDate = (key: string): number | undefined => {
    const raw = project.metadata?.[key]
    if (typeof raw !== 'string' || !raw.trim()) return undefined
    const parsed = Date.parse(`${raw.trim()}T00:00:00`)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  if (startMs == null) startMs = readMetaDate('planStartDate')
  if (dueMs == null) dueMs = readMetaDate('planFinishDate')

  if (startMs == null && dueMs != null) startMs = dueMs
  if (dueMs == null && startMs != null) dueMs = startMs
  if (startMs == null) startMs = startOfLocalDay(Date.now())
  if (dueMs == null) dueMs = startMs

  const progressPercent =
    items.length === 0
      ? 0
      : Math.round(
          items.reduce((sum, entry) => sum + (entry.progressPercent ?? 0), 0) / items.length,
        )

  return {
    id: GANTT_PROJECT_ROOT_ID,
    projectId: project.id,
    workspaceId: project.workspaceId,
    type: 'wbs_node',
    status: 'in_progress',
    priority: 'normal',
    domain: 'progress_management',
    title: `${project.code} · ${project.name}`,
    progressPercent,
    sortOrder: -1,
    metadata: { source: 'gantt_project_root' },
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    startDate: startOfLocalDay(startMs),
    dueDate: startOfLocalDay(dueMs),
  }
}

/**
 * Prepend a project summary row and hang current roots under it (display tree only).
 */
export function withGanttProjectRootItems(
  project: PmProject | null,
  items: PmWorkItem[],
): PmWorkItem[] {
  if (!project || items.length === 0) return items
  if (items.some((item) => item.id === GANTT_PROJECT_ROOT_ID)) return items
  const root = buildGanttProjectRootItem(project, items)
  const idSet = new Set(items.map((item) => item.id))
  const nested = items.map((item) => {
    const parentMissing = !item.parentId || !idSet.has(item.parentId)
    return parentMissing ? { ...item, parentId: root.id } : item
  })
  return [root, ...nested]
}

export type PmScheduleBar = {
  item: PmWorkItem
  startMs: number
  endMs: number
  leftPercent: number
  widthPercent: number
}

export type GanttScaleUnit = 'day'

/** Days represented by one bottom-row tick cell. */
export type GanttDayTickStep = 1 | 5 | 7

/** One day (or multi-day) tick (bottom row). */
export type GanttTimelineHeader = {
  key: string
  labelBottom: string
  startMs: number
  endMs: number
  leftPercent: number
  widthPercent: number
}

/** Spanned year/month band (OpenProject / MS Project style). */
export type GanttScaleBand = {
  key: string
  label: string
  startMs: number
  endMs: number
  leftPercent: number
  widthPercent: number
}

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

function addCalendarPadding(ms: number, days: number): number {
  return startOfLocalDay(ms) + days * DAY_MS
}

/** Blank days before the earliest task so bars are not flush to the chart left edge. */
const GANTT_TIMELINE_PAD_START_DAYS = 7
/** Trailing blank days after the latest task (keep equal to start pad). */
const GANTT_TIMELINE_PAD_END_DAYS = 7

function startOfMonth(ms: number): number {
  const date = new Date(startOfLocalDay(ms))
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime()
}

function startOfNextMonth(ms: number): number {
  const date = new Date(startOfLocalDay(ms))
  return new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime()
}

function startOfYear(ms: number): number {
  const date = new Date(startOfLocalDay(ms))
  return new Date(date.getFullYear(), 0, 1).getTime()
}

function startOfNextYear(ms: number): number {
  const date = new Date(startOfLocalDay(ms))
  return new Date(date.getFullYear() + 1, 0, 1).getTime()
}

function bandPercent(
  startMs: number,
  endMs: number,
  rangeStart: number,
  totalMs: number,
): { leftPercent: number; widthPercent: number } {
  const left = Math.max(startMs, rangeStart)
  const right = Math.min(endMs, rangeStart + totalMs)
  return {
    leftPercent: ((left - rangeStart) / totalMs) * 100,
    widthPercent: Math.max(((right - left) / totalMs) * 100, 0.05),
  }
}

/** Build day / multi-day ticks; year/month labels are separate spanned bands.
 * Multi-day steps stay inside each month so ticks align with month boundaries
 * (月初 / 月末), never straddling two months.
 *
 * Like MS Project: if a full step would leave a short orphan at month end
 * (e.g. 26–30 then lonely 31), fold the remainder into the last cell (26–31).
 */
export function buildAdaptiveTimelineHeaders(
  rangeStart: number,
  rangeEnd: number,
  stepDays: number = 1,
): GanttTimelineHeader[] {
  const step = Math.max(1, Math.floor(stepDays))
  const totalMs = Math.max(rangeEnd - rangeStart, DAY_MS)
  const headers: GanttTimelineHeader[] = []

  if (step === 1) {
    let cursor = rangeStart
    let guard = 0
    while (cursor < rangeEnd && guard < 800) {
      guard += 1
      const next = Math.min(cursor + DAY_MS, rangeEnd)
      const date = new Date(cursor)
      const { leftPercent, widthPercent } = bandPercent(cursor, next, rangeStart, totalMs)
      headers.push({
        key: `day-${cursor}`,
        labelBottom: String(date.getDate()),
        startMs: cursor,
        endMs: next,
        leftPercent,
        widthPercent,
      })
      cursor = next
    }
    return headers
  }

  // Multi-day: walk month by month; within each month step from day 1.
  let monthStart = startOfMonth(rangeStart)
  let guard = 0
  while (monthStart < rangeEnd && guard < 240) {
    guard += 1
    const monthEnd = startOfNextMonth(monthStart)
    const year = new Date(monthStart).getFullYear()
    const monthIndex = new Date(monthStart).getMonth()
    const dim = daysInMonth(year, monthIndex)

    let day = 1
    while (day <= dim) {
      const remaining = dim - day + 1
      // Absorb a short month-end orphan into this cell (e.g. 6 days for step 5).
      const leftoverAfterStep = remaining - step
      const takeAll =
        remaining <= step || (leftoverAfterStep > 0 && leftoverAfterStep < step)
      const take = takeAll ? remaining : step
      const cellStart = new Date(year, monthIndex, day).getTime()
      const endDay = day + take
      const cellEnd = endDay > dim ? monthEnd : new Date(year, monthIndex, endDay).getTime()
      const startMs = Math.max(cellStart, rangeStart)
      const endMs = Math.min(cellEnd, rangeEnd)
      if (endMs > startMs) {
        const { leftPercent, widthPercent } = bandPercent(startMs, endMs, rangeStart, totalMs)
        headers.push({
          key: `day-${startMs}`,
          labelBottom: String(new Date(startMs).getDate()),
          startMs,
          endMs,
          leftPercent,
          widthPercent,
        })
      }
      day += take
    }

    monthStart = monthEnd
  }

  return headers
}

const MONTH_DAY_ANCHORS = [9, 15, 20, 25]
/** Minimum horizontal space (px) needed to render one day-of-month label legibly. */
const MIN_DAY_LABEL_PX = 12

function monthAnchorCandidates(
  sorted: GanttTimelineHeader[],
  firstDay: number,
  lastDay: number,
  year: number,
  month: number,
): GanttTimelineHeader[] {
  const dayToHeader = new Map<number, GanttTimelineHeader>()
  for (const h of sorted) {
    dayToHeader.set(new Date(h.startMs).getDate(), h)
  }

  const monthLast = daysInMonth(year, month)
  const dayCandidates = new Set<number>()
  if (firstDay > 1 && dayToHeader.has(firstDay - 1)) {
    dayCandidates.add(firstDay - 1)
  }
  dayCandidates.add(firstDay)
  for (const anchor of MONTH_DAY_ANCHORS) {
    if (anchor >= firstDay && anchor <= lastDay) {
      dayCandidates.add(anchor)
    }
  }
  if (monthLast >= firstDay && monthLast <= lastDay) {
    dayCandidates.add(monthLast)
  }
  dayCandidates.add(lastDay)

  return [...dayCandidates]
    .sort((a, b) => a - b)
    .map((day) => dayToHeader.get(day))
    .filter((h): h is GanttTimelineHeader => h != null)
}

function pickHeadersWithMinGap(
  candidates: GanttTimelineHeader[],
  canvasWidth: number,
  minGapPx: number,
): Set<number> {
  const showMs = new Set<number>()
  let lastLabelLeftPx = -Infinity
  for (const header of candidates) {
    const centerPx = ((header.leftPercent + header.widthPercent / 2) / 100) * canvasWidth
    if (centerPx - lastLabelLeftPx >= minGapPx || showMs.size === 0) {
      showMs.add(header.startMs)
      lastLabelLeftPx = centerPx
    }
  }
  return showMs
}

function applyMonthAnchorLabels(
  headers: GanttTimelineHeader[],
  canvasWidth: number,
  minGapPx: number,
): GanttTimelineHeader[] {
  const showMs = new Set<number>()
  const byMonth = new Map<string, GanttTimelineHeader[]>()
  for (const header of headers) {
    const d = new Date(header.startMs)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const list = byMonth.get(key) ?? []
    list.push(header)
    byMonth.set(key, list)
  }

  for (const [, monthHeaders] of byMonth) {
    const sorted = [...monthHeaders].sort((a, b) => a.startMs - b.startMs)
    const first = sorted[0]!
    const last = sorted[sorted.length - 1]!
    const firstDate = new Date(first.startMs)
    const candidates = monthAnchorCandidates(
      sorted,
      firstDate.getDate(),
      new Date(last.startMs).getDate(),
      firstDate.getFullYear(),
      firstDate.getMonth(),
    )
    for (const ms of pickHeadersWithMinGap(candidates, canvasWidth, minGapPx)) {
      showMs.add(ms)
    }
  }

  return headers.map((header) => ({
    ...header,
    labelBottom: showMs.has(header.startMs)
      ? String(new Date(header.startMs).getDate())
      : '',
  }))
}

/**
 * Thin day-of-month labels to fit the timeline width.
 * - Enough room → every tick
 * - Medium room → every N ticks
 * - Tight → month anchors (9/15/20/25/30)
 *
 * @param cellWidthPx pixel width of one tick cell (dayWidth * dayTickStep)
 */
export function applySparseDayLabels(
  headers: GanttTimelineHeader[],
  cellWidthPx: number,
  canvasWidth: number,
): GanttTimelineHeader[] {
  if (headers.length === 0) return headers

  const minGapPx = MIN_DAY_LABEL_PX
  const labelBudget = Math.max(1, Math.floor(canvasWidth / minGapPx))

  // Window is wide enough to show every tick label.
  if (labelBudget >= headers.length || cellWidthPx >= minGapPx) {
    return headers
  }

  // Medium: step through ticks so labels stay readable.
  const step = Math.max(2, Math.ceil(headers.length / labelBudget))
  if (step <= 5) {
    const stepped = headers.filter(
      (_, index) => index % step === 0 || index === headers.length - 1,
    )
    const showMs = pickHeadersWithMinGap(stepped, canvasWidth, minGapPx)
    if (showMs.size > 0) {
      return headers.map((header) => ({
        ...header,
        labelBottom: showMs.has(header.startMs)
          ? String(new Date(header.startMs).getDate())
          : '',
      }))
    }
  }

  return applyMonthAnchorLabels(headers, canvasWidth, minGapPx)
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

function startOfWeek(ms: number, weekStartsOn: 0 | 1): number {
  const date = new Date(startOfLocalDay(ms))
  const day = date.getDay() // 0=Sun
  const offset = weekStartsOn === 1 ? (day + 6) % 7 : day
  date.setDate(date.getDate() - offset)
  return date.getTime()
}

function startOfNextWeek(ms: number): number {
  return startOfLocalDay(ms) + 7 * DAY_MS
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

export function workItemDurationDays(item: PmWorkItem): number {
  if (item.type === 'milestone') return 0
  const { startMs, endMs } = resolveWorkItemScheduleRange(item)
  return durationDaysBetween(startMs, endMs)
}

/** Planned % complete by status date (linear between start and finish). */
export function shouldCompletePercent(
  item: PmWorkItem,
  startMs?: number | null,
  finishMs?: number | null,
  /** When set (e.g. selected baseline as-of), ignore stored metadata and recompute. */
  statusDateMs?: number | null,
): number {
  const start = startMs ?? item.startDate
  const finish = finishMs ?? item.dueDate
  if (statusDateMs != null && Number.isFinite(statusDateMs)) {
    if (start == null || finish == null) return 0
    const status = startOfLocalDay(statusDateMs)
    const rangeStart = startOfLocalDay(start)
    const rangeFinish = startOfLocalDay(finish)
    if (status <= rangeStart) return 0
    if (status >= rangeFinish) return 100
    const span = Math.max(rangeFinish - rangeStart, DAY_MS)
    return Math.min(100, Math.max(0, Math.round(((status - rangeStart) / span) * 100)))
  }
  const meta = item.metadata?.[SHOULD_PERCENT_META_KEY]
  if (typeof meta === 'number' && Number.isFinite(meta)) {
    return Math.min(100, Math.max(0, Math.round(meta)))
  }
  if (typeof meta === 'string' && meta.trim()) {
    const parsed = Number.parseInt(meta, 10)
    if (Number.isFinite(parsed)) return Math.min(100, Math.max(0, parsed))
  }
  if (start == null || finish == null) return 0
  const now = startOfLocalDay(Date.now())
  const rangeStart = startOfLocalDay(start)
  const rangeFinish = startOfLocalDay(finish)
  if (now <= rangeStart) return 0
  if (now >= rangeFinish) return 100
  const span = Math.max(rangeFinish - rangeStart, DAY_MS)
  return Math.min(100, Math.max(0, Math.round(((now - rangeStart) / span) * 100)))
}

function readActualDateMeta(item: PmWorkItem, key: string): number | null {
  const raw = item.metadata?.[key]
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export type ScheduleVarianceSource = 'finish' | 'progress'

/**
 * Schedule variance in days (positive = ahead, negative = behind).
 * - With actual start + actual finish: planned finish − actual finish.
 * - Else with baseline 应完成%: (actual% − should%) × planned duration.
 */
export function computeScheduleVarianceDays(
  item: PmWorkItem,
  options?: {
    planStartMs?: number | null
    planFinishMs?: number | null
    shouldPercentAsOfMs?: number | null
  },
): { days: number; source: ScheduleVarianceSource } | null {
  const planStart = options?.planStartMs ?? item.startDate
  const planFinish = options?.planFinishMs ?? item.dueDate
  const actualStart = readActualDateMeta(item, ACTUAL_START_META_KEY)
  const actualFinish = readActualDateMeta(item, ACTUAL_FINISH_META_KEY)

  if (actualStart != null && actualFinish != null && planFinish != null) {
    const days = Math.round(
      (startOfLocalDay(planFinish) - startOfLocalDay(actualFinish)) / DAY_MS,
    )
    return { days, source: 'finish' }
  }

  const hasShouldMeta =
    item.metadata?.[SHOULD_PERCENT_META_KEY] != null &&
    item.metadata?.[SHOULD_PERCENT_META_KEY] !== ''
  const hasShouldContext = options?.shouldPercentAsOfMs != null || hasShouldMeta
  if (!hasShouldContext || planStart == null || planFinish == null) return null

  const should = shouldCompletePercent(
    item,
    planStart,
    planFinish,
    options?.shouldPercentAsOfMs,
  )
  const actual =
    typeof item.progressPercent === 'number' && Number.isFinite(item.progressPercent)
      ? Math.min(100, Math.max(0, item.progressPercent))
      : 0
  const duration = durationDaysBetween(planStart, planFinish)
  const days = Math.round(((actual - should) / 100) * duration)
  return { days, source: 'progress' }
}

export function formatScheduleVarianceDays(days: number, dayUnit: string): string {
  if (days === 0) return `0${dayUnit}`
  return `${days > 0 ? '+' : ''}${days}${dayUnit}`
}

export function formatWorkItemDate(ms: number | undefined, empty = '—'): string {
  if (ms == null || !Number.isFinite(ms)) return empty
  const date = new Date(startOfLocalDay(ms))
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

export function parseDateInput(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '—' || trimmed === '-') return null
  const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!match) return null
  const ms = new Date(
    Number.parseInt(match[1]!, 10),
    Number.parseInt(match[2]!, 10) - 1,
    Number.parseInt(match[3]!, 10),
  ).getTime()
  return Number.isFinite(ms) ? startOfLocalDay(ms) : null
}

export function finishFromStartDuration(startMs: number, durationDays: number): number {
  return finishFromStartAndDuration(startMs, durationDays)
}

export function parseDurationDaysInput(value: string): number | null {
  const digits = value.replace(/[^\d]/g, '')
  if (!digits && value.trim() !== '0') return null
  const days = Number.parseInt(digits || '0', 10)
  return Number.isFinite(days) && days >= 0 ? days : null
}

/** Position a bar within an existing timeline range (for baseline ghosts). */
export function barPercentsInRange(
  startMs: number,
  endMs: number,
  rangeStart: number,
  rangeEnd: number,
): { leftPercent: number; widthPercent: number } {
  const totalMs = Math.max(rangeEnd - rangeStart, DAY_MS)
  const start = startOfLocalDay(startMs)
  const end = startOfLocalDay(endMs) + DAY_MS
  return {
    leftPercent: ((start - rangeStart) / totalMs) * 100,
    widthPercent: Math.max(((end - start) / totalMs) * 100, 0.8),
  }
}

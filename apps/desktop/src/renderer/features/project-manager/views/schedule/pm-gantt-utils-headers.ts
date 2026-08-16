import {
  bandPercent,
  daysInMonth,
  startOfMonth,
  startOfNextMonth,
} from './pm-gantt-utils-calendar'
import { DAY_MS, type GanttTimelineHeader } from './pm-gantt-utils-types'

const MONTH_DAY_ANCHORS = [9, 15, 20, 25]
/** Minimum horizontal space (px) needed to render one day-of-month label legibly. */
const MIN_DAY_LABEL_PX = 12

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

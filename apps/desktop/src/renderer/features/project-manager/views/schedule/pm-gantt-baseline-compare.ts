/** Baseline compare modes and progress-line (前锋线) geometry. */

import type { PmScheduleBaseline, PmWorkItem } from '@toolman/shared'

import { GANTT_ROW_HEIGHT } from './pm-gantt-utils'

export type BaselineCompareMode = 'none' | 'gantt' | 'progressLine'

export type ProgressLineStub = {
  itemId: string
  /** Center Y of the row within the chart body (px). */
  y: number
  /** Tip X (0–100): actual progress mapped onto the baseline/current schedule. */
  tipLeftPercent: number
  /** Actual − planned percentage points (negative = behind → tip left of status line). */
  variancePct: number
}

function startOfLocalDay(ms: number): number {
  const date = new Date(ms)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Planned % complete at `statusDate` given a schedule span. */
export function plannedProgressAtDate(
  startMs: number | null | undefined,
  finishMs: number | null | undefined,
  statusDateMs: number,
): number {
  if (startMs == null || finishMs == null) return 0
  const start = startOfLocalDay(startMs)
  const finish = startOfLocalDay(finishMs)
  const status = startOfLocalDay(statusDateMs)
  if (status <= start) return 0
  if (status >= finish) return 100
  const span = Math.max(1, finish - start)
  return Math.min(100, Math.max(0, ((status - start) / span) * 100))
}

export function resolveBaselineAsOfDate(baseline: PmScheduleBaseline): number {
  if (
    typeof baseline.snapshot.asOfDate === 'number' &&
    Number.isFinite(baseline.snapshot.asOfDate)
  ) {
    return startOfLocalDay(baseline.snapshot.asOfDate)
  }
  return startOfLocalDay(baseline.snapshot.capturedAt)
}

/** Next unused 基线N index among user baselines. */
export function nextUserBaselineIndex(
  baselines: ReadonlyArray<{ name: string }>,
): number {
  const used = new Set<number>()
  for (const entry of baselines) {
    const match = /^基线\s*(\d+)/u.exec(entry.name.trim())
    if (!match) continue
    const n = Number.parseInt(match[1]!, 10)
    if (Number.isFinite(n) && n > 0) used.add(n)
  }
  let next = 1
  while (used.has(next)) next += 1
  return next
}

/** Default display name: 基线1 (2026-09-15) */
export function formatUserBaselineName(index: number, asOfDateLabel: string): string {
  const date = asOfDateLabel.trim()
  if (!date) return `基线${index}`
  return `基线${index} (${date})`
}

/** True when the name still looks like an auto-generated 基线N (…) label. */
export function isAutoUserBaselineName(name: string): boolean {
  return /^基线\s*\d+(\s*[·(（].*)?$/u.test(name.trim())
}

/** Next default name: 基线1 (YYYY-MM-DD), … skipping numbers already used. */
export function nextUserBaselineName(
  baselines: ReadonlyArray<{ name: string }>,
  asOfDateLabel = '',
): string {
  return formatUserBaselineName(nextUserBaselineIndex(baselines), asOfDateLabel)
}

export function formatBaselineCaptureTime(ms: number, locale = 'zh-CN'): string {
  return new Date(ms).toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * Default status date for capture: today when inside the plan window;
 * otherwise ~1/3 into the schedule so 应完成% is not all zeros.
 */
export function suggestBaselineAsOfDate(
  items: ReadonlyArray<{ startDate?: number | null; dueDate?: number | null }>,
  nowMs = Date.now(),
): number {
  const today = startOfLocalDay(nowMs)
  let minStart: number | null = null
  let maxFinish: number | null = null
  for (const item of items) {
    if (item.startDate == null || item.dueDate == null) continue
    const start = startOfLocalDay(item.startDate)
    const finish = startOfLocalDay(item.dueDate)
    minStart = minStart == null ? start : Math.min(minStart, start)
    maxFinish = maxFinish == null ? finish : Math.max(maxFinish, finish)
  }
  if (minStart == null || maxFinish == null) return today
  if (today > minStart && today < maxFinish) return today
  const span = Math.max(1, maxFinish - minStart)
  return startOfLocalDay(minStart + span / 3)
}

/**
 * Classic 前锋线: vertical status date + horizontal stubs.
 * Tip = date of actual progress along the (baseline) schedule.
 * Behind → tip left of status line; ahead → tip right.
 */
export function computeProgressLineStubs(input: {
  rows: ReadonlyArray<{ item: PmWorkItem; hasChildren: boolean }>
  baselineByItemId: ReadonlyMap<
    string,
    { startDate?: number; dueDate?: number; progressPercent?: number }
  >
  statusDateMs: number
  rangeStart: number
  rangeEnd: number
  /** Prefer snapshot/display progress when comparing a baseline. */
  progressPercentById?: ReadonlyMap<string, number>
}): { stubs: ProgressLineStub[]; statusLeftPercent: number } {
  const span = Math.max(1, input.rangeEnd - input.rangeStart)
  const statusLeftPercent = Math.min(
    100,
    Math.max(0, ((startOfLocalDay(input.statusDateMs) - input.rangeStart) / span) * 100),
  )

  const stubs: ProgressLineStub[] = []
  input.rows.forEach((row, index) => {
    if (row.hasChildren) return
    const item = row.item
    const baseline = input.baselineByItemId.get(item.id)
    const planStart = baseline?.startDate ?? item.startDate
    const planFinish = baseline?.dueDate ?? item.dueDate
    if (planStart == null || planFinish == null) return

    const start = startOfLocalDay(planStart)
    const finish = startOfLocalDay(planFinish)
    if (finish < input.rangeStart || start > input.rangeEnd) return

    const fromMap = input.progressPercentById?.get(item.id)
    const fromBaseline = baseline?.progressPercent
    const rawActual =
      typeof fromMap === 'number' && Number.isFinite(fromMap)
        ? fromMap
        : typeof fromBaseline === 'number' && Number.isFinite(fromBaseline)
          ? fromBaseline
          : item.progressPercent
    const actualPct =
      typeof rawActual === 'number' && Number.isFinite(rawActual)
        ? Math.min(100, Math.max(0, rawActual))
        : 0
    const plannedPct = plannedProgressAtDate(planStart, planFinish, input.statusDateMs)

    const tipMs = start + ((finish - start) * actualPct) / 100
    const tipLeftPercent = Math.min(
      100,
      Math.max(0, ((tipMs - input.rangeStart) / span) * 100),
    )

    stubs.push({
      itemId: item.id,
      y: index * GANTT_ROW_HEIGHT + GANTT_ROW_HEIGHT / 2,
      tipLeftPercent,
      variancePct: actualPct - plannedPct,
    })
  })

  return { stubs, statusLeftPercent }
}

/** Patch actual progressPercent values inside a baseline snapshot (local / optimistic). */
export function patchBaselineWorkItemProgress(
  baselines: readonly PmScheduleBaseline[],
  baselineId: string,
  workItemProgress: ReadonlyArray<{ workItemId: string; progressPercent: number }>,
): PmScheduleBaseline[] {
  if (workItemProgress.length === 0) return [...baselines]
  const progressById = new Map(
    workItemProgress.map((entry) => [entry.workItemId, entry.progressPercent] as const),
  )
  return baselines.map((entry) => {
    if (entry.id !== baselineId) return entry
    return {
      ...entry,
      snapshot: {
        ...entry.snapshot,
        workItems: entry.snapshot.workItems.map((item) => {
          const next = progressById.get(item.workItemId)
          if (next == null) return item
          return { ...item, progressPercent: next }
        }),
      },
    }
  })
}

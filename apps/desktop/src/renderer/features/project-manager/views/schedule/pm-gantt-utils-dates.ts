import type { PmWorkItem } from '@toolman/shared'

import { ACTUAL_FINISH_META_KEY, ACTUAL_START_META_KEY, SHOULD_PERCENT_META_KEY } from './pm-gantt-prefs'
import {
  durationDaysBetween,
  finishFromStartAndDuration,
  startOfLocalDay,
} from './pm-gantt-schedule'
import { resolveWorkItemScheduleRange } from './pm-gantt-utils-timeline'
import { DAY_MS, type ScheduleVarianceSource } from './pm-gantt-utils-types'

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

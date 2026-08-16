import { startOfLocalDay } from './pm-gantt-schedule'
import { DAY_MS } from './pm-gantt-utils-types'

/** Blank days before the earliest task so bars are not flush to the chart left edge. */
export const GANTT_TIMELINE_PAD_START_DAYS = 7
/** Trailing blank days after the latest task (keep equal to start pad). */
export const GANTT_TIMELINE_PAD_END_DAYS = 7

export function addCalendarPadding(ms: number, days: number): number {
  return startOfLocalDay(ms) + days * DAY_MS
}

export function startOfMonth(ms: number): number {
  const date = new Date(startOfLocalDay(ms))
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime()
}

export function startOfNextMonth(ms: number): number {
  const date = new Date(startOfLocalDay(ms))
  return new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime()
}

export function startOfYear(ms: number): number {
  const date = new Date(startOfLocalDay(ms))
  return new Date(date.getFullYear(), 0, 1).getTime()
}

export function startOfNextYear(ms: number): number {
  const date = new Date(startOfLocalDay(ms))
  return new Date(date.getFullYear() + 1, 0, 1).getTime()
}

export function startOfWeek(ms: number, weekStartsOn: 0 | 1): number {
  const date = new Date(startOfLocalDay(ms))
  const day = date.getDay() // 0=Sun
  const offset = weekStartsOn === 1 ? (day + 6) % 7 : day
  date.setDate(date.getDate() - offset)
  return date.getTime()
}

export function startOfNextWeek(ms: number): number {
  return startOfLocalDay(ms) + 7 * DAY_MS
}

export function bandPercent(
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

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

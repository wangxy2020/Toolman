/** Pure helpers local to `ProjectScheduleGanttPanel` — no React, no module-level state. */

import type { PmWorkItem } from '@toolman/shared'

import { barPercentsInRange } from './pm-gantt-utils'

/** Escape a string for use inside a CSS `content: "..."` custom-property value. */
export function escapeCssContentValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** Chromium "Save as PDF" uses `document.title` as the default filename — keep it filesystem-safe. */
export function sanitizePrintDocumentTitle(code: string, name: string): string {
  const rawName = code && name ? `${code} · ${name}` : code || name || 'Toolman'
  return rawName.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || 'Toolman'
}

const BASELINE_NAME_INDEX_RE = /^基线\s*(\d+)/u

/** Extract the numeric suffix from an auto-generated baseline name (`基线3` -> `3`). */
export function parseBaselineNameIndex(name: string): number | null {
  const match = BASELINE_NAME_INDEX_RE.exec(name.trim())
  return match?.[1] ? Number.parseInt(match[1], 10) : null
}

/** Stable fingerprint for a batch of schedule date updates, used to dedupe repeated auto-schedule passes. */
export function buildScheduleUpdateFingerprint(
  updates: ReadonlyArray<{ id: string; startDate: number; dueDate: number }>,
): string {
  return updates
    .map((update) => `${update.id}:${update.startDate}:${update.dueDate}`)
    .sort()
    .join('|')
}

/** Set or clear a numeric metadata key depending on whether `value` is present. */
export function setOrDeleteMetaKey(
  metadata: Record<string, unknown> | undefined,
  key: string,
  value: number | null | undefined,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(metadata ?? {}) }
  if (value == null) delete next[key]
  else next[key] = value
  return next
}

/** Resolve the "actual %" shown on a Gantt bar — live rollup map first, falling back to the item field. */
export function resolveActualProgressPercent(
  progressPercentById: ReadonlyMap<string, number>,
  item: PmWorkItem,
): number {
  const fromMap = progressPercentById.get(item.id)
  if (typeof fromMap === 'number' && Number.isFinite(fromMap)) {
    return Math.min(100, Math.max(0, fromMap))
  }
  return typeof item.progressPercent === 'number' && Number.isFinite(item.progressPercent)
    ? Math.min(100, Math.max(0, item.progressPercent))
    : 0
}

/** Bar percents for a baseline "ghost" bar, or `null` when the baseline has no usable date range. */
export function resolveGhostRange(
  ghost: { startDate?: number; dueDate?: number } | undefined,
  rangeStart: number,
  rangeEnd: number,
): { leftPercent: number; widthPercent: number } | null {
  if (ghost?.startDate == null || ghost.dueDate == null) return null
  return barPercentsInRange(ghost.startDate, ghost.dueDate, rangeStart, rangeEnd)
}

export type ScheduleVarianceTone = 'behind' | 'ahead' | 'ontrack'

/** Classify actual-vs-planned variance for bar/progress-line styling. */
export function resolveVarianceTone(variancePct: number): ScheduleVarianceTone {
  if (variancePct < -0.5) return 'behind'
  if (variancePct > 0.5) return 'ahead'
  return 'ontrack'
}

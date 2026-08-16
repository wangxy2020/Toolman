/** Column-order helpers for Gantt UI prefs normalization. */

import {
  GANTT_BUILTIN_COLUMNS,
  isGanttBuiltinColumn,
  type GanttBuiltinColumn,
  type GanttCustomColumn,
} from './pm-gantt-prefs-types'
import type { GanttUiPrefs } from './pm-gantt-prefs-ui'

/**
 * Stock builtin headers across locales. Stored overrides that match these are
 * dropped so the active i18n pack controls the label (language switch).
 */
const STOCK_BUILTIN_LABELS: Record<GanttBuiltinColumn, readonly string[]> = {
  index: ['序号', '#', 'No.', 'ID'],
  name: ['任务名称', 'Task Name'],
  duration: ['工期', 'Duration'],
  start: ['计划开始日期', '开始日期', 'Planned Start', 'Start', 'Start Date'],
  finish: ['计划完成日期', '完成日期', 'Planned Finish', 'Finish', 'Finish Date'],
  predecessors: ['前置任务', 'Predecessors'],
  actualStart: ['实际开始日期', 'Actual Start', 'Actual Start Date'],
  actualFinish: ['实际完成日期', 'Actual Finish', 'Actual Finish Date'],
  shouldPercentComplete: [
    '应完成\n百分比',
    '应完成百分比',
    'Should %\nComplete',
    'Should % Complete',
    'Planned %\nComplete',
    'Planned % Complete',
    'Planned\nComplete',
    'Planned Complete',
  ],
  percentComplete: [
    '实际完成\n百分比',
    '实际完成百分比',
    '完成百分比',
    'Actual %\nComplete',
    'Actual % Complete',
    'Actual\nComplete',
    'Actual Complete',
    '% Complete',
    'Percent Complete',
  ],
  variance: ['偏差', '偏差天数', 'Variance', 'Variance Days', 'Finish Variance'],
}

function normalizeLabelKey(label: string): string {
  return label.replace(/\s+/g, '').replace(/\n/g, '')
}

export function isStockBuiltinColumnLabel(id: string, label: string): boolean {
  if (!isGanttBuiltinColumn(id)) return false
  const stock = STOCK_BUILTIN_LABELS[id]
  const trimmed = label.trim()
  const compact = normalizeLabelKey(trimmed)
  return stock.some((entry) => entry === trimmed || normalizeLabelKey(entry) === compact)
}

/**
 * Insert a column back into the visible order at its fixed canonical position
 * (builtin order, then custom columns in definition order).
 */
export function insertColumnInCanonicalOrder(
  columnOrder: string[],
  id: string,
  customColumns: GanttCustomColumn[] = [],
): string[] {
  if (columnOrder.includes(id)) return columnOrder
  const canonical = [
    ...GANTT_BUILTIN_COLUMNS,
    ...customColumns.map((col) => col.id),
  ]
  for (const existing of columnOrder) {
    if (!canonical.includes(existing)) canonical.push(existing)
  }
  const idIndex = canonical.indexOf(id)
  if (idIndex < 0) return [...columnOrder, id]

  const next = [...columnOrder]
  let insertAt = next.length
  for (let i = 0; i < next.length; i += 1) {
    const otherIndex = canonical.indexOf(next[i]!)
    if (otherIndex > idIndex) {
      insertAt = i
      break
    }
  }
  next.splice(insertAt, 0, id)
  return next
}

/** Ensure 前置任务 is visible (Gantt view default when switching views / migrating prefs). */
export function withGanttDefaultPredecessorsColumn(prefs: GanttUiPrefs): GanttUiPrefs {
  if (prefs.columnOrder.includes('predecessors')) return prefs
  return {
    ...prefs,
    columnOrder: insertColumnInCanonicalOrder(
      prefs.columnOrder,
      'predecessors',
      prefs.customColumns,
    ),
  }
}

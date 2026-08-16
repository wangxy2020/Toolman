/** Column-order builders, grid template, and label resolution. */

import {
  GANTT_COLUMN_WIDTHS,
  GANTT_COST_VIEW_BASE_COLUMNS,
  GANTT_CUSTOM_COLUMN_WIDTH,
  GANTT_FULL_LIST_NAME_WIDTH,
  GANTT_RESOURCE_VIEW_BASE_COLUMNS,
  isGanttBuiltinColumn,
  type GanttBuiltinColumn,
} from './pm-gantt-prefs-types'
import { type GanttCostViewPrefs, type GanttResourceViewPrefs } from './pm-gantt-prefs-assign'
import { type GanttUiPrefs } from './pm-gantt-prefs-ui'
import { isStockBuiltinColumnLabel } from './pm-gantt-prefs-normalize'

/** Build the fixed column order for the resource-allocation view. */
export function buildResourceViewColumnOrder(resourceView: GanttResourceViewPrefs): string[] {
  const columns: string[] = [...GANTT_RESOURCE_VIEW_BASE_COLUMNS]
  if (resourceView.showDuration) columns.push('duration')
  if (resourceView.showStart) columns.push('start')
  if (resourceView.showFinish) columns.push('finish')
  const slots = Math.max(1, Math.floor(resourceView.slotCount))
  // One column per assignment slot (type / name / qty in the cell). Input mode uses the
  // same layout as normal mode — no combined free-text column.
  for (let slot = 0; slot < slots; slot += 1) {
    columns.push(`resource:${slot}:qty`)
  }
  columns.push('spacer')
  return columns
}

/** Build the fixed column order for the cost-allocation view. */
export function buildCostViewColumnOrder(costView: GanttCostViewPrefs): string[] {
  const columns: string[] = [...GANTT_COST_VIEW_BASE_COLUMNS]
  if (costView.showDuration) columns.push('duration')
  if (costView.showStart) columns.push('start')
  if (costView.showFinish) columns.push('finish')
  const slots = Math.max(1, Math.floor(costView.slotCount))
  for (let slot = 0; slot < slots; slot += 1) {
    if (costView.inputMode) {
      columns.push('cost:0:input')
      break
    }
    // One column per slot: price-list name picker + quantity (mirrors resource qty columns).
    columns.push(`cost:${slot}:qty`)
  }
  columns.push('spacer')
  return columns
}

/**
 * Task list view: keep user column order, append trailing spacer so leftover
 * width sits in the blank column instead of stretching the task name.
 */
export function buildListViewColumnOrder(columnOrder: readonly string[]): string[] {
  const columns = columnOrder.filter((id) => id !== 'spacer')
  if (!columns.includes('name')) {
    columns.splice(Math.min(1, columns.length), 0, 'name')
  }
  columns.push('spacer')
  return columns
}

export function buildGridTemplateColumns(
  columnOrder: string[],
  options?: { fullWidthList?: boolean; printLayout?: boolean },
): string {
  const hasSpacer = columnOrder.includes('spacer')
  const tracks = columnOrder.map((id) => {
    if (id === 'spacer') return 'minmax(0, 1fr)'
    if (id === 'name') {
      // Print: fixed width so every row shares identical tracks (no 1fr + max-content drift).
      if (options?.printLayout) return '200px'
      // Full-list with trailing spacer: keep name at a readable fixed width; blank goes right.
      if (options?.fullWidthList && hasSpacer) return GANTT_FULL_LIST_NAME_WIDTH
      // Full-list / maximized without spacer: let the name column absorb leftover width.
      if (options?.fullWidthList) return `minmax(${GANTT_FULL_LIST_NAME_WIDTH}, 1fr)`
      return GANTT_COLUMN_WIDTHS.name!
    }
    if (
      id === 'resourceType' ||
      id === 'resourceName' ||
      id === 'resourceQty' ||
      /^resource:\d+:type$/.test(id)
    ) {
      return GANTT_COLUMN_WIDTHS.resourceType!
    }
    if (/^resource:\d+:name$/.test(id)) return GANTT_COLUMN_WIDTHS.resourceName!
    if (/^resource:\d+:qty$/.test(id)) return GANTT_COLUMN_WIDTHS.resourceQty!
    if (id === 'resourceInput' || /^resource:\d+:input$/.test(id)) {
      return GANTT_COLUMN_WIDTHS.resourceInput!
    }
    if (id === 'costName' || /^cost:\d+:name$/.test(id)) return GANTT_COLUMN_WIDTHS.costName!
    if (id === 'costAmount' || /^cost:\d+:amount$/.test(id)) {
      return GANTT_COLUMN_WIDTHS.costAmount!
    }
    if (/^cost:\d+:qty$/.test(id)) return GANTT_COLUMN_WIDTHS.costQty!
    if (id === 'costInput' || /^cost:\d+:input$/.test(id)) {
      return GANTT_COLUMN_WIDTHS.costInput!
    }
    return isGanttBuiltinColumn(id)
      ? (GANTT_COLUMN_WIDTHS[id] ?? '96px')
      : GANTT_CUSTOM_COLUMN_WIDTH
  })
  return tracks.join(' ')
}

export function resolveColumnLabel(
  id: string,
  prefs: GanttUiPrefs,
  builtinDefaults: Record<GanttBuiltinColumn, string>,
): string {
  if (id === 'spacer') return ''
  const override = prefs.columnLabels[id]
  // Builtin stock labels (any locale) must not block the active i18n pack.
  if (
    override &&
    !(isGanttBuiltinColumn(id) && isStockBuiltinColumnLabel(id, override))
  ) {
    return override
  }
  if (isGanttBuiltinColumn(id)) return builtinDefaults[id]
  const custom = prefs.customColumns.find((col) => col.id === id)
  return custom?.label ?? id
}

/**
 * Fit all days into the chart pane so the full gantt is visible without
 * horizontal scrolling. Always shrinks to fit — never wider than the pane.
 * Allows sub-pixel day widths when the span is long / window is small.
 */
export function computeGanttDayWidth(
  dayCount: number,
  paneWidthPx: number,
  scrollbarGutterPx = 0,
  _minDayWidth = 2,
): number {
  const usable = Math.max(paneWidthPx - scrollbarGutterPx, 1)
  const count = Math.max(1, dayCount)
  // Always fit the full project into the pane (even if day columns become < 2px).
  return usable / count
}

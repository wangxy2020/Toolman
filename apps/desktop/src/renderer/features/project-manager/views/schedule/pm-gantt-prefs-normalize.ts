/** Normalize / migrate stored Gantt UI prefs. */

import {
  DEFAULT_GANTT_RESOURCE_VIEW_PREFS,
  DEFAULT_GANTT_COST_VIEW_PREFS,
  buildDefaultResourceColumnBindings,
  normalizeCostAssignTypeFilter,
  normalizeResourceAssignTypeFilter,
  normalizeResourceColumnBindings,
} from './pm-gantt-prefs-assign'
import {
  DEFAULT_GANTT_TASK_COLORS,
  DEFAULT_GANTT_VISIBLE_COLUMNS,
  GANTT_BUILTIN_COLUMNS,
  GANTT_DATE_HEADER_MODES,
  type GanttBuiltinColumn,
  type GanttCustomColumn,
  type GanttDateHeaderMode,
} from './pm-gantt-prefs-types'
import { DEFAULT_GANTT_UI_PREFS, type GanttUiPrefs } from './pm-gantt-prefs-ui'
import {
  insertColumnInCanonicalOrder,
  isStockBuiltinColumnLabel,
} from './pm-gantt-prefs-normalize-columns'

export {
  insertColumnInCanonicalOrder,
  isStockBuiltinColumnLabel,
  withGanttDefaultPredecessorsColumn,
} from './pm-gantt-prefs-normalize-columns'

function isDateHeaderMode(value: unknown): value is GanttDateHeaderMode {
  return (
    typeof value === 'string' &&
    (GANTT_DATE_HEADER_MODES as readonly string[]).includes(value)
  )
}

function migrateDateHeaderMode(partial: Partial<GanttUiPrefs> | null | undefined): GanttDateHeaderMode {
  if (isDateHeaderMode(partial?.dateHeaderMode)) return partial!.dateHeaderMode
  // Legacy numeric rows → mode
  if (partial?.dateHeaderRows === 1) return 'day'
  if (partial?.dateHeaderRows === 2) return 'month_day'
  if (partial?.dateHeaderRows === 3) return 'year_month_day'
  return DEFAULT_GANTT_UI_PREFS.dateHeaderMode
}

function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, a, b, c] = trimmed
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase()
  }
  return fallback
}

const LEGACY_PERCENT_LABELS = new Set(['完成百分比', '% Complete', 'Percent Complete'])

export function normalizeGanttUiPrefs(partial: Partial<GanttUiPrefs> | null | undefined): GanttUiPrefs {
  const customColumns = (
    Array.isArray(partial?.customColumns)
      ? partial!.customColumns.filter(
          (col): col is GanttCustomColumn =>
            Boolean(col && typeof col.id === 'string' && typeof col.label === 'string'),
        )
      : []
  ).filter((col) => !LEGACY_PERCENT_LABELS.has(col.label.trim()))
  const customIds = new Set(customColumns.map((col) => col.id))
  const rawOrder = Array.isArray(partial?.columnOrder)
    ? partial!.columnOrder
    : [...DEFAULT_GANTT_VISIBLE_COLUMNS]
  let columnOrder = rawOrder.filter(
    (id) =>
      typeof id === 'string' &&
      (GANTT_BUILTIN_COLUMNS.includes(id as GanttBuiltinColumn) || customIds.has(id)),
  )
  // Always keep name visible
  if (!columnOrder.includes('name')) {
    const insertAt = columnOrder.includes('index') ? 1 : 0
    columnOrder.splice(insertAt, 0, 'name')
  }
  // Ensure known customs appear if missing from order but exist
  for (const col of customColumns) {
    if (!columnOrder.includes(col.id)) columnOrder.push(col.id)
  }

  let columnDefaultsVersion =
    typeof partial?.columnDefaultsVersion === 'number' &&
    Number.isFinite(partial.columnDefaultsVersion)
      ? Math.floor(partial.columnDefaultsVersion)
      : 0
  // v1–v2: Gantt/list default set includes 前置任务 (existing installs may omit it).
  if (columnDefaultsVersion < 2) {
    if (!columnOrder.includes('predecessors')) {
      columnOrder = insertColumnInCanonicalOrder(columnOrder, 'predecessors', customColumns)
    }
    columnDefaultsVersion = 2
  }

  const columnLabels: Record<string, string> =
    partial?.columnLabels && typeof partial.columnLabels === 'object'
      ? { ...partial.columnLabels }
      : {}
  // Drop stock / legacy builtin labels so active locale i18n wins.
  for (const id of GANTT_BUILTIN_COLUMNS) {
    const label = columnLabels[id]
    if (typeof label === 'string' && isStockBuiltinColumnLabel(id, label)) {
      delete columnLabels[id]
    }
  }
  // Drop labels for removed legacy custom columns.
  for (const key of Object.keys(columnLabels)) {
    if (key.startsWith('custom:') && !customIds.has(key)) delete columnLabels[key]
  }

  const colors = partial?.taskColors
  const resourceViewPartial =
    partial?.resourceView && typeof partial.resourceView === 'object'
      ? partial.resourceView
      : null
  const slotCountRaw = resourceViewPartial?.slotCount
  let slotCount =
    typeof slotCountRaw === 'number' && Number.isFinite(slotCountRaw)
      ? Math.max(1, Math.floor(slotCountRaw))
      : DEFAULT_GANTT_RESOURCE_VIEW_PREFS.slotCount
  let resourceInputMode = resourceViewPartial?.inputMode === true
  const layoutVersionRaw = resourceViewPartial?.columnLayoutVersion
  const columnLayoutVersion =
    typeof layoutVersionRaw === 'number' && Number.isFinite(layoutVersionRaw)
      ? Math.floor(layoutVersionRaw)
      : 0
  // v3: one column per type (人力/材料/机械) with header resource-name dropdown.
  // v4: insert 辅材 into the default type columns.
  if (columnLayoutVersion < 3) {
    slotCount = DEFAULT_GANTT_RESOURCE_VIEW_PREFS.slotCount
    resourceInputMode = false
  }

  let columnBindings = normalizeResourceColumnBindings(
    resourceViewPartial?.columnBindings,
    slotCount,
  )

  if (columnLayoutVersion < 4) {
    const types = columnBindings.map((binding) => binding.type)
    const isLegacyDefaultTriplet =
      types.length === 3 &&
      types[0] === 'labor' &&
      types[1] === 'material' &&
      types[2] === 'equipment'
    if (columnLayoutVersion < 3 || isLegacyDefaultTriplet) {
      slotCount = DEFAULT_GANTT_RESOURCE_VIEW_PREFS.slotCount
      columnBindings = buildDefaultResourceColumnBindings(slotCount)
    } else if (!types.includes('auxiliary')) {
      const laborIndex = types.indexOf('labor')
      const insertAt = laborIndex >= 0 ? laborIndex + 1 : 0
      columnBindings = [
        ...columnBindings.slice(0, insertAt),
        { type: 'auxiliary', resourceId: null },
        ...columnBindings.slice(insertAt),
      ]
      slotCount = columnBindings.length
    }
  }

  const costViewPartial =
    partial?.costView && typeof partial.costView === 'object' ? partial.costView : null
  const costSlotCountRaw = costViewPartial?.slotCount
  let costSlotCount =
    typeof costSlotCountRaw === 'number' && Number.isFinite(costSlotCountRaw)
      ? Math.max(1, Math.floor(costSlotCountRaw))
      : DEFAULT_GANTT_COST_VIEW_PREFS.slotCount
  // v3: cost-allocation default columns 1 → 4 (legacy default was a single slot).
  if (columnDefaultsVersion < 3) {
    if (costSlotCountRaw == null || costSlotCount === 1) {
      costSlotCount = DEFAULT_GANTT_COST_VIEW_PREFS.slotCount
    }
    columnDefaultsVersion = 3
  }

  return {
    dateHeaderMode: migrateDateHeaderMode(partial),
    barStyle:
      partial?.barStyle === 'outline'
        ? 'outline'
        : partial?.barStyle === 'hatch'
          ? 'hatch'
          : 'fill',
    taskColors: {
      task: normalizeHexColor(colors?.task, DEFAULT_GANTT_TASK_COLORS.task),
      critical: normalizeHexColor(colors?.critical, DEFAULT_GANTT_TASK_COLORS.critical),
      summary: normalizeHexColor(colors?.summary, DEFAULT_GANTT_TASK_COLORS.summary),
      milestone: normalizeHexColor(colors?.milestone, DEFAULT_GANTT_TASK_COLORS.milestone),
    },
    scheduleView:
      partial?.scheduleView === 'list'
        ? 'list'
        : partial?.scheduleView === 'resource'
          ? 'resource'
          : partial?.scheduleView === 'cost'
            ? 'cost'
            : partial?.scheduleView === 'progressCheck'
              ? 'progressCheck'
              : 'gantt',
    calendarWeekStartsOn: partial?.calendarWeekStartsOn === 0 ? 0 : 1,
    columnOrder,
    columnLabels,
    customColumns,
    resourceView: {
      slotCount,
      showDuration: resourceViewPartial?.showDuration !== false,
      showStart: resourceViewPartial?.showStart !== false,
      showFinish: resourceViewPartial?.showFinish !== false,
      inputMode: resourceInputMode,
      columnLayoutVersion: 4,
      columnBindings,
      typeFilter: normalizeResourceAssignTypeFilter(resourceViewPartial?.typeFilter),
    },
    costView: {
      slotCount: costSlotCount,
      showDuration: costViewPartial?.showDuration !== false,
      showStart: costViewPartial?.showStart !== false,
      showFinish: costViewPartial?.showFinish !== false,
      inputMode: costViewPartial?.inputMode === true,
      typeFilter: normalizeCostAssignTypeFilter(costViewPartial?.typeFilter),
    },
    columnDefaultsVersion,
  }
}

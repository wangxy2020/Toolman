/** Top-level Gantt UI prefs shape and defaults. */

import {
  DEFAULT_GANTT_TASK_COLORS,
  DEFAULT_GANTT_VISIBLE_COLUMNS,
  type GanttBarStyle,
  type GanttCustomColumn,
  type GanttDateHeaderMode,
  type GanttDateHeaderRows,
  type GanttScheduleView,
  type GanttTaskColors,
} from './pm-gantt-prefs-types'
import {
  DEFAULT_GANTT_COST_VIEW_PREFS,
  DEFAULT_GANTT_RESOURCE_VIEW_PREFS,
  type GanttCostViewPrefs,
  type GanttResourceViewPrefs,
} from './pm-gantt-prefs-assign'

export type GanttUiPrefs = {
  /** Timeline header layout. */
  dateHeaderMode: GanttDateHeaderMode
  /**
   * Legacy row count. Migrated into dateHeaderMode on load.
   * @deprecated
   */
  dateHeaderRows?: GanttDateHeaderRows
  /** Filled bars vs outline-only bars. */
  barStyle: GanttBarStyle
  /** Task bar colors. */
  taskColors: GanttTaskColors
  /** Task list only, or list + gantt chart. */
  scheduleView: GanttScheduleView
  /** Calendar: 0=Sunday, 1=Monday */
  calendarWeekStartsOn: 0 | 1
  /** Visible columns in display order (builtin keys or custom ids). */
  columnOrder: string[]
  /** Label overrides for any column id. */
  columnLabels: Record<string, string>
  /** User-added free-text columns. */
  customColumns: GanttCustomColumn[]
  /** Resource-allocation view layout (slots + optional schedule columns). */
  resourceView: GanttResourceViewPrefs
  /** Cost-allocation view layout. */
  costView: GanttCostViewPrefs
  /**
   * Bumped when default visible columns change.
   * Drives one-time inserts (e.g. ensure 前置任务 is visible).
   */
  columnDefaultsVersion?: number
}

export const DEFAULT_GANTT_UI_PREFS: GanttUiPrefs = {
  dateHeaderMode: 'year_month_day',
  barStyle: 'fill',
  taskColors: { ...DEFAULT_GANTT_TASK_COLORS },
  scheduleView: 'gantt',
  calendarWeekStartsOn: 1,
  columnOrder: [...DEFAULT_GANTT_VISIBLE_COLUMNS],
  columnLabels: {},
  customColumns: [],
  resourceView: { ...DEFAULT_GANTT_RESOURCE_VIEW_PREFS },
  costView: { ...DEFAULT_GANTT_COST_VIEW_PREFS },
  /** Bump when shipping a new one-time default-column migration. */
  columnDefaultsVersion: 3,
}

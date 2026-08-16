/** Gantt UI preferences (localStorage). */

export {
  ACTUAL_FINISH_META_KEY,
  ACTUAL_START_META_KEY,
  DEFAULT_GANTT_TASK_COLORS,
  DEFAULT_GANTT_VISIBLE_COLUMNS,
  GANTT_BUILTIN_COLUMNS,
  GANTT_COLUMN_WIDTHS,
  GANTT_COST_VIEW_BASE_COLUMNS,
  GANTT_CUSTOM_COLUMN_WIDTH,
  GANTT_DATE_HEADER_HEIGHT,
  GANTT_DATE_HEADER_MODES,
  GANTT_FULL_LIST_NAME_WIDTH,
  GANTT_MAX_DEPTH,
  GANTT_RESOURCE_VIEW_BASE_COLUMNS,
  PROGRESS_CHECK_COLUMN_ORDER,
  SHOULD_PERCENT_META_KEY,
  createCustomColumnId,
  customColumnMetaKey,
  dateHeaderHeight,
  isGanttBuiltinColumn,
  isGanttCustomColumnId,
  type GanttBarStyle,
  type GanttBuiltinColumn,
  type GanttCustomColumn,
  type GanttDateHeaderMode,
  type GanttDateHeaderRows,
  type GanttScheduleView,
  type GanttTaskColors,
} from './pm-gantt-prefs-types'

export {
  DEFAULT_GANTT_COST_VIEW_PREFS,
  DEFAULT_GANTT_RESOURCE_VIEW_PREFS,
  DEFAULT_RESOURCE_COLUMN_TYPES,
  GANTT_COST_ASSIGN_MENU_TYPES,
  GANTT_RESOURCE_ASSIGN_MENU_TYPES,
  SWITCHABLE_RESOURCE_COLUMN_TYPES,
  buildDefaultResourceColumnBindings,
  normalizeCostAssignTypeFilter,
  normalizeResourceAssignTypeFilter,
  normalizeResourceColumnBindings,
  resolveAssignViewSlotCount,
  type GanttAssignTypeFilter,
  type GanttCostViewPrefs,
  type GanttResourceColumnBinding,
  type GanttResourceColumnType,
  type GanttResourceViewPrefs,
} from './pm-gantt-prefs-assign'

export { DEFAULT_GANTT_UI_PREFS, type GanttUiPrefs } from './pm-gantt-prefs-ui'

export {
  insertColumnInCanonicalOrder,
  isStockBuiltinColumnLabel,
  normalizeGanttUiPrefs,
  withGanttDefaultPredecessorsColumn,
} from './pm-gantt-prefs-normalize'

export { loadGanttUiPrefs, saveGanttUiPrefs } from './pm-gantt-prefs-storage'

export {
  buildCostViewColumnOrder,
  buildGridTemplateColumns,
  buildListViewColumnOrder,
  buildResourceViewColumnOrder,
  computeGanttDayWidth,
  resolveColumnLabel,
} from './pm-gantt-prefs-layout'

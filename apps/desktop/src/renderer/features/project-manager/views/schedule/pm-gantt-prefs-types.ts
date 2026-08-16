/** Gantt UI preference types, builtin columns, and shared constants. */

export const GANTT_BUILTIN_COLUMNS = [
  'index',
  'name',
  'duration',
  'start',
  'finish',
  'predecessors',
  'actualStart',
  'actualFinish',
  'shouldPercentComplete',
  'percentComplete',
  'variance',
] as const

export type GanttBuiltinColumn = (typeof GANTT_BUILTIN_COLUMNS)[number]

/** Default visible columns (extra builtins start hidden). */
export const DEFAULT_GANTT_VISIBLE_COLUMNS: GanttBuiltinColumn[] = [
  'index',
  'name',
  'duration',
  'start',
  'finish',
  'predecessors',
]

/** Timeline header layout modes. */
export const GANTT_DATE_HEADER_MODES = [
  'day',
  'week',
  'month',
  'year',
  'month_day',
  'year_month',
  'year_month_day',
] as const

export type GanttDateHeaderMode = (typeof GANTT_DATE_HEADER_MODES)[number]

/** @deprecated Prefer GanttDateHeaderMode; kept for prefs migration. */
export type GanttDateHeaderRows = 1 | 2 | 3

export type GanttBarStyle = 'fill' | 'outline' | 'hatch'

export type GanttTaskColors = {
  task: string
  critical: string
  summary: string
  milestone: string
}

export type GanttCustomColumn = {
  id: string
  label: string
}

export const GANTT_COLUMN_WIDTHS: Record<string, string> = {
  index: '48px',
  /** Fixed in split gantt view so collapse/expand does not resize the list pane. */
  name: '220px',
  duration: '64px',
  start: '100px',
  finish: '100px',
  predecessors: '72px',
  actualStart: '100px',
  actualFinish: '100px',
  shouldPercentComplete: '72px',
  percentComplete: '72px',
  variance: '72px',
  /** Resource-assignment view: named columns (header select; cell = name select + qty). */
  resourceType: '88px',
  resourceName: '140px',
  resourceQty: '120px',
  /** Combined input-mode column (`类型，名称，数量；…`). */
  resourceInput: '320px',
  'resource:0:type': '88px',
  'resource:0:name': '140px',
  'resource:0:qty': '120px',
  /** Cost-allocation: one slot column = name picker + quantity. */
  costName: '128px',
  costAmount: '104px',
  costQty: '200px',
  costInput: '320px',
}

/** Fixed name width for full-width list layouts (resource / cost / list). */
export const GANTT_FULL_LIST_NAME_WIDTH = '280px'

/**
 * Resource view base columns. Named qty columns use `resource:N:qty`.
 * Trailing `spacer` absorbs leftover width so task name stays readable.
 */
export const GANTT_RESOURCE_VIEW_BASE_COLUMNS = ['index', 'name'] as const

export const GANTT_COST_VIEW_BASE_COLUMNS = ['index', 'name'] as const

export const GANTT_CUSTOM_COLUMN_WIDTH = '100px'

export type GanttScheduleView = 'list' | 'gantt' | 'progressCheck' | 'resource' | 'cost'

/** Columns shown in 进度检查 view (list + Gantt). */
export const PROGRESS_CHECK_COLUMN_ORDER: readonly GanttBuiltinColumn[] = [
  'index',
  'name',
  'duration',
  'start',
  'finish',
  'shouldPercentComplete',
  'percentComplete',
  'variance',
] as const

/** Max outline depth index (0-based). 5 levels → 0..4 */
export const GANTT_MAX_DEPTH = 4

export const DEFAULT_GANTT_TASK_COLORS: GanttTaskColors = {
  task: '#2e7d32',
  critical: '#c62828',
  summary: '#1b5e20',
  milestone: '#2e7d32',
}

/** Metadata keys for actual schedule fields (not first-class DB columns yet). */
export const ACTUAL_START_META_KEY = 'actualStartDate'
export const ACTUAL_FINISH_META_KEY = 'actualFinishDate'
export const SHOULD_PERCENT_META_KEY = 'shouldPercentComplete'

/** Fixed header height shared by task-grid columns and the date scale (3-row budget). */
export const GANTT_DATE_HEADER_HEIGHT = 54

export function isGanttBuiltinColumn(id: string): id is GanttBuiltinColumn {
  return (GANTT_BUILTIN_COLUMNS as readonly string[]).includes(id)
}

export function isGanttCustomColumnId(id: string): boolean {
  return id.startsWith('custom:')
}

export function createCustomColumnId(): string {
  return `custom:${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export function customColumnMetaKey(columnId: string): string {
  return `ganttCol:${columnId}`
}

export function dateHeaderHeight(_mode?: GanttDateHeaderMode | GanttDateHeaderRows): number {
  // Always reserve the 3-row budget; visible scale rows share it via flex.
  return GANTT_DATE_HEADER_HEIGHT
}

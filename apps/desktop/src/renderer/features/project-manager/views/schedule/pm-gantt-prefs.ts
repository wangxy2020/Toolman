/** Gantt UI preferences (localStorage). */

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
}

/** Fixed name width for full-width list layouts (resource / cost / list). */
export const GANTT_FULL_LIST_NAME_WIDTH = '280px'

export const GANTT_CUSTOM_COLUMN_WIDTH = '100px'

export type GanttScheduleView = 'list' | 'gantt' | 'resource' | 'cost'

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
}

/** Max outline depth index (0-based). 5 levels → 0..4 */
export const GANTT_MAX_DEPTH = 4

export const DEFAULT_GANTT_TASK_COLORS: GanttTaskColors = {
  task: '#2e7d32',
  critical: '#c62828',
  summary: '#1b5e20',
  milestone: '#2e7d32',
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
}

const GANTT_UI_PREFS_KEY = 'tm-pm-gantt-ui-prefs'
const LEGACY_LABELS_KEY = 'tm-pm-gantt-column-labels'

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

export function loadGanttUiPrefs(): GanttUiPrefs {
  try {
    const raw = localStorage.getItem(GANTT_UI_PREFS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GanttUiPrefs>
      const normalized = normalizeGanttUiPrefs(parsed)
      // Persist migrations (e.g. drop legacy「完成百分比」custom column).
      try {
        localStorage.setItem(GANTT_UI_PREFS_KEY, JSON.stringify(normalized))
      } catch {
        // ignore quota
      }
      return normalized
    }
    // Migrate legacy label-only storage
    const legacy = localStorage.getItem(LEGACY_LABELS_KEY)
    if (legacy) {
      const labels = JSON.parse(legacy) as Record<string, string>
      return normalizeGanttUiPrefs({ columnLabels: labels })
    }
  } catch {
    // ignore
  }
  return {
    ...DEFAULT_GANTT_UI_PREFS,
    columnOrder: [...DEFAULT_GANTT_VISIBLE_COLUMNS],
    taskColors: { ...DEFAULT_GANTT_TASK_COLORS },
  }
}

export function saveGanttUiPrefs(prefs: GanttUiPrefs): void {
  try {
    localStorage.setItem(GANTT_UI_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // ignore quota
  }
}

const LEGACY_PERCENT_LABELS = new Set(['完成百分比', '% Complete', 'Percent Complete'])

/**
 * Stock builtin headers across locales. Stored overrides that match these are
 * dropped so the active i18n pack controls the label (language switch).
 */
const STOCK_BUILTIN_LABELS: Record<GanttBuiltinColumn, readonly string[]> = {
  index: ['序号', '#', 'No.', 'ID'],
  name: ['任务名称', 'Task Name'],
  duration: ['工期', 'Duration'],
  start: ['开始日期', 'Start', 'Start Date'],
  finish: ['完成日期', 'Finish', 'Finish Date'],
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
  const columnOrder = rawOrder.filter(
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
            : 'gantt',
    calendarWeekStartsOn: partial?.calendarWeekStartsOn === 0 ? 0 : 1,
    columnOrder,
    columnLabels,
    customColumns,
  }
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

/** Metadata keys for actual schedule fields (not first-class DB columns yet). */
export const ACTUAL_START_META_KEY = 'actualStartDate'
export const ACTUAL_FINISH_META_KEY = 'actualFinishDate'
export const SHOULD_PERCENT_META_KEY = 'shouldPercentComplete'

export function buildGridTemplateColumns(
  columnOrder: string[],
  options?: { fullWidthList?: boolean; printLayout?: boolean },
): string {
  const tracks = columnOrder.map((id) => {
    if (id === 'name') {
      // Print: fixed width so every row shares identical tracks (no 1fr + max-content drift).
      if (options?.printLayout) return '200px'
      // Full-list / maximized: let the name column absorb leftover width.
      if (options?.fullWidthList) return `minmax(${GANTT_FULL_LIST_NAME_WIDTH}, 1fr)`
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

/** Fixed header height shared by task-grid columns and the date scale (3-row budget). */
export const GANTT_DATE_HEADER_HEIGHT = 54

export function dateHeaderHeight(_mode?: GanttDateHeaderMode | GanttDateHeaderRows): number {
  // Always reserve the 3-row budget; visible scale rows share it via flex.
  return GANTT_DATE_HEADER_HEIGHT
}

export function dateHeaderRowCount(mode: GanttDateHeaderMode): 1 | 2 | 3 {
  switch (mode) {
    case 'day':
    case 'week':
    case 'month':
    case 'year':
      return 1
    case 'month_day':
    case 'year_month':
      return 2
    case 'year_month_day':
    default:
      return 3
  }
}

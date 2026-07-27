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

export type GanttResourceColumnType =
  | 'labor'
  | 'auxiliary'
  | 'material'
  | 'equipment'
  | 'device'
  | 'instrument'
  | 'management'
  | 'fees'
  | 'comprehensive'
  | 'measures'
  | 'tax'
  | 'investment'
  | 'designEstimate'
  | 'constructionBudget'
  | 'costBudget'
  | 'funds'
  | 'other'
  | 'custom'

export type GanttResourceColumnBinding = {
  /** Resource type this column represents (header defaults to this type's label). */
  type: GanttResourceColumnType
  /** Selected catalog resource id; null = show type name only, cells empty. */
  resourceId: string | null
}

/** Default: one column per primary type — 人力 / 辅材 / 材料 / 机械. */
export const DEFAULT_RESOURCE_COLUMN_TYPES: readonly GanttResourceColumnType[] = [
  'labor',
  'auxiliary',
  'material',
  'equipment',
] as const

/** Types the resource-allocation header can switch among (all resource list types). */
export const SWITCHABLE_RESOURCE_COLUMN_TYPES: readonly GanttResourceColumnType[] = [
  'labor',
  'auxiliary',
  'material',
  'equipment',
  'device',
  'instrument',
  'management',
  'fees',
  'comprehensive',
  'measures',
  'tax',
  'investment',
  'designEstimate',
  'constructionBudget',
  'costBudget',
  'funds',
  'other',
  'custom',
] as const

export function buildDefaultResourceColumnBindings(
  count = DEFAULT_RESOURCE_COLUMN_TYPES.length,
): GanttResourceColumnBinding[] {
  const n = Math.max(1, Math.floor(count))
  return Array.from({ length: n }, (_, index) => ({
    type: DEFAULT_RESOURCE_COLUMN_TYPES[index % DEFAULT_RESOURCE_COLUMN_TYPES.length]!,
    resourceId: null,
  }))
}

function isGanttResourceColumnType(value: unknown): value is GanttResourceColumnType {
  return (
    value === 'labor' ||
    value === 'auxiliary' ||
    value === 'material' ||
    value === 'equipment' ||
    value === 'device' ||
    value === 'instrument' ||
    value === 'management' ||
    value === 'fees' ||
    value === 'comprehensive' ||
    value === 'measures' ||
    value === 'tax' ||
    value === 'investment' ||
    value === 'designEstimate' ||
    value === 'constructionBudget' ||
    value === 'costBudget' ||
    value === 'funds' ||
    value === 'other' ||
    value === 'custom'
  )
}

export type GanttAssignTypeFilter = 'all' | GanttResourceColumnType | 'custom'

/** Types listed under the 资源分配 menubar dropdown. */
export const GANTT_RESOURCE_ASSIGN_MENU_TYPES = [
  'labor',
  'auxiliary',
  'material',
  'equipment',
  'device',
  'instrument',
  'custom',
] as const satisfies readonly GanttAssignTypeFilter[]

/** Types listed under the 成本分配 menubar dropdown (price-list primary types through 资金). */
export const GANTT_COST_ASSIGN_MENU_TYPES = [
  'comprehensive',
  'management',
  'fees',
  'measures',
  'other',
  'tax',
  'investment',
  'designEstimate',
  'constructionBudget',
  'costBudget',
  'funds',
] as const satisfies readonly GanttAssignTypeFilter[]

export function normalizeResourceAssignTypeFilter(value: unknown): GanttAssignTypeFilter {
  if (value === 'all') return 'all'
  if (
    typeof value === 'string' &&
    (GANTT_RESOURCE_ASSIGN_MENU_TYPES as readonly string[]).includes(value)
  ) {
    return value as GanttAssignTypeFilter
  }
  return 'all'
}

export function normalizeCostAssignTypeFilter(value: unknown): GanttAssignTypeFilter {
  if (value === 'all') return 'all'
  if (
    typeof value === 'string' &&
    (GANTT_COST_ASSIGN_MENU_TYPES as readonly string[]).includes(value)
  ) {
    return value as GanttAssignTypeFilter
  }
  return 'all'
}

export function normalizeResourceColumnBindings(
  raw: unknown,
  slotCount: number,
): GanttResourceColumnBinding[] {
  const defaults = buildDefaultResourceColumnBindings(slotCount)
  if (!Array.isArray(raw)) return defaults
  const parsed: GanttResourceColumnBinding[] = []
  for (let i = 0; i < slotCount; i += 1) {
    const entry = raw[i]
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const row = entry as Record<string, unknown>
      const type = isGanttResourceColumnType(row.type)
        ? row.type
        : defaults[i]?.type ?? 'labor'
      const resourceId =
        typeof row.resourceId === 'string' && row.resourceId.trim()
          ? row.resourceId.trim()
          : null
      parsed.push({ type, resourceId })
    } else {
      parsed.push(defaults[i] ?? { type: 'labor', resourceId: null })
    }
  }
  return parsed
}

export type GanttResourceViewPrefs = {
  /** Number of type-based resource columns (qty-only cells). */
  slotCount: number
  showDuration: boolean
  showStart: boolean
  showFinish: boolean
  /**
   * When true, one text column (`类型，名称，数量；…`)
   * instead of type-based named qty columns.
   */
  inputMode: boolean
  /**
   * Bumped when column model changes.
   * v3 = one column per type with header resource-name dropdown.
   * v4 = defaults include 辅材 between 人力 and 材料.
   */
  columnLayoutVersion?: number
  /** Per-column type + selected resource (header dropdown). */
  columnBindings?: GanttResourceColumnBinding[]
  /**
   * Menubar filter for 资源分配: `'all'` or a resource-list type.
   * Filters visible assignment columns to that type.
   */
  typeFilter?: GanttAssignTypeFilter
}

export const DEFAULT_GANTT_RESOURCE_VIEW_PREFS: GanttResourceViewPrefs = {
  slotCount: DEFAULT_RESOURCE_COLUMN_TYPES.length,
  showDuration: true,
  showStart: true,
  showFinish: true,
  inputMode: false,
  columnLayoutVersion: 4,
  columnBindings: buildDefaultResourceColumnBindings(),
  typeFilter: 'all',
}

export type GanttCostViewPrefs = {
  slotCount: number
  showDuration: boolean
  showStart: boolean
  showFinish: boolean
  /**
   * When true, one combined column (`类型，名称，数量；…`) labeled「成本」
   * instead of per-slot name / quantity columns.
   */
  inputMode: boolean
  /**
   * Menubar filter for 成本分配: `'all'` or a price-list type.
   * Filters visible assignment columns to that type.
   */
  typeFilter?: GanttAssignTypeFilter
}

export const DEFAULT_GANTT_COST_VIEW_PREFS: GanttCostViewPrefs = {
  slotCount: 4,
  showDuration: true,
  showStart: true,
  showFinish: true,
  inputMode: false,
  typeFilter: 'all',
}

/**
 * Visible resource/cost assignment column count for the current project.
 * Empty projects use the default (4); otherwise at least the widest assignment row.
 */
export function resolveAssignViewSlotCount(
  maxAssignmentSlots: number,
  defaultSlots: number = DEFAULT_GANTT_COST_VIEW_PREFS.slotCount,
): number {
  const maxSlots = Math.max(0, Math.floor(maxAssignmentSlots))
  const fallback = Math.max(1, Math.floor(defaultSlots))
  return Math.max(fallback, maxSlots)
}

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
  resourceView: { ...DEFAULT_GANTT_RESOURCE_VIEW_PREFS },
  costView: { ...DEFAULT_GANTT_COST_VIEW_PREFS },
  /** Bump when shipping a new one-time default-column migration. */
  columnDefaultsVersion: 3,
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
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('tm-pm-gantt-prefs'))
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

export function isGanttBuiltinColumn(id: string): id is GanttBuiltinColumn {
  return (GANTT_BUILTIN_COLUMNS as readonly string[]).includes(id)
}

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

/** Fixed header height shared by task-grid columns and the date scale (3-row budget). */
export const GANTT_DATE_HEADER_HEIGHT = 54

export function dateHeaderHeight(_mode?: GanttDateHeaderMode | GanttDateHeaderRows): number {
  // Always reserve the 3-row budget; visible scale rows share it via flex.
  return GANTT_DATE_HEADER_HEIGHT
}

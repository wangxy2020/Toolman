/** Resource / cost assignment view prefs and column bindings. */

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

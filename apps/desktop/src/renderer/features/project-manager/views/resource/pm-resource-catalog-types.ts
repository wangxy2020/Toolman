/** Resource catalog on `PmProject.metadata.resourceCatalog`; workspace「全部项目」uses localStorage. */

export const PM_RESOURCE_CATALOG_KEY = 'resourceCatalog'

export const PM_RESOURCE_TYPES = [
  'labor',
  'auxiliary',
  'material',
  'equipment',
  'device',
  'instrument',
  'funds',
  'custom',
  'management',
  'fees',
  'comprehensive',
  'measures',
  'other',
  'tax',
  'investment',
  'designEstimate',
  'constructionBudget',
  'costBudget',
] as const

export type PmResourceType = (typeof PM_RESOURCE_TYPES)[number]

/** Top-level types shown directly in the view / type menus. */
export const PM_RESOURCE_PRIMARY_TYPES = [
  'labor',
  'auxiliary',
  'material',
  'equipment',
  'device',
  'instrument',
  'funds',
  'custom',
] as const satisfies readonly PmResourceType[]

/** Cost types nested under「成本资源」(管理 … 成本预算). */
export const PM_RESOURCE_COST_TYPES = [
  'management',
  'fees',
  'comprehensive',
  'measures',
  'other',
  'tax',
  'investment',
  'designEstimate',
  'constructionBudget',
  'costBudget',
] as const satisfies readonly PmResourceType[]

export type PmResourceCostType = (typeof PM_RESOURCE_COST_TYPES)[number]

export function isPmResourceCostType(value: unknown): value is PmResourceCostType {
  return typeof value === 'string' && (PM_RESOURCE_COST_TYPES as readonly string[]).includes(value)
}

export const PM_RESOURCE_APPLICABLE_ALL = 'all'

export type PmResourceRow = {
  id: string
  type: PmResourceType
  /** User-defined type label when `type === 'custom'`. */
  customTypeName: string
  name: string
  /** Specification / model (规格). */
  spec: string
  /** Measurement / quantity unit (计量单位). */
  unit: string
  /** Pricing unit for unitPrice (计价单位); defaults to `unit`. */
  pricingUnit: string
  unitPrice: number | null
  /** `'all'` = 全部项目, otherwise a project id. */
  applicable: string
  /** Free-form note (说明). */
  note: string
  sortOrder: number
  parentId?: string | null
}

/** Built-in primary types (excludes `custom`, which is named by the user). */
export const PM_RESOURCE_BUILTIN_PRIMARY_TYPES = PM_RESOURCE_PRIMARY_TYPES.filter(
  (type): type is Exclude<(typeof PM_RESOURCE_PRIMARY_TYPES)[number], 'custom'> =>
    type !== 'custom',
)

/** Trimmed user-defined type name (`''` when blank / not custom). */
export function resourceCustomTypeName(
  row: Pick<PmResourceRow, 'type' | 'customTypeName'>,
): string {
  if (row.type !== 'custom') return ''
  return row.customTypeName?.trim() ?? ''
}

/**
 * Display label for a resource type.
 * Custom rows use the user-entered name; unnamed custom falls back to `fallbackCustomLabel`.
 */
export function formatResourceTypeDisplayLabel(
  row: Pick<PmResourceRow, 'type' | 'customTypeName'>,
  builtinLabel: (type: PmResourceType) => string,
  fallbackCustomLabel: string,
): string {
  if (row.type === 'custom') {
    return resourceCustomTypeName(row) || fallbackCustomLabel
  }
  return builtinLabel(row.type)
}

/** Unique custom type names: catalog order first, then names found on rows. */
export function listCustomResourceTypeNames(
  rows: readonly PmResourceRow[],
  catalog: readonly string[] = [],
): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const entry of catalog) {
    const name = entry.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  for (const row of rows) {
    const name = resourceCustomTypeName(row)
    if (!name || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

/** Select-value encoding for a named custom type (`customName:<name>`). */
export function encodeCustomTypeSelectValue(name: string): string {
  return encodeCustomResourceViewFilter(name.trim())
}

export function parseCustomTypeSelectValue(
  value: string,
): { kind: 'blank' } | { kind: 'named'; name: string } | null {
  if (value === 'custom') return { kind: 'blank' }
  const name = parseCustomResourceViewFilter(value)
  if (name != null) return { kind: 'named', name }
  return null
}

export const CUSTOM_RESOURCE_VIEW_PREFIX = 'customName:' as const

export function encodeCustomResourceViewFilter(name: string): string {
  return `${CUSTOM_RESOURCE_VIEW_PREFIX}${name}`
}

export function parseCustomResourceViewFilter(filter: string): string | null {
  if (!filter.startsWith(CUSTOM_RESOURCE_VIEW_PREFIX)) return null
  return filter.slice(CUSTOM_RESOURCE_VIEW_PREFIX.length)
}

export function resourceRowMatchesViewFilter(
  row: Pick<PmResourceRow, 'type' | 'customTypeName'>,
  filter: string,
): boolean {
  if (filter === 'all') return true
  if (filter === 'custom') return row.type === 'custom'
  const customName = parseCustomResourceViewFilter(filter)
  if (customName != null) {
    return row.type === 'custom' && resourceCustomTypeName(row) === customName
  }
  return row.type === filter
}

export function isPmResourceType(value: unknown): value is PmResourceType {
  return typeof value === 'string' && (PM_RESOURCE_TYPES as readonly string[]).includes(value)
}

/** Built-in starter rows when a catalog has never been saved.
 * `unit` = 计量单位; `pricingUnit` = 计价单位; `unitPrice` = CNY per pricing unit.
 */
export const DEFAULT_RESOURCE_DEFS: ReadonlyArray<{
  type: PmResourceType
  name: string
  unit: string
  pricingUnit: string
  unitPrice: number | null
}> = [
  { type: 'labor', name: '普通工', unit: '人', pricingUnit: '工日', unitPrice: 250 },
  { type: 'labor', name: '技术工人', unit: '人', pricingUnit: '工日', unitPrice: 400 },
  { type: 'labor', name: '管理人员', unit: '人', pricingUnit: '工日', unitPrice: 500 },
  { type: 'auxiliary', name: '模板', unit: 'm²', pricingUnit: 'm²', unitPrice: 50 },
  { type: 'auxiliary', name: '方木', unit: 'm³', pricingUnit: 'm³', unitPrice: 1800 },
  { type: 'auxiliary', name: '脚手架', unit: 't', pricingUnit: 't', unitPrice: 5000 },
  { type: 'material', name: '砂子', unit: 'm³', pricingUnit: 'm³', unitPrice: 100 },
  { type: 'material', name: '石子', unit: 'm³', pricingUnit: 'm³', unitPrice: 110 },
  { type: 'material', name: '水泥', unit: 't', pricingUnit: 't', unitPrice: 400 },
  { type: 'material', name: '商品混凝土', unit: 'm³', pricingUnit: 'm³', unitPrice: 420 },
  { type: 'material', name: '钢筋', unit: 't', pricingUnit: 't', unitPrice: 3800 },
  { type: 'material', name: '砌块/砖', unit: 'm³', pricingUnit: 'm³', unitPrice: 280 },
  { type: 'material', name: '防水卷材', unit: 'm²', pricingUnit: 'm²', unitPrice: 25 },
  { type: 'material', name: '预拌砂浆', unit: 'm³', pricingUnit: 'm³', unitPrice: 450 },
  { type: 'material', name: '电缆', unit: 'm', pricingUnit: 'm', unitPrice: 20 },
  { type: 'material', name: '钢管', unit: 't', pricingUnit: 't', unitPrice: 4800 },
  { type: 'equipment', name: '钢筋切断机', unit: '台', pricingUnit: '台班', unitPrice: 200 },
  { type: 'equipment', name: '钢筋折弯机', unit: '台', pricingUnit: '台班', unitPrice: 220 },
  { type: 'equipment', name: '钢筋调直机', unit: '台', pricingUnit: '台班', unitPrice: 250 },
  { type: 'equipment', name: '洒水车', unit: '台', pricingUnit: '台班', unitPrice: 800 },
  { type: 'equipment', name: '铲车', unit: '台', pricingUnit: '台班', unitPrice: 1000 },
  { type: 'equipment', name: '吊车', unit: '台', pricingUnit: '台班', unitPrice: 2000 },
  { type: 'equipment', name: '挖掘机', unit: '台', pricingUnit: '台班', unitPrice: 1500 },
  { type: 'device', name: '发电机', unit: '台', pricingUnit: '台班', unitPrice: 600 },
  { type: 'device', name: '电焊机', unit: '台', pricingUnit: '台班', unitPrice: 180 },
  { type: 'device', name: '空压机', unit: '台', pricingUnit: '台班', unitPrice: 350 },
  { type: 'device', name: '水泵', unit: '台', pricingUnit: '台班', unitPrice: 200 },
  { type: 'device', name: '搅拌机', unit: '台', pricingUnit: '台班', unitPrice: 450 },
  { type: 'instrument', name: '全站仪', unit: '台', pricingUnit: '台班', unitPrice: 400 },
  { type: 'instrument', name: '水准仪', unit: '台', pricingUnit: '台班', unitPrice: 150 },
  { type: 'instrument', name: '塔尺', unit: '台', pricingUnit: '台班', unitPrice: 30 },
]

export const DEFAULT_UNIT_PRICE_BY_NAME = new Map(
  DEFAULT_RESOURCE_DEFS.flatMap((entry) =>
    entry.unitPrice != null ? ([[entry.name, entry.unitPrice]] as const) : [],
  ),
)

/** Legacy display names normalized onto the current project vocabulary. */
export const RESOURCE_NAME_ALIASES: Readonly<Record<string, string>> = {
  普通工人: '普通工',
  方林: '方木',
  施工图预算: '施工预算',
}

/** Canonicalize a resource name (e.g. 普通工人 → 普通工). */
export function canonicalizeResourceName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''
  return RESOURCE_NAME_ALIASES[trimmed] ?? trimmed
}

export function resourceMatchKey(
  type: PmResourceType,
  name: string,
  customTypeName = '',
): string {
  if (type === 'custom') {
    return `${type}::${customTypeName.trim()}::${name.trim()}`
  }
  return `${type}::${name.trim()}`
}

/**
 * Types whose built-in defaults should be rolled into already-saved catalogs
 * when the type is completely absent (e.g. newly added「设备」「仪器」).
 * Budget types (投资估算…成本预算) are intentionally omitted so users can delete them.
 */
export const ENSURE_DEFAULT_TYPES: readonly PmResourceType[] = [
  'auxiliary',
  'device',
  'instrument',
]

/**
 * Named defaults to roll into existing catalogs even when the type already exists
 * (e.g. new materials / instruments added later).
 * Budget named rows are omitted so deletions persist after save.
 */
export const ENSURE_NAMED_DEFAULTS: ReadonlyArray<{ type: PmResourceType; name: string }> = [
  { type: 'instrument', name: '全站仪' },
  { type: 'instrument', name: '水准仪' },
  { type: 'instrument', name: '塔尺' },
  { type: 'auxiliary', name: '模板' },
  { type: 'auxiliary', name: '方木' },
  { type: 'auxiliary', name: '脚手架' },
  { type: 'material', name: '砌块/砖' },
  { type: 'material', name: '防水卷材' },
  { type: 'material', name: '预拌砂浆' },
  { type: 'material', name: '电缆' },
  { type: 'material', name: '钢管' },
]

/**
 * Built-in budget rows removed from「全部项目」defaults; strip if still present
 * so hydrate/localStorage cannot resurrect them after delete.
 */
export const RETIRED_SHARED_BUDGET_DEFAULTS: ReadonlySet<string> = new Set([
  'investment\0投资估算',
  'designEstimate\0设计概算',
  'constructionBudget\0施工预算',
  'costBudget\0成本预算',
])

export function isRetiredSharedBudgetDefault(
  type: PmResourceType,
  name: string,
): boolean {
  return RETIRED_SHARED_BUDGET_DEFAULTS.has(`${type}\0${canonicalizeResourceName(name)}`)
}

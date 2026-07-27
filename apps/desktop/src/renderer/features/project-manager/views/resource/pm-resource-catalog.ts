/** Resource catalog stored on `PmProject.metadata.resourceCatalog`.
 * Workspace-wide「全部项目」catalog is stored in localStorage per workspace.
 */

import {
  buildResourceSaveMetadata,
  readResourceLastSavedAt,
  readResourceSaveHistory,
  readResourceVersion,
  removeResourceSaveHistoryEntry,
  type PmResourceCatalogSnapshotRow,
  type PmResourceSaveRecord,
} from '@toolman/shared'

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

/**
 * Cost-oriented types nested under「成本资源」in resource-list menus
 * (管理 … 成本预算, with 其他费 between 措施费 and 税金).
 */
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
  /**
   * User-defined type label when `type === 'custom'`.
   * Display / filter / Gantt use this name — not the literal「自定义」.
   */
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

/** Built-in starter rows when a catalog has never been saved.
 * `unit` = 计量单位; `pricingUnit` = 计价单位; `unitPrice` = CNY per pricing unit.
 */
const DEFAULT_RESOURCE_DEFS: ReadonlyArray<{
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

const DEFAULT_UNIT_PRICE_BY_NAME = new Map(
  DEFAULT_RESOURCE_DEFS.flatMap((entry) =>
    entry.unitPrice != null ? ([[entry.name, entry.unitPrice]] as const) : [],
  ),
)

export function isPmResourceType(value: unknown): value is PmResourceType {
  return typeof value === 'string' && (PM_RESOURCE_TYPES as readonly string[]).includes(value)
}

/** Legacy display names normalized onto the current project vocabulary. */
const RESOURCE_NAME_ALIASES: Readonly<Record<string, string>> = {
  普通工人: '普通工',
  方林: '方木',
  施工图预算: '施工预算',
}

/** Names that belong under「辅材」even if older catalogs stored them as material. */
const AUXILIARY_RESOURCE_NAMES: ReadonlySet<string> = new Set(['模板', '方木', '脚手架'])

/** Legacy「资金」named rows that become dedicated budget types. */
const BUDGET_TYPE_BY_NAME: Readonly<Record<string, PmResourceType>> = {
  投资估算: 'investment',
  设计概算: 'designEstimate',
  施工预算: 'constructionBudget',
  成本预算: 'costBudget',
}

/**
 * Move formwork / timber / scaffold into「辅材」and drop duplicate material rows.
 */
export function applyAuxiliaryResourceMigration(
  rows: readonly PmResourceRow[],
): { rows: PmResourceRow[]; changed: boolean } {
  let changed = false
  const result: PmResourceRow[] = []
  const seenAuxiliary = new Set<string>()

  for (const row of rows) {
    const name = canonicalizeResourceName(row.name)
    if (!AUXILIARY_RESOURCE_NAMES.has(name)) {
      if (name !== row.name.trim()) {
        changed = true
        result.push({ ...row, name })
      } else {
        result.push(row)
      }
      continue
    }

    if (seenAuxiliary.has(name)) {
      changed = true
      continue
    }
    seenAuxiliary.add(name)
    if (row.type !== 'auxiliary' || name !== row.name.trim()) {
      changed = true
      result.push({ ...row, name, type: 'auxiliary' })
    } else {
      result.push(row)
    }
  }

  if (!changed) return { rows: [...rows], changed: false }
  return { rows: result, changed: true }
}

/**
 * Promote legacy funds rows (投资估算等) into dedicated budget resource types.
 */
export function applyBudgetTypeMigration(
  rows: readonly PmResourceRow[],
): { rows: PmResourceRow[]; changed: boolean } {
  let changed = false
  const result: PmResourceRow[] = []
  const seenBudget = new Set<string>()

  for (const row of rows) {
    const name = canonicalizeResourceName(row.name)
    const budgetType = BUDGET_TYPE_BY_NAME[name]
    if (!budgetType) {
      if (name !== row.name.trim()) {
        changed = true
        result.push({ ...row, name })
      } else {
        result.push(row)
      }
      continue
    }

    if (seenBudget.has(budgetType)) {
      changed = true
      continue
    }
    seenBudget.add(budgetType)
    if (row.type !== budgetType || name !== row.name.trim()) {
      changed = true
      result.push({ ...row, name, type: budgetType })
    } else {
      result.push(row)
    }
  }

  if (!changed) return { rows: [...rows], changed: false }
  return { rows: result, changed: true }
}

/** Canonicalize a resource name (e.g. 普通工人 → 普通工). */
export function canonicalizeResourceName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''
  return RESOURCE_NAME_ALIASES[trimmed] ?? trimmed
}

function rawCatalogHasLegacyResourceNames(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false
  return raw.some((entry) => {
    if (entry == null || typeof entry !== 'object') return false
    const name = (entry as { name?: unknown }).name
    return typeof name === 'string' && canonicalizeResourceName(name) !== name.trim()
  })
}

function rawCatalogHasLegacyLaborUnits(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false
  return raw.some((entry) => {
    if (entry == null || typeof entry !== 'object') return false
    const row = entry as { type?: unknown; unit?: unknown; pricingUnit?: unknown }
    const laborMeasureIsDay =
      row.type === 'labor' && typeof row.unit === 'string' && row.unit.trim() === '工日'
    const laborPricingIsPeople =
      row.type === 'labor' &&
      typeof row.pricingUnit === 'string' &&
      row.pricingUnit.trim() === '人'
    return laborMeasureIsDay || laborPricingIsPeople
  })
}

function rawCatalogHasLegacyMachineMeasureUnits(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false
  return raw.some((entry) => {
    if (entry == null || typeof entry !== 'object') return false
    const row = entry as { type?: unknown; unit?: unknown }
    if (typeof row.unit !== 'string') return false
    const unit = row.unit.trim()
    if (
      (row.type === 'equipment' || row.type === 'device' || row.type === 'instrument') &&
      unit === '台班'
    ) {
      return true
    }
    return row.type === 'instrument' && unit === '天'
  })
}

function rawCatalogMissingPricingUnit(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false
  return raw.some((entry) => {
    if (entry == null || typeof entry !== 'object') return false
    const pricingUnit = (entry as { pricingUnit?: unknown }).pricingUnit
    return typeof pricingUnit !== 'string'
  })
}

function rawCatalogNeedsTypeMigration(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false
  return raw.some((entry) => {
    if (entry == null || typeof entry !== 'object') return false
    const row = entry as { name?: unknown; type?: unknown }
    const name = canonicalizeResourceName(typeof row.name === 'string' ? row.name : '')
    if (!name) return false
    if (AUXILIARY_RESOURCE_NAMES.has(name) && row.type !== 'auxiliary') return true
    const budgetType = BUDGET_TYPE_BY_NAME[name]
    if (budgetType && row.type !== budgetType) return true
    return false
  })
}

function rawCatalogNeedsLegacyRewrite(raw: unknown): boolean {
  return (
    rawCatalogHasLegacyResourceNames(raw) ||
    rawCatalogHasLegacyLaborUnits(raw) ||
    rawCatalogHasLegacyMachineMeasureUnits(raw) ||
    rawCatalogMissingPricingUnit(raw) ||
    rawCatalogNeedsTypeMigration(raw)
  )
}

/**
 * Rename aliased resource names and drop duplicates created by the rename
 * (prefer the first row for each type+name).
 */
export function applyResourceNameAliases(
  rows: readonly PmResourceRow[],
): { rows: PmResourceRow[]; changed: boolean } {
  let changed = false
  const mapped = rows.map((row) => {
    const nextName = canonicalizeResourceName(row.name)
    if (nextName !== row.name) {
      changed = true
      return { ...row, name: nextName }
    }
    return row
  })

  const seen = new Set<string>()
  const deduped: PmResourceRow[] = []
  for (const row of mapped) {
    const name = row.name.trim()
    if (!name) {
      deduped.push(row)
      continue
    }
    const key = `${row.type}::${name}`
    if (seen.has(key)) {
      changed = true
      continue
    }
    seen.add(key)
    deduped.push(row)
  }

  if (!changed) return { rows: [...rows], changed: false }
  return { rows: reindexResourceRows(deduped), changed: true }
}

/** Labor measurement unit is headcount — normalize legacy 工日 → 人 (not pricing). */
export function canonicalizeLaborUnit(type: PmResourceType, unit: string): string {
  if (type !== 'labor') return unit
  return unit.trim() === '工日' ? '人' : unit
}

export function applyLaborUnitAliases(
  rows: readonly PmResourceRow[],
): { rows: PmResourceRow[]; changed: boolean } {
  let changed = false
  const mapped = rows.map((row) => {
    const nextUnit = canonicalizeLaborUnit(row.type, row.unit)
    if (nextUnit !== row.unit) {
      changed = true
      return { ...row, unit: nextUnit }
    }
    return row
  })
  if (!changed) return { rows: [...rows], changed: false }
  return { rows: mapped, changed: true }
}

/**
 * Labor pricing is per 工日. Rewrite legacy synced「人」pricing units.
 * Machine types: measurement「台班」/「天」→「台」, keep旧值 as pricing when synced.
 */
export function applyResourceUnitConventions(
  rows: readonly PmResourceRow[],
): { rows: PmResourceRow[]; changed: boolean } {
  let changed = false
  const mapped = rows.map((row) => {
    let next = row

    if (row.type === 'labor') {
      const pricing = row.pricingUnit.trim()
      if (!pricing || pricing === '人') {
        next = { ...next, pricingUnit: '工日' }
      }
    }

    if (row.type === 'equipment' || row.type === 'device' || row.type === 'instrument') {
      const measure = next.unit.trim()
      const shouldRewriteMeasure =
        measure === '台班' || (row.type === 'instrument' && measure === '天')
      if (shouldRewriteMeasure) {
        const pricing = next.pricingUnit.trim()
        next = {
          ...next,
          unit: '台',
          pricingUnit: !pricing || pricing === measure ? '台班' : pricing,
        }
      }
    }

    if (
      next.unit !== row.unit ||
      next.pricingUnit !== row.pricingUnit
    ) {
      changed = true
    }
    return next
  })
  if (!changed) return { rows: [...rows], changed: false }
  return { rows: mapped, changed: true }
}

/** Apply name / measure / pricing-unit conventions used when reading catalogs. */
export function normalizeResourceCatalogRows(
  rows: readonly PmResourceRow[],
): { rows: PmResourceRow[]; changed: boolean } {
  const aliased = applyResourceNameAliases(rows)
  const auxiliary = applyAuxiliaryResourceMigration(aliased.rows)
  const budget = applyBudgetTypeMigration(auxiliary.rows)
  const measured = applyLaborUnitAliases(budget.rows)
  const conventioned = applyResourceUnitConventions(measured.rows)
  const pricedUnits = applyDefaultPricingUnits(conventioned.rows)
  const priced = applyDefaultUnitPrices(pricedUnits.rows)
  return {
    rows: priced.rows,
    changed:
      aliased.changed ||
      auxiliary.changed ||
      budget.changed ||
      measured.changed ||
      conventioned.changed ||
      pricedUnits.changed ||
      priced.changed,
  }
}

/** Fill missing/blank pricing units from type conventions. */
export function applyDefaultPricingUnits(
  rows: readonly PmResourceRow[],
): { rows: PmResourceRow[]; changed: boolean } {
  let changed = false
  const mapped = rows.map((row) => {
    const pricing = row.pricingUnit.trim()
    if (pricing) return row
    changed = true
    const fallback =
      row.type === 'labor'
        ? '工日'
        : row.type === 'equipment' || row.type === 'device' || row.type === 'instrument'
          ? '台班'
          : row.unit
    return { ...row, pricingUnit: fallback }
  })
  if (!changed) return { rows: [...rows], changed: false }
  return { rows: mapped, changed: true }
}

function readOptionalString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isResourceRow(value: unknown): value is PmResourceRow {
  if (value == null || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.id === 'string' &&
    row.id.length > 0 &&
    isPmResourceType(row.type) &&
    typeof row.name === 'string' &&
    typeof row.unit === 'string' &&
    (row.unitPrice == null ||
      (typeof row.unitPrice === 'number' && Number.isFinite(row.unitPrice))) &&
    typeof row.applicable === 'string' &&
    typeof row.sortOrder === 'number' &&
    Number.isFinite(row.sortOrder)
  )
}

/** Parse a stored catalog. `null` = key missing/invalid; `[]` = explicit empty (do not reseed). */
export function parseResourceRows(raw: unknown): PmResourceRow[] | null {
  if (!Array.isArray(raw)) return null
  if (raw.length === 0) return []
  const parsed = raw
    .filter(isResourceRow)
    .map((row) => {
      const record = row as PmResourceRow & Record<string, unknown>
      const unit = canonicalizeLaborUnit(row.type, row.unit)
      const rawPricing =
        typeof record.pricingUnit === 'string' ? record.pricingUnit : ''
      const pricingUnit = rawPricing.trim() ? rawPricing : ''
      return {
        id: row.id,
        type: row.type,
        customTypeName: readOptionalString(record.customTypeName),
        name: canonicalizeResourceName(row.name),
        spec: readOptionalString(record.spec),
        unit,
        pricingUnit,
        unitPrice:
          typeof row.unitPrice === 'number' && Number.isFinite(row.unitPrice)
            ? row.unitPrice
            : null,
        applicable:
          typeof row.applicable === 'string' && row.applicable.trim()
            ? row.applicable.trim()
            : PM_RESOURCE_APPLICABLE_ALL,
        note: readOptionalString(record.note ?? record.description),
        sortOrder: Math.floor(row.sortOrder),
        parentId: typeof row.parentId === 'string' ? row.parentId : null,
      }
    })
    .sort((left, right) => left.sortOrder - right.sortOrder)
  // Array was present but no valid rows — treat as explicit empty, not "unset".
  if (parsed.length === 0) return []
  return normalizeResourceCatalogRows(parsed).rows
}

export function createDefaultResourceCatalog(
  applicable: string = PM_RESOURCE_APPLICABLE_ALL,
): PmResourceRow[] {
  return DEFAULT_RESOURCE_DEFS.map((entry, index) => ({
    id: crypto.randomUUID(),
    type: entry.type,
    customTypeName: '',
    name: entry.name,
    spec: '',
    unit: entry.unit,
    pricingUnit: entry.pricingUnit,
    unitPrice: entry.unitPrice,
    applicable,
    note: '',
    sortOrder: index,
    parentId: null,
  }))
}

/**
 * Types whose built-in defaults should be rolled into already-saved catalogs
 * when the type is completely absent (e.g. newly added「设备」「仪器」).
 * Budget types (投资估算…成本预算) are intentionally omitted so users can delete them.
 */
const ENSURE_DEFAULT_TYPES: readonly PmResourceType[] = [
  'auxiliary',
  'device',
  'instrument',
]

/**
 * Named defaults to roll into existing catalogs even when the type already exists
 * (e.g. new materials / instruments added later).
 * Budget named rows are omitted so deletions persist after save.
 */
const ENSURE_NAMED_DEFAULTS: ReadonlyArray<{ type: PmResourceType; name: string }> = [
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
const RETIRED_SHARED_BUDGET_DEFAULTS: ReadonlySet<string> = new Set([
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

export function stripRetiredSharedBudgetDefaults(rows: readonly PmResourceRow[]): {
  rows: PmResourceRow[]
  changed: boolean
} {
  const next = rows.filter((row) => !isRetiredSharedBudgetDefault(row.type, row.name))
  if (next.length === rows.length) return { rows: [...rows], changed: false }
  return { rows: reindexResourceRows(next), changed: true }
}

/**
 * Append built-in defaults for newly introduced types / named resources that are
 * missing from a catalog.
 */
export function ensureDefaultResourcesInCatalog(rows: PmResourceRow[]): {
  rows: PmResourceRow[]
  changed: boolean
} {
  const stripped = stripRetiredSharedBudgetDefaults(rows)
  rows = stripped.rows
  const typesPresent = new Set<PmResourceType>()
  const keysPresent = new Set<string>()
  for (const row of rows) {
    const name = row.name.trim()
    if (!name) continue
    typesPresent.add(row.type)
    keysPresent.add(resourceMatchKey(row.type, name, row.customTypeName))
  }

  const defByKey = new Map(
    DEFAULT_RESOURCE_DEFS.map((entry) => [resourceMatchKey(entry.type, entry.name), entry] as const),
  )

  const additions: PmResourceRow[] = []

  for (const entry of DEFAULT_RESOURCE_DEFS) {
    if (!ENSURE_DEFAULT_TYPES.includes(entry.type)) continue
    if (typesPresent.has(entry.type)) continue
    const key = resourceMatchKey(entry.type, entry.name)
    if (keysPresent.has(key)) continue
    keysPresent.add(key)
    additions.push({
      id: crypto.randomUUID(),
      type: entry.type,
      customTypeName: '',
      name: entry.name,
      spec: '',
      unit: entry.unit,
      pricingUnit: entry.pricingUnit,
      unitPrice: entry.unitPrice,
      applicable: PM_RESOURCE_APPLICABLE_ALL,
      note: '',
      sortOrder: rows.length + additions.length,
      parentId: null,
    })
  }

  for (const named of ENSURE_NAMED_DEFAULTS) {
    const key = resourceMatchKey(named.type, named.name)
    if (keysPresent.has(key)) continue
    const def = defByKey.get(key)
    if (!def) continue
    keysPresent.add(key)
    additions.push({
      id: crypto.randomUUID(),
      type: def.type,
      customTypeName: '',
      name: def.name,
      spec: '',
      unit: def.unit,
      pricingUnit: def.pricingUnit,
      unitPrice: def.unitPrice,
      applicable: PM_RESOURCE_APPLICABLE_ALL,
      note: '',
      sortOrder: rows.length + additions.length,
      parentId: null,
    })
  }

  if (additions.length === 0) {
    return { rows, changed: stripped.changed }
  }
  return {
    rows: reindexResourceRows([...rows, ...additions]),
    changed: true,
  }
}

/** Fill missing unit prices for known built-in resource names. */
export function applyDefaultUnitPrices(rows: PmResourceRow[]): {
  rows: PmResourceRow[]
  changed: boolean
} {
  let changed = false
  const next = rows.map((row) => {
    if (row.unitPrice != null) return row
    const price = DEFAULT_UNIT_PRICE_BY_NAME.get(row.name.trim())
    if (price == null) return row
    changed = true
    return { ...row, unitPrice: price }
  })
  return { rows: next, changed }
}

function sharedCatalogStorageKey(workspaceId: string): string {
  return `toolman.pm.resourceCatalog.shared.${workspaceId}`
}

function sharedCatalogMetaStorageKey(workspaceId: string): string {
  return `toolman.pm.resourceCatalog.sharedMeta.${workspaceId}`
}

/** Workspace「全部项目」resource version / save history (localStorage). */
export function readSharedResourceSaveMeta(workspaceId: string): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(sharedCatalogMetaStorageKey(workspaceId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export function writeSharedResourceSaveMeta(
  workspaceId: string,
  metadata: Record<string, unknown>,
): void {
  localStorage.setItem(sharedCatalogMetaStorageKey(workspaceId), JSON.stringify(metadata))
}

/** Stable fingerprint for resource-catalog versioning (ignores row ids). */
export function fingerprintResourceCatalog(rows: readonly PmResourceRow[]): string {
  const idToIndex = new Map(rows.map((row, index) => [row.id, index]))
  const normalized = rows.map((row) => ({
    type: row.type,
    customTypeName: row.type === 'custom' ? row.customTypeName.trim() : '',
    name: row.name.trim(),
    spec: row.spec.trim(),
    unit: row.unit.trim(),
    pricingUnit: row.pricingUnit.trim(),
    unitPrice: row.unitPrice,
    applicable: row.applicable,
    note: row.note.trim(),
    sortOrder: row.sortOrder,
    parentIndex:
      row.parentId != null && idToIndex.has(row.parentId)
        ? idToIndex.get(row.parentId)!
        : null,
  }))
  return JSON.stringify(normalized)
}

/** Snapshot shape stored on save-history entries. */
export function toResourceCatalogSnapshot(
  rows: readonly PmResourceRow[],
): PmResourceCatalogSnapshotRow[] {
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    customTypeName: row.customTypeName,
    name: row.name,
    spec: row.spec,
    unit: row.unit,
    pricingUnit: row.pricingUnit,
    unitPrice: row.unitPrice,
    applicable: row.applicable,
    note: row.note,
    sortOrder: row.sortOrder,
    parentId: row.parentId ?? null,
  }))
}

/**
 * Record shared「全部项目」save meta after a catalog save.
 * Pass `bumpVersion: true` for「另存为新版本」; `false` (default) updates current only
 * (first save still creates v1).
 */
export function recordSharedResourceSaveMeta(
  workspaceId: string,
  rows: readonly PmResourceRow[],
  options?: { savedAt?: number; bumpVersion?: boolean; note?: string },
): Record<string, unknown> {
  const next = buildResourceSaveMetadata(readSharedResourceSaveMeta(workspaceId), {
    resourceCount: rows.length,
    contentFingerprint: fingerprintResourceCatalog(rows),
    savedAt: options?.savedAt ?? Date.now(),
    catalog: toResourceCatalogSnapshot(rows),
    bumpVersion: options?.bumpVersion ?? false,
    ...(options?.note?.trim() ? { note: options.note.trim() } : {}),
  })
  writeSharedResourceSaveMeta(workspaceId, next)
  return next
}

export function readSharedResourceVersion(workspaceId: string): number {
  return readResourceVersion(readSharedResourceSaveMeta(workspaceId))
}

export function readSharedResourceLastSavedAt(workspaceId: string): number | null {
  return readResourceLastSavedAt(readSharedResourceSaveMeta(workspaceId))
}

export function readSharedResourceSaveHistory(workspaceId: string): PmResourceSaveRecord[] {
  return readResourceSaveHistory(readSharedResourceSaveMeta(workspaceId))
}

export function removeSharedResourceSaveHistoryEntry(
  workspaceId: string,
  version: number,
): Record<string, unknown> {
  const next = removeResourceSaveHistoryEntry(readSharedResourceSaveMeta(workspaceId), version)
  writeSharedResourceSaveMeta(workspaceId, next)
  return next
}

/** Workspace「全部项目」resource list (independent of any single project). */
export function readSharedResourceCatalog(workspaceId: string): {
  rows: PmResourceRow[]
  isDefault: boolean
} {
  try {
    const raw = localStorage.getItem(sharedCatalogStorageKey(workspaceId))
    if (!raw) {
      return {
        rows: createDefaultResourceCatalog(PM_RESOURCE_APPLICABLE_ALL),
        isDefault: true,
      }
    }
    const parsedJson = JSON.parse(raw) as unknown
    const parsed = parseResourceRows(parsedJson)
    if (!parsed) {
      return {
        rows: createDefaultResourceCatalog(PM_RESOURCE_APPLICABLE_ALL),
        isDefault: true,
      }
    }
    const rows = parsed.map((row) =>
      row.applicable === PM_RESOURCE_APPLICABLE_ALL
        ? row
        : { ...row, applicable: PM_RESOURCE_APPLICABLE_ALL },
    )
    if (rawCatalogNeedsLegacyRewrite(parsedJson)) {
      writeSharedResourceCatalog(workspaceId, rows)
    }
    return {
      rows,
      isDefault: false,
    }
  } catch {
    return {
      rows: createDefaultResourceCatalog(PM_RESOURCE_APPLICABLE_ALL),
      isDefault: true,
    }
  }
}

export function writeSharedResourceCatalog(
  workspaceId: string,
  rows: PmResourceRow[],
): Promise<void> {
  const normalized = rows.map((row) => ({
    ...row,
    applicable: PM_RESOURCE_APPLICABLE_ALL,
  }))
  localStorage.setItem(sharedCatalogStorageKey(workspaceId), JSON.stringify(normalized))
  // Best-effort durable mirror for agent hints / main-process apply.
  return import('../../pm-api')
    .then(({ pmApi }) =>
      pmApi.setSharedResourceCatalog(
        workspaceId,
        normalized.map((row) => ({
          id: row.id,
          type: row.type,
          customTypeName: row.customTypeName ?? '',
          name: row.name,
          spec: row.spec,
          unit: row.unit,
          pricingUnit: row.pricingUnit,
          unitPrice: row.unitPrice,
          applicable: row.applicable,
          note: row.note,
          sortOrder: row.sortOrder,
          parentId: row.parentId ?? null,
        })),
      ),
    )
    .then(() => undefined)
    .catch(() => {
      // ignore offline / IPC failures; localStorage remains source for UI
    })
}

/**
 * Pull durable「全部项目」catalog into localStorage when main has a non-default store.
 * If main still has defaults but localStorage already has a saved catalog, push local → main
 * so the agent runtime snapshot can see the same list.
 */
export async function hydrateSharedResourceCatalogFromMain(
  workspaceId: string,
): Promise<PmResourceRow[]> {
  try {
    const { pmApi } = await import('../../pm-api')
    const remote = await pmApi.getSharedResourceCatalog(workspaceId)
    if (!remote.isDefault) {
      const mapped: PmResourceRow[] = remote.rows.map((row) => {
        const unit = row.unit
        const pricingUnit =
          typeof (row as { pricingUnit?: unknown }).pricingUnit === 'string' &&
          (row as { pricingUnit: string }).pricingUnit.trim()
            ? (row as { pricingUnit: string }).pricingUnit
            : ''
        return {
          id: row.id,
          type: row.type as PmResourceType,
          customTypeName:
            typeof (row as { customTypeName?: unknown }).customTypeName === 'string'
              ? (row as { customTypeName: string }).customTypeName
              : '',
          name: row.name,
          spec:
            typeof (row as { spec?: unknown }).spec === 'string'
              ? (row as { spec: string }).spec
              : '',
          unit,
          pricingUnit,
          unitPrice: row.unitPrice,
          applicable: row.applicable || PM_RESOURCE_APPLICABLE_ALL,
          note:
            typeof (row as { note?: unknown }).note === 'string'
              ? (row as { note: string }).note
              : '',
          sortOrder: row.sortOrder,
          parentId: row.parentId ?? null,
        }
      })
      const local = readSharedResourceCatalog(workspaceId)
      const remoteIds = new Set(mapped.map((row) => row.id))
      // Keep local-only rows (e.g. types main dropped while sync lagged / schema lagged).
      // Do not resurrect retired budget defaults that were removed from「全部项目」.
      const localExtras =
        !local.isDefault
          ? local.rows.filter(
              (row) =>
                !remoteIds.has(row.id) && !isRetiredSharedBudgetDefault(row.type, row.name),
            )
          : []
      const merged = localExtras.length > 0 ? [...mapped, ...localExtras] : mapped
      const stripped = stripRetiredSharedBudgetDefaults(merged)
      const normalized = normalizeResourceCatalogRows(stripped.rows)
      // Always write normalized rows so unit conventions sync to localStorage + main.
      writeSharedResourceCatalog(workspaceId, normalized.rows)
      return normalized.rows
    }

    const local = readSharedResourceCatalog(workspaceId)
    if (!local.isDefault && local.rows.length > 0) {
      const normalized = normalizeResourceCatalogRows(local.rows)
      writeSharedResourceCatalog(workspaceId, normalized.rows)
      return normalized.rows
    }
  } catch {
    // fall through to local
  }
  const local = readSharedResourceCatalog(workspaceId)
  if (!local.isDefault) {
    const normalized = normalizeResourceCatalogRows(local.rows)
    if (normalized.changed) {
      writeSharedResourceCatalog(workspaceId, normalized.rows)
    }
    return normalized.rows
  }
  return local.rows
}

/**
 * Insert shared「全部项目」rows that are missing from a project catalog (match by type+name).
 * Existing project rows keep their own prices / applicable scope.
 */
export function mergeSharedIntoProjectCatalog(
  projectRows: PmResourceRow[],
  sharedRows: PmResourceRow[],
): { rows: PmResourceRow[]; changed: boolean } {
  const existingKeys = new Set<string>()
  for (const row of projectRows) {
    const name = row.name.trim()
    if (!name) continue
    existingKeys.add(resourceMatchKey(row.type, name, row.customTypeName))
  }

  const additions: PmResourceRow[] = []
  for (const shared of sharedRows) {
    const name = shared.name.trim()
    if (!name) continue
    const key = resourceMatchKey(shared.type, name, shared.customTypeName)
    if (existingKeys.has(key)) continue
    existingKeys.add(key)
    additions.push({
      ...shared,
      id: crypto.randomUUID(),
      parentId: null,
      applicable: PM_RESOURCE_APPLICABLE_ALL,
    })
  }

  if (additions.length === 0) {
    return { rows: projectRows, changed: false }
  }
  return {
    rows: reindexResourceRows([...projectRows, ...additions]),
    changed: true,
  }
}

/** Promote project rows (适用 = 全部项目) into the shared catalog by type+name. */
export function upsertSharedResourceCatalog(
  sharedRows: PmResourceRow[],
  incoming: PmResourceRow[],
): { rows: PmResourceRow[]; changed: boolean } {
  let changed = false
  const next = [...sharedRows]
  const indexByKey = new Map<string, number>()
  for (let i = 0; i < next.length; i += 1) {
    const name = next[i]!.name.trim()
    if (!name) continue
    indexByKey.set(resourceMatchKey(next[i]!.type, name, next[i]!.customTypeName), i)
  }

  for (const row of incoming) {
    const name = row.name.trim()
    if (!name) continue
    const key = resourceMatchKey(row.type, name, row.customTypeName)
    const existingIndex = indexByKey.get(key)
    if (existingIndex == null) {
      next.push({
        ...row,
        id: crypto.randomUUID(),
        parentId: null,
        applicable: PM_RESOURCE_APPLICABLE_ALL,
      })
      indexByKey.set(key, next.length - 1)
      changed = true
      continue
    }
    const existing = next[existingIndex]!
    if (
      existing.unit !== row.unit ||
      existing.pricingUnit !== row.pricingUnit ||
      existing.unitPrice !== row.unitPrice ||
      existing.type !== row.type ||
      existing.name !== row.name ||
      existing.spec !== row.spec ||
      existing.note !== row.note
    ) {
      next[existingIndex] = {
        ...existing,
        type: row.type,
        name: row.name,
        spec: row.spec,
        unit: row.unit,
        pricingUnit: row.pricingUnit,
        unitPrice: row.unitPrice,
        applicable: PM_RESOURCE_APPLICABLE_ALL,
        note: row.note,
      }
      changed = true
    }
  }

  return {
    rows: changed ? reindexResourceRows(next) : sharedRows,
    changed,
  }
}

/**
 * Project catalog resolution:
 * - Stored catalog (including explicit `[]`) → use as-is.
 * - No stored catalog → use「全部项目」in memory only (`needsPersist: false`).
 *   Projects without their own list share the workspace catalog until the user saves.
 */
export function resolveProjectResourceCatalog(
  workspaceId: string,
  _projectId: string,
  metadata: Record<string, unknown> | null | undefined,
  _options?: { projectCode?: string | null },
): { rows: PmResourceRow[]; needsPersist: boolean; usesSharedFallback: boolean } {
  const shared = readSharedResourceCatalog(workspaceId)
  const rawCatalog = metadata?.[PM_RESOURCE_CATALOG_KEY]
  const stored = parseResourceRows(rawCatalog)
  if (stored !== null) {
    const priced = applyDefaultUnitPrices(stored)
    return {
      rows: priced.rows,
      needsPersist: priced.changed || rawCatalogNeedsLegacyRewrite(rawCatalog),
      usesSharedFallback: false,
    }
  }

  return {
    rows: shared.rows.map((row) => ({ ...row })),
    needsPersist: false,
    usesSharedFallback: true,
  }
}

/**
 * Catalog used when assigning resources on a schedule: project list if present,
 * otherwise「全部项目」.
 */
export function resolveAssignableResourceCatalog(
  workspaceId: string,
  projectId: string,
  metadata: Record<string, unknown> | null | undefined,
  options?: { projectCode?: string | null },
): PmResourceRow[] {
  return resolveProjectResourceCatalog(workspaceId, projectId, metadata, options).rows
}

export function createEmptyResourceRow(
  sortOrder: number,
  type: PmResourceType = 'labor',
  parentId: string | null = null,
  applicable: string = PM_RESOURCE_APPLICABLE_ALL,
  customTypeName = '',
): PmResourceRow {
  return {
    id: crypto.randomUUID(),
    type,
    customTypeName: type === 'custom' ? customTypeName : '',
    name: '',
    spec: '',
    unit: '',
    pricingUnit: '',
    unitPrice: null,
    applicable,
    note: '',
    sortOrder,
    parentId,
  }
}

export function reindexResourceRows(rows: PmResourceRow[]): PmResourceRow[] {
  return rows.map((row, index) => ({ ...row, sortOrder: index }))
}

export function resourceTypeMenuRank(type: PmResourceType): number {
  const index = PM_RESOURCE_TYPES.indexOf(type)
  return index >= 0 ? index : PM_RESOURCE_TYPES.length
}

/**
 * Sort by type-menu order, preserving relative order within the same type.
 * Used for「全部项目」so types follow the type dropdown.
 */
export function sortResourceRowsByTypeMenu(rows: readonly PmResourceRow[]): PmResourceRow[] {
  const indexed = rows.map((row, index) => ({ row, index }))
  indexed.sort((left, right) => {
    const typeDelta = resourceTypeMenuRank(left.row.type) - resourceTypeMenuRank(right.row.type)
    if (typeDelta !== 0) return typeDelta
    if (left.row.type === 'custom' && right.row.type === 'custom') {
      const nameDelta = resourceCustomTypeName(left.row).localeCompare(
        resourceCustomTypeName(right.row),
        'zh-CN',
      )
      if (nameDelta !== 0) return nameDelta
    }
    if (left.row.sortOrder !== right.row.sortOrder) {
      return left.row.sortOrder - right.row.sortOrder
    }
    return left.index - right.index
  })
  return reindexResourceRows(indexed.map((entry) => entry.row))
}

/**
 * Project catalogs: type-menu order, then name order of「全部项目」within each type.
 * Project-only rows (not in shared) stay after shared rows of the same type.
 */
export function sortResourceRowsLikeSharedCatalog(
  rows: readonly PmResourceRow[],
  sharedRows: readonly PmResourceRow[],
): PmResourceRow[] {
  const sharedRank = new Map<string, number>()
  sharedRows.forEach((row, index) => {
    const name = row.name.trim()
    if (!name) return
    const key = resourceMatchKey(row.type, name, row.customTypeName)
    if (!sharedRank.has(key)) sharedRank.set(key, index)
  })

  const indexed = rows.map((row, index) => ({ row, index }))
  indexed.sort((left, right) => {
    const typeDelta = resourceTypeMenuRank(left.row.type) - resourceTypeMenuRank(right.row.type)
    if (typeDelta !== 0) return typeDelta

    if (left.row.type === 'custom' && right.row.type === 'custom') {
      const nameDelta = resourceCustomTypeName(left.row).localeCompare(
        resourceCustomTypeName(right.row),
        'zh-CN',
      )
      if (nameDelta !== 0) return nameDelta
    }

    const leftKey = resourceMatchKey(left.row.type, left.row.name, left.row.customTypeName)
    const rightKey = resourceMatchKey(right.row.type, right.row.name, right.row.customTypeName)
    const leftShared = sharedRank.get(leftKey)
    const rightShared = sharedRank.get(rightKey)
    if (leftShared != null && rightShared != null && leftShared !== rightShared) {
      return leftShared - rightShared
    }
    if (leftShared != null && rightShared == null) return -1
    if (leftShared == null && rightShared != null) return 1

    if (left.row.sortOrder !== right.row.sortOrder) {
      return left.row.sortOrder - right.row.sortOrder
    }
    return left.index - right.index
  })
  return reindexResourceRows(indexed.map((entry) => entry.row))
}

export function resourceRowDepth(
  row: PmResourceRow,
  byId: Map<string, PmResourceRow>,
): number {
  let depth = 0
  let parentId = row.parentId ?? null
  const seen = new Set<string>()
  while (parentId) {
    if (seen.has(parentId)) break
    seen.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) break
    depth += 1
    parentId = parent.parentId ?? null
  }
  return depth
}

function resourceMatchKey(
  type: PmResourceType,
  name: string,
  customTypeName = '',
): string {
  if (type === 'custom') {
    return `${type}::${customTypeName.trim()}::${name.trim()}`
  }
  return `${type}::${name.trim()}`
}

/** Map「全部项目」catalog prices by type+name (and name-only fallback). */
export function buildBaselinePriceIndex(baselineRows: PmResourceRow[]): {
  byTypeAndName: Map<string, number>
  byName: Map<string, number>
} {
  const byTypeAndName = new Map<string, number>()
  const byName = new Map<string, number>()
  for (const row of baselineRows) {
    const name = row.name.trim()
    if (!name || row.unitPrice == null || !(row.unitPrice > 0)) continue
    byTypeAndName.set(
      resourceMatchKey(row.type, name, row.customTypeName),
      row.unitPrice,
    )
    if (!byName.has(name)) byName.set(name, row.unitPrice)
  }
  return { byTypeAndName, byName }
}

export function lookupBaselineUnitPrice(
  row: PmResourceRow,
  index: ReturnType<typeof buildBaselinePriceIndex>,
): number | null {
  const name = row.name.trim()
  if (!name) return null
  return (
    index.byTypeAndName.get(resourceMatchKey(row.type, name, row.customTypeName)) ??
    index.byName.get(name) ??
    null
  )
}

/**
 * Project unit price / 全部项目 unit price.
 * Returns null when either side is missing or baseline is zero.
 */
export function computeResourceBaselineRatio(
  projectUnitPrice: number | null,
  baselineUnitPrice: number | null,
): number | null {
  if (projectUnitPrice == null || !Number.isFinite(projectUnitPrice)) return null
  if (baselineUnitPrice == null || !(baselineUnitPrice > 0)) return null
  return projectUnitPrice / baselineUnitPrice
}

export function formatResourceBaselineRatio(ratio: number): string {
  if (Math.abs(ratio - 1) < 1e-9) return '1'
  const rounded = Math.round(ratio * 1000) / 1000
  return String(rounded)
}

export function isResourceBaselineRatioOff(ratio: number | null): boolean {
  return ratio != null && Math.abs(ratio - 1) > 1e-6
}

/**
 * Project-scope「适用」follows baseline:
 * - baseline ratio === 1 (same unit price as「全部项目」) → 全部项目
 * - otherwise (different price, or no comparable baseline) → this project
 */
export function deriveResourceApplicable(
  row: PmResourceRow,
  baselineIndex: ReturnType<typeof buildBaselinePriceIndex> | null,
  projectId: string,
): string {
  if (!baselineIndex) return projectId
  const ratio = computeResourceBaselineRatio(
    row.unitPrice,
    lookupBaselineUnitPrice(row, baselineIndex),
  )
  if (ratio != null && !isResourceBaselineRatioOff(ratio)) {
    return PM_RESOURCE_APPLICABLE_ALL
  }
  return projectId
}

export function withDerivedResourceApplicable(
  rows: readonly PmResourceRow[],
  baselineIndex: ReturnType<typeof buildBaselinePriceIndex> | null,
  projectId: string,
): PmResourceRow[] {
  return rows.map((row) => {
    const applicable = deriveResourceApplicable(row, baselineIndex, projectId)
    return row.applicable === applicable ? row : { ...row, applicable }
  })
}



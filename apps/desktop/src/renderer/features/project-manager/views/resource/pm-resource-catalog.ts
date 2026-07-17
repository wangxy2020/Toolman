/** Resource catalog stored on `PmProject.metadata.resourceCatalog`.
 * Workspace-wide「全部项目」catalog is stored in localStorage per workspace.
 */

import {
  buildResourceSaveMetadata,
  readResourceLastSavedAt,
  readResourceSaveHistory,
  readResourceVersion,
  removeResourceSaveHistoryEntry,
  type PmResourceSaveRecord,
} from '@toolman/shared'

export const PM_RESOURCE_CATALOG_KEY = 'resourceCatalog'

export const PM_RESOURCE_TYPES = [
  'labor',
  'material',
  'equipment',
  'management',
  'fees',
  'other',
] as const

export type PmResourceType = (typeof PM_RESOURCE_TYPES)[number]

export const PM_RESOURCE_APPLICABLE_ALL = 'all'

/** View menu: shared list (适用 = 全部项目). Project views use a project id. */
export const PM_RESOURCE_VIEW_ALL = 'all'

export type PmResourceViewKey = typeof PM_RESOURCE_VIEW_ALL | string

export type PmResourceRow = {
  id: string
  type: PmResourceType
  name: string
  unit: string
  unitPrice: number | null
  /** `'all'` = 全部项目, otherwise a project id. */
  applicable: string
  sortOrder: number
  parentId?: string | null
}

/** Built-in starter rows when a catalog has never been saved.
 * `unitPrice` is a rough China construction market reference (CNY / unit).
 */
const DEFAULT_RESOURCE_DEFS: ReadonlyArray<{
  type: PmResourceType
  name: string
  unit: string
  unitPrice: number
}> = [
  { type: 'labor', name: '普通工人', unit: '工日', unitPrice: 250 },
  { type: 'labor', name: '技术工人', unit: '工日', unitPrice: 400 },
  { type: 'labor', name: '管理人员', unit: '工日', unitPrice: 500 },
  { type: 'material', name: '砂子', unit: 'm³', unitPrice: 100 },
  { type: 'material', name: '石子', unit: 'm³', unitPrice: 110 },
  { type: 'material', name: '水泥', unit: 't', unitPrice: 400 },
  { type: 'material', name: '商品混凝土', unit: 'm³', unitPrice: 420 },
  { type: 'material', name: '钢筋', unit: 't', unitPrice: 3800 },
  { type: 'material', name: '模板', unit: 'm²', unitPrice: 50 },
  { type: 'material', name: '方木', unit: 'm³', unitPrice: 1800 },
  { type: 'material', name: '脚手架', unit: 't', unitPrice: 5000 },
  { type: 'equipment', name: '钢筋切断机', unit: '台班', unitPrice: 200 },
  { type: 'equipment', name: '钢筋折弯机', unit: '台班', unitPrice: 220 },
  { type: 'equipment', name: '钢筋调直机', unit: '台班', unitPrice: 250 },
  { type: 'equipment', name: '洒水车', unit: '台班', unitPrice: 800 },
  { type: 'equipment', name: '铲车', unit: '台班', unitPrice: 1000 },
  { type: 'equipment', name: '吊车', unit: '台班', unitPrice: 2000 },
  { type: 'equipment', name: '挖掘机', unit: '台班', unitPrice: 1500 },
]

const DEFAULT_UNIT_PRICE_BY_NAME = new Map(
  DEFAULT_RESOURCE_DEFS.map((entry) => [entry.name, entry.unitPrice] as const),
)

export function isPmResourceType(value: unknown): value is PmResourceType {
  return typeof value === 'string' && (PM_RESOURCE_TYPES as readonly string[]).includes(value)
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

function parseResourceRows(raw: unknown): PmResourceRow[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const parsed = raw
    .filter(isResourceRow)
    .map((row) => ({
      id: row.id,
      type: row.type,
      name: row.name,
      unit: row.unit,
      unitPrice:
        typeof row.unitPrice === 'number' && Number.isFinite(row.unitPrice) ? row.unitPrice : null,
      applicable:
        typeof row.applicable === 'string' && row.applicable.trim()
          ? row.applicable.trim()
          : PM_RESOURCE_APPLICABLE_ALL,
      sortOrder: Math.floor(row.sortOrder),
      parentId: typeof row.parentId === 'string' ? row.parentId : null,
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder)
  if (parsed.length === 0) return null
  return applyDefaultUnitPrices(parsed).rows
}

export function createDefaultResourceCatalog(
  applicable: string = PM_RESOURCE_APPLICABLE_ALL,
): PmResourceRow[] {
  return DEFAULT_RESOURCE_DEFS.map((entry, index) => ({
    id: crypto.randomUUID(),
    type: entry.type,
    name: entry.name,
    unit: entry.unit,
    unitPrice: entry.unitPrice,
    applicable,
    sortOrder: index,
    parentId: null,
  }))
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

/** True when metadata has never stored a resource catalog array (or it is empty). */
export function isResourceCatalogUnset(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  const raw = metadata?.[PM_RESOURCE_CATALOG_KEY]
  return !Array.isArray(raw) || raw.length === 0
}

/** True when stored rows are missing reference market prices for built-in names. */
export function resourceCatalogNeedsPriceBackfill(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  const raw = metadata?.[PM_RESOURCE_CATALOG_KEY]
  if (!Array.isArray(raw) || raw.length === 0) return false
  return raw.some((value) => {
    if (!isResourceRow(value)) return false
    if (value.unitPrice != null) return false
    return DEFAULT_UNIT_PRICE_BY_NAME.has(value.name.trim())
  })
}

export function readResourceCatalog(
  metadata: Record<string, unknown> | null | undefined,
): PmResourceRow[] {
  const parsed = parseResourceRows(metadata?.[PM_RESOURCE_CATALOG_KEY])
  if (parsed) return parsed
  return createDefaultResourceCatalog(PM_RESOURCE_APPLICABLE_ALL)
}

/** Clone a catalog with new ids and a fixed applicable scope (project or all). */
export function cloneResourceCatalog(
  rows: PmResourceRow[],
  applicable: string,
): PmResourceRow[] {
  const idMap = new Map<string, string>()
  for (const row of rows) {
    idMap.set(row.id, crypto.randomUUID())
  }
  return reindexResourceRows(
    rows.map((row) => ({
      ...row,
      id: idMap.get(row.id) ?? crypto.randomUUID(),
      parentId: row.parentId ? (idMap.get(row.parentId) ?? null) : null,
      applicable,
    })),
  )
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
    name: row.name.trim(),
    unit: row.unit.trim(),
    unitPrice: row.unitPrice,
    applicable: row.applicable,
    sortOrder: row.sortOrder,
    parentIndex:
      row.parentId != null && idToIndex.has(row.parentId)
        ? idToIndex.get(row.parentId)!
        : null,
  }))
  return JSON.stringify(normalized)
}

/**
 * Record shared「全部项目」save meta after a catalog save.
 * New versions are created only when catalog content actually changes.
 */
export function recordSharedResourceSaveMeta(
  workspaceId: string,
  rows: readonly PmResourceRow[],
  savedAt: number = Date.now(),
): Record<string, unknown> {
  const next = buildResourceSaveMetadata(readSharedResourceSaveMeta(workspaceId), {
    resourceCount: rows.length,
    contentFingerprint: fingerprintResourceCatalog(rows),
    savedAt,
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
    const parsed = parseResourceRows(JSON.parse(raw) as unknown)
    if (!parsed) {
      return {
        rows: createDefaultResourceCatalog(PM_RESOURCE_APPLICABLE_ALL),
        isDefault: true,
      }
    }
    return {
      rows: parsed.map((row) =>
        row.applicable === PM_RESOURCE_APPLICABLE_ALL
          ? row
          : { ...row, applicable: PM_RESOURCE_APPLICABLE_ALL },
      ),
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
): void {
  const normalized = rows.map((row) => ({
    ...row,
    applicable: PM_RESOURCE_APPLICABLE_ALL,
  }))
  localStorage.setItem(sharedCatalogStorageKey(workspaceId), JSON.stringify(normalized))
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
    existingKeys.add(resourceMatchKey(row.type, name))
  }

  const additions: PmResourceRow[] = []
  for (const shared of sharedRows) {
    const name = shared.name.trim()
    if (!name) continue
    const key = resourceMatchKey(shared.type, name)
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
    indexByKey.set(resourceMatchKey(next[i]!.type, name), i)
  }

  for (const row of incoming) {
    const name = row.name.trim()
    if (!name) continue
    const key = resourceMatchKey(row.type, name)
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
      existing.unitPrice !== row.unitPrice ||
      existing.type !== row.type ||
      existing.name !== row.name
    ) {
      next[existingIndex] = {
        ...existing,
        type: row.type,
        name: row.name,
        unit: row.unit,
        unitPrice: row.unitPrice,
        applicable: PM_RESOURCE_APPLICABLE_ALL,
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
 * Project catalog: use stored rows merged with workspace「全部项目」additions,
 * or clone the shared list when the project has never saved a catalog.
 */
export function resolveProjectResourceCatalog(
  workspaceId: string,
  _projectId: string,
  metadata: Record<string, unknown> | null | undefined,
): { rows: PmResourceRow[]; needsPersist: boolean } {
  const shared = readSharedResourceCatalog(workspaceId)
  const stored = parseResourceRows(metadata?.[PM_RESOURCE_CATALOG_KEY])
  if (stored) {
    const merged = mergeSharedIntoProjectCatalog(stored, shared.rows)
    const priced = applyDefaultUnitPrices(merged.rows)
    return {
      rows: priced.rows,
      needsPersist: merged.changed || priced.changed,
    }
  }

  return {
    // Inherited shared rows keep 适用 = 全部项目.
    rows: cloneResourceCatalog(shared.rows, PM_RESOURCE_APPLICABLE_ALL),
    needsPersist: true,
  }
}

/** Seed a brand-new project with the current workspace「全部项目」catalog. */
export function seedProjectResourceCatalogFromShared(
  workspaceId: string,
): PmResourceRow[] {
  const shared = readSharedResourceCatalog(workspaceId)
  return cloneResourceCatalog(shared.rows, PM_RESOURCE_APPLICABLE_ALL)
}

export function createEmptyResourceRow(
  sortOrder: number,
  type: PmResourceType = 'labor',
  parentId: string | null = null,
  applicable: string = PM_RESOURCE_APPLICABLE_ALL,
): PmResourceRow {
  return {
    id: crypto.randomUUID(),
    type,
    name: '',
    unit: '',
    unitPrice: null,
    applicable,
    sortOrder,
    parentId,
  }
}

export function reindexResourceRows(rows: PmResourceRow[]): PmResourceRow[] {
  return rows.map((row, index) => ({ ...row, sortOrder: index }))
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

function resourceMatchKey(type: PmResourceType, name: string): string {
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
    byTypeAndName.set(resourceMatchKey(row.type, name), row.unitPrice)
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
    index.byTypeAndName.get(resourceMatchKey(row.type, name)) ??
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

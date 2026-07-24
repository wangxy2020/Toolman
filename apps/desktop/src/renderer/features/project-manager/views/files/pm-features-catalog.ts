/** Practice (实务) catalog stored on `PmProject.metadata.featureCatalog`.
 * Workspace-wide「全部项目」catalog is stored in localStorage per workspace.
 */

import {
  buildFeatureSaveMetadata,
  readFeatureLastSavedAt,
  readFeatureSaveHistory,
  readFeatureVersion,
  removeFeatureSaveHistoryEntry,
  type PmFeatureCatalogSnapshotRow,
  type PmFeatureSaveRecord,
} from '@toolman/shared'

export const PM_FEATURE_CATALOG_KEY = 'featureCatalog'

export const PM_FEATURE_TYPES = [
  'labor',
  'auxiliary',
  'material',
  'machinery',
  'device',
  'instrument',
  'procurement',
  'metering',
  'node',
  'funds',
] as const

export type PmFeatureType = (typeof PM_FEATURE_TYPES)[number]

export const PM_FEATURE_APPLICABLE_ALL = 'all'

/** Schedule-synced types shown under 人力…仪器 / 「全部」. */
export const PM_FEATURE_SCHEDULE_TYPES = [
  'labor',
  'auxiliary',
  'material',
  'machinery',
  'device',
  'instrument',
] as const satisfies readonly PmFeatureType[]

export type PmFeatureScheduleType = (typeof PM_FEATURE_SCHEDULE_TYPES)[number]

export type PmFeatureViewFilter = PmFeatureType | 'scheduleAll'

export function isPmFeatureScheduleType(value: unknown): value is PmFeatureScheduleType {
  return (
    typeof value === 'string' &&
    (PM_FEATURE_SCHEDULE_TYPES as readonly string[]).includes(value)
  )
}

export function isPmFeatureViewFilter(value: unknown): value is PmFeatureViewFilter {
  return value === 'scheduleAll' || isPmFeatureType(value)
}

export type PmFeatureRow = {
  id: string
  type: PmFeatureType
  name: string
  unit: string
  /** Optional quantity / amount depending on type. */
  quantity: number | null
  remark: string
  /** `'all'` = 全部项目, otherwise a project id. */
  applicable: string
  sortOrder: number
  parentId?: string | null
}

const DEFAULT_FEATURE_DEFS: ReadonlyArray<{
  type: PmFeatureType
  name: string
  unit: string
  quantity: number | null
  remark: string
}> = [
  // labor / auxiliary / material / machinery are seeded from Gantt — no placeholders.
  { type: 'procurement', name: '招标采购计划', unit: '包', quantity: null, remark: '' },
  { type: 'metering', name: '工程计量节点', unit: '期', quantity: null, remark: '' },
  { type: 'node', name: '关键里程碑节点', unit: '个', quantity: null, remark: '' },
  { type: 'funds', name: '资金支付计划', unit: '笔', quantity: null, remark: '' },
]

/** Legacy starter rows that should not appear once schedule types auto-sync from Gantt. */
const LEGACY_SCHEDULE_FEATURE_PLACEHOLDERS: ReadonlySet<string> = new Set([
  'labor::现场管理人员配置',
  'material::主材进场计划',
  'machinery::关键机械进场',
])

const SCHEDULE_FEATURE_TYPES: ReadonlySet<PmFeatureType> = new Set(PM_FEATURE_SCHEDULE_TYPES)

export function isScheduleFeatureType(type: PmFeatureType): boolean {
  return SCHEDULE_FEATURE_TYPES.has(type)
}

export function featureTypeMenuRank(type: PmFeatureType): number {
  const index = PM_FEATURE_TYPES.indexOf(type)
  return index >= 0 ? index : PM_FEATURE_TYPES.length
}

export function isPmFeatureType(value: unknown): value is PmFeatureType {
  return typeof value === 'string' && (PM_FEATURE_TYPES as readonly string[]).includes(value)
}

function isFeatureRow(value: unknown): value is PmFeatureRow {
  if (value == null || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.id === 'string' &&
    row.id.length > 0 &&
    isPmFeatureType(row.type) &&
    typeof row.name === 'string' &&
    typeof row.unit === 'string' &&
    (row.quantity == null ||
      (typeof row.quantity === 'number' && Number.isFinite(row.quantity))) &&
    typeof row.remark === 'string' &&
    typeof row.applicable === 'string' &&
    typeof row.sortOrder === 'number' &&
    Number.isFinite(row.sortOrder)
  )
}

/** Parse a stored catalog. `null` = key missing/invalid; `[]` = explicit empty (do not reseed). */
function parseFeatureRows(raw: unknown): PmFeatureRow[] | null {
  if (!Array.isArray(raw)) return null
  if (raw.length === 0) return []
  const parsed = raw
    .filter(isFeatureRow)
    .map((row) => ({
      id: row.id,
      type: row.type,
      name: row.name,
      unit: row.unit,
      quantity:
        typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : null,
      remark: typeof row.remark === 'string' ? row.remark : '',
      applicable:
        typeof row.applicable === 'string' && row.applicable.trim()
          ? row.applicable.trim()
          : PM_FEATURE_APPLICABLE_ALL,
      sortOrder: Math.floor(row.sortOrder),
      parentId: typeof row.parentId === 'string' ? row.parentId : null,
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder)
  if (parsed.length === 0) return []
  return parsed
}

export function createDefaultFeatureCatalog(
  applicable: string = PM_FEATURE_APPLICABLE_ALL,
): PmFeatureRow[] {
  return DEFAULT_FEATURE_DEFS.map((entry, index) => ({
    id: crypto.randomUUID(),
    type: entry.type,
    name: entry.name,
    unit: entry.unit,
    quantity: entry.quantity,
    remark: entry.remark,
    applicable,
    sortOrder: index,
    parentId: null,
  }))
}

function cloneFeatureCatalog(rows: PmFeatureRow[], applicable: string): PmFeatureRow[] {
  return rows.map((row, index) => ({
    ...row,
    id: crypto.randomUUID(),
    applicable,
    sortOrder: index,
    parentId: null,
  }))
}

function featureMatchKey(type: PmFeatureType, name: string): string {
  return `${type}::${name.trim()}`
}

/** Drop legacy labor/auxiliary/material/machinery placeholders from stored catalogs. */
export function pruneLegacyScheduleFeaturePlaceholders(
  rows: readonly PmFeatureRow[],
): { rows: PmFeatureRow[]; changed: boolean } {
  const next = rows.filter(
    (row) => !LEGACY_SCHEDULE_FEATURE_PLACEHOLDERS.has(featureMatchKey(row.type, row.name)),
  )
  if (next.length === rows.length) {
    return { rows: [...rows], changed: false }
  }
  return { rows: reindexFeatureRows(next), changed: true }
}

/**
 * Remove labor/auxiliary/material/machinery rows from persisted catalogs.
 * Those types are live-derived from Gantt assignments and must not linger in storage.
 */
export function stripScheduleFeatureRows(
  rows: readonly PmFeatureRow[],
): { rows: PmFeatureRow[]; changed: boolean } {
  const next = rows.filter((row) => !isScheduleFeatureType(row.type))
  if (next.length === rows.length) {
    return { rows: [...rows], changed: false }
  }
  return { rows: reindexFeatureRows(next), changed: true }
}

function sharedCatalogStorageKey(workspaceId: string): string {
  return `toolman.pm.featureCatalog.shared.${workspaceId}`
}

export function readSharedFeatureCatalog(workspaceId: string): {
  rows: PmFeatureRow[]
  isDefault: boolean
} {
  try {
    const raw = localStorage.getItem(sharedCatalogStorageKey(workspaceId))
    if (!raw) {
      return {
        rows: createDefaultFeatureCatalog(PM_FEATURE_APPLICABLE_ALL),
        isDefault: true,
      }
    }
    const parsed = parseFeatureRows(JSON.parse(raw) as unknown)
    if (!parsed) {
      return {
        rows: createDefaultFeatureCatalog(PM_FEATURE_APPLICABLE_ALL),
        isDefault: true,
      }
    }
    const pruned = stripScheduleFeatureRows(
      parsed.map((row) =>
        row.applicable === PM_FEATURE_APPLICABLE_ALL
          ? row
          : { ...row, applicable: PM_FEATURE_APPLICABLE_ALL },
      ),
    )
    if (pruned.changed) {
      writeSharedFeatureCatalog(workspaceId, pruned.rows)
    }
    return {
      rows: pruned.rows,
      isDefault: false,
    }
  } catch {
    return {
      rows: createDefaultFeatureCatalog(PM_FEATURE_APPLICABLE_ALL),
      isDefault: true,
    }
  }
}
export function writeSharedFeatureCatalog(workspaceId: string, rows: PmFeatureRow[]): void {
  const normalized = rows.map((row) => ({
    ...row,
    applicable: PM_FEATURE_APPLICABLE_ALL,
  }))
  localStorage.setItem(sharedCatalogStorageKey(workspaceId), JSON.stringify(normalized))
}

export function mergeSharedIntoProjectFeatureCatalog(
  projectRows: PmFeatureRow[],
  sharedRows: PmFeatureRow[],
): { rows: PmFeatureRow[]; changed: boolean } {
  const existingKeys = new Set<string>()
  for (const row of projectRows) {
    const name = row.name.trim()
    if (!name) continue
    existingKeys.add(featureMatchKey(row.type, name))
  }

  const additions: PmFeatureRow[] = []
  for (const shared of sharedRows) {
    const name = shared.name.trim()
    if (!name) continue
    const key = featureMatchKey(shared.type, name)
    if (existingKeys.has(key)) continue
    existingKeys.add(key)
    additions.push({
      ...shared,
      id: crypto.randomUUID(),
      applicable: PM_FEATURE_APPLICABLE_ALL,
      parentId: null,
    })
  }

  if (additions.length === 0) {
    return { rows: projectRows, changed: false }
  }
  return {
    rows: reindexFeatureRows([...projectRows, ...additions]),
    changed: true,
  }
}

export function upsertSharedFeatureCatalog(
  sharedRows: PmFeatureRow[],
  candidates: PmFeatureRow[],
): { rows: PmFeatureRow[]; changed: boolean } {
  const byKey = new Map<string, PmFeatureRow>()
  for (const row of sharedRows) {
    const name = row.name.trim()
    if (!name) continue
    byKey.set(featureMatchKey(row.type, name), row)
  }

  let changed = false
  for (const candidate of candidates) {
    const name = candidate.name.trim()
    if (!name) continue
    const key = featureMatchKey(candidate.type, name)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, {
        ...candidate,
        id: crypto.randomUUID(),
        applicable: PM_FEATURE_APPLICABLE_ALL,
        parentId: null,
      })
      changed = true
      continue
    }
    if (
      existing.unit !== candidate.unit ||
      existing.quantity !== candidate.quantity ||
      existing.remark !== candidate.remark
    ) {
      byKey.set(key, {
        ...existing,
        unit: candidate.unit,
        quantity: candidate.quantity,
        remark: candidate.remark,
      })
      changed = true
    }
  }

  if (!changed) return { rows: sharedRows, changed: false }
  return {
    rows: reindexFeatureRows([...byKey.values()]),
    changed: true,
  }
}

export function resolveProjectFeatureCatalog(
  workspaceId: string,
  _projectId: string,
  metadata: Record<string, unknown> | null | undefined,
): { rows: PmFeatureRow[]; needsPersist: boolean } {
  const shared = readSharedFeatureCatalog(workspaceId)
  const stored = parseFeatureRows(metadata?.[PM_FEATURE_CATALOG_KEY])
  if (stored) {
    const pruned = stripScheduleFeatureRows(stored)
    const merged = mergeSharedIntoProjectFeatureCatalog(pruned.rows, shared.rows)
    return {
      rows: merged.rows,
      needsPersist: pruned.changed || merged.changed,
    }
  }

  return {
    rows: cloneFeatureCatalog(shared.rows, PM_FEATURE_APPLICABLE_ALL),
    needsPersist: true,
  }
}

export function createEmptyFeatureRow(
  sortOrder: number,
  type: PmFeatureType = 'labor',
  parentId: string | null = null,
  applicable: string = PM_FEATURE_APPLICABLE_ALL,
): PmFeatureRow {
  return {
    id: crypto.randomUUID(),
    type,
    name: '',
    unit: '',
    quantity: null,
    remark: '',
    applicable,
    sortOrder,
    parentId,
  }
}

export function reindexFeatureRows(rows: PmFeatureRow[]): PmFeatureRow[] {
  return rows.map((row, index) => ({ ...row, sortOrder: index }))
}

export function featureRowDepth(row: PmFeatureRow, byId: Map<string, PmFeatureRow>): number {
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

/** Stable fingerprint of persisted 手工目录 rows (schedule-synced types excluded upstream). */
export function fingerprintFeatureCatalog(rows: readonly PmFeatureRow[]): string {
  return JSON.stringify(
    rows.map((row) => ({
      type: row.type,
      name: row.name.trim(),
      unit: row.unit.trim(),
      quantity: row.quantity,
      remark: row.remark,
      applicable: row.applicable,
      sortOrder: row.sortOrder,
      parentId: row.parentId ?? null,
    })),
  )
}

function sharedCatalogMetaStorageKey(workspaceId: string): string {
  return `toolman.pm.featureCatalog.sharedMeta.${workspaceId}`
}

export function readSharedFeatureSaveMeta(workspaceId: string): Record<string, unknown> {
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

export function writeSharedFeatureSaveMeta(
  workspaceId: string,
  metadata: Record<string, unknown>,
): void {
  localStorage.setItem(sharedCatalogMetaStorageKey(workspaceId), JSON.stringify(metadata))
}

export function toFeatureCatalogSnapshot(rows: readonly PmFeatureRow[]): PmFeatureCatalogSnapshotRow[] {
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    name: row.name,
    unit: row.unit,
    quantity: row.quantity,
    remark: row.remark,
    applicable: row.applicable,
    sortOrder: row.sortOrder,
    parentId: row.parentId ?? null,
  }))
}

/**
 * Record shared「全部项目」save meta after a catalog save.
 * Pass `bumpVersion: true` for「另存为新版本」; `false` (default) updates current only
 * (first save still creates v1).
 */
export function recordSharedFeatureSaveMeta(
  workspaceId: string,
  rows: readonly PmFeatureRow[],
  options?: { savedAt?: number; bumpVersion?: boolean; note?: string },
): Record<string, unknown> {
  const next = buildFeatureSaveMetadata(readSharedFeatureSaveMeta(workspaceId), {
    featureCount: rows.length,
    contentFingerprint: fingerprintFeatureCatalog(rows),
    savedAt: options?.savedAt ?? Date.now(),
    catalog: toFeatureCatalogSnapshot(rows),
    bumpVersion: options?.bumpVersion ?? false,
    ...(options?.note?.trim() ? { note: options.note.trim() } : {}),
  })
  writeSharedFeatureSaveMeta(workspaceId, next)
  return next
}

export function readSharedFeatureVersion(workspaceId: string): number {
  return readFeatureVersion(readSharedFeatureSaveMeta(workspaceId))
}

export function readSharedFeatureLastSavedAt(workspaceId: string): number | null {
  return readFeatureLastSavedAt(readSharedFeatureSaveMeta(workspaceId))
}

export function readSharedFeatureSaveHistory(workspaceId: string): PmFeatureSaveRecord[] {
  return readFeatureSaveHistory(readSharedFeatureSaveMeta(workspaceId))
}

export function removeSharedFeatureSaveHistoryEntry(
  workspaceId: string,
  version: number,
): Record<string, unknown> {
  const next = removeFeatureSaveHistoryEntry(readSharedFeatureSaveMeta(workspaceId), version)
  writeSharedFeatureSaveMeta(workspaceId, next)
  return next
}

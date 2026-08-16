import {
  buildResourceSaveMetadata,
  readResourceLastSavedAt,
  readResourceSaveHistory,
  readResourceVersion,
  removeResourceSaveHistoryEntry,
  type PmResourceCatalogSnapshotRow,
  type PmResourceSaveRecord,
} from '@toolman/shared'
import {
  canonicalizeResourceName,
  isPmResourceType,
  PM_RESOURCE_APPLICABLE_ALL,
  type PmResourceRow,
} from './pm-resource-catalog-types'
import {
  canonicalizeLaborUnit,
  normalizeResourceCatalogRows,
  rawCatalogNeedsLegacyRewrite,
} from './pm-resource-catalog-migrations'
import { createDefaultResourceCatalog } from './pm-resource-catalog-rows'

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
      const rawPricing = typeof record.pricingUnit === 'string' ? record.pricingUnit : ''
      return {
        id: row.id,
        type: row.type,
        customTypeName: readOptionalString(record.customTypeName),
        name: canonicalizeResourceName(row.name),
        spec: readOptionalString(record.spec),
        unit,
        pricingUnit: rawPricing.trim() ? rawPricing : '',
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
  if (parsed.length === 0) return []
  return normalizeResourceCatalogRows(parsed).rows
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
      return { rows: createDefaultResourceCatalog(PM_RESOURCE_APPLICABLE_ALL), isDefault: true }
    }
    const parsedJson = JSON.parse(raw) as unknown
    const parsed = parseResourceRows(parsedJson)
    if (!parsed) {
      return { rows: createDefaultResourceCatalog(PM_RESOURCE_APPLICABLE_ALL), isDefault: true }
    }
    const rows = parsed.map((row) =>
      row.applicable === PM_RESOURCE_APPLICABLE_ALL
        ? row
        : { ...row, applicable: PM_RESOURCE_APPLICABLE_ALL },
    )
    if (rawCatalogNeedsLegacyRewrite(parsedJson)) {
      writeSharedResourceCatalog(workspaceId, rows)
    }
    return { rows, isDefault: false }
  } catch {
    return { rows: createDefaultResourceCatalog(PM_RESOURCE_APPLICABLE_ALL), isDefault: true }
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

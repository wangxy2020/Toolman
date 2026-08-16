/** Keys stored on `PmProject.metadata` for resource-catalog save versioning. */
export const PM_RESOURCE_VERSION_KEY = 'resourceVersion'
export const PM_RESOURCE_LAST_SAVED_AT_KEY = 'resourceLastSavedAt'
export const PM_RESOURCE_SAVE_HISTORY_KEY = 'resourceSaveHistory'
/** Fingerprint of last saved catalog; used to avoid version bumps on no-op saves. */
export const PM_RESOURCE_CONTENT_FINGERPRINT_KEY = 'resourceContentFingerprint'

export const PM_RESOURCE_SAVE_HISTORY_MAX = 5

/** Serializable resource-catalog row stored on a save-history entry for version switch. */
export type PmResourceCatalogSnapshotRow = {
  id: string
  type: string
  /** User-defined type name when type is custom; optional for legacy snapshots. */
  customTypeName?: string
  name: string
  spec: string
  unit: string
  pricingUnit: string
  unitPrice: number | null
  applicable: string
  note: string
  sortOrder: number
  parentId: string | null
}

export type PmResourceSaveRecord = {
  version: number
  savedAt: number
  resourceCount: number
  note?: string
  /** Fingerprint of the catalog at save time (keeps no-op save detection after version switch). */
  contentFingerprint?: string
  /** Catalog snapshot at save time; required to switch back to this version. */
  catalog?: PmResourceCatalogSnapshotRow[]
}

function isResourceCatalogSnapshotRow(value: unknown): value is PmResourceCatalogSnapshotRow {
  if (value == null || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.id === 'string' &&
    row.id.length > 0 &&
    typeof row.type === 'string' &&
    typeof row.name === 'string' &&
    typeof row.unit === 'string' &&
    (row.unitPrice == null ||
      (typeof row.unitPrice === 'number' && Number.isFinite(row.unitPrice))) &&
    typeof row.applicable === 'string' &&
    typeof row.sortOrder === 'number' &&
    Number.isFinite(row.sortOrder) &&
    (row.parentId == null || typeof row.parentId === 'string')
  )
}

function readSnapshotPricingUnit(row: Record<string, unknown>, unit: string): string {
  return typeof row.pricingUnit === 'string' && row.pricingUnit.trim()
    ? row.pricingUnit
    : unit
}

export function normalizeResourceCatalogSnapshot(
  rows: readonly PmResourceCatalogSnapshotRow[],
): PmResourceCatalogSnapshotRow[] {
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    customTypeName: typeof row.customTypeName === 'string' ? row.customTypeName : '',
    name: row.name,
    spec: typeof row.spec === 'string' ? row.spec : '',
    unit: row.unit,
    pricingUnit: readSnapshotPricingUnit(row as unknown as Record<string, unknown>, row.unit),
    unitPrice:
      typeof row.unitPrice === 'number' && Number.isFinite(row.unitPrice) ? row.unitPrice : null,
    applicable: row.applicable,
    note: typeof row.note === 'string' ? row.note : '',
    sortOrder: Math.floor(row.sortOrder),
    parentId: typeof row.parentId === 'string' ? row.parentId : null,
  }))
}

export function parseResourceCatalogSnapshot(raw: unknown): PmResourceCatalogSnapshotRow[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const rows = raw.filter(isResourceCatalogSnapshotRow).map((row) => {
    const record = row as PmResourceCatalogSnapshotRow & Record<string, unknown>
    return {
      id: row.id,
      type: row.type,
      customTypeName: typeof record.customTypeName === 'string' ? record.customTypeName : '',
      name: row.name,
      spec: typeof record.spec === 'string' ? record.spec : '',
      unit: row.unit,
      pricingUnit: readSnapshotPricingUnit(record, row.unit),
      unitPrice:
        typeof row.unitPrice === 'number' && Number.isFinite(row.unitPrice) ? row.unitPrice : null,
      applicable: row.applicable,
      note: typeof record.note === 'string' ? record.note : '',
      sortOrder: Math.floor(row.sortOrder),
      parentId: typeof row.parentId === 'string' ? row.parentId : null,
    }
  })
  return rows.length > 0 || raw.length === 0 ? rows : undefined
}

export function isResourceSaveRecord(value: unknown): value is PmResourceSaveRecord {
  if (value == null || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.version === 'number' &&
    Number.isFinite(row.version) &&
    typeof row.savedAt === 'number' &&
    Number.isFinite(row.savedAt) &&
    typeof row.resourceCount === 'number' &&
    Number.isFinite(row.resourceCount)
  )
}

export function serializeResourceHistoryEntry(entry: PmResourceSaveRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {
    version: entry.version,
    savedAt: entry.savedAt,
    resourceCount: entry.resourceCount,
  }
  if (entry.note) out.note = entry.note
  if (entry.contentFingerprint) out.contentFingerprint = entry.contentFingerprint
  if (entry.catalog) out.catalog = entry.catalog
  return out
}


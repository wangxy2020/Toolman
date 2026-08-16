/** Keys stored on `PmProject.metadata` for feature-catalog (实务目录) save versioning. */
export const PM_FEATURE_VERSION_KEY = 'featureVersion'
export const PM_FEATURE_LAST_SAVED_AT_KEY = 'featureLastSavedAt'
export const PM_FEATURE_SAVE_HISTORY_KEY = 'featureSaveHistory'
/** Fingerprint of last saved catalog; used to avoid version bumps on no-op saves. */
export const PM_FEATURE_CONTENT_FINGERPRINT_KEY = 'featureContentFingerprint'

export const PM_FEATURE_SAVE_HISTORY_MAX = 5

/** Serializable feature-catalog row stored on a save-history entry for version switch. */
export type PmFeatureCatalogSnapshotRow = {
  id: string
  type: string
  name: string
  unit: string
  pricingUnit?: string
  purchaseCycle?: number | null
  transportCycle?: number | null
  quantity: number | null
  remark: string
  code?: string
  featureDescription?: string
  sectionalWork?: string
  unitPrice?: number | null
  applicable: string
  sortOrder: number
  parentId: string | null
}

export type PmFeatureSaveRecord = {
  version: number
  savedAt: number
  featureCount: number
  note?: string
  /** Fingerprint of the catalog at save time (keeps no-op save detection after version switch). */
  contentFingerprint?: string
  /** Catalog snapshot at save time; required to switch back to this version. */
  catalog?: PmFeatureCatalogSnapshotRow[]
}

function isFeatureCatalogSnapshotRow(value: unknown): value is PmFeatureCatalogSnapshotRow {
  if (value == null || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.id === 'string' &&
    row.id.length > 0 &&
    typeof row.type === 'string' &&
    typeof row.name === 'string' &&
    typeof row.unit === 'string' &&
    (row.quantity == null ||
      (typeof row.quantity === 'number' && Number.isFinite(row.quantity))) &&
    typeof row.applicable === 'string' &&
    typeof row.sortOrder === 'number' &&
    Number.isFinite(row.sortOrder) &&
    (row.parentId == null || typeof row.parentId === 'string')
  )
}

export function normalizeFeatureCatalogSnapshot(
  rows: readonly PmFeatureCatalogSnapshotRow[],
): PmFeatureCatalogSnapshotRow[] {
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    name: row.name,
    unit: row.unit,
    pricingUnit: typeof row.pricingUnit === 'string' ? row.pricingUnit : '',
    purchaseCycle:
      typeof row.purchaseCycle === 'number' && Number.isFinite(row.purchaseCycle)
        ? row.purchaseCycle
        : null,
    transportCycle:
      typeof row.transportCycle === 'number' && Number.isFinite(row.transportCycle)
        ? row.transportCycle
        : null,
    quantity:
      typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : null,
    remark: typeof row.remark === 'string' ? row.remark : '',
    code: typeof row.code === 'string' ? row.code : '',
    featureDescription:
      typeof row.featureDescription === 'string' ? row.featureDescription : '',
    sectionalWork: typeof row.sectionalWork === 'string' ? row.sectionalWork : '',
    unitPrice:
      typeof row.unitPrice === 'number' && Number.isFinite(row.unitPrice) ? row.unitPrice : null,
    applicable: row.applicable,
    sortOrder: Math.floor(row.sortOrder),
    parentId: typeof row.parentId === 'string' ? row.parentId : null,
  }))
}

export function parseFeatureCatalogSnapshot(raw: unknown): PmFeatureCatalogSnapshotRow[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const rows = raw.filter(isFeatureCatalogSnapshotRow).map((row) => {
    const record = row as PmFeatureCatalogSnapshotRow & Record<string, unknown>
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      unit: row.unit,
      pricingUnit: typeof record.pricingUnit === 'string' ? record.pricingUnit : '',
      purchaseCycle:
        typeof record.purchaseCycle === 'number' && Number.isFinite(record.purchaseCycle)
          ? record.purchaseCycle
          : null,
      transportCycle:
        typeof record.transportCycle === 'number' && Number.isFinite(record.transportCycle)
          ? record.transportCycle
          : null,
      quantity:
        typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : null,
      remark: typeof record.remark === 'string' ? record.remark : '',
      code: typeof record.code === 'string' ? record.code : '',
      featureDescription:
        typeof record.featureDescription === 'string' ? record.featureDescription : '',
      sectionalWork: typeof record.sectionalWork === 'string' ? record.sectionalWork : '',
      unitPrice:
        typeof record.unitPrice === 'number' && Number.isFinite(record.unitPrice)
          ? record.unitPrice
          : null,
      applicable: row.applicable,
      sortOrder: Math.floor(row.sortOrder),
      parentId: typeof row.parentId === 'string' ? row.parentId : null,
    }
  })
  return rows.length > 0 || raw.length === 0 ? rows : undefined
}

export function isFeatureSaveRecord(value: unknown): value is PmFeatureSaveRecord {
  if (value == null || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.version === 'number' &&
    Number.isFinite(row.version) &&
    typeof row.savedAt === 'number' &&
    Number.isFinite(row.savedAt) &&
    typeof row.featureCount === 'number' &&
    Number.isFinite(row.featureCount)
  )
}

export function serializeFeatureHistoryEntry(entry: PmFeatureSaveRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {
    version: entry.version,
    savedAt: entry.savedAt,
    featureCount: entry.featureCount,
  }
  if (entry.note) out.note = entry.note
  if (entry.contentFingerprint) out.contentFingerprint = entry.contentFingerprint
  if (entry.catalog) out.catalog = entry.catalog
  return out
}


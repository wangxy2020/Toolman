/** Keys stored on `PmProject.metadata` for cost-catalog (价格表) save versioning. */
export const PM_COST_VERSION_KEY = 'costVersion'
export const PM_COST_LAST_SAVED_AT_KEY = 'costLastSavedAt'
export const PM_COST_SAVE_HISTORY_KEY = 'costSaveHistory'
/** Fingerprint of last saved catalog; used to avoid version bumps on no-op saves. */
export const PM_COST_CONTENT_FINGERPRINT_KEY = 'costContentFingerprint'

export const PM_COST_SAVE_HISTORY_MAX = 5

/** Serializable cost-catalog row stored on a save-history entry for version switch. */
export type PmCostCatalogSnapshotRow = {
  id: string
  type: string
  /** Item code (编码); optional for legacy snapshots. */
  code?: string
  name: string
  /** Feature description (特征描述); optional for legacy snapshots. */
  featureDescription?: string
  unit: string
  quantity: number | null
  unitPrice: number | null
  applicable: string
  note: string
  /** Sectional / divisional work (分部工程); optional for legacy snapshots. */
  sectionalWork?: string
  /** Code on 分部工程 summary row; optional for legacy snapshots. */
  sectionCode?: string
  /** Note on 分部工程 summary row; optional for legacy snapshots. */
  sectionNote?: string
  /** Display name on 分部工程 / 汇总 summary row; optional for legacy snapshots. */
  sectionName?: string
  /** Feature description on 分部工程 / 汇总 summary row; optional for legacy snapshots. */
  sectionFeatureDescription?: string
  /** Optional 合价 formula on 分部工程 summary row; optional for legacy snapshots. */
  sectionTotalFormula?: string
  sortOrder: number
  parentId: string | null
}

export type PmCostSaveRecord = {
  version: number
  savedAt: number
  costCount: number
  note?: string
  /** Fingerprint of the catalog at save time (keeps no-op save detection after version switch). */
  contentFingerprint?: string
  /** Catalog snapshot at save time; required to switch back to this version. */
  catalog?: PmCostCatalogSnapshotRow[]
}

function isCostCatalogSnapshotRow(value: unknown): value is PmCostCatalogSnapshotRow {
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
    (row.unitPrice == null ||
      (typeof row.unitPrice === 'number' && Number.isFinite(row.unitPrice))) &&
    typeof row.applicable === 'string' &&
    typeof row.sortOrder === 'number' &&
    Number.isFinite(row.sortOrder) &&
    (row.parentId == null || typeof row.parentId === 'string')
  )
}

export function normalizeCostCatalogSnapshot(
  rows: readonly PmCostCatalogSnapshotRow[],
): PmCostCatalogSnapshotRow[] {
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    code: typeof row.code === 'string' ? row.code : '',
    name: row.name,
    featureDescription:
      typeof row.featureDescription === 'string' ? row.featureDescription : '',
    unit: row.unit,
    quantity:
      typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : null,
    unitPrice:
      typeof row.unitPrice === 'number' && Number.isFinite(row.unitPrice) ? row.unitPrice : null,
    applicable: row.applicable,
    note: typeof row.note === 'string' ? row.note : '',
    sectionalWork: typeof row.sectionalWork === 'string' ? row.sectionalWork : '',
    sectionCode: typeof row.sectionCode === 'string' ? row.sectionCode : '',
    sectionNote: typeof row.sectionNote === 'string' ? row.sectionNote : '',
    sectionName: typeof row.sectionName === 'string' ? row.sectionName : '',
    sectionFeatureDescription:
      typeof row.sectionFeatureDescription === 'string' ? row.sectionFeatureDescription : '',
    sectionTotalFormula:
      typeof row.sectionTotalFormula === 'string' ? row.sectionTotalFormula : '',
    sortOrder: Math.floor(row.sortOrder),
    parentId: typeof row.parentId === 'string' ? row.parentId : null,
  }))
}

export function parseCostCatalogSnapshot(raw: unknown): PmCostCatalogSnapshotRow[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const rows = raw.filter(isCostCatalogSnapshotRow).map((row) => {
    const record = row as PmCostCatalogSnapshotRow & Record<string, unknown>
    return {
      id: row.id,
      type: row.type,
      code: typeof record.code === 'string' ? record.code : '',
      name: row.name,
      featureDescription:
        typeof record.featureDescription === 'string' ? record.featureDescription : '',
      unit: row.unit,
      quantity:
        typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : null,
      unitPrice:
        typeof row.unitPrice === 'number' && Number.isFinite(row.unitPrice) ? row.unitPrice : null,
      applicable: row.applicable,
      note: typeof record.note === 'string' ? record.note : '',
      sectionalWork: typeof record.sectionalWork === 'string' ? record.sectionalWork : '',
      sectionCode: typeof record.sectionCode === 'string' ? record.sectionCode : '',
      sectionNote: typeof record.sectionNote === 'string' ? record.sectionNote : '',
      sectionName: typeof record.sectionName === 'string' ? record.sectionName : '',
      sectionFeatureDescription:
        typeof record.sectionFeatureDescription === 'string'
          ? record.sectionFeatureDescription
          : '',
      sectionTotalFormula:
        typeof record.sectionTotalFormula === 'string' ? record.sectionTotalFormula : '',
      sortOrder: Math.floor(row.sortOrder),
      parentId: typeof row.parentId === 'string' ? row.parentId : null,
    }
  })
  return rows.length > 0 || raw.length === 0 ? rows : undefined
}

export function isCostSaveRecord(value: unknown): value is PmCostSaveRecord {
  if (value == null || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.version === 'number' &&
    Number.isFinite(row.version) &&
    typeof row.savedAt === 'number' &&
    Number.isFinite(row.savedAt) &&
    typeof row.costCount === 'number' &&
    Number.isFinite(row.costCount)
  )
}

export function serializeCostHistoryEntry(entry: PmCostSaveRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {
    version: entry.version,
    savedAt: entry.savedAt,
    costCount: entry.costCount,
  }
  if (entry.note) out.note = entry.note
  if (entry.contentFingerprint) out.contentFingerprint = entry.contentFingerprint
  if (entry.catalog) out.catalog = entry.catalog
  return out
}

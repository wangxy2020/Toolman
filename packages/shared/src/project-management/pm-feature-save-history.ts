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

function parseFeatureCatalogSnapshot(raw: unknown): PmFeatureCatalogSnapshotRow[] | undefined {
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

function isFeatureSaveRecord(value: unknown): value is PmFeatureSaveRecord {
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

function serializeHistoryEntry(entry: PmFeatureSaveRecord): Record<string, unknown> {
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

export function readFeatureVersion(metadata: Record<string, unknown> | null | undefined): number {
  const raw = metadata?.[PM_FEATURE_VERSION_KEY]
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return Math.floor(raw)
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
    return Math.max(0, Math.floor(Number(raw)))
  }
  return 0
}

/** Highest version number among current pointer and feature save-history rows. */
export function readMaxFeatureVersion(
  metadata: Record<string, unknown> | null | undefined,
): number {
  let max = readFeatureVersion(metadata)
  for (const row of readFeatureSaveHistory(metadata)) {
    if (row.version > max) max = row.version
  }
  return max
}

export function readFeatureLastSavedAt(
  metadata: Record<string, unknown> | null | undefined,
): number | null {
  const raw = metadata?.[PM_FEATURE_LAST_SAVED_AT_KEY]
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
    const value = Number(raw)
    return value > 0 ? value : null
  }
  return null
}

export function readFeatureContentFingerprint(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const raw = metadata?.[PM_FEATURE_CONTENT_FINGERPRINT_KEY]
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

export function readFeatureSaveHistory(
  metadata: Record<string, unknown> | null | undefined,
): PmFeatureSaveRecord[] {
  const raw = metadata?.[PM_FEATURE_SAVE_HISTORY_KEY]
  if (!Array.isArray(raw)) return []
  return raw.filter(isFeatureSaveRecord).map((row) => {
    const catalog = parseFeatureCatalogSnapshot((row as { catalog?: unknown }).catalog)
    const contentFingerprint =
      typeof (row as { contentFingerprint?: unknown }).contentFingerprint === 'string' &&
      (row as { contentFingerprint: string }).contentFingerprint.length > 0
        ? (row as { contentFingerprint: string }).contentFingerprint
        : undefined
    return {
      version: Math.floor(row.version),
      savedAt: row.savedAt,
      featureCount: Math.max(0, Math.floor(row.featureCount)),
      ...(typeof row.note === 'string' && row.note.trim() ? { note: row.note.trim() } : {}),
      ...(contentFingerprint ? { contentFingerprint } : {}),
      ...(catalog ? { catalog } : {}),
    }
  })
}

/** Catalog snapshot for a history version, if one was stored at save time. */
export function readFeatureVersionCatalog(
  metadata: Record<string, unknown> | null | undefined,
  version: number,
): PmFeatureCatalogSnapshotRow[] | null {
  const target = Math.floor(version)
  const entry = readFeatureSaveHistory(metadata).find((row) => row.version === target)
  return entry?.catalog ?? null
}

/**
 * Point metadata at an existing history version (does not rewrite the live catalog key).
 * Returns null when the version is missing or has no catalog snapshot.
 */
export function buildMetadataForFeatureVersionSwitch(
  metadata: Record<string, unknown> | null | undefined,
  version: number,
): Record<string, unknown> | null {
  const target = Math.floor(version)
  const entry = readFeatureSaveHistory(metadata).find((row) => row.version === target)
  if (!entry?.catalog) return null
  const next: Record<string, unknown> = {
    ...(metadata ?? {}),
    [PM_FEATURE_VERSION_KEY]: entry.version,
    [PM_FEATURE_LAST_SAVED_AT_KEY]: entry.savedAt,
    [PM_FEATURE_SAVE_HISTORY_KEY]: readFeatureSaveHistory(metadata).map(serializeHistoryEntry),
  }
  if (entry.contentFingerprint) {
    next[PM_FEATURE_CONTENT_FINGERPRINT_KEY] = entry.contentFingerprint
  } else {
    delete next[PM_FEATURE_CONTENT_FINGERPRINT_KEY]
  }
  return next
}

/**
 * Build the next metadata patch after a successful feature-catalog save.
 *
 * - `bumpVersion: true`: always create a new version
 * - `bumpVersion: false`: update current version only (first save still creates v1)
 * - omitted: bump when content fingerprint changed (legacy)
 *
 * Unchanged / non-bump saves refresh `lastSavedAt` on the current version.
 */
export function buildFeatureSaveMetadata(
  metadata: Record<string, unknown> | null | undefined,
  options: {
    featureCount: number
    /** Stable hash/serialization of the catalog being saved. */
    contentFingerprint: string
    savedAt?: number
    note?: string
    /** Force a new version even when the fingerprint is unchanged. */
    bumpVersion?: boolean
    /** Catalog snapshot for version switch (stored on the history entry). */
    catalog?: readonly PmFeatureCatalogSnapshotRow[]
  },
): Record<string, unknown> {
  const base = { ...(metadata ?? {}) }
  const savedAt = options.savedAt ?? Date.now()
  const featureCount = Math.max(0, Math.floor(options.featureCount))
  const fingerprint = options.contentFingerprint
  const previousFingerprint = readFeatureContentFingerprint(base)
  const hasVersion = readMaxFeatureVersion(base) > 0
  const contentChanged =
    previousFingerprint != null ? previousFingerprint !== fingerprint : !hasVersion
  const shouldBump =
    options.bumpVersion === true ||
    !hasVersion ||
    (options.bumpVersion == null && contentChanged)
  const catalog =
    options.catalog != null ? normalizeFeatureCatalogSnapshot(options.catalog) : undefined

  if (shouldBump) {
    const nextVersion = readMaxFeatureVersion(base) + 1
    const entry: PmFeatureSaveRecord = {
      version: nextVersion,
      savedAt,
      featureCount,
      contentFingerprint: fingerprint,
      ...(options.note?.trim() ? { note: options.note.trim() } : {}),
      ...(catalog ? { catalog } : {}),
    }

    const history = [entry, ...readFeatureSaveHistory(base)].slice(0, PM_FEATURE_SAVE_HISTORY_MAX)

    return {
      ...base,
      [PM_FEATURE_VERSION_KEY]: nextVersion,
      [PM_FEATURE_LAST_SAVED_AT_KEY]: savedAt,
      [PM_FEATURE_SAVE_HISTORY_KEY]: history.map(serializeHistoryEntry),
      [PM_FEATURE_CONTENT_FINGERPRINT_KEY]: fingerprint,
    }
  }

  const currentVersion = readFeatureVersion(base)
  let history = readFeatureSaveHistory(base)
  if (currentVersion > 0) {
    const index = history.findIndex((row) => row.version === currentVersion)
    const previous = index >= 0 ? history[index] : undefined
    const updated: PmFeatureSaveRecord = {
      version: currentVersion,
      savedAt,
      featureCount,
      contentFingerprint: fingerprint,
      ...(options.note?.trim()
        ? { note: options.note.trim() }
        : previous?.note
          ? { note: previous.note }
          : {}),
      ...(catalog ? { catalog } : previous?.catalog ? { catalog: previous.catalog } : {}),
    }
    if (index >= 0) {
      history = [...history]
      history[index] = updated
    } else {
      history = [updated, ...history].slice(0, PM_FEATURE_SAVE_HISTORY_MAX)
    }
  }

  return {
    ...base,
    [PM_FEATURE_LAST_SAVED_AT_KEY]: savedAt,
    [PM_FEATURE_CONTENT_FINGERPRINT_KEY]: fingerprint,
    ...(currentVersion > 0
      ? { [PM_FEATURE_SAVE_HISTORY_KEY]: history.map(serializeHistoryEntry) }
      : {}),
  }
}

/**
 * Remove one feature save-history entry. If it was the current version, fall
 * back to the newest remaining history entry (or 0 when history is empty).
 */
export function removeFeatureSaveHistoryEntry(
  metadata: Record<string, unknown> | null | undefined,
  version: number,
): Record<string, unknown> {
  const base = { ...(metadata ?? {}) }
  const target = Math.floor(version)
  const history = readFeatureSaveHistory(base).filter((row) => row.version !== target)
  const currentVersion = readFeatureVersion(base)
  const nextVersion = currentVersion === target ? (history[0]?.version ?? 0) : currentVersion
  const nextLastSavedAt =
    currentVersion === target ? (history[0]?.savedAt ?? null) : readFeatureLastSavedAt(base)

  const next: Record<string, unknown> = {
    ...base,
    [PM_FEATURE_VERSION_KEY]: nextVersion,
    [PM_FEATURE_SAVE_HISTORY_KEY]: history.map(serializeHistoryEntry),
  }
  if (nextLastSavedAt != null) next[PM_FEATURE_LAST_SAVED_AT_KEY] = nextLastSavedAt
  else delete next[PM_FEATURE_LAST_SAVED_AT_KEY]
  if (currentVersion === target) delete next[PM_FEATURE_CONTENT_FINGERPRINT_KEY]
  return next
}

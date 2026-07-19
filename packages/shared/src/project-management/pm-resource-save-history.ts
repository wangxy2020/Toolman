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

function parseResourceCatalogSnapshot(raw: unknown): PmResourceCatalogSnapshotRow[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const rows = raw.filter(isResourceCatalogSnapshotRow).map((row) => {
    const record = row as PmResourceCatalogSnapshotRow & Record<string, unknown>
    return {
      id: row.id,
      type: row.type,
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

function isResourceSaveRecord(value: unknown): value is PmResourceSaveRecord {
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

function serializeHistoryEntry(entry: PmResourceSaveRecord): Record<string, unknown> {
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

export function readResourceVersion(
  metadata: Record<string, unknown> | null | undefined,
): number {
  const raw = metadata?.[PM_RESOURCE_VERSION_KEY]
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return Math.floor(raw)
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
    return Math.max(0, Math.floor(Number(raw)))
  }
  return 0
}

/** Highest version number among current pointer and resource save-history rows. */
export function readMaxResourceVersion(
  metadata: Record<string, unknown> | null | undefined,
): number {
  let max = readResourceVersion(metadata)
  for (const row of readResourceSaveHistory(metadata)) {
    if (row.version > max) max = row.version
  }
  return max
}

export function readResourceLastSavedAt(
  metadata: Record<string, unknown> | null | undefined,
): number | null {
  const raw = metadata?.[PM_RESOURCE_LAST_SAVED_AT_KEY]
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
    const value = Number(raw)
    return value > 0 ? value : null
  }
  return null
}

export function readResourceContentFingerprint(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const raw = metadata?.[PM_RESOURCE_CONTENT_FINGERPRINT_KEY]
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

export function readResourceSaveHistory(
  metadata: Record<string, unknown> | null | undefined,
): PmResourceSaveRecord[] {
  const raw = metadata?.[PM_RESOURCE_SAVE_HISTORY_KEY]
  if (!Array.isArray(raw)) return []
  return raw.filter(isResourceSaveRecord).map((row) => {
    const catalog = parseResourceCatalogSnapshot(
      (row as { catalog?: unknown }).catalog,
    )
    const contentFingerprint =
      typeof (row as { contentFingerprint?: unknown }).contentFingerprint === 'string' &&
      (row as { contentFingerprint: string }).contentFingerprint.length > 0
        ? (row as { contentFingerprint: string }).contentFingerprint
        : undefined
    return {
      version: Math.floor(row.version),
      savedAt: row.savedAt,
      resourceCount: Math.max(0, Math.floor(row.resourceCount)),
      ...(typeof row.note === 'string' && row.note.trim() ? { note: row.note.trim() } : {}),
      ...(contentFingerprint ? { contentFingerprint } : {}),
      ...(catalog ? { catalog } : {}),
    }
  })
}

/** Catalog snapshot for a history version, if one was stored at save time. */
export function readResourceVersionCatalog(
  metadata: Record<string, unknown> | null | undefined,
  version: number,
): PmResourceCatalogSnapshotRow[] | null {
  const target = Math.floor(version)
  const entry = readResourceSaveHistory(metadata).find((row) => row.version === target)
  return entry?.catalog ?? null
}

/**
 * Point metadata at an existing history version (does not rewrite the live catalog key).
 * Returns null when the version is missing or has no catalog snapshot.
 */
export function buildMetadataForResourceVersionSwitch(
  metadata: Record<string, unknown> | null | undefined,
  version: number,
): Record<string, unknown> | null {
  const target = Math.floor(version)
  const entry = readResourceSaveHistory(metadata).find((row) => row.version === target)
  if (!entry?.catalog) return null
  const next: Record<string, unknown> = {
    ...(metadata ?? {}),
    [PM_RESOURCE_VERSION_KEY]: entry.version,
    [PM_RESOURCE_LAST_SAVED_AT_KEY]: entry.savedAt,
    [PM_RESOURCE_SAVE_HISTORY_KEY]: readResourceSaveHistory(metadata).map(serializeHistoryEntry),
  }
  if (entry.contentFingerprint) {
    next[PM_RESOURCE_CONTENT_FINGERPRINT_KEY] = entry.contentFingerprint
  } else {
    delete next[PM_RESOURCE_CONTENT_FINGERPRINT_KEY]
  }
  return next
}

/**
 * Build the next metadata patch after a successful resource-catalog save.
 *
 * New versions are created only when:
 * - there is no version yet (first save), or
 * - `contentFingerprint` differs from the last saved fingerprint, or
 * - `bumpVersion` is explicitly true
 *
 * Unchanged content refreshes `lastSavedAt` on the current version only.
 */
export function buildResourceSaveMetadata(
  metadata: Record<string, unknown> | null | undefined,
  options: {
    resourceCount: number
    /** Stable hash/serialization of the catalog being saved. */
    contentFingerprint: string
    savedAt?: number
    note?: string
    /** Force a new version even when the fingerprint is unchanged. */
    bumpVersion?: boolean
    /** Catalog snapshot for version switch (stored on the history entry). */
    catalog?: readonly PmResourceCatalogSnapshotRow[]
  },
): Record<string, unknown> {
  const base = { ...(metadata ?? {}) }
  const savedAt = options.savedAt ?? Date.now()
  const resourceCount = Math.max(0, Math.floor(options.resourceCount))
  const fingerprint = options.contentFingerprint
  const previousFingerprint = readResourceContentFingerprint(base)
  const hasVersion = readMaxResourceVersion(base) > 0
  // Missing fingerprint on an existing version is legacy data — stamp fingerprint
  // without treating it as a content change (otherwise every Save bumps forever).
  const contentChanged =
    previousFingerprint != null
      ? previousFingerprint !== fingerprint
      : !hasVersion
  const shouldBump =
    options.bumpVersion === true ||
    (options.bumpVersion !== false && contentChanged)
  const catalog =
    options.catalog != null ? normalizeResourceCatalogSnapshot(options.catalog) : undefined

  if (shouldBump) {
    const nextVersion = readMaxResourceVersion(base) + 1
    const entry: PmResourceSaveRecord = {
      version: nextVersion,
      savedAt,
      resourceCount,
      contentFingerprint: fingerprint,
      ...(options.note?.trim() ? { note: options.note.trim() } : {}),
      ...(catalog ? { catalog } : {}),
    }

    const history = [entry, ...readResourceSaveHistory(base)].slice(
      0,
      PM_RESOURCE_SAVE_HISTORY_MAX,
    )

    return {
      ...base,
      [PM_RESOURCE_VERSION_KEY]: nextVersion,
      [PM_RESOURCE_LAST_SAVED_AT_KEY]: savedAt,
      [PM_RESOURCE_SAVE_HISTORY_KEY]: history.map(serializeHistoryEntry),
      [PM_RESOURCE_CONTENT_FINGERPRINT_KEY]: fingerprint,
    }
  }

  const currentVersion = readResourceVersion(base)
  let history = readResourceSaveHistory(base)
  if (currentVersion > 0) {
    const index = history.findIndex((row) => row.version === currentVersion)
    const previous = index >= 0 ? history[index] : undefined
    const updated: PmResourceSaveRecord = {
      version: currentVersion,
      savedAt,
      resourceCount,
      contentFingerprint: fingerprint,
      ...(options.note?.trim()
        ? { note: options.note.trim() }
        : previous?.note
          ? { note: previous.note }
          : {}),
      ...(catalog
        ? { catalog }
        : previous?.catalog
          ? { catalog: previous.catalog }
          : {}),
    }
    if (index >= 0) {
      history = [...history]
      history[index] = updated
    } else {
      history = [updated, ...history].slice(0, PM_RESOURCE_SAVE_HISTORY_MAX)
    }
  }

  return {
    ...base,
    [PM_RESOURCE_LAST_SAVED_AT_KEY]: savedAt,
    [PM_RESOURCE_CONTENT_FINGERPRINT_KEY]: fingerprint,
    ...(currentVersion > 0
      ? { [PM_RESOURCE_SAVE_HISTORY_KEY]: history.map(serializeHistoryEntry) }
      : {}),
  }
}

/**
 * Remove one resource save-history entry. If it was the current version, fall
 * back to the newest remaining history entry (or 0 when history is empty).
 */
export function removeResourceSaveHistoryEntry(
  metadata: Record<string, unknown> | null | undefined,
  version: number,
): Record<string, unknown> {
  const base = { ...(metadata ?? {}) }
  const target = Math.floor(version)
  const history = readResourceSaveHistory(base).filter((row) => row.version !== target)
  const currentVersion = readResourceVersion(base)
  const nextVersion =
    currentVersion === target ? (history[0]?.version ?? 0) : currentVersion
  const nextLastSavedAt =
    currentVersion === target
      ? (history[0]?.savedAt ?? null)
      : readResourceLastSavedAt(base)

  const next: Record<string, unknown> = {
    ...base,
    [PM_RESOURCE_VERSION_KEY]: nextVersion,
    [PM_RESOURCE_SAVE_HISTORY_KEY]: history.map(serializeHistoryEntry),
  }
  if (nextLastSavedAt != null) next[PM_RESOURCE_LAST_SAVED_AT_KEY] = nextLastSavedAt
  else delete next[PM_RESOURCE_LAST_SAVED_AT_KEY]
  if (currentVersion === target) delete next[PM_RESOURCE_CONTENT_FINGERPRINT_KEY]
  return next
}

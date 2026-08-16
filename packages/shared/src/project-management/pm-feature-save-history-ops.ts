import {
  PM_FEATURE_CONTENT_FINGERPRINT_KEY,
  PM_FEATURE_LAST_SAVED_AT_KEY,
  PM_FEATURE_SAVE_HISTORY_KEY,
  PM_FEATURE_SAVE_HISTORY_MAX,
  PM_FEATURE_VERSION_KEY,
  isFeatureSaveRecord,
  normalizeFeatureCatalogSnapshot,
  parseFeatureCatalogSnapshot,
  serializeFeatureHistoryEntry,
  type PmFeatureCatalogSnapshotRow,
  type PmFeatureSaveRecord,
} from './pm-feature-save-history-types.js'

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
    [PM_FEATURE_SAVE_HISTORY_KEY]: readFeatureSaveHistory(metadata).map(serializeFeatureHistoryEntry),
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
      [PM_FEATURE_SAVE_HISTORY_KEY]: history.map(serializeFeatureHistoryEntry),
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
      ? { [PM_FEATURE_SAVE_HISTORY_KEY]: history.map(serializeFeatureHistoryEntry) }
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
    [PM_FEATURE_SAVE_HISTORY_KEY]: history.map(serializeFeatureHistoryEntry),
  }
  if (nextLastSavedAt != null) next[PM_FEATURE_LAST_SAVED_AT_KEY] = nextLastSavedAt
  else delete next[PM_FEATURE_LAST_SAVED_AT_KEY]
  if (currentVersion === target) delete next[PM_FEATURE_CONTENT_FINGERPRINT_KEY]
  return next
}

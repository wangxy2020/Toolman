import {
  PM_RESOURCE_CONTENT_FINGERPRINT_KEY,
  PM_RESOURCE_LAST_SAVED_AT_KEY,
  PM_RESOURCE_SAVE_HISTORY_KEY,
  PM_RESOURCE_SAVE_HISTORY_MAX,
  PM_RESOURCE_VERSION_KEY,
  isResourceSaveRecord,
  normalizeResourceCatalogSnapshot,
  parseResourceCatalogSnapshot,
  serializeResourceHistoryEntry,
  type PmResourceCatalogSnapshotRow,
  type PmResourceSaveRecord,
} from './pm-resource-save-history-types.js'

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
    [PM_RESOURCE_SAVE_HISTORY_KEY]: readResourceSaveHistory(metadata).map(serializeResourceHistoryEntry),
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
 * - `bumpVersion: true`: always create a new version
 * - `bumpVersion: false`: update current version only (first save still creates v1)
 * - omitted: bump when content fingerprint changed (legacy)
 *
 * Unchanged / non-bump saves refresh `lastSavedAt` on the current version.
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
    !hasVersion ||
    (options.bumpVersion == null && contentChanged)
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
      [PM_RESOURCE_SAVE_HISTORY_KEY]: history.map(serializeResourceHistoryEntry),
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
      ? { [PM_RESOURCE_SAVE_HISTORY_KEY]: history.map(serializeResourceHistoryEntry) }
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
    [PM_RESOURCE_SAVE_HISTORY_KEY]: history.map(serializeResourceHistoryEntry),
  }
  if (nextLastSavedAt != null) next[PM_RESOURCE_LAST_SAVED_AT_KEY] = nextLastSavedAt
  else delete next[PM_RESOURCE_LAST_SAVED_AT_KEY]
  if (currentVersion === target) delete next[PM_RESOURCE_CONTENT_FINGERPRINT_KEY]
  return next
}

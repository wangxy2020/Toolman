import {
  PM_COST_CONTENT_FINGERPRINT_KEY,
  PM_COST_LAST_SAVED_AT_KEY,
  PM_COST_SAVE_HISTORY_KEY,
  PM_COST_SAVE_HISTORY_MAX,
  PM_COST_VERSION_KEY,
  isCostSaveRecord,
  normalizeCostCatalogSnapshot,
  parseCostCatalogSnapshot,
  serializeCostHistoryEntry,
  type PmCostCatalogSnapshotRow,
  type PmCostSaveRecord,
} from './pm-cost-save-history-types.js'

export function readCostVersion(metadata: Record<string, unknown> | null | undefined): number {
  const raw = metadata?.[PM_COST_VERSION_KEY]
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return Math.floor(raw)
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
    return Math.max(0, Math.floor(Number(raw)))
  }
  return 0
}

/** Highest version number among current pointer and cost save-history rows. */
export function readMaxCostVersion(metadata: Record<string, unknown> | null | undefined): number {
  let max = readCostVersion(metadata)
  for (const row of readCostSaveHistory(metadata)) {
    if (row.version > max) max = row.version
  }
  return max
}

export function readCostLastSavedAt(
  metadata: Record<string, unknown> | null | undefined,
): number | null {
  const raw = metadata?.[PM_COST_LAST_SAVED_AT_KEY]
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
    const value = Number(raw)
    return value > 0 ? value : null
  }
  return null
}

export function readCostContentFingerprint(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const raw = metadata?.[PM_COST_CONTENT_FINGERPRINT_KEY]
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

export function readCostSaveHistory(
  metadata: Record<string, unknown> | null | undefined,
): PmCostSaveRecord[] {
  const raw = metadata?.[PM_COST_SAVE_HISTORY_KEY]
  if (!Array.isArray(raw)) return []
  return raw.filter(isCostSaveRecord).map((row) => {
    const catalog = parseCostCatalogSnapshot((row as { catalog?: unknown }).catalog)
    const contentFingerprint =
      typeof (row as { contentFingerprint?: unknown }).contentFingerprint === 'string' &&
      (row as { contentFingerprint: string }).contentFingerprint.length > 0
        ? (row as { contentFingerprint: string }).contentFingerprint
        : undefined
    return {
      version: Math.floor(row.version),
      savedAt: row.savedAt,
      costCount: Math.max(0, Math.floor(row.costCount)),
      ...(typeof row.note === 'string' && row.note.trim() ? { note: row.note.trim() } : {}),
      ...(contentFingerprint ? { contentFingerprint } : {}),
      ...(catalog ? { catalog } : {}),
    }
  })
}

/** Catalog snapshot for a history version, if one was stored at save time. */
export function readCostVersionCatalog(
  metadata: Record<string, unknown> | null | undefined,
  version: number,
): PmCostCatalogSnapshotRow[] | null {
  const target = Math.floor(version)
  const entry = readCostSaveHistory(metadata).find((row) => row.version === target)
  return entry?.catalog ?? null
}

/**
 * Point metadata at an existing history version (does not rewrite the live catalog key).
 * Returns null when the version is missing or has no catalog snapshot.
 */
export function buildMetadataForCostVersionSwitch(
  metadata: Record<string, unknown> | null | undefined,
  version: number,
): Record<string, unknown> | null {
  const target = Math.floor(version)
  const entry = readCostSaveHistory(metadata).find((row) => row.version === target)
  if (!entry?.catalog) return null
  const next: Record<string, unknown> = {
    ...(metadata ?? {}),
    [PM_COST_VERSION_KEY]: entry.version,
    [PM_COST_LAST_SAVED_AT_KEY]: entry.savedAt,
    [PM_COST_SAVE_HISTORY_KEY]: readCostSaveHistory(metadata).map(serializeCostHistoryEntry),
  }
  if (entry.contentFingerprint) {
    next[PM_COST_CONTENT_FINGERPRINT_KEY] = entry.contentFingerprint
  } else {
    delete next[PM_COST_CONTENT_FINGERPRINT_KEY]
  }
  return next
}

/**
 * Build the next metadata patch after a successful cost-catalog save.
 *
 * - `bumpVersion: true`: always create a new version
 * - `bumpVersion: false`: update current version only (first save still creates v1)
 * - omitted: bump when content fingerprint changed (legacy)
 *
 * Unchanged / non-bump saves refresh `lastSavedAt` on the current version.
 */
export function buildCostSaveMetadata(
  metadata: Record<string, unknown> | null | undefined,
  options: {
    costCount: number
    /** Stable hash/serialization of the catalog being saved. */
    contentFingerprint: string
    savedAt?: number
    note?: string
    /** Force a new version even when the fingerprint is unchanged. */
    bumpVersion?: boolean
    /** Catalog snapshot for version switch (stored on the history entry). */
    catalog?: readonly PmCostCatalogSnapshotRow[]
  },
): Record<string, unknown> {
  const base = { ...(metadata ?? {}) }
  const savedAt = options.savedAt ?? Date.now()
  const costCount = Math.max(0, Math.floor(options.costCount))
  const fingerprint = options.contentFingerprint
  const previousFingerprint = readCostContentFingerprint(base)
  const hasVersion = readMaxCostVersion(base) > 0
  const contentChanged =
    previousFingerprint != null ? previousFingerprint !== fingerprint : !hasVersion
  const shouldBump =
    options.bumpVersion === true ||
    !hasVersion ||
    (options.bumpVersion == null && contentChanged)
  const catalog =
    options.catalog != null ? normalizeCostCatalogSnapshot(options.catalog) : undefined

  if (shouldBump) {
    const nextVersion = readMaxCostVersion(base) + 1
    const entry: PmCostSaveRecord = {
      version: nextVersion,
      savedAt,
      costCount,
      contentFingerprint: fingerprint,
      ...(options.note?.trim() ? { note: options.note.trim() } : {}),
      ...(catalog ? { catalog } : {}),
    }

    const history = [entry, ...readCostSaveHistory(base)].slice(0, PM_COST_SAVE_HISTORY_MAX)

    return {
      ...base,
      [PM_COST_VERSION_KEY]: nextVersion,
      [PM_COST_LAST_SAVED_AT_KEY]: savedAt,
      [PM_COST_SAVE_HISTORY_KEY]: history.map(serializeCostHistoryEntry),
      [PM_COST_CONTENT_FINGERPRINT_KEY]: fingerprint,
    }
  }

  const currentVersion = readCostVersion(base)
  let history = readCostSaveHistory(base)
  if (currentVersion > 0) {
    const index = history.findIndex((row) => row.version === currentVersion)
    const previous = index >= 0 ? history[index] : undefined
    const updated: PmCostSaveRecord = {
      version: currentVersion,
      savedAt,
      costCount,
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
      history = [updated, ...history].slice(0, PM_COST_SAVE_HISTORY_MAX)
    }
  }

  return {
    ...base,
    [PM_COST_LAST_SAVED_AT_KEY]: savedAt,
    [PM_COST_CONTENT_FINGERPRINT_KEY]: fingerprint,
    ...(currentVersion > 0
      ? { [PM_COST_SAVE_HISTORY_KEY]: history.map(serializeCostHistoryEntry) }
      : {}),
  }
}

/**
 * Remove one cost save-history entry. If it was the current version, fall
 * back to the newest remaining history entry (or 0 when history is empty).
 */
export function removeCostSaveHistoryEntry(
  metadata: Record<string, unknown> | null | undefined,
  version: number,
): Record<string, unknown> {
  const base = { ...(metadata ?? {}) }
  const target = Math.floor(version)
  const history = readCostSaveHistory(base).filter((row) => row.version !== target)
  const currentVersion = readCostVersion(base)
  const nextVersion = currentVersion === target ? (history[0]?.version ?? 0) : currentVersion
  const nextLastSavedAt =
    currentVersion === target ? (history[0]?.savedAt ?? null) : readCostLastSavedAt(base)

  const next: Record<string, unknown> = {
    ...base,
    [PM_COST_VERSION_KEY]: nextVersion,
    [PM_COST_SAVE_HISTORY_KEY]: history.map(serializeCostHistoryEntry),
  }
  if (nextLastSavedAt != null) next[PM_COST_LAST_SAVED_AT_KEY] = nextLastSavedAt
  else delete next[PM_COST_LAST_SAVED_AT_KEY]
  if (currentVersion === target) delete next[PM_COST_CONTENT_FINGERPRINT_KEY]
  return next
}

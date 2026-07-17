/** Keys stored on `PmProject.metadata` for resource-catalog save versioning. */
export const PM_RESOURCE_VERSION_KEY = 'resourceVersion'
export const PM_RESOURCE_LAST_SAVED_AT_KEY = 'resourceLastSavedAt'
export const PM_RESOURCE_SAVE_HISTORY_KEY = 'resourceSaveHistory'
/** Fingerprint of last saved catalog; used to avoid version bumps on no-op saves. */
export const PM_RESOURCE_CONTENT_FINGERPRINT_KEY = 'resourceContentFingerprint'

export const PM_RESOURCE_SAVE_HISTORY_MAX = 10

export type PmResourceSaveRecord = {
  version: number
  savedAt: number
  resourceCount: number
  note?: string
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
  return raw.filter(isResourceSaveRecord).map((row) => ({
    version: Math.floor(row.version),
    savedAt: row.savedAt,
    resourceCount: Math.max(0, Math.floor(row.resourceCount)),
    ...(typeof row.note === 'string' && row.note.trim() ? { note: row.note.trim() } : {}),
  }))
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

  if (shouldBump) {
    const nextVersion = readMaxResourceVersion(base) + 1
    const entry: PmResourceSaveRecord = {
      version: nextVersion,
      savedAt,
      resourceCount,
    }
    if (options.note?.trim()) entry.note = options.note.trim()

    const history = [entry, ...readResourceSaveHistory(base)].slice(
      0,
      PM_RESOURCE_SAVE_HISTORY_MAX,
    )

    return {
      ...base,
      [PM_RESOURCE_VERSION_KEY]: nextVersion,
      [PM_RESOURCE_LAST_SAVED_AT_KEY]: savedAt,
      [PM_RESOURCE_SAVE_HISTORY_KEY]: history,
      [PM_RESOURCE_CONTENT_FINGERPRINT_KEY]: fingerprint,
    }
  }

  const currentVersion = readResourceVersion(base)
  let history = readResourceSaveHistory(base)
  if (currentVersion > 0) {
    const index = history.findIndex((row) => row.version === currentVersion)
    const updated: PmResourceSaveRecord = {
      version: currentVersion,
      savedAt,
      resourceCount,
      ...(options.note?.trim()
        ? { note: options.note.trim() }
        : index >= 0 && history[index]?.note
          ? { note: history[index]!.note }
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
    ...(currentVersion > 0 ? { [PM_RESOURCE_SAVE_HISTORY_KEY]: history } : {}),
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
    [PM_RESOURCE_SAVE_HISTORY_KEY]: history,
  }
  if (nextLastSavedAt != null) next[PM_RESOURCE_LAST_SAVED_AT_KEY] = nextLastSavedAt
  else delete next[PM_RESOURCE_LAST_SAVED_AT_KEY]
  if (currentVersion === target) delete next[PM_RESOURCE_CONTENT_FINGERPRINT_KEY]
  return next
}

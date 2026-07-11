/** Keys stored on `PmProject.metadata` for schedule save versioning. */
export const PM_SCHEDULE_VERSION_KEY = 'scheduleVersion'
export const PM_LAST_SAVED_AT_KEY = 'lastSavedAt'
export const PM_SAVE_HISTORY_KEY = 'saveHistory'
/** Set by agent plan/schedule apply; cleared on next Gantt save that bumps version. */
export const PM_PENDING_AGENT_REVISION_KEY = 'pendingAgentScheduleRevision'

export const PM_SAVE_HISTORY_MAX = 10

export type PmScheduleSaveRecord = {
  version: number
  savedAt: number
  workItemCount: number
  note?: string
}

function isSaveRecord(value: unknown): value is PmScheduleSaveRecord {
  if (value == null || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.version === 'number' &&
    Number.isFinite(row.version) &&
    typeof row.savedAt === 'number' &&
    Number.isFinite(row.savedAt) &&
    typeof row.workItemCount === 'number' &&
    Number.isFinite(row.workItemCount)
  )
}

export function readScheduleVersion(metadata: Record<string, unknown> | null | undefined): number {
  const raw = metadata?.[PM_SCHEDULE_VERSION_KEY]
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return Math.floor(raw)
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
    return Math.max(0, Math.floor(Number(raw)))
  }
  return 0
}

export function readLastSavedAt(metadata: Record<string, unknown> | null | undefined): number | null {
  const raw = metadata?.[PM_LAST_SAVED_AT_KEY]
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
    const value = Number(raw)
    return value > 0 ? value : null
  }
  return null
}

export function readSaveHistory(
  metadata: Record<string, unknown> | null | undefined,
): PmScheduleSaveRecord[] {
  const raw = metadata?.[PM_SAVE_HISTORY_KEY]
  if (!Array.isArray(raw)) return []
  return raw.filter(isSaveRecord).map((row) => ({
    version: Math.floor(row.version),
    savedAt: row.savedAt,
    workItemCount: Math.max(0, Math.floor(row.workItemCount)),
    ...(typeof row.note === 'string' && row.note.trim() ? { note: row.note.trim() } : {}),
  }))
}

export function readPendingAgentScheduleRevision(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.[PM_PENDING_AGENT_REVISION_KEY] === true
}

/** Mark that an agent apply landed; the next intentional Save may create a new version. */
export function markPendingAgentScheduleRevision(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    [PM_PENDING_AGENT_REVISION_KEY]: true,
  }
}

/**
 * Build the next metadata patch after a successful schedule save.
 *
 * - `bumpVersion: true` (default when pending agent revision): new version + history entry
 * - otherwise: keep current version, refresh `lastSavedAt` / current history row
 *
 * Clears {@link PM_PENDING_AGENT_REVISION_KEY}. Caps history at {@link PM_SAVE_HISTORY_MAX}.
 */
export function buildScheduleSaveMetadata(
  metadata: Record<string, unknown> | null | undefined,
  options: {
    workItemCount: number
    savedAt?: number
    note?: string
    /** Override auto detection from pending agent flag. */
    bumpVersion?: boolean
  },
): Record<string, unknown> {
  const base = { ...(metadata ?? {}) }
  const savedAt = options.savedAt ?? Date.now()
  const workItemCount = Math.max(0, Math.floor(options.workItemCount))
  const shouldBump =
    options.bumpVersion ?? readPendingAgentScheduleRevision(base)

  // Explicit false so shallow-merge updateProject clears a previous true flag.
  base[PM_PENDING_AGENT_REVISION_KEY] = false

  if (shouldBump) {
    const nextVersion = readScheduleVersion(base) + 1
    const entry: PmScheduleSaveRecord = {
      version: nextVersion,
      savedAt,
      workItemCount,
    }
    if (options.note?.trim()) entry.note = options.note.trim()

    const history = [entry, ...readSaveHistory(base)].slice(0, PM_SAVE_HISTORY_MAX)

    return {
      ...base,
      [PM_SCHEDULE_VERSION_KEY]: nextVersion,
      [PM_LAST_SAVED_AT_KEY]: savedAt,
      [PM_SAVE_HISTORY_KEY]: history,
    }
  }

  const currentVersion = readScheduleVersion(base)
  let history = readSaveHistory(base)
  if (currentVersion > 0) {
    const index = history.findIndex((row) => row.version === currentVersion)
    const updated: PmScheduleSaveRecord = {
      version: currentVersion,
      savedAt,
      workItemCount,
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
      history = [updated, ...history].slice(0, PM_SAVE_HISTORY_MAX)
    }
  }

  return {
    ...base,
    [PM_LAST_SAVED_AT_KEY]: savedAt,
    ...(currentVersion > 0 ? { [PM_SAVE_HISTORY_KEY]: history } : {}),
  }
}

/** Keys stored on `PmProject.metadata` for schedule save versioning. */
export const PM_SCHEDULE_VERSION_KEY = 'scheduleVersion'
export const PM_LAST_SAVED_AT_KEY = 'lastSavedAt'
export const PM_SAVE_HISTORY_KEY = 'saveHistory'

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

/**
 * Build the next metadata patch after a successful schedule save.
 * Preserves unrelated metadata keys; caps history at {@link PM_SAVE_HISTORY_MAX}.
 */
export function buildScheduleSaveMetadata(
  metadata: Record<string, unknown> | null | undefined,
  options: {
    workItemCount: number
    savedAt?: number
    note?: string
  },
): Record<string, unknown> {
  const base = { ...(metadata ?? {}) }
  const nextVersion = readScheduleVersion(base) + 1
  const savedAt = options.savedAt ?? Date.now()
  const entry: PmScheduleSaveRecord = {
    version: nextVersion,
    savedAt,
    workItemCount: Math.max(0, Math.floor(options.workItemCount)),
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

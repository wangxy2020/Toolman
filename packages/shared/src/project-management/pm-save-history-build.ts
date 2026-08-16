import {
  PM_LAST_SAVED_AT_KEY,
  PM_PENDING_AGENT_REVISION_KEY,
  PM_SAVE_HISTORY_KEY,
  PM_SAVE_HISTORY_MAX,
  PM_SCHEDULE_VERSION_KEY,
  readMaxScheduleVersion,
  readPendingAgentScheduleRevision,
  readSaveHistory,
  readScheduleVersion,
  type PmScheduleSaveRecord,
} from './pm-save-history-keys.js'

export function buildScheduleSaveMetadata(
  metadata: Record<string, unknown> | null | undefined,
  options: {
    workItemCount: number
    /** Inclusive calendar days for the project schedule envelope. */
    totalDurationDays?: number
    savedAt?: number
    note?: string
    /** Override auto detection from pending agent flag / first-save rule. */
    bumpVersion?: boolean
  },
): Record<string, unknown> {
  const base = { ...(metadata ?? {}) }
  const savedAt = options.savedAt ?? Date.now()
  const workItemCount = Math.max(0, Math.floor(options.workItemCount))
  const totalDurationDays =
    options.totalDurationDays != null && Number.isFinite(options.totalDurationDays)
      ? Math.max(0, Math.floor(options.totalDurationDays))
      : undefined
  const maxVersion = readMaxScheduleVersion(base)
  // First save always creates v1. Explicit true always bumps. Explicit false never
  // bumps after v1. Omitted keeps legacy agent-pending auto-bump for callers/tests.
  const shouldBump =
    options.bumpVersion === true ||
    maxVersion === 0 ||
    (options.bumpVersion == null && readPendingAgentScheduleRevision(base))

  // Explicit false so shallow-merge updateProject clears a previous true flag.
  base[PM_PENDING_AGENT_REVISION_KEY] = false

  if (shouldBump) {
    // After restoring an older version, current+1 may collide with a newer
    // history entry (e.g. on v2 while v3 still exists). Always allocate past max.
    const nextVersion = readMaxScheduleVersion(base) + 1
    const entry: PmScheduleSaveRecord = {
      version: nextVersion,
      savedAt,
      workItemCount,
      ...(totalDurationDays != null ? { totalDurationDays } : {}),
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
      ...(totalDurationDays != null
        ? { totalDurationDays }
        : index >= 0 && history[index]?.totalDurationDays != null
          ? { totalDurationDays: history[index]!.totalDurationDays }
          : {}),
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

/**
 * Parse schedule version from auto-named version baselines (`版本 2` / `Version 2`).
 * Returns null when the name is a manual capture baseline.
 * @deprecated Prefer {@link parseVersionPlanSnapshotName} — legacy display names only.
 */

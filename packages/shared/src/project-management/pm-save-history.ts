/** Keys stored on `PmProject.metadata` for schedule save versioning. */
export const PM_SCHEDULE_VERSION_KEY = 'scheduleVersion'
export const PM_LAST_SAVED_AT_KEY = 'lastSavedAt'
export const PM_SAVE_HISTORY_KEY = 'saveHistory'
/** Set by agent plan/schedule apply; cleared on next Gantt save that bumps version. */
export const PM_PENDING_AGENT_REVISION_KEY = 'pendingAgentScheduleRevision'
/** Durable fingerprints of agent plans already applied to this project (survives restart). */
export const PM_APPLIED_PLAN_RECEIPTS_KEY = 'appliedPlanReceipts'

export const PM_SAVE_HISTORY_MAX = 10
export const PM_APPLIED_PLAN_RECEIPTS_MAX = 20

export type PmScheduleSaveRecord = {
  version: number
  savedAt: number
  workItemCount: number
  /** Inclusive calendar-day span of the live schedule envelope at save time. */
  totalDurationDays?: number
  note?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

function startOfLocalDayMs(ms: number): number {
  const date = new Date(ms)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * Inclusive calendar-day span across work-item start/due dates.
 * Returns null when the schedule has no dated envelope.
 */
export function computeScheduleTotalDurationDays(
  items: ReadonlyArray<{ startDate?: number | null; dueDate?: number | null }>,
): number | null {
  let earliest: number | null = null
  let latest: number | null = null
  for (const item of items) {
    if (typeof item.startDate === 'number' && Number.isFinite(item.startDate)) {
      earliest = earliest == null ? item.startDate : Math.min(earliest, item.startDate)
    }
    if (typeof item.dueDate === 'number' && Number.isFinite(item.dueDate)) {
      latest = latest == null ? item.dueDate : Math.max(latest, item.dueDate)
    }
  }
  if (earliest == null && latest == null) return null
  if (earliest == null) earliest = latest
  if (latest == null) latest = earliest
  const start = startOfLocalDayMs(earliest!)
  const finish = startOfLocalDayMs(latest!)
  return Math.max(1, Math.round((finish - start) / DAY_MS) + 1)
}

export type PmAppliedPlanReceipt = {
  fingerprint: string
  appliedAt: number
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

/** Highest version number among current pointer and save-history rows. */
export function readMaxScheduleVersion(
  metadata: Record<string, unknown> | null | undefined,
): number {
  let max = readScheduleVersion(metadata)
  for (const row of readSaveHistory(metadata)) {
    if (row.version > max) max = row.version
  }
  return max
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
    ...(typeof row.totalDurationDays === 'number' &&
    Number.isFinite(row.totalDurationDays) &&
    row.totalDurationDays >= 0
      ? { totalDurationDays: Math.floor(row.totalDurationDays) }
      : {}),
    ...(typeof row.note === 'string' && row.note.trim() ? { note: row.note.trim() } : {}),
  }))
}

export function readPendingAgentScheduleRevision(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  const raw = metadata?.[PM_PENDING_AGENT_REVISION_KEY]
  if (raw === true || raw === 1) return true
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    return normalized === 'true' || normalized === '1' || normalized === 'yes'
  }
  return false
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

function isAppliedPlanReceipt(value: unknown): value is PmAppliedPlanReceipt {
  if (value == null || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.fingerprint === 'string' &&
    row.fingerprint.length > 0 &&
    typeof row.appliedAt === 'number' &&
    Number.isFinite(row.appliedAt)
  )
}

export function readAppliedPlanReceipts(
  metadata: Record<string, unknown> | null | undefined,
): PmAppliedPlanReceipt[] {
  const raw = metadata?.[PM_APPLIED_PLAN_RECEIPTS_KEY]
  if (!Array.isArray(raw)) return []
  return raw.filter(isAppliedPlanReceipt).map((row) => ({
    fingerprint: row.fingerprint,
    appliedAt: row.appliedAt,
  }))
}

/** True when this fingerprint was already applied to the project (survives restart). */
export function hasAppliedPlanFingerprint(
  metadata: Record<string, unknown> | null | undefined,
  fingerprint: string,
): boolean {
  if (!fingerprint) return false
  return readAppliedPlanReceipts(metadata).some((row) => row.fingerprint === fingerprint)
}

/** Prepend a receipt; dedupe by fingerprint; cap list length. */
export function upsertAppliedPlanReceipt(
  metadata: Record<string, unknown> | null | undefined,
  fingerprint: string,
  appliedAt: number = Date.now(),
): Record<string, unknown> {
  const base = { ...(metadata ?? {}) }
  const trimmed = fingerprint.trim()
  if (!trimmed) return base
  const next: PmAppliedPlanReceipt[] = [
    { fingerprint: trimmed, appliedAt },
    ...readAppliedPlanReceipts(base).filter((row) => row.fingerprint !== trimmed),
  ].slice(0, PM_APPLIED_PLAN_RECEIPTS_MAX)
  return {
    ...base,
    [PM_APPLIED_PLAN_RECEIPTS_KEY]: next,
  }
}

/**
 * Decide apply-bar action for the current assistant plan fingerprint.
 * - goToGantt: already applied (do not clearExisting)
 * - reapply: new plan on a project that already has live data / prior applies
 * - confirm: first apply onto empty / fresh target
 */
export type PmPlanApplyAction = 'goToGantt' | 'confirm' | 'reapply'

export function resolvePmPlanApplyAction(options: {
  fingerprint: string
  fingerprintAlreadyApplied: boolean
  hasLiveWorkItems: boolean
  hasAnyPriorReceipt: boolean
}): PmPlanApplyAction {
  if (options.fingerprintAlreadyApplied) return 'goToGantt'
  if (options.hasLiveWorkItems || options.hasAnyPriorReceipt) return 'reapply'
  return 'confirm'
}

/**
 * Build the next metadata patch after a successful schedule save.
 *
 * - `bumpVersion: true`: always create a new version + history entry
 * - `bumpVersion: false`: update current version only (first save with no version
 *   still creates v1 so there is a version pointer to update)
 * - omitted: legacy — bump on first save or pending agent revision
 *
 * Clears {@link PM_PENDING_AGENT_REVISION_KEY}. Caps history at {@link PM_SAVE_HISTORY_MAX}.
 */
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
export function parseVersionFromBaselineName(name: string): number | null {
  const trimmed = name.trim()
  const match = /^(?:版本|version)\s*(\d+)\s*$/i.exec(trimmed)
  if (!match) return null
  const version = Number.parseInt(match[1]!, 10)
  return Number.isFinite(version) && version > 0 ? version : null
}

export function isVersionBaselineName(name: string): boolean {
  return parseVersionFromBaselineName(name) != null
}

/**
 * Reserved storage name for a version's plan snapshot (version switch data).
 * Not shown in the baseline-compare list — baselines are separate and many-per-version.
 */
export const PM_VERSION_PLAN_SNAPSHOT_PREFIX = '__pm_version_plan__:'

export function versionPlanSnapshotName(version: number): string {
  return `${PM_VERSION_PLAN_SNAPSHOT_PREFIX}${Math.floor(version)}`
}

/** Parse version from a version-plan snapshot name (new prefix or legacy `版本 N`). */
export function parseVersionPlanSnapshotName(name: string): number | null {
  const trimmed = name.trim()
  if (trimmed.startsWith(PM_VERSION_PLAN_SNAPSHOT_PREFIX)) {
    const raw = trimmed.slice(PM_VERSION_PLAN_SNAPSHOT_PREFIX.length)
    const version = Number.parseInt(raw, 10)
    return Number.isFinite(version) && version > 0 ? version : null
  }
  return parseVersionFromBaselineName(trimmed)
}

export function isVersionPlanSnapshotName(name: string): boolean {
  return parseVersionPlanSnapshotName(name) != null
}

/** User-captured baselines only (excludes version plan snapshots used for version switch). */
export function listUserBaselines<T extends { name: string }>(baselines: readonly T[]): T[] {
  return baselines.filter((entry) => !isVersionPlanSnapshotName(entry.name))
}

export function findVersionPlanSnapshot<T extends { id: string; name: string }>(
  baselines: readonly T[],
  version: number,
): T | null {
  const target = Math.floor(version)
  const preferred = versionPlanSnapshotName(target)
  const exact = baselines.find((entry) => entry.name === preferred)
  if (exact) return exact
  return (
    baselines.find((entry) => parseVersionPlanSnapshotName(entry.name) === target) ?? null
  )
}

/**
 * Keep one version-plan snapshot per schedule version (newest first).
 * User baselines are never deduped — a version may have many baselines.
 */
export function dedupeVersionBaselines<T extends { id: string; name: string }>(
  baselines: readonly T[],
): T[] {
  const seenVersions = new Set<number>()
  const result: T[] = []
  for (const baseline of baselines) {
    const version = parseVersionPlanSnapshotName(baseline.name)
    if (version != null) {
      if (seenVersions.has(version)) continue
      seenVersions.add(version)
    }
    result.push(baseline)
  }
  return result
}

/** Ids of older duplicate version-plan snapshots to remove (keeps newest per version). */
export function findDuplicateVersionBaselineIds(
  baselines: ReadonlyArray<{ id: string; name: string }>,
): string[] {
  const seenVersions = new Set<number>()
  const duplicateIds: string[] = []
  for (const baseline of baselines) {
    const version = parseVersionPlanSnapshotName(baseline.name)
    if (version == null) continue
    if (seenVersions.has(version)) duplicateIds.push(baseline.id)
    else seenVersions.add(version)
  }
  return duplicateIds
}

type BaselineCompareItem = {
  workItemId: string
  title: string
  startDate?: number | null
  dueDate?: number | null
  progressPercent?: number | null
}

type WorkItemCompareItem = {
  id: string
  title: string
  startDate?: number | null
  dueDate?: number | null
  progressPercent?: number | null
}

/**
 * After agent clearExisting, most snapshot UUIDs are gone — rebuild the tree
 * instead of no-op patching by id.
 */
export function shouldStructurallyRestoreBaseline(
  missingCount: number,
  snapshotCount: number,
): boolean {
  return snapshotCount > 0 && missingCount >= Math.ceil(snapshotCount * 0.5)
}

/** Diff a baseline snapshot against current work items (title / dates / progress). */
export function countBaselineSnapshotChanges(
  snapshotItems: readonly BaselineCompareItem[],
  currentItems: readonly WorkItemCompareItem[],
): { changed: number; unchanged: number; missing: number } {
  const byId = new Map(currentItems.map((item) => [item.id, item]))
  let changed = 0
  let unchanged = 0
  let missing = 0
  for (const entry of snapshotItems) {
    const current = byId.get(entry.workItemId)
    if (!current) {
      missing += 1
      continue
    }
    const sameTitle = current.title === entry.title
    const sameStart = (current.startDate ?? null) === (entry.startDate ?? null)
    const sameDue = (current.dueDate ?? null) === (entry.dueDate ?? null)
    const sameProgress =
      (current.progressPercent ?? 0) === (entry.progressPercent ?? 0)
    if (sameTitle && sameStart && sameDue && sameProgress) unchanged += 1
    else changed += 1
  }
  return { changed, unchanged, missing }
}

/** True when snapshot exists and matches every current work item field it covers. */
export function isBaselineSnapshotIdenticalToItems(
  snapshotItems: readonly BaselineCompareItem[],
  currentItems: readonly WorkItemCompareItem[],
): boolean {
  if (snapshotItems.length === 0) return false
  const { changed, missing } = countBaselineSnapshotChanges(snapshotItems, currentItems)
  return changed === 0 && missing === 0
}

/**
 * Remove one save-history entry. If it was the current version, fall back to the
 * newest remaining history entry (or 0 when history is empty).
 */
export function removeSaveHistoryEntry(
  metadata: Record<string, unknown> | null | undefined,
  version: number,
): Record<string, unknown> {
  const base = { ...(metadata ?? {}) }
  const target = Math.floor(version)
  const history = readSaveHistory(base).filter((row) => row.version !== target)
  const currentVersion = readScheduleVersion(base)
  const nextVersion =
    currentVersion === target ? (history[0]?.version ?? 0) : currentVersion
  const nextLastSavedAt =
    currentVersion === target
      ? (history[0]?.savedAt ?? null)
      : readLastSavedAt(base)

  const next: Record<string, unknown> = {
    ...base,
    [PM_SCHEDULE_VERSION_KEY]: nextVersion,
    [PM_SAVE_HISTORY_KEY]: history,
  }
  if (nextLastSavedAt != null) next[PM_LAST_SAVED_AT_KEY] = nextLastSavedAt
  else delete next[PM_LAST_SAVED_AT_KEY]
  return next
}

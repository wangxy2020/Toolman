/** Keys stored on `PmProject.metadata` for schedule save versioning. */
export const PM_SCHEDULE_VERSION_KEY = 'scheduleVersion'
export const PM_LAST_SAVED_AT_KEY = 'lastSavedAt'
export const PM_SAVE_HISTORY_KEY = 'saveHistory'
/** Set by agent plan/schedule apply; cleared on next Gantt save that bumps version. */
export const PM_PENDING_AGENT_REVISION_KEY = 'pendingAgentScheduleRevision'
/** Durable fingerprints of agent plans already applied to this project (survives restart). */
export const PM_APPLIED_PLAN_RECEIPTS_KEY = 'appliedPlanReceipts'
/** Durable fingerprints of agent resource plans already applied (survives restart). */
export const PM_APPLIED_RESOURCE_PLAN_RECEIPTS_KEY = 'appliedResourcePlanReceipts'
/** Durable fingerprints of agent cost plans already applied (survives restart). */
export const PM_APPLIED_COST_PLAN_RECEIPTS_KEY = 'appliedCostPlanReceipts'

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

function readAppliedReceiptsAt(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): PmAppliedPlanReceipt[] {
  const raw = metadata?.[key]
  if (!Array.isArray(raw)) return []
  return raw.filter(isAppliedPlanReceipt).map((row) => ({
    fingerprint: row.fingerprint,
    appliedAt: row.appliedAt,
  }))
}

/** Prepend a receipt; dedupe by fingerprint; cap list length. */
function upsertAppliedReceiptAt(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
  fingerprint: string,
  appliedAt: number,
): Record<string, unknown> {
  const base = { ...(metadata ?? {}) }
  const trimmed = fingerprint.trim()
  if (!trimmed) return base
  const next: PmAppliedPlanReceipt[] = [
    { fingerprint: trimmed, appliedAt },
    ...readAppliedReceiptsAt(base, key).filter((row) => row.fingerprint !== trimmed),
  ].slice(0, PM_APPLIED_PLAN_RECEIPTS_MAX)
  return {
    ...base,
    [key]: next,
  }
}

export function readAppliedPlanReceipts(
  metadata: Record<string, unknown> | null | undefined,
): PmAppliedPlanReceipt[] {
  return readAppliedReceiptsAt(metadata, PM_APPLIED_PLAN_RECEIPTS_KEY)
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
  return upsertAppliedReceiptAt(metadata, PM_APPLIED_PLAN_RECEIPTS_KEY, fingerprint, appliedAt)
}

/** True when this resource-plan fingerprint was already applied (survives restart). */
export function hasAppliedResourcePlanFingerprint(
  metadata: Record<string, unknown> | null | undefined,
  fingerprint: string,
): boolean {
  if (!fingerprint) return false
  return readAppliedReceiptsAt(metadata, PM_APPLIED_RESOURCE_PLAN_RECEIPTS_KEY).some(
    (row) => row.fingerprint === fingerprint,
  )
}

export function upsertAppliedResourcePlanReceipt(
  metadata: Record<string, unknown> | null | undefined,
  fingerprint: string,
  appliedAt: number = Date.now(),
): Record<string, unknown> {
  return upsertAppliedReceiptAt(
    metadata,
    PM_APPLIED_RESOURCE_PLAN_RECEIPTS_KEY,
    fingerprint,
    appliedAt,
  )
}

/** True when this cost-plan fingerprint was already applied (survives restart). */
export function hasAppliedCostPlanFingerprint(
  metadata: Record<string, unknown> | null | undefined,
  fingerprint: string,
): boolean {
  if (!fingerprint) return false
  return readAppliedReceiptsAt(metadata, PM_APPLIED_COST_PLAN_RECEIPTS_KEY).some(
    (row) => row.fingerprint === fingerprint,
  )
}

export function upsertAppliedCostPlanReceipt(
  metadata: Record<string, unknown> | null | undefined,
  fingerprint: string,
  appliedAt: number = Date.now(),
): Record<string, unknown> {
  return upsertAppliedReceiptAt(
    metadata,
    PM_APPLIED_COST_PLAN_RECEIPTS_KEY,
    fingerprint,
    appliedAt,
  )
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

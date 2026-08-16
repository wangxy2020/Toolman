import {
  PM_LAST_SAVED_AT_KEY,
  PM_SAVE_HISTORY_KEY,
  PM_SCHEDULE_VERSION_KEY,
  readLastSavedAt,
  readSaveHistory,
  readScheduleVersion,
} from './pm-save-history-keys.js'

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

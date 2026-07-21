import {
  countBaselineSnapshotChanges,
  PM_LAST_SAVED_AT_KEY,
  PM_PENDING_AGENT_REVISION_KEY,
  PM_SCHEDULE_VERSION_KEY,
  parseVersionPlanSnapshotName,
  versionPlanSnapshotName,
  PmBaselineCreateInputSchema,
  PmBaselineDeleteInputSchema,
  PmBaselineGetInputSchema,
  PmBaselineListInputSchema,
  PmBaselineRestoreInputSchema,
  PmBaselineUpdateInputSchema,
  readLastSavedAt,
  readSaveHistory,
  shouldStructurallyRestoreBaseline,
  type PmScheduleBaselineItem,
  type PmScheduleBaselineSnapshot,
} from '@toolman/shared'
import {
  PmScheduleBaselineRepository,
  PmWorkItemRelationRepository,
  PmWorkItemRepository,
} from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'
import { clearPmProjectPlanData } from './pm-plan-apply.service'
import { getPmProject, updatePmProject } from './pm-project.service'
import { createPmWorkItem, updatePmWorkItem } from './pm-work-item.service'

function getBaselineRepo(): PmScheduleBaselineRepository {
  return new PmScheduleBaselineRepository(getDatabase())
}

function getWorkItemRepo(): PmWorkItemRepository {
  return new PmWorkItemRepository(getDatabase())
}

function getRelationRepo(): PmWorkItemRelationRepository {
  return new PmWorkItemRelationRepository(getDatabase())
}

export function listPmBaselines(input: unknown) {
  const data = PmBaselineListInputSchema.parse(input)
  reviveMissingVersionPlanSnapshots(data.projectId, data.workspaceId)
  const baselines = getBaselineRepo().listByProject(data.projectId, data.workspaceId)
  return { baselines }
}

/**
 * If save-history still lists a version but its plan snapshot was soft-deleted
 * (e.g. mistaken “delete baseline”), revive the newest matching row so version
 * switch keeps working. User baselines are never revived here.
 */
function reviveMissingVersionPlanSnapshots(projectId: string, workspaceId: string): void {
  let historyVersions: number[] = []
  try {
    const project = getPmProject({ id: projectId })
    historyVersions = readSaveHistory(project.metadata).map((row) => row.version)
  } catch {
    return
  }
  if (historyVersions.length === 0) return

  const repo = getBaselineRepo()
  const live = repo.listByProject(projectId, workspaceId)
  const liveVersions = new Set<number>()
  for (const entry of live) {
    const version = parseVersionPlanSnapshotName(entry.name)
    if (version != null) liveVersions.add(version)
  }

  for (const version of new Set(historyVersions)) {
    if (liveVersions.has(version)) continue
    const soft = repo.findSoftDeletedVersionPlan(projectId, workspaceId, version)
    if (!soft) continue
    repo.undelete(soft.id, versionPlanSnapshotName(version))
  }
}

export function getPmBaseline(input: unknown) {
  const data = PmBaselineGetInputSchema.parse(input)
  const baseline = getBaselineRepo().getById(data.id)
  if (!baseline) {
    throw new Error('基线不存在')
  }
  return baseline
}

function startOfLocalDayMs(ms: number): number {
  const date = new Date(ms)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function parseAsOfDateInput(value: string | undefined): number | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const ms = new Date(
    Number.parseInt(match[1]!, 10),
    Number.parseInt(match[2]!, 10) - 1,
    Number.parseInt(match[3]!, 10),
  ).getTime()
  return Number.isFinite(ms) ? startOfLocalDayMs(ms) : null
}

function formatAsOfDateLabel(ms: number): string {
  const date = new Date(ms)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function captureScheduleSnapshot(
  workspaceId: string,
  projectId: string,
  asOfDate?: number | null,
): PmScheduleBaselineSnapshot {
  const items = getWorkItemRepo().list({
    workspaceId,
    projectId,
    limit: 1000,
  })
  const relations = getRelationRepo().listByProject(projectId, workspaceId)
  const capturedAt = Date.now()
  return {
    capturedAt,
    ...(asOfDate != null ? { asOfDate } : {}),
    workItems: items.map((item) => ({
      workItemId: item.id,
      title: item.title,
      ...(item.startDate != null ? { startDate: item.startDate } : {}),
      ...(item.dueDate != null ? { dueDate: item.dueDate } : {}),
      progressPercent:
        typeof item.progressPercent === 'number' && Number.isFinite(item.progressPercent)
          ? Math.min(100, Math.max(0, Math.floor(item.progressPercent)))
          : 0,
      ...(item.parentId ? { parentWorkItemId: item.parentId } : {}),
      type: item.type,
      sortOrder: item.sortOrder,
    })),
    relations: relations.map((relation) => ({
      fromWorkItemId: relation.fromWorkItemId,
      toWorkItemId: relation.toWorkItemId,
      type: relation.type,
      lagDays: relation.lagDays,
    })),
  }
}

function plannedProgressAtDateMs(
  startMs: number | null | undefined,
  finishMs: number | null | undefined,
  statusDateMs: number,
): number {
  if (startMs == null || finishMs == null) return 0
  const start = startOfLocalDayMs(startMs)
  const finish = startOfLocalDayMs(finishMs)
  const status = startOfLocalDayMs(statusDateMs)
  if (status <= start) return 0
  if (status >= finish) return 100
  const span = Math.max(1, finish - start)
  return Math.min(100, Math.max(0, Math.round(((status - start) / span) * 100)))
}

const SHOULD_PERCENT_META_KEY = 'shouldPercentComplete'

/** Write 应完成百分比 on live tasks from the baseline as-of date. */
function applyShouldPercentFromAsOfDate(
  workspaceId: string,
  projectId: string,
  asOfDate: number,
): void {
  const items = getWorkItemRepo().list({
    workspaceId,
    projectId,
    domain: 'progress_management',
    limit: 1000,
  })
  for (const item of items) {
    const should = plannedProgressAtDateMs(item.startDate, item.dueDate, asOfDate)
    const prevMeta =
      item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
        ? (item.metadata as Record<string, unknown>)
        : {}
    if (prevMeta[SHOULD_PERCENT_META_KEY] === should) continue
    updatePmWorkItem({
      id: item.id,
      metadata: { ...prevMeta, [SHOULD_PERCENT_META_KEY]: should },
    })
  }
}

export function createPmBaseline(input: unknown) {
  const data = PmBaselineCreateInputSchema.parse(input)
  // Prefer schema field; fall back to raw payload if an older shared build stripped asOfDate.
  const rawAsOf =
    data.asOfDate ??
    (input && typeof input === 'object' && typeof (input as { asOfDate?: unknown }).asOfDate === 'string'
      ? (input as { asOfDate: string }).asOfDate
      : undefined)
  const asOfDate = parseAsOfDateInput(rawAsOf) ?? startOfLocalDayMs(Date.now())
  const name =
    data.name?.trim() ||
    `基线 ${formatAsOfDateLabel(asOfDate)}`
  const snapshot = captureScheduleSnapshot(data.workspaceId, data.projectId, asOfDate)

  // Version plan snapshots are unique per schedule version (upsert).
  // User baselines are independent — many baselines may exist for one version.
  const version = parseVersionPlanSnapshotName(name)
  if (version != null) {
    const repo = getBaselineRepo()
    const sameVersion = repo
      .listByProject(data.projectId, data.workspaceId)
      .filter((entry) => parseVersionPlanSnapshotName(entry.name) === version)
    const preferredName = versionPlanSnapshotName(version)
    const keep =
      sameVersion.find((entry) => entry.name === preferredName) ?? sameVersion[0]
    const duplicates = sameVersion.filter((entry) => entry.id !== keep?.id)
    for (const duplicate of duplicates) {
      repo.softDelete(duplicate.id)
    }
    if (keep) {
      // Migrate legacy `版本 N` rows to the reserved version-plan name.
      const updated = repo.updateSnapshot(keep.id, snapshot, preferredName)
      if (updated) return updated
    }
    const soft = repo.findSoftDeletedVersionPlan(data.projectId, data.workspaceId, version)
    if (soft) {
      const revived = repo.undeleteAndUpdateSnapshot(soft.id, snapshot, preferredName)
      if (revived) return revived
    }
    return getBaselineRepo().create({
      workspaceId: data.workspaceId,
      projectId: data.projectId,
      name: preferredName,
      snapshot,
    })
  }

  const created = getBaselineRepo().create({
    workspaceId: data.workspaceId,
    projectId: data.projectId,
    name,
    snapshot,
  })
  // User baselines: refresh 应完成百分比 so Gantt/前锋线 can compare vs 实际完成.
  applyShouldPercentFromAsOfDate(data.workspaceId, data.projectId, asOfDate)
  return created
}

/** Update user baseline name and/or as-of date (refreshes 应完成% when date changes). */
export function updatePmBaseline(input: unknown) {
  const data = PmBaselineUpdateInputSchema.parse(input)
  const existing = getBaselineRepo().getById(data.id)
  if (!existing) {
    throw new Error('基线不存在')
  }
  if (parseVersionPlanSnapshotName(existing.name) != null) {
    throw new Error('版本计划快照不能在此修改；请在项目信息中管理保存记录')
  }
  if (data.name == null && data.asOfDate == null) {
    return existing
  }

  const name = data.name?.trim() || existing.name
  let snapshot = existing.snapshot
  let asOfDate: number | null = null
  if (data.asOfDate != null) {
    asOfDate = parseAsOfDateInput(data.asOfDate)
    if (asOfDate == null) {
      throw new Error('请输入有效日期，格式为 YYYY-MM-DD')
    }
    snapshot = { ...snapshot, asOfDate }
  }

  const updated = getBaselineRepo().updateSnapshot(existing.id, snapshot, name)
  if (!updated) {
    throw new Error('基线不存在')
  }
  if (asOfDate != null) {
    applyShouldPercentFromAsOfDate(existing.workspaceId, existing.projectId, asOfDate)
  }
  return updated
}

export function deletePmBaseline(input: unknown) {
  const data = PmBaselineDeleteInputSchema.parse(input)
  const existing = getBaselineRepo().getById(data.id)
  if (!existing) {
    throw new Error('基线不存在')
  }
  // Version plan snapshots back save-history switches — never remove via baseline UI.
  // Project info → delete save record is the intentional path.
  if (parseVersionPlanSnapshotName(existing.name) != null && !data.allowVersionPlan) {
    throw new Error('版本计划快照不能作为基线删除；请在项目信息中删除对应保存记录')
  }
  const deleted = getBaselineRepo().softDelete(data.id)
  if (!deleted) {
    throw new Error('基线不存在')
  }
  return { ok: true as const }
}

function sortSnapshotItemsForCreate(items: PmScheduleBaselineItem[]): PmScheduleBaselineItem[] {
  const byId = new Map(items.map((item) => [item.workItemId, item]))
  const depth = (id: string, seen: Set<string>): number => {
    if (seen.has(id)) return 0
    seen.add(id)
    const item = byId.get(id)
    if (!item?.parentWorkItemId || !byId.has(item.parentWorkItemId)) return 0
    return 1 + depth(item.parentWorkItemId, seen)
  }
  return [...items].sort((left, right) => {
    const depthDelta =
      depth(left.workItemId, new Set()) - depth(right.workItemId, new Set())
    if (depthDelta !== 0) return depthDelta
    return (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
  })
}

/**
 * When most snapshot IDs are gone (typical after agent clearExisting), wipe live
 * progress items and rebuild the tree from the snapshot, remapping relation IDs.
 * Preserves task metadata (resource/cost assignments, etc.) matched by title.
 */
function structurallyRestoreSnapshot(options: {
  workspaceId: string
  projectId: string
  snapshot: PmScheduleBaselineSnapshot
}): { createdCount: number; relationsRestored: number; idMap: Map<string, string> } {
  const { workspaceId, projectId, snapshot } = options
  const liveBefore = getWorkItemRepo().list({
    workspaceId,
    projectId,
    domain: 'progress_management',
    limit: 1000,
  })
  const metadataByTitle = new Map<string, Record<string, unknown>>()
  for (const item of liveBefore) {
    const meta =
      item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
        ? (item.metadata as Record<string, unknown>)
        : {}
    const existing = metadataByTitle.get(item.title)
    const hasAssignments =
      (Array.isArray(meta.resourceAssignments) && meta.resourceAssignments.length > 0) ||
      (Array.isArray(meta.costAssignments) && meta.costAssignments.length > 0)
    const existingHasAssignments =
      existing != null &&
      ((Array.isArray(existing.resourceAssignments) &&
        existing.resourceAssignments.length > 0) ||
        (Array.isArray(existing.costAssignments) && existing.costAssignments.length > 0))
    if (!existing || (hasAssignments && !existingHasAssignments)) {
      metadataByTitle.set(item.title, { ...meta })
    }
  }

  clearPmProjectPlanData(workspaceId, projectId)

  const idMap = new Map<string, string>()
  const ordered = sortSnapshotItemsForCreate(snapshot.workItems)
  let createdCount = 0
  let sortFallback = 0

  for (const entry of ordered) {
    const parentId = entry.parentWorkItemId
      ? (idMap.get(entry.parentWorkItemId) ?? undefined)
      : undefined
    const preserved = metadataByTitle.get(entry.title)
    const created = createPmWorkItem({
      workspaceId,
      projectId,
      domain: 'progress_management',
      title: entry.title,
      type: entry.type ?? 'task',
      parentId,
      startDate: entry.startDate,
      dueDate: entry.dueDate,
      progressPercent: entry.progressPercent ?? 0,
      sortOrder: entry.sortOrder ?? sortFallback,
      status: 'todo',
      priority: 'normal',
      ...(preserved && Object.keys(preserved).length > 0 ? { metadata: preserved } : {}),
    })
    idMap.set(entry.workItemId, created.id)
    createdCount += 1
    sortFallback += 1
  }

  let relationsRestored = 0
  const relationRepo = getRelationRepo()
  for (const relation of snapshot.relations ?? []) {
    const fromWorkItemId = idMap.get(relation.fromWorkItemId)
    const toWorkItemId = idMap.get(relation.toWorkItemId)
    if (!fromWorkItemId || !toWorkItemId || fromWorkItemId === toWorkItemId) continue
    relationRepo.create({
      workspaceId,
      projectId,
      fromWorkItemId,
      toWorkItemId,
      type: relation.type,
      lagDays: relation.lagDays,
    })
    relationsRestored += 1
  }

  return { createdCount, relationsRestored, idMap }
}

function rewriteBaselineSnapshotIds(
  snapshot: PmScheduleBaselineSnapshot,
  idMap: Map<string, string>,
): PmScheduleBaselineSnapshot {
  return {
    capturedAt: Date.now(),
    workItems: snapshot.workItems.map((item) => ({
      ...item,
      workItemId: idMap.get(item.workItemId) ?? item.workItemId,
      parentWorkItemId: item.parentWorkItemId
        ? (idMap.get(item.parentWorkItemId) ?? item.parentWorkItemId)
        : undefined,
    })),
    relations: (snapshot.relations ?? []).map((relation) => ({
      ...relation,
      fromWorkItemId: idMap.get(relation.fromWorkItemId) ?? relation.fromWorkItemId,
      toWorkItemId: idMap.get(relation.toWorkItemId) ?? relation.toWorkItemId,
    })),
  }
}

/** Apply a baseline snapshot onto current work items (dates / progress / title / relations). */
export function restorePmBaseline(input: unknown) {
  const data = PmBaselineRestoreInputSchema.parse(input)
  const baseline = getBaselineRepo().getById(data.id)
  if (!baseline) {
    throw new Error('基线不存在')
  }

  const liveItems = getWorkItemRepo().list({
    workspaceId: baseline.workspaceId,
    projectId: baseline.projectId,
    limit: 1000,
  })
  const { changed: changedCount, unchanged: unchangedCount, missing: missingCount } =
    countBaselineSnapshotChanges(baseline.snapshot.workItems, liveItems)

  const snapshotCount = baseline.snapshot.workItems.length
  const mostlyMissing = shouldStructurallyRestoreBaseline(missingCount, snapshotCount)

  let updatedCount = 0
  let createdCount = 0
  let relationsRestored = 0

  if (mostlyMissing) {
    const rebuilt = structurallyRestoreSnapshot({
      workspaceId: baseline.workspaceId,
      projectId: baseline.projectId,
      snapshot: baseline.snapshot,
    })
    createdCount = rebuilt.createdCount
    relationsRestored = rebuilt.relationsRestored
    // Keep future switches ID-stable by rewriting this version baseline.
    getBaselineRepo().updateSnapshot(
      baseline.id,
      rewriteBaselineSnapshotIds(baseline.snapshot, rebuilt.idMap),
    )
  } else {
    for (const entry of baseline.snapshot.workItems) {
      const existing = getWorkItemRepo().getById(entry.workItemId)
      if (
        !existing ||
        existing.projectId !== baseline.projectId ||
        existing.workspaceId !== baseline.workspaceId
      ) {
        continue
      }
      updatePmWorkItem({
        id: entry.workItemId,
        title: entry.title,
        startDate: entry.startDate ?? null,
        dueDate: entry.dueDate ?? null,
        progressPercent: entry.progressPercent,
      })
      updatedCount += 1
    }

    // Restore dependency graph when the snapshot includes one (new version baselines).
    // Legacy baselines omit `relations` — leave live links alone.
    if (baseline.snapshot.relations) {
      const relationRepo = getRelationRepo()
      relationRepo.softDeleteAllByProject(baseline.projectId, baseline.workspaceId)
      const liveIds = new Set(
        getWorkItemRepo()
          .list({
            workspaceId: baseline.workspaceId,
            projectId: baseline.projectId,
            limit: 1000,
          })
          .map((item) => item.id),
      )
      for (const relation of baseline.snapshot.relations) {
        if (!liveIds.has(relation.fromWorkItemId) || !liveIds.has(relation.toWorkItemId)) {
          continue
        }
        if (relation.fromWorkItemId === relation.toWorkItemId) continue
        relationRepo.create({
          workspaceId: baseline.workspaceId,
          projectId: baseline.projectId,
          fromWorkItemId: relation.fromWorkItemId,
          toWorkItemId: relation.toWorkItemId,
          type: relation.type,
          lagDays: relation.lagDays,
        })
        relationsRestored += 1
      }
    }
  }

  const scheduleVersion = parseVersionPlanSnapshotName(baseline.name)
  if (scheduleVersion != null) {
    // Keep history timestamps; only move the current-version pointer.
    const current = getPmProject({ id: baseline.projectId })
    const history = readSaveHistory(current.metadata)
    const historySavedAt = history.find((row) => row.version === scheduleVersion)?.savedAt
    updatePmProject({
      id: baseline.projectId,
      metadata: {
        [PM_SCHEDULE_VERSION_KEY]: scheduleVersion,
        [PM_LAST_SAVED_AT_KEY]:
          historySavedAt ?? readLastSavedAt(current.metadata) ?? Date.now(),
        [PM_PENDING_AGENT_REVISION_KEY]: false,
      },
    })
  }

  return {
    ok: true as const,
    updatedCount: updatedCount + createdCount,
    changedCount: mostlyMissing ? createdCount : changedCount,
    unchangedCount: mostlyMissing ? 0 : unchangedCount,
    missingCount: mostlyMissing ? 0 : missingCount,
    relationsRestored,
    baselineId: baseline.id,
    baselineName: baseline.name,
    scheduleVersion,
  }
}

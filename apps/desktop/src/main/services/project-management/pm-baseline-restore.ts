import {
  countBaselineSnapshotChanges,
  mergeAssignmentSnapshotIntoMetadata,
  PM_LAST_SAVED_AT_KEY,
  PM_PENDING_AGENT_REVISION_KEY,
  PM_SCHEDULE_VERSION_KEY,
  PmBaselineDeleteInputSchema,
  PmBaselineRestoreInputSchema,
  parseVersionPlanSnapshotName,
  readLastSavedAt,
  readSaveHistory,
  shouldStructurallyRestoreBaseline,
  type PmScheduleBaselineItem,
  type PmScheduleBaselineSnapshot,
} from '@toolman/shared'

import { clearPmProjectPlanData } from './pm-plan-apply.service'
import { getPmProject, updatePmProject } from './pm-project.service'
import { createPmWorkItem, updatePmWorkItem } from './pm-work-item.service'
import { getBaselineRepo, getRelationRepo, getWorkItemRepo } from './pm-baseline-read'

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
 *
 * Assignment metadata preference:
 * 1. Snapshot resource/cost assignments when the baseline recorded them
 * 2. Else fall back to live-by-title (legacy baselines without assignment fields)
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
    const fromSnapshot = mergeAssignmentSnapshotIntoMetadata({}, entry)
    const preserved = fromSnapshot ?? metadataByTitle.get(entry.title)
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
      const assignmentMeta = mergeAssignmentSnapshotIntoMetadata(existing.metadata, entry)
      updatePmWorkItem({
        id: entry.workItemId,
        title: entry.title,
        startDate: entry.startDate ?? null,
        dueDate: entry.dueDate ?? null,
        progressPercent: entry.progressPercent,
        ...(assignmentMeta ? { metadata: assignmentMeta } : {}),
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

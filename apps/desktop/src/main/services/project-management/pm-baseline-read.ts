import {
  pickAssignmentSnapshotFromMetadata,
  parseVersionPlanSnapshotName,
  versionPlanSnapshotName,
  PmBaselineGetInputSchema,
  PmBaselineListInputSchema,
  readSaveHistory,
  type PmScheduleBaselineSnapshot,
} from '@toolman/shared'
import {
  PmScheduleBaselineRepository,
  PmWorkItemRelationRepository,
  PmWorkItemRepository,
} from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'
import { getPmProject } from './pm-project.service'
import { updatePmWorkItem } from './pm-work-item.service'

export function getBaselineRepo(): PmScheduleBaselineRepository {
  return new PmScheduleBaselineRepository(getDatabase())
}

export function getWorkItemRepo(): PmWorkItemRepository {
  return new PmWorkItemRepository(getDatabase())
}

export function getRelationRepo(): PmWorkItemRelationRepository {
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

export function startOfLocalDayMs(ms: number): number {
  const date = new Date(ms)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function parseAsOfDateInput(value: string | undefined): number | null {
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

export function formatAsOfDateLabel(ms: number): string {
  const date = new Date(ms)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function captureScheduleSnapshot(
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
    workItems: items.map((item) => {
      const meta =
        item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
          ? (item.metadata as Record<string, unknown>)
          : {}
      const assignments = pickAssignmentSnapshotFromMetadata(meta)
      return {
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
        resourceAssignments: assignments.resourceAssignments,
        costAssignments: assignments.costAssignments,
      }
    }),
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
export function applyShouldPercentFromAsOfDate(
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


import type { PmProject, PmWorkItem } from '@toolman/shared'

import { startOfLocalDay } from './pm-gantt-schedule'
import { GANTT_PROJECT_ROOT_ID } from './pm-gantt-utils-types'

export function isGanttProjectRootId(id: string | null | undefined): boolean {
  return id === GANTT_PROJECT_ROOT_ID
}

/** Build a display-only project summary row spanning the schedule envelope. */
export function buildGanttProjectRootItem(
  project: PmProject,
  items: PmWorkItem[],
): PmWorkItem {
  let startMs: number | undefined
  let dueMs: number | undefined
  for (const item of items) {
    if (item.startDate != null) {
      startMs = startMs == null ? item.startDate : Math.min(startMs, item.startDate)
    }
    if (item.dueDate != null) {
      dueMs = dueMs == null ? item.dueDate : Math.max(dueMs, item.dueDate)
    }
  }

  // Plan start/finish in project metadata are contract targets (项目信息), not the
  // live schedule envelope. Mixing them in pinned 总工期 so predecessor-driven
  // reschedules looked like a no-op when tasks stayed inside the plan window.
  const readMetaDate = (key: string): number | undefined => {
    const raw = project.metadata?.[key]
    if (typeof raw !== 'string' || !raw.trim()) return undefined
    const parsed = Date.parse(`${raw.trim()}T00:00:00`)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  if (startMs == null) startMs = readMetaDate('planStartDate')
  if (dueMs == null) dueMs = readMetaDate('planFinishDate')

  if (startMs == null && dueMs != null) startMs = dueMs
  if (dueMs == null && startMs != null) dueMs = startMs
  if (startMs == null) startMs = startOfLocalDay(Date.now())
  if (dueMs == null) dueMs = startMs

  const progressPercent =
    items.length === 0
      ? 0
      : Math.round(
          items.reduce((sum, entry) => sum + (entry.progressPercent ?? 0), 0) / items.length,
        )

  return {
    id: GANTT_PROJECT_ROOT_ID,
    projectId: project.id,
    workspaceId: project.workspaceId,
    type: 'wbs_node',
    status: 'in_progress',
    priority: 'normal',
    domain: 'progress_management',
    title: `${project.code} · ${project.name}`,
    progressPercent,
    sortOrder: -1,
    metadata: { source: 'gantt_project_root' },
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    startDate: startOfLocalDay(startMs),
    dueDate: startOfLocalDay(dueMs),
  }
}

/**
 * Prepend a project summary row and hang current roots under it (display tree only).
 */
export function withGanttProjectRootItems(
  project: PmProject | null,
  items: PmWorkItem[],
): PmWorkItem[] {
  if (!project || items.length === 0) return items
  if (items.some((item) => item.id === GANTT_PROJECT_ROOT_ID)) return items
  const root = buildGanttProjectRootItem(project, items)
  const idSet = new Set(items.map((item) => item.id))
  const nested = items.map((item) => {
    const parentMissing = !item.parentId || !idSet.has(item.parentId)
    return parentMissing ? { ...item, parentId: root.id } : item
  })
  return [root, ...nested]
}

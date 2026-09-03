import type { PmProject, PmWorkItem, PmWorkItemPriority, PmWorkItemStatus } from '@toolman/shared'

export type UrgentItemCardModel = {
  id: string
  title: string
  projectName: string
  assignee: string
  dueMs?: number
  progressPercent: number
  priority: PmWorkItemPriority
  status: PmWorkItemStatus
  overdue: boolean
}

export type UrgentTodoStats = {
  openCount: number
  urgentCount: number
  overdueCount: number
  blockedCount: number
  inProgressCount: number
  projectCount: number
  avgProgress: number
  healthPercent: number
}

export function isOpenPmWorkItem(item: PmWorkItem): boolean {
  return item.status !== 'done' && item.status !== 'cancelled'
}

export function isOverduePmWorkItem(item: PmWorkItem, now = Date.now()): boolean {
  return isOpenPmWorkItem(item) && item.dueDate != null && item.dueDate < now
}

export function isHighPriorityPmWorkItem(item: PmWorkItem): boolean {
  return item.priority === 'urgent' || item.priority === 'high'
}

export function buildUrgentTodoStats(
  items: PmWorkItem[],
  projects: PmProject[],
  now = Date.now(),
): UrgentTodoStats {
  const openItems = items.filter(isOpenPmWorkItem)
  const overdueCount = openItems.filter((item) => isOverduePmWorkItem(item, now)).length
  const blockedCount = openItems.filter((item) => item.status === 'blocked').length
  const healthyCount = openItems.filter(
    (item) => item.status !== 'blocked' && !isOverduePmWorkItem(item, now),
  ).length
  const avgProgress =
    openItems.length === 0
      ? 0
      : openItems.reduce((sum, item) => sum + item.progressPercent, 0) / openItems.length
  return {
    openCount: openItems.length,
    urgentCount: openItems.filter(isHighPriorityPmWorkItem).length,
    overdueCount,
    blockedCount,
    inProgressCount: openItems.filter((item) => item.status === 'in_progress').length,
    projectCount: projects.length,
    avgProgress,
    healthPercent:
      openItems.length === 0 ? 100 : Math.round((healthyCount / openItems.length) * 100),
  }
}

function priorityWeight(priority: PmWorkItemPriority): number {
  if (priority === 'urgent') return 300
  if (priority === 'high') return 200
  if (priority === 'normal') return 50
  return 0
}

export function importantWorkItemScore(item: PmWorkItem, now = Date.now()): number {
  let score = priorityWeight(item.priority) + (100 - item.progressPercent)
  if (isOverduePmWorkItem(item, now)) score += 1000
  if (item.status === 'blocked') score += 400
  if (item.dueDate != null) {
    const days = (item.dueDate - now) / (24 * 60 * 60 * 1000)
    score += days < 0 ? 80 : Math.max(0, 40 - days)
  }
  return score
}

export function pickImportantWorkItems(
  items: PmWorkItem[],
  limit = 6,
  now = Date.now(),
): PmWorkItem[] {
  return items
    .filter(isOpenPmWorkItem)
    .slice()
    .sort((a, b) => importantWorkItemScore(b, now) - importantWorkItemScore(a, now))
    .slice(0, limit)
}

export function toUrgentItemCard(
  item: PmWorkItem,
  projects: PmProject[],
  now = Date.now(),
): UrgentItemCardModel {
  const project = projects.find((entry) => entry.id === item.projectId)
  return {
    id: item.id,
    title: item.title,
    projectName: project?.name || project?.code || '未关联项目',
    assignee: item.assignee?.trim() || '未指派',
    dueMs: item.dueDate,
    progressPercent: item.progressPercent,
    priority: item.priority,
    status: item.status,
    overdue: isOverduePmWorkItem(item, now),
  }
}

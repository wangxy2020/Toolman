import { buildPortfolioAggregates, type EpcPortfolioAggregates } from './epc-aggregates.js'
import { MOCK_EPC_PROJECTS, type EpcProjectRecord } from './epc-mock.js'
import type { PmProject, PmProjectStatus, PmWorkItem } from './pm-types.js'

export type { EpcPortfolioAggregates, EpcProjectRecord }

function readMetaNumber(metadata: Record<string, unknown>, key: string): number | undefined {
  const value = metadata[key]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

function readMetaString(metadata: Record<string, unknown>, key: string): string | undefined {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function mapPmStatusToEpc(status: PmProjectStatus): EpcProjectRecord['status'] {
  if (status === 'on_hold') return 'critical'
  if (status === 'planning') return 'warning'
  return 'normal'
}

function averageWorkItemProgress(workItems: PmWorkItem[]): number | undefined {
  if (workItems.length === 0) return undefined
  return workItems.reduce((sum, item) => sum + item.progressPercent, 0) / workItems.length
}

export function dedupePmProjectsByCode(projects: PmProject[]): PmProject[] {
  const byCode = new Map<string, PmProject>()
  for (const project of projects) {
    const existing = byCode.get(project.code)
    if (!existing || project.updatedAt > existing.updatedAt) {
      byCode.set(project.code, project)
    }
  }
  return [...byCode.values()].sort((left, right) => left.code.localeCompare(right.code))
}

export function resolvePmProjectDashboardRecord(
  project: PmProject,
  workItems: PmWorkItem[] = [],
): EpcProjectRecord {
  const mock = MOCK_EPC_PROJECTS.find((entry) => entry.code === project.code)
  const metadata = project.metadata ?? {}

  const contractValue = readMetaNumber(metadata, 'contractValue') ?? mock?.contractValue ?? 0
  const settledAmount = readMetaNumber(metadata, 'settledAmount') ?? mock?.settledAmount ?? 0
  const pendingAmount =
    readMetaNumber(metadata, 'pendingAmount') ??
    mock?.pendingAmount ??
    Math.max(0, contractValue - settledAmount)

  const progressPercent =
    readMetaNumber(metadata, 'progressPercent') ??
    averageWorkItemProgress(workItems) ??
    mock?.progressPercent ??
    0

  const epcStatusRaw = readMetaString(metadata, 'epcStatus')
  const status: EpcProjectRecord['status'] =
    epcStatusRaw === 'normal' || epcStatusRaw === 'warning' || epcStatusRaw === 'critical'
      ? epcStatusRaw
      : (mock?.status ?? mapPmStatusToEpc(project.status))

  return {
    id: project.id,
    code: project.code,
    name: project.name,
    contractValue,
    settledAmount,
    pendingAmount,
    progressPercent: Math.round(progressPercent),
    planPhase: readMetaString(metadata, 'planPhase') ?? mock?.planPhase ?? '—',
    // Do not fall back to project.description — that is overview prose, not a period label.
    period: readMetaString(metadata, 'period') ?? mock?.period ?? '—',
    status,
    region: readMetaString(metadata, 'region') ?? mock?.region ?? '—',
  }
}

export function buildPmProjectDashboardRecords(
  projects: PmProject[],
  workItems: PmWorkItem[] = [],
): EpcProjectRecord[] {
  const itemsByProject = new Map<string, PmWorkItem[]>()
  for (const item of workItems) {
    const bucket = itemsByProject.get(item.projectId)
    if (bucket) {
      bucket.push(item)
    } else {
      itemsByProject.set(item.projectId, [item])
    }
  }

  return projects.map((project) =>
    resolvePmProjectDashboardRecord(project, itemsByProject.get(project.id) ?? []),
  )
}

export function countOverduePmWorkItems(workItems: PmWorkItem[], now = Date.now()): number {
  return workItems.filter(
    (item) =>
      item.dueDate != null &&
      item.dueDate < now &&
      item.status !== 'done' &&
      item.status !== 'cancelled',
  ).length
}

export type PlanProgressKpiCounts = {
  monthMilestoneCount: number
  monthWorkItemCount: number
  riskWorkItemCount: number
}

function startOfLocalMonth(now: number): number {
  const date = new Date(now)
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime()
}

function startOfNextLocalMonth(now: number): number {
  const date = new Date(now)
  return new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime()
}

function timestampTouchesMonth(ms: number | undefined, start: number, end: number): boolean {
  return ms != null && Number.isFinite(ms) && ms >= start && ms < end
}

export function workItemTouchesMonth(item: PmWorkItem, now = Date.now()): boolean {
  const start = startOfLocalMonth(now)
  const end = startOfNextLocalMonth(now)
  return (
    timestampTouchesMonth(item.dueDate, start, end) ||
    timestampTouchesMonth(item.startDate, start, end) ||
    timestampTouchesMonth(item.updatedAt, start, end)
  )
}

export function isRiskPmWorkItem(item: PmWorkItem, now = Date.now()): boolean {
  if (item.status === 'done' || item.status === 'cancelled') return false
  if (item.status === 'blocked') return true
  if (item.priority === 'urgent' || item.priority === 'high') return true
  return item.dueDate != null && item.dueDate < now
}

export function buildPlanProgressKpiCounts(
  workItems: PmWorkItem[],
  now = Date.now(),
): PlanProgressKpiCounts {
  return {
    monthMilestoneCount: workItems.filter(
      (item) => item.type === 'milestone' && workItemTouchesMonth(item, now),
    ).length,
    monthWorkItemCount: workItems.filter((item) => workItemTouchesMonth(item, now)).length,
    riskWorkItemCount: workItems.filter((item) => isRiskPmWorkItem(item, now)).length,
  }
}

export function buildPlanProgressKpiCountsFromRecords(
  records: EpcProjectRecord[],
): PlanProgressKpiCounts {
  return {
    monthMilestoneCount: records.filter(
      (record) => record.planPhase === '试运行' || record.planPhase === '竣工',
    ).length,
    monthWorkItemCount: records.length,
    riskWorkItemCount: records.filter((record) => record.status !== 'normal').length,
  }
}

export function buildPmPortfolioAggregates(
  projects: PmProject[],
  workItems: PmWorkItem[] = [],
): EpcPortfolioAggregates {
  const records = buildPmProjectDashboardRecords(projects, workItems)
  const overdueCount = countOverduePmWorkItems(workItems)
  return buildPortfolioAggregates(records, { overdueCount })
}

import type { ProjectManagementAgentTab } from '@toolman/shared'
import {
  buildPmPortfolioAggregates,
  buildPmProjectDashboardRecords,
  buildProjectResourceCatalogSummaryEntry,
  countOverduePmWorkItems,
  dedupePmProjectsByCode,
  formatResourceCatalogHintLines,
  isPmSystemDefaultResourceProjectCode,
  parseSharedResourceCatalogRows,
  PM_PROJECT_RESOURCE_CATALOG_KEY,
  type PmAgentProjectResourceCatalogSummary,
  type PmAgentSnapshot,
  resolvePmDomainForAgentTab,
  shouldDedupePmProjectsForAgentTab,
} from '@toolman/shared'
import { PmProjectRepository, PmWorkItemRelationRepository, PmWorkItemRepository } from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'
import { ensurePmDemoProjects } from './pm-seed.service'
import { getSharedResourceCatalog } from './pm-shared-resource-catalog.service'

function getProjectRepo(): PmProjectRepository {
  return new PmProjectRepository(getDatabase())
}

function getWorkItemRepo(): PmWorkItemRepository {
  return new PmWorkItemRepository(getDatabase())
}

function getRelationRepo(): PmWorkItemRelationRepository {
  return new PmWorkItemRelationRepository(getDatabase())
}

function isOpenWorkItem(status: string): boolean {
  return status !== 'done' && status !== 'cancelled'
}

const MAX_USER_OWNED_CATALOG_SUMMARIES = 12

function buildProjectResourceCatalogSummaries(
  projects: ReadonlyArray<{
    id: string
    code: string
    name: string
    metadata: Record<string, unknown> | null
  }>,
): PmAgentProjectResourceCatalogSummary[] {
  const system: PmAgentProjectResourceCatalogSummary[] = []
  const userOwned: PmAgentProjectResourceCatalogSummary[] = []
  const userFallback: PmAgentProjectResourceCatalogSummary[] = []

  for (const project of projects) {
    const raw = project.metadata?.[PM_PROJECT_RESOURCE_CATALOG_KEY]
    const ownedRows = parseSharedResourceCatalogRows(raw)
    const entry = buildProjectResourceCatalogSummaryEntry({
      projectId: project.id,
      code: project.code,
      name: project.name,
      rows: ownedRows,
    })
    if (isPmSystemDefaultResourceProjectCode(project.code)) {
      system.push(entry)
    } else if (entry.source === 'owned') {
      userOwned.push(entry)
    } else {
      userFallback.push(entry)
    }
  }

  // Prefer system samples + owned user catalogs; keep a short tail of fallbacks.
  const selectedUser = [
    ...userOwned.slice(0, MAX_USER_OWNED_CATALOG_SUMMARIES),
    ...userFallback.slice(0, Math.max(0, 6 - Math.min(userOwned.length, 6))),
  ]
  return [...system, ...selectedUser]
}

export function buildPmRuntimeSnapshot(
  workspaceId: string,
  tab: ProjectManagementAgentTab,
): PmAgentSnapshot {
  const domain = resolvePmDomainForAgentTab(tab)
  ensurePmDemoProjects(workspaceId, domain)

  // Shared portfolio (not per-domain clones); work items remain domain-scoped below.
  const projectResult = getProjectRepo().listByWorkspace(workspaceId, { limit: 500 })
  const projects = shouldDedupePmProjectsForAgentTab(tab)
    ? dedupePmProjectsByCode(projectResult)
    : projectResult

  const workItems = getWorkItemRepo().list({
    workspaceId,
    domain,
    limit: 5000,
  })
  const projectIds = new Set(projects.map((project) => project.id))
  const scopedWorkItems = workItems.filter((item) => projectIds.has(item.projectId))

  const urgentItems = scopedWorkItems.filter(
    (item) =>
      isOpenWorkItem(item.status) &&
      (item.priority === 'urgent' || item.priority === 'high'),
  )

  const openWorkItems = scopedWorkItems.filter((item) => isOpenWorkItem(item.status)).length
  const records = buildPmProjectDashboardRecords(projects, scopedWorkItems)
  const aggregates = buildPmPortfolioAggregates(projects, scopedWorkItems)

  let relationCount: number | undefined
  if (tab === 'progress_management' && projects.length > 0) {
    relationCount = projects.reduce((sum, project) => {
      return sum + getRelationRepo().listByProject(project.id, workspaceId).length
    }, 0)
  }

  let resourceCatalogSummary: string | undefined
  let projectResourceCatalogSummaries: PmAgentProjectResourceCatalogSummary[] | undefined
  let scheduleTaskTitles: string[] | undefined
  if (tab === 'progress_management' || tab === 'resource_management') {
    try {
      const catalog = getSharedResourceCatalog(workspaceId)
      resourceCatalogSummary = formatResourceCatalogHintLines(catalog.rows)
      projectResourceCatalogSummaries = buildProjectResourceCatalogSummaries(projects)
    } catch {
      const catalog = getSharedResourceCatalog(workspaceId)
      resourceCatalogSummary = formatResourceCatalogHintLines(catalog.rows)
      projectResourceCatalogSummaries = []
    }
  }
  if (tab === 'progress_management') {
    const scheduleItems = getWorkItemRepo().list({
      workspaceId,
      domain: 'progress_management',
      limit: 5000,
    })
    const titles = scheduleItems
      .filter((item) => projectIds.has(item.projectId))
      .map((item) => item.title.trim())
      .filter(Boolean)
    scheduleTaskTitles = [...new Set(titles)].slice(0, 80)
  }

  return {
    dataSource: 'sqlite',
    tab,
    aggregates,
    records,
    openWorkItems,
    overdueWorkItems: countOverduePmWorkItems(scopedWorkItems),
    urgentWorkItems: urgentItems.length,
    relationCount,
    resourceCatalogSummary,
    projectResourceCatalogSummaries,
    scheduleTaskTitles,
  }
}

/** Catalog-only snapshot when the full portfolio build fails. */
export function buildPmResourceCatalogFallbackSnapshot(
  workspaceId: string,
  tab: ProjectManagementAgentTab,
): PmAgentSnapshot {
  const emptyAggregates = {
    projectCount: 0,
    contractTotal: 0,
    settledTotal: 0,
    pendingTotal: 0,
    avgProgress: 0,
    varianceRate: 0,
    overdueCount: 0,
    settlementRate: '0',
  }
  let resourceCatalogSummary: string | undefined
  let projectResourceCatalogSummaries: PmAgentProjectResourceCatalogSummary[] | undefined
  try {
    const catalog = getSharedResourceCatalog(workspaceId)
    resourceCatalogSummary = formatResourceCatalogHintLines(catalog.rows)
  } catch {
    resourceCatalogSummary = '（资源列表读取失败）'
  }
  try {
    const projects = getProjectRepo().listByWorkspace(workspaceId, { limit: 500 })
    projectResourceCatalogSummaries = buildProjectResourceCatalogSummaries(projects)
  } catch {
    projectResourceCatalogSummaries = []
  }
  return {
    dataSource: 'sqlite',
    tab,
    aggregates: emptyAggregates,
    records: [],
    openWorkItems: 0,
    overdueWorkItems: 0,
    urgentWorkItems: 0,
    resourceCatalogSummary,
    projectResourceCatalogSummaries,
  }
}

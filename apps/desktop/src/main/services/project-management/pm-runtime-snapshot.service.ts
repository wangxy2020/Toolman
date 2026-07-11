import type { ProjectManagementAgentTab } from '@toolman/shared'
import {
  buildPmPortfolioAggregates,
  buildPmProjectDashboardRecords,
  countOverduePmWorkItems,
  dedupePmProjectsByCode,
  type PmAgentSnapshot,
  resolvePmDomainForAgentTab,
  shouldDedupePmProjectsForAgentTab,
} from '@toolman/shared'
import { PmProjectRepository, PmWorkItemRelationRepository, PmWorkItemRepository } from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'
import { ensurePmDemoProjects } from './pm-seed.service'

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

  return {
    dataSource: 'sqlite',
    tab,
    aggregates,
    records,
    openWorkItems,
    overdueWorkItems: countOverduePmWorkItems(scopedWorkItems),
    urgentWorkItems: urgentItems.length,
    relationCount,
  }
}

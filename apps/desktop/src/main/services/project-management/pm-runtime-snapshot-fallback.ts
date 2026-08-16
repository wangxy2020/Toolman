import type {
  PmAgentProjectCostCatalogSummary,
  PmAgentProjectResourceCatalogSummary,
  PmAgentSnapshot,
  ProjectManagementAgentTab,
} from '@toolman/shared'
import {
  formatCostCatalogHintLines,
  formatResourceCatalogHintLines,
} from '@toolman/shared'
import { getSharedResourceCatalog } from './pm-shared-resource-catalog.service'
import { getSharedCostCatalog } from './pm-shared-cost-catalog.service'
import {
  getProjectRepo,
  buildProjectCostCatalogSummaries,
  buildProjectResourceCatalogSummaries,
} from './pm-runtime-snapshot-build'

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
  let costCatalogSummary: string | undefined
  let projectCostCatalogSummaries: PmAgentProjectCostCatalogSummary[] | undefined
  try {
    const catalog = getSharedCostCatalog(workspaceId)
    costCatalogSummary = formatCostCatalogHintLines(catalog.rows)
  } catch {
    costCatalogSummary = '（价格表读取失败）'
  }
  try {
    const projects = getProjectRepo().listByWorkspace(workspaceId, { limit: 500 })
    projectResourceCatalogSummaries = buildProjectResourceCatalogSummaries(projects)
    projectCostCatalogSummaries = buildProjectCostCatalogSummaries(projects)
  } catch {
    projectResourceCatalogSummaries = []
    projectCostCatalogSummaries = []
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
    costCatalogSummary,
    projectCostCatalogSummaries,
  }
}


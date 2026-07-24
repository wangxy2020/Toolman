import type { ProjectManagementAgentTab } from './agent-link.js'
import type { EpcPortfolioAggregates } from './epc-aggregates.js'
import type { EpcProjectRecord } from './epc-mock.js'
import { formatProjectMoney } from './epc-mock.js'
import type { PmDomain } from './pm-types.js'
import {
  formatProjectResourceCatalogAgentBlock,
  type PmAgentProjectResourceCatalogSummary,
} from './pm-resource-catalog-agent.js'
import {
  formatProjectCostCatalogAgentBlock,
  type PmAgentProjectCostCatalogSummary,
} from './pm-cost-catalog-agent.js'

export type PmAgentDataSource = 'mock' | 'sqlite'

export type PmAgentSnapshot = {
  dataSource: PmAgentDataSource
  tab: ProjectManagementAgentTab
  aggregates: EpcPortfolioAggregates
  records: EpcProjectRecord[]
  openWorkItems: number
  overdueWorkItems: number
  urgentWorkItems: number
  relationCount?: number
  /** Markdown bullet list of「全部项目」resource catalog rows. */
  resourceCatalogSummary?: string
  /** Per-project catalogs (system defaults + user-owned / shared-fallback). */
  projectResourceCatalogSummaries?: PmAgentProjectResourceCatalogSummary[]
  /** Markdown bullet list of「全部项目」cost/price-list catalog rows. */
  costCatalogSummary?: string
  /** Per-project price lists (system defaults + user-owned / shared-fallback). */
  projectCostCatalogSummaries?: PmAgentProjectCostCatalogSummary[]
  /** Markdown bullet list of「全部项目」feature (实务目录) catalog rows. */
  featureCatalogSummary?: string
  /** Sample schedule leaf/task titles for resource-plan matching. */
  scheduleTaskTitles?: string[]
  /** Sample schedule leaf/task id+title (+code) refs; preferred over titles for agent matching. */
  scheduleTaskRefs?: Array<{ id: string; title: string; code?: string }>
}

export function resolvePmDomainForAgentTab(
  tab: ProjectManagementAgentTab,
): PmDomain | undefined {
  if (tab === 'all_projects' || tab === 'urgent_tasks') {
    return undefined
  }
  return tab
}

export function shouldDedupePmProjectsForAgentTab(tab: ProjectManagementAgentTab): boolean {
  return tab === 'all_projects'
}

function formatEpcStatus(status: EpcProjectRecord['status']): string {
  switch (status) {
    case 'critical':
      return '高风险'
    case 'warning':
      return '需关注'
    default:
      return '正常'
  }
}

export function buildPmAgentPortfolioSummary(snapshot: PmAgentSnapshot): string {
  const { tab, aggregates, records } = snapshot
  const sourceLabel = snapshot.dataSource === 'sqlite' ? 'SQLite 工作区数据' : 'MOCK 演示数据'
  const summaryLines = [
    `- 在管项目：${aggregates.projectCount} 个`,
    `- 合同总额：${formatProjectMoney(aggregates.contractTotal)}`,
    `- 已结算：${formatProjectMoney(aggregates.settledTotal)}（结算率 ${aggregates.settlementRate}%）`,
    `- 待支付：${formatProjectMoney(aggregates.pendingTotal)}`,
    `- 平均进度：${aggregates.avgProgress.toFixed(1)}%`,
    `- 逾期工作项：${aggregates.overdueCount} 个`,
    `- 未完成工作项：${snapshot.openWorkItems} 个`,
    `- 高优先级工作项：${snapshot.urgentWorkItems} 个`,
    `- 数据来源：${sourceLabel}`,
  ]

  if (snapshot.relationCount != null) {
    summaryLines.push(`- 计划依赖关系：${snapshot.relationCount} 条`)
  }

  const catalogBlock =
    snapshot.resourceCatalogSummary != null && snapshot.resourceCatalogSummary.trim()
      ? [
          '',
          '### 全部项目适用的资源列表（系统默认 · 权威数据源）',
          '说明：下列条目即为工作区「全部项目」资源字典（类型/名称/单位/单价/规格/说明）。智能体应直接据此分析，不要到工作目录找文件。',
          snapshot.resourceCatalogSummary.trim(),
        ]
      : []

  const projectCatalogBlock = formatProjectResourceCatalogAgentBlock(
    snapshot.projectResourceCatalogSummaries ?? [],
  )

  const costCatalogBlock =
    snapshot.costCatalogSummary != null && snapshot.costCatalogSummary.trim()
      ? [
          '',
          '### 全部项目适用的价格表（系统默认 · 权威数据源）',
          '说明：下列条目即为工作区「全部项目」价格表（类型/编码/名称/单位/数量/单价/分部工程/说明）。智能体应直接据此分析，不要到工作目录找文件。',
          snapshot.costCatalogSummary.trim(),
        ]
      : []

  const projectCostCatalogBlock = formatProjectCostCatalogAgentBlock(
    snapshot.projectCostCatalogSummaries ?? [],
  )

  const featureCatalogBlock =
    snapshot.featureCatalogSummary != null && snapshot.featureCatalogSummary.trim()
      ? [
          '',
          '### 全部项目适用的实务目录（系统默认 · 权威数据源）',
          snapshot.featureCatalogSummary.trim(),
        ]
      : []

  const taskBlock =
    snapshot.scheduleTaskRefs != null && snapshot.scheduleTaskRefs.length > 0
      ? [
          '',
          '### 计划任务列表（用于资源/成本用量匹配，请优先使用 id）',
          ...snapshot.scheduleTaskRefs
            .slice(0, 60)
            .map((task) => `- ${task.id} · ${task.title}${task.code ? ` · ${task.code}` : ''}`),
        ]
      : snapshot.scheduleTaskTitles != null && snapshot.scheduleTaskTitles.length > 0
        ? [
            '',
            '### 计划任务名称（用于资源用量匹配）',
            ...snapshot.scheduleTaskTitles.slice(0, 60).map((title) => `- ${title}`),
          ]
        : []

  const projectLines = records.slice(0, 12).map((project) => {
    if (tab === 'cost_management') {
      return [
        `- ${project.code} ${project.name}`,
        `  合同 ${formatProjectMoney(project.contractValue)} · 已结算 ${formatProjectMoney(project.settledAmount)} · 待支付 ${formatProjectMoney(project.pendingAmount)} · ${formatEpcStatus(project.status)}`,
      ].join('\n')
    }

    return [
      `- ${project.code} ${project.name}`,
      `  进度 ${project.progressPercent}% · 阶段 ${project.planPhase} · 周期 ${project.period} · ${formatEpcStatus(project.status)}`,
    ].join('\n')
  })

  return [
    '### 组合汇总',
    ...summaryLines,
    '',
    '### 项目明细',
    ...projectLines,
    ...catalogBlock,
    ...(projectCatalogBlock ? ['', projectCatalogBlock] : []),
    ...costCatalogBlock,
    ...(projectCostCatalogBlock ? ['', projectCostCatalogBlock] : []),
    ...featureCatalogBlock,
    ...taskBlock,
  ].join('\n')
}

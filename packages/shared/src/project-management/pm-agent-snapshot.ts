import type { ProjectManagementAgentTab } from './agent-link.js'
import type { EpcPortfolioAggregates } from './epc-aggregates.js'
import type { EpcProjectRecord } from './epc-mock.js'
import { formatProjectMoney } from './epc-mock.js'
import type { PmDomain } from './pm-types.js'

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

  return ['### 组合汇总', ...summaryLines, '', '### 项目明细', ...projectLines].join('\n')
}

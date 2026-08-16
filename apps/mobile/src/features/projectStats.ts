import {
  MOCK_EPC_PROJECTS,
  buildPortfolioAggregates,
  formatProjectMoney,
  type EpcProjectRecord,
} from '@toolman/shared'
import type { ProjectSidebarMenuKey } from './projectSidebar'
import {
  clampProgressPercent,
  chunkRows,
  interpolate,
  kpi,
  projectOverviewFlags,
  projectOverviewProgressCopy,
  projectSettlementRate,
  projectStatusLabel,
  type ProjectInsightCard,
  type ProjectKpiCard,
  type ProjectStatsModel,
  type ProjectStatsSection,
  type ProjectStatsTrend,
} from './projectStats-helpers'
import {
  costInsights,
  costKpis,
  progressInsights,
  progressKpis,
  securityKpis,
  verticalKpis,
} from './projectStats-kpis'

export type {
  ProjectInsightCard,
  ProjectKpiCard,
  ProjectStatsModel,
  ProjectStatsSection,
  ProjectStatsTrend,
}
export type { EpcProjectRecord }
export {
  clampProgressPercent,
  chunkRows,
  interpolate,
  projectOverviewFlags,
  projectOverviewProgressCopy,
  projectSettlementRate,
  projectStatusLabel,
  formatProjectMoney,
}

function mockRecords(): EpcProjectRecord[] {
  return MOCK_EPC_PROJECTS
}

function mockAggregates() {
  return buildPortfolioAggregates(MOCK_EPC_PROJECTS)
}

export function buildProjectStats(menuKey: ProjectSidebarMenuKey): ProjectStatsModel {
  const records = mockRecords()
  const aggregates = mockAggregates()
  const atRisk = records.filter((item) => item.status !== 'normal')
  const inProgress = records.filter(
    (item) => item.progressPercent > 0 && item.progressPercent < 100,
  ).length
  const blocked = records.filter((item) => item.status === 'critical').length

  switch (menuKey) {
    case 'cost_management':
      return {
        variant: 'cost',
        kpis: costKpis(aggregates),
        section: { title: '项目成本概览', desc: '核心 EPC 项目合同与结算状态' },
        records,
        insights: costInsights(aggregates),
        emptyHint: '暂无项目数据',
      }
    case 'progress_management':
    case 'all_projects':
      return {
        variant: 'progress',
        kpis: progressKpis(aggregates),
        section: { title: '项目进度概览', desc: '核心 EPC 项目计划与实际进度状态' },
        records,
        insights: progressInsights(aggregates),
        emptyHint: '暂无项目数据',
      }
    case 'urgent_tasks':
      return {
        variant: 'progress',
        kpis: [
          kpi('open', '未完成工作项', `${records.length}`, '未完成工作项', 'list'),
          kpi('urgent', '高优先级', `${atRisk.length}`, '高优先级', 'alert', atRisk.length > 0 ? 'up' : null),
          kpi('blocked', '阻塞中', `${blocked}`, '阻塞中', 'layers', blocked > 0 ? 'up' : null),
          kpi('projects', '关联项目', `${records.length}`, '关联项目', 'building'),
          kpi('inProgress', '进行中', `${inProgress}`, '进行中', 'check'),
          kpi('progress', '平均进度', `${aggregates.avgProgress.toFixed(0)}%`, '平均完成度', 'trending'),
        ],
        section: { title: '待办看板', desc: '按状态查看高优先级与逾期工作项' },
        records: atRisk.length > 0 ? atRisk : records,
        insights: [],
        emptyHint: '暂无高优先级或逾期工作项。',
      }
    case 'key_projects':
      return {
        variant: 'progress',
        kpis: [
          kpi('portfolio', '在管项目', `${records.length}`, '综合管理覆盖项目', 'building'),
          kpi('atRisk', '风险项目', `${atRisk.length}`, '需升级关注', 'alert', atRisk.length > 0 ? 'up' : null),
          kpi('coordination', '协调中', `${atRisk.length}`, '未完成协调项', 'handshake'),
          kpi('progress', '平均进度', `${aggregates.avgProgress.toFixed(0)}%`, '平均完成度', 'layers', 'up'),
          kpi('open', '未完成', `${records.length}`, '未完成工作项', 'check'),
          kpi('blocked', '阻塞', `${blocked}`, '阻塞项', 'ban', blocked > 0 ? 'up' : null),
        ],
        section: { title: '风险项目', desc: '状态预警或关键路径偏差的项目' },
        records: atRisk.length > 0 ? atRisk : records.slice(0, 4),
        insights: [],
        emptyHint: '暂无重点项目数据。',
      }
    case 'security_management':
      return {
        variant: 'progress',
        kpis: securityKpis(records),
        section: { title: '项目概览', desc: '当前域内在管项目进度与状态' },
        records: records.slice(0, 4),
        insights: [],
        emptyHint: '暂无未完成工作项。',
      }
    case 'archive_management':
      return {
        variant: 'progress',
        kpis: [
          kpi('links', '已关联文档', `${records.length * 4}`, '知识库关联', 'file'),
          kpi('open', '待归档项', `${atRisk.length}`, '待归档项', 'folder'),
          kpi('total', '文档类别', `${records.length * 2}`, '档案工作项总数', 'archive'),
          kpi('projects', '项目数', `${records.length}`, '涉及项目', 'building'),
          kpi('urgent', '高优先级', `${atRisk.length}`, '需重点关注', 'alert', atRisk.length > 0 ? 'up' : null),
          kpi('progress', '平均进度', `${aggregates.avgProgress.toFixed(0)}%`, '平均完成度', 'layers'),
        ],
        section: { title: '项目概览', desc: '已关联至知识库的项目文档' },
        records: records.slice(0, 4),
        insights: [],
        emptyHint: '尚未关联任何文档。',
      }
    default:
      return {
        variant: 'progress',
        kpis: verticalKpis(records),
        section: { title: '项目概览', desc: '当前域内在管项目进度与状态' },
        records: records.slice(0, 4),
        insights: [],
        emptyHint: '暂无未完成工作项。',
      }
  }
}

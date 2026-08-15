import {
  MOCK_EPC_PROJECTS,
  buildPortfolioAggregates,
  formatProjectMoney,
  type EpcPortfolioAggregates,
  type EpcProjectRecord,
} from '@toolman/shared'
import type { ProjectKpiIconName } from '../icons/project-kpi-icons'
import type { ProjectSidebarMenuKey } from './projectSidebar'

export type ProjectStatsTrend = 'up' | 'down' | null

export type ProjectKpiCard = {
  key: string
  label: string
  value: string
  sub: string
  trend: ProjectStatsTrend
  delta: string
  icon: ProjectKpiIconName
}

export type ProjectStatsSection = {
  title: string
  desc: string
}

export type ProjectInsightCard = {
  key: string
  title: string
  value: string
  desc: string
}

export type ProjectStatsModel = {
  variant: 'cost' | 'progress'
  kpis: ProjectKpiCard[]
  section: ProjectStatsSection | null
  records: EpcProjectRecord[]
  insights: ProjectInsightCard[]
  emptyHint: string
}

export function interpolate(template: string, value: string | number): string {
  return template.replaceAll('{{value}}', String(value))
}

export function chunkRows<T>(items: T[], size: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size))
  return rows
}

export function projectSettlementRate(project: EpcProjectRecord): number {
  return project.contractValue > 0 ? (project.settledAmount / project.contractValue) * 100 : 0
}

export function projectOverviewFlags(project: EpcProjectRecord): {
  warnPending: boolean
  warnStatus: boolean
} {
  return {
    warnPending: project.pendingAmount > 10_000_000,
    warnStatus: project.status !== 'normal',
  }
}

export function projectOverviewProgressCopy(
  variant: 'cost' | 'progress',
  progressPercent: number,
  settlementRate: number,
): { left: string; right: string } {
  return {
    left:
      variant === 'cost'
        ? interpolate('进度 {{value}}%', progressPercent)
        : interpolate('计划 {{value}}%', progressPercent),
    right:
      variant === 'cost'
        ? interpolate('结算率 {{value}}%', settlementRate.toFixed(0))
        : interpolate('完成率 {{value}}%', settlementRate.toFixed(0)),
  }
}

export function clampProgressPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function kpi(
  key: string,
  label: string,
  value: string,
  sub: string,
  icon: ProjectKpiIconName,
  trend: ProjectStatsTrend = null,
  delta = '',
): ProjectKpiCard {
  return { key, label, value, sub, icon, trend, delta }
}

function statusLabel(status: EpcProjectRecord['status']): string {
  if (status === 'critical') return '高风险'
  if (status === 'warning') return '需关注'
  return '正常'
}

export function projectStatusLabel(status: EpcProjectRecord['status']): string {
  return statusLabel(status)
}

function mockRecords(): EpcProjectRecord[] {
  return MOCK_EPC_PROJECTS
}

function mockAggregates(): EpcPortfolioAggregates {
  return buildPortfolioAggregates(MOCK_EPC_PROJECTS)
}

function costKpis(aggregates: EpcPortfolioAggregates): ProjectKpiCard[] {
  const riskDelta = aggregates.overdueCount > 0 ? '待处理' : '无'
  const varianceDelta = aggregates.varianceRate > 35 ? '偏高' : '可控'
  return [
    kpi('projects', '在管项目', `${aggregates.projectCount}`, '个项目', 'building'),
    kpi('contract', '合同总额', formatProjectMoney(aggregates.contractTotal), 'USD 口径', 'dollar', 'up', '+4.2%'),
    kpi(
      'settled',
      '已结算',
      formatProjectMoney(aggregates.settledTotal),
      interpolate('结算率 {{value}}%', aggregates.settlementRate),
      'wallet',
      'up',
      '+2.8%',
    ),
    kpi('pending', '待支付', formatProjectMoney(aggregates.pendingTotal), '含进度款与尾款', 'trending', 'down', '-1.1%'),
    kpi(
      'variance',
      '成本偏差率',
      `${aggregates.varianceRate.toFixed(1)}%`,
      '合同 vs 已结算',
      'layers',
      aggregates.varianceRate > 35 ? 'up' : 'down',
      varianceDelta,
    ),
    kpi(
      'risk',
      '风险项目',
      `${aggregates.overdueCount}`,
      '需关注 / 高风险',
      'alert',
      aggregates.overdueCount > 0 ? 'up' : null,
      riskDelta,
    ),
  ]
}

function progressKpis(aggregates: EpcPortfolioAggregates): ProjectKpiCard[] {
  const riskDelta = aggregates.overdueCount > 0 ? '待处理' : '无'
  const varianceDelta = aggregates.varianceRate > 35 ? '偏高' : '可控'
  return [
    kpi('projects', '在管项目', `${aggregates.projectCount}`, '个项目', 'building'),
    kpi('plan', '计划进度', `${aggregates.avgProgress.toFixed(0)}%`, '在管项目均值', 'dollar', 'up', '+3.1%'),
    kpi('actual', '实际完成', `${aggregates.settlementRate}%`, '相对计划基准', 'wallet', 'up', '+1.6%'),
    kpi('delay', '里程碑延期', `${aggregates.overdueCount}`, '项待纠偏', 'trending', 'down', '-2'),
    kpi(
      'variance',
      '进度偏差率',
      `${aggregates.varianceRate.toFixed(1)}%`,
      '计划 vs 实际',
      'layers',
      aggregates.varianceRate > 35 ? 'up' : 'down',
      varianceDelta,
    ),
    kpi(
      'risk',
      '风险项目',
      `${aggregates.overdueCount}`,
      '需关注 / 高风险',
      'alert',
      aggregates.overdueCount > 0 ? 'up' : null,
      riskDelta,
    ),
  ]
}

function costInsights(aggregates: EpcPortfolioAggregates): ProjectInsightCard[] {
  const payment =
    aggregates.contractTotal > 0
      ? `${((aggregates.pendingTotal / aggregates.contractTotal) * 100).toFixed(1)}%`
      : '0%'
  return [
    {
      key: 'payment',
      title: '支付健康度',
      value: payment,
      desc: '待支付占合同总额比例，建议控制在 15% 以内',
    },
    {
      key: 'progress',
      title: '平均执行进度',
      value: `${aggregates.avgProgress.toFixed(0)}%`,
      desc: '在管项目加权进度，与结算节奏联动监控',
    },
  ]
}

function progressInsights(aggregates: EpcPortfolioAggregates): ProjectInsightCard[] {
  const health =
    aggregates.contractTotal > 0 ? `${(100 - aggregates.varianceRate).toFixed(1)}%` : '0%'
  return [
    {
      key: 'health',
      title: '进度健康度',
      value: health,
      desc: '综合计划达成度，建议保持在 85% 以上',
    },
    {
      key: 'progress',
      title: '平均执行进度',
      value: `${aggregates.avgProgress.toFixed(0)}%`,
      desc: '在管项目加权进度，与里程碑节奏联动监控',
    },
  ]
}

function verticalKpis(records: EpcProjectRecord[]): ProjectKpiCard[] {
  const open = records.length
  const urgent = records.filter((item) => item.status !== 'normal').length
  const blocked = records.filter((item) => item.status === 'critical').length
  const avg =
    records.length > 0
      ? records.reduce((sum, item) => sum + item.progressPercent, 0) / records.length
      : 0
  return [
    kpi('projects', '项目数', `${records.length}`, '在管项目', 'building'),
    kpi('open', '未完成', `${open}`, '未完成工作项', 'check'),
    kpi('urgent', '高优先级', `${urgent}`, '高优先级', 'alert', urgent > 0 ? 'up' : null),
    kpi('blocked', '阻塞', `${blocked}`, '阻塞项', 'ban', blocked > 0 ? 'up' : null),
    kpi('progress', '平均进度', `${avg.toFixed(0)}%`, '平均完成度', 'layers'),
    kpi('week', '本周事项', `${Math.max(1, Math.round(records.length / 2))}`, '本周计划/已排', 'calendar'),
  ]
}

function securityKpis(records: EpcProjectRecord[]): ProjectKpiCard[] {
  const hazards = records.length
  const highRisk = records.filter((item) => item.status !== 'normal').length
  const qcPoints = records.filter((item) => item.status === 'warning').length
  const defects = records.filter((item) => item.status === 'critical').length
  const weekInspections = Math.max(1, Math.round(records.length / 2))
  return [
    kpi('projects', '项目数', `${records.length}`, '在管项目', 'building'),
    kpi('hazards', '危险源', `${hazards}`, '待管控危险源', 'shield'),
    kpi('highRisk', '高风险', `${highRisk}`, '需重点关注的高风险项', 'alert', highRisk > 0 ? 'up' : null),
    kpi('qc', '质量控制点', `${qcPoints}`, '待闭环质量控制点', 'target', qcPoints > 0 ? 'up' : null),
    kpi('defects', '质量通病', `${defects}`, '待治理质量通病', 'clipboard', defects > 0 ? 'up' : null),
    kpi('week', '本周检查项', `${weekInspections}`, '本周计划/已排检查', 'calendar'),
  ]
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

export { formatProjectMoney }
export type { EpcProjectRecord }

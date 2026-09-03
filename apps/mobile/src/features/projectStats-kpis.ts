import {
  buildPlanProgressKpiCountsFromRecords,
  formatProjectMoney,
  MOCK_EPC_PROJECTS,
  type EpcPortfolioAggregates,
  type EpcProjectRecord,
} from '@toolman/shared'
import {
  interpolate,
  kpi,
  type ProjectInsightCard,
  type ProjectKpiCard,
} from './projectStats-helpers'

export function costKpis(aggregates: EpcPortfolioAggregates): ProjectKpiCard[] {
  const monthExpense = Math.max(
    0,
    aggregates.contractTotal - aggregates.settledTotal - aggregates.pendingTotal,
  )
  return [
    kpi('projects', '在管项目', `${aggregates.projectCount}`, '个项目', 'building'),
    kpi('contract', '合同总额', formatProjectMoney(aggregates.contractTotal), 'USD 口径', 'dollar', 'up', '+4.2%'),
    kpi(
      'settled',
      '已计量',
      formatProjectMoney(aggregates.settledTotal),
      interpolate('计量率 {{value}}%', aggregates.settlementRate),
      'wallet',
      'up',
      '+2.8%',
    ),
    kpi('pending', '本月收入', formatProjectMoney(aggregates.pendingTotal), '本月进度款', 'trending'),
    kpi('variance', '本月支出', formatProjectMoney(monthExpense), '本月成本发生', 'layers'),
    kpi(
      'risk',
      '本月计划完成',
      `${aggregates.avgProgress.toFixed(0)}%`,
      '计划完成率',
      'alert',
    ),
  ]
}

export function planKpis(aggregates: EpcPortfolioAggregates): ProjectKpiCard[] {
  const counts = buildPlanProgressKpiCountsFromRecords(
    MOCK_EPC_PROJECTS.slice(0, aggregates.projectCount || MOCK_EPC_PROJECTS.length),
  )
  const riskDelta = counts.riskWorkItemCount > 0 ? '待处理' : '无'
  return [
    kpi('projects', '在管项目', `${aggregates.projectCount}`, '个项目', 'building'),
    kpi('plan', '计划进度', `${aggregates.avgProgress.toFixed(0)}%`, '在管项目均值', 'dollar', 'up', '+3.1%'),
    kpi('actual', '实际完成', `${aggregates.settlementRate}%`, '相对计划基准', 'wallet', 'up', '+1.6%'),
    kpi('monthMilestones', '本月里程碑', `${counts.monthMilestoneCount}`, '本月排期里程碑', 'trending'),
    kpi('monthWorkItems', '本月工作项', `${counts.monthWorkItemCount}`, '本月有排期的工作项', 'layers'),
    kpi(
      'riskWork',
      '风险工作',
      `${counts.riskWorkItemCount}`,
      '逾期、阻塞或高优先级',
      'alert',
      counts.riskWorkItemCount > 0 ? 'up' : null,
      riskDelta,
    ),
  ]
}

export function progressKpis(aggregates: EpcPortfolioAggregates): ProjectKpiCard[] {
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

export function costInsights(aggregates: EpcPortfolioAggregates): ProjectInsightCard[] {
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

export function pickImportantRecords(records: EpcProjectRecord[], limit = 6): EpcProjectRecord[] {
  return records
    .slice()
    .sort((a, b) => {
      const rank = (item: EpcProjectRecord) =>
        (item.status === 'critical' ? 300 : item.status === 'warning' ? 200 : 0) +
        (100 - item.progressPercent)
      return rank(b) - rank(a)
    })
    .slice(0, limit)
}

export function urgentKpis(records: EpcProjectRecord[]): ProjectKpiCard[] {
  const urgent = records.filter((item) => item.status !== 'normal').length
  const overdue = records.filter((item) => item.status === 'critical').length
  const blocked = overdue
  const inProgress = records.filter(
    (item) => item.progressPercent > 0 && item.progressPercent < 100,
  ).length
  return [
    kpi('open', '未完成', `${records.length}`, '未完成工作项', 'list'),
    kpi('urgent', '高优先级', `${urgent}`, '高优先级', 'alert', urgent > 0 ? 'up' : null),
    kpi('overdue', '逾期', `${overdue}`, '已过截止日期', 'calendar', overdue > 0 ? 'up' : null),
    kpi('blocked', '阻塞中', `${blocked}`, '阻塞中', 'ban', blocked > 0 ? 'up' : null),
    kpi('inProgress', '进行中', `${inProgress}`, '进行中', 'check'),
    kpi('projects', '关联项目', `${records.length}`, '关联项目', 'building'),
  ]
}

export function urgentInsights(records: EpcProjectRecord[]): ProjectInsightCard[] {
  const healthy = records.filter((item) => item.status === 'normal').length
  const health = records.length === 0 ? 100 : Math.round((healthy / records.length) * 100)
  const avg =
    records.length === 0
      ? 0
      : records.reduce((sum, item) => sum + item.progressPercent, 0) / records.length
  return [
    {
      key: 'health',
      title: '待办健康度',
      value: `${health}%`,
      desc: '未逾期且未阻塞的待办占比，建议保持在 85% 以上',
    },
    {
      key: 'progress',
      title: '平均执行进度',
      value: `${avg.toFixed(0)}%`,
      desc: '未完成待办的平均完成度，与截止日期联动监控',
    },
  ]
}

export function progressInsights(aggregates: EpcPortfolioAggregates): ProjectInsightCard[] {
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

export function verticalKpis(records: EpcProjectRecord[]): ProjectKpiCard[] {
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

export function securityKpis(records: EpcProjectRecord[]): ProjectKpiCard[] {
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

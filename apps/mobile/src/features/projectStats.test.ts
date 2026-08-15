import { describe, expect, it } from 'vitest'
import {
  buildProjectStats,
  clampProgressPercent,
  projectOverviewFlags,
  projectOverviewProgressCopy,
  projectSettlementRate,
} from './projectStats'

describe('project stats', () => {
  it('builds cost dashboard kpis like desktop', () => {
    const stats = buildProjectStats('cost_management')
    expect(stats.variant).toBe('cost')
    expect(stats.kpis.map((item) => item.label)).toEqual([
      '在管项目',
      '合同总额',
      '已结算',
      '待支付',
      '成本偏差率',
      '风险项目',
    ])
    expect(stats.section?.title).toBe('项目成本概览')
    expect(stats.insights.map((item) => item.title)).toEqual(['支付健康度', '平均执行进度'])
    expect(stats.kpis).toHaveLength(6)
    expect(stats.kpis.map((item) => item.icon)).toEqual([
      'building',
      'dollar',
      'wallet',
      'trending',
      'layers',
      'alert',
    ])
  })

  it('builds progress dashboard kpis for workbench and plan menus', () => {
    const workbench = buildProjectStats('all_projects')
    const plan = buildProjectStats('progress_management')
    expect(workbench.variant).toBe('progress')
    expect(plan.kpis.map((item) => item.label)).toEqual([
      '在管项目',
      '计划进度',
      '实际完成',
      '里程碑延期',
      '进度偏差率',
      '风险项目',
    ])
    expect(workbench.section?.title).toBe('项目进度概览')
  })

  it('builds security quality kpis', () => {
    const stats = buildProjectStats('security_management')
    expect(stats.kpis.map((item) => item.label)).toEqual([
      '项目数',
      '危险源',
      '高风险',
      '质量控制点',
      '质量通病',
      '本周检查项',
    ])
  })

  it('builds six kpi cards for every project menu', () => {
    const keys = [
      'all_projects',
      'urgent_tasks',
      'operations_management',
      'key_projects',
      'progress_management',
      'cost_management',
      'security_management',
      'archive_management',
    ] as const
    for (const key of keys) {
      expect(buildProjectStats(key).kpis).toHaveLength(6)
    }
  })

  it('derives overview card rates and copy', () => {
    const project = {
      contractValue: 100,
      settledAmount: 40,
      pendingAmount: 20_000_000,
      status: 'warning',
      progressPercent: 120,
    } as never
    expect(projectSettlementRate(project)).toBe(40)
    expect(projectOverviewFlags(project)).toEqual({ warnPending: true, warnStatus: true })
    expect(projectOverviewProgressCopy('cost', 12, 40)).toEqual({
      left: '进度 12%',
      right: '结算率 40%',
    })
    expect(clampProgressPercent(120)).toBe(100)
  })
})

import type { EpcProjectRecord, PmDomain, PmWorkItemPriority } from '@toolman/shared'

import { daysFromNow, type DemoWorkItemSeed } from './pm-seed-types'

export function buildProgressWorkItemSeeds(mock: EpcProjectRecord): DemoWorkItemSeed[] {
  const riskPriority: PmWorkItemPriority =
    mock.status === 'critical' ? 'urgent' : mock.status === 'warning' ? 'high' : 'normal'
  return [
    {
      key: 'phase',
      type: 'milestone',
      title: `${mock.planPhase}阶段主线`,
      status: mock.progressPercent >= 95 ? 'done' : 'in_progress',
      priority: riskPriority,
      progressPercent: mock.progressPercent,
      sortOrder: 0,
      description: `当前阶段 ${mock.planPhase}`,
      startDate: daysFromNow(-30),
      dueDate: mock.status === 'critical' ? daysFromNow(-2) : daysFromNow(14),
    },
    {
      key: 'review',
      type: 'task',
      title: `${mock.period} 进度计划复核`,
      status: mock.progressPercent >= 50 ? 'done' : 'in_progress',
      priority: 'normal',
      progressPercent: Math.min(mock.progressPercent + 10, 100),
      sortOrder: 1,
      assignee: '计划工程师',
      startDate: daysFromNow(-14),
      dueDate: daysFromNow(7),
    },
    {
      key: 'critical',
      type: 'task',
      title: '关键路径偏差分析',
      status: mock.status === 'normal' ? 'todo' : 'in_progress',
      priority: riskPriority,
      progressPercent: mock.status === 'critical' ? 35 : 0,
      sortOrder: 2,
      startDate: daysFromNow(-3),
      dueDate: mock.status !== 'normal' ? daysFromNow(3) : undefined,
    },
    {
      key: 'acceptance',
      type: 'milestone',
      title: `${mock.region}区域联调验收`,
      status: mock.progressPercent >= 90 ? 'in_progress' : 'todo',
      priority: 'normal',
      progressPercent: Math.max(mock.progressPercent - 15, 0),
      sortOrder: 3,
      startDate: daysFromNow(30),
      dueDate: daysFromNow(60),
    },
  ]
}

export function buildCostWorkItemSeeds(mock: EpcProjectRecord): DemoWorkItemSeed[] {
  const settlementRate = Math.round((mock.settledAmount / mock.contractValue) * 100)
  const riskPriority: PmWorkItemPriority =
    mock.status === 'critical' ? 'urgent' : mock.pendingAmount > 10_000_000 ? 'high' : 'normal'
  return [
    {
      key: 'wbs',
      type: 'wbs_node',
      title: `${mock.code} 成本 WBS`,
      status: 'in_progress',
      priority: 'normal',
      progressPercent: settlementRate,
      sortOrder: 0,
    },
    {
      key: 'ipc',
      parentKey: 'wbs',
      type: 'task',
      title: 'IPC 进度款申报核对',
      status: mock.pendingAmount > 0 ? 'in_progress' : 'done',
      priority: riskPriority,
      progressPercent: settlementRate,
      sortOrder: 1,
      description: `待付 ${(mock.pendingAmount / 10_000).toFixed(1)} 万`,
      assignee: '商务经理',
      dueDate: mock.pendingAmount > 0 ? daysFromNow(5) : undefined,
    },
    {
      key: 'ledger',
      parentKey: 'wbs',
      type: 'task',
      title: '合同变更与签证台账同步',
      status: mock.status === 'normal' ? 'done' : 'in_progress',
      priority: 'normal',
      progressPercent: mock.status === 'normal' ? 100 : 60,
      sortOrder: 2,
    },
    {
      key: 'settlement',
      parentKey: 'wbs',
      type: 'milestone',
      title: `结算完成率 ${settlementRate}%`,
      status: settlementRate >= 90 ? 'done' : 'in_progress',
      priority: settlementRate < 50 ? 'high' : 'normal',
      progressPercent: settlementRate,
      sortOrder: 3,
    },
    {
      key: 'variance',
      parentKey: 'wbs',
      type: 'task',
      title: `${mock.period} 成本偏差预警复核`,
      status: mock.status === 'critical' ? 'in_progress' : 'todo',
      priority: riskPriority,
      progressPercent: mock.status === 'critical' ? 40 : 0,
      sortOrder: 4,
      dueDate: mock.status === 'critical' ? daysFromNow(-1) : undefined,
    },
  ]
}

export function buildResourceWorkItemSeeds(mock: EpcProjectRecord): DemoWorkItemSeed[] {
  const riskPriority: PmWorkItemPriority =
    mock.status === 'critical' ? 'urgent' : mock.status === 'warning' ? 'high' : 'normal'
  return [
    {
      key: 'wbs',
      type: 'wbs_node',
      title: `${mock.code} 资源计划`,
      status: 'in_progress',
      priority: 'normal',
      progressPercent: 55,
      sortOrder: 0,
      metadata: { resourceType: '人力', quantity: 120, unit: '人·天' },
    },
    {
      key: 'crew',
      parentKey: 'wbs',
      type: 'task',
      title: '主体施工班组调配',
      status: 'in_progress',
      priority: riskPriority,
      progressPercent: 70,
      sortOrder: 1,
      assignee: '资源经理',
      metadata: { resourceType: '人力', quantity: 48, unit: '人' },
    },
    {
      key: 'equipment',
      parentKey: 'wbs',
      type: 'task',
      title: '关键设备进场协调',
      status: mock.status === 'critical' ? 'blocked' : 'in_progress',
      priority: riskPriority,
      progressPercent: mock.status === 'critical' ? 30 : 60,
      sortOrder: 2,
      assignee: '设备主管',
      dueDate: daysFromNow(mock.status === 'critical' ? -1 : 10),
      metadata: { resourceType: '设备', quantity: 6, unit: '台套' },
    },
    {
      key: 'material',
      parentKey: 'wbs',
      type: 'task',
      title: '主材到货与堆场安排',
      status: 'todo',
      priority: 'normal',
      progressPercent: 20,
      sortOrder: 3,
      metadata: { resourceType: '物料', quantity: 3200, unit: '吨' },
    },
  ]
}

export function buildCoreWorkItemSeeds(
  mock: EpcProjectRecord,
  domain: PmDomain,
): DemoWorkItemSeed[] | null {
  if (domain === 'progress_management') return buildProgressWorkItemSeeds(mock)
  if (domain === 'cost_management') return buildCostWorkItemSeeds(mock)
  if (domain === 'resource_management') return buildResourceWorkItemSeeds(mock)
  return null
}

import type { EpcProjectRecord, PmDomain, PmWorkItemPriority } from '@toolman/shared'

import { daysFromNow, type DemoWorkItemSeed } from './pm-seed-types'

export function buildSecurityWorkItemSeeds(mock: EpcProjectRecord): DemoWorkItemSeed[] {
  const riskPriority: PmWorkItemPriority =
    mock.status === 'critical' ? 'urgent' : mock.status === 'warning' ? 'high' : 'normal'
  return [
    {
      key: 'wbs',
      type: 'wbs_node',
      title: `${mock.code} 安全质量`,
      status: 'in_progress',
      priority: 'normal',
      progressPercent: 65,
      sortOrder: 0,
      metadata: { hazardLevel: mock.status === 'critical' ? '重大' : '一般' },
    },
    {
      key: 'inspect',
      parentKey: 'wbs',
      type: 'task',
      title: '周度 HSE 巡检',
      status: 'in_progress',
      priority: 'normal',
      progressPercent: 80,
      sortOrder: 1,
      assignee: '安全工程师',
      metadata: {
        hazardLevel: '一般',
        inspectionDate: daysFromNow(-3),
        rectificationDeadline: daysFromNow(7),
      },
    },
    {
      key: 'hazard',
      parentKey: 'wbs',
      type: 'issue',
      title: '高处作业防护整改',
      status: mock.status !== 'normal' ? 'in_progress' : 'done',
      priority: riskPriority,
      progressPercent: mock.status === 'critical' ? 40 : 90,
      sortOrder: 2,
      assignee: '施工经理',
      dueDate: mock.status !== 'normal' ? daysFromNow(2) : undefined,
      metadata: {
        hazardLevel: mock.status === 'critical' ? '重大' : '较大',
        inspectionDate: daysFromNow(-5),
        rectificationDeadline: daysFromNow(3),
      },
    },
    {
      key: 'accept',
      parentKey: 'wbs',
      type: 'milestone',
      title: '安全验收节点',
      status: 'todo',
      priority: 'high',
      progressPercent: 0,
      sortOrder: 3,
      dueDate: daysFromNow(30),
      metadata: { hazardLevel: '一般', inspectionDate: daysFromNow(28) },
    },
  ]
}

export function buildQualityWorkItemSeeds(mock: EpcProjectRecord): DemoWorkItemSeed[] {
  return [
    {
      key: 'wbs',
      type: 'wbs_node',
      title: `${mock.code} 测量试验`,
      status: 'in_progress',
      priority: 'normal',
      progressPercent: 72,
      sortOrder: 0,
      metadata: { testType: '混凝土', result: '合格' },
    },
    {
      key: 'concrete',
      parentKey: 'wbs',
      type: 'task',
      title: '主体结构混凝土试块送检',
      status: 'in_progress',
      priority: 'high',
      progressPercent: 85,
      sortOrder: 1,
      assignee: '试验工程师',
      metadata: { testType: '混凝土', specimenId: `${mock.code}-C35-01`, result: '合格' },
    },
    {
      key: 'survey',
      parentKey: 'wbs',
      type: 'task',
      title: '关键轴线测量放线复核',
      status: 'done',
      priority: 'normal',
      progressPercent: 100,
      sortOrder: 2,
      assignee: '测量员',
      metadata: { testType: '测量', specimenId: `${mock.code}-SV-12`, result: '合格' },
    },
    {
      key: 'retest',
      parentKey: 'wbs',
      type: 'issue',
      title: '钢筋连接复检',
      status: mock.status === 'warning' ? 'in_progress' : 'todo',
      priority: mock.status === 'warning' ? 'high' : 'normal',
      progressPercent: mock.status === 'warning' ? 50 : 0,
      sortOrder: 3,
      metadata: {
        testType: '钢筋',
        specimenId: `${mock.code}-RB-07`,
        result: mock.status === 'warning' ? '待复检' : '合格',
      },
    },
  ]
}

export function buildArchiveWorkItemSeeds(mock: EpcProjectRecord): DemoWorkItemSeed[] {
  return [
    {
      key: 'wbs',
      type: 'wbs_node',
      title: `${mock.code} 档案清单`,
      status: 'in_progress',
      priority: 'normal',
      progressPercent: 45,
      sortOrder: 0,
      metadata: { docCategory: '竣工', version: 'v0.3' },
    },
    {
      key: 'design',
      parentKey: 'wbs',
      type: 'task',
      title: '设计变更汇编',
      status: 'in_progress',
      priority: 'normal',
      progressPercent: 60,
      sortOrder: 1,
      metadata: { docCategory: '设计', version: 'v2.1' },
    },
    {
      key: 'construction',
      parentKey: 'wbs',
      type: 'task',
      title: '施工记录归档',
      status: 'todo',
      priority: 'normal',
      progressPercent: 30,
      sortOrder: 2,
      metadata: { docCategory: '施工', version: 'v1.0' },
    },
    {
      key: 'handover',
      parentKey: 'wbs',
      type: 'milestone',
      title: '竣工资料移交包',
      status: 'todo',
      priority: 'high',
      progressPercent: 10,
      sortOrder: 3,
      dueDate: daysFromNow(90),
      metadata: { docCategory: '竣工', version: 'draft' },
    },
  ]
}

export function buildKeyProjectWorkItemSeeds(mock: EpcProjectRecord): DemoWorkItemSeed[] {
  const riskPriority: PmWorkItemPriority =
    mock.status === 'critical' ? 'urgent' : mock.status === 'warning' ? 'high' : 'normal'
  return [
    {
      key: 'wbs',
      type: 'wbs_node',
      title: `${mock.code} 重点协调`,
      status: 'in_progress',
      priority: riskPriority,
      progressPercent: mock.progressPercent,
      sortOrder: 0,
      metadata: { coordinationLevel: '集团', stakeholder: 'EPC 指挥部' },
    },
    {
      key: 'monthly',
      parentKey: 'wbs',
      type: 'milestone',
      title: `${mock.period} 月度协调会`,
      status: 'in_progress',
      priority: riskPriority,
      progressPercent: 50,
      sortOrder: 1,
      assignee: '项目经理',
      dueDate: daysFromNow(7),
      metadata: { coordinationLevel: '区域', stakeholder: mock.region },
    },
    {
      key: 'risk',
      parentKey: 'wbs',
      type: 'issue',
      title: '关键风险项升级跟踪',
      status: mock.status !== 'normal' ? 'in_progress' : 'todo',
      priority: riskPriority,
      progressPercent: mock.status === 'critical' ? 35 : 0,
      sortOrder: 2,
      metadata: { coordinationLevel: '集团', stakeholder: '业主代表' },
    },
  ]
}

export function buildOpsWorkItemSeeds(
  mock: EpcProjectRecord,
  domain: PmDomain,
): DemoWorkItemSeed[] | null {
  if (domain === 'security_management') return buildSecurityWorkItemSeeds(mock)
  if (domain === 'quality_management') return buildQualityWorkItemSeeds(mock)
  if (domain === 'archive_management') return buildArchiveWorkItemSeeds(mock)
  if (domain === 'key_projects') return buildKeyProjectWorkItemSeeds(mock)
  return null
}

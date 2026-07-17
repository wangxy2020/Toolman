import type { EpcProjectRecord, PmDomain, PmWorkItemPriority, PmWorkItemStatus, PmWorkItemType } from '@toolman/shared'
import { MOCK_EPC_PROJECTS, PM_VERTICAL_DOMAINS } from '@toolman/shared'
import {
  PmProjectRepository,
  PmWorkItemRelationRepository,
  PmWorkItemRepository,
} from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'

const SEEDABLE_DOMAINS: PmDomain[] = ['cost_management', 'progress_management', ...PM_VERTICAL_DOMAINS]

/** Canonical domain for the shared 6-project demo portfolio. */
export const PM_DEMO_PORTFOLIO_DOMAIN: PmDomain = 'progress_management'

type DemoWorkItemSeed = {
  key: string
  parentKey?: string
  type: PmWorkItemType
  title: string
  status: PmWorkItemStatus
  priority: PmWorkItemPriority
  progressPercent: number
  sortOrder: number
  description?: string
  assignee?: string
  startDate?: number
  dueDate?: number
  metadata?: Record<string, unknown>
}

function daysFromNow(days: number): number {
  return Date.now() + days * 24 * 60 * 60 * 1000
}

function isMockSeedProject(metadata: Record<string, unknown> | undefined): boolean {
  return metadata?.source === 'mock_seed'
}

function mockProjectKey(metadata: Record<string, unknown> | undefined, code: string): string {
  const mockId = metadata?.mockProjectId
  return typeof mockId === 'string' && mockId.length > 0 ? mockId : code
}

/**
 * Soft-delete duplicate mock_seed projects so each demo code exists once.
 * Prefers the progress_management copy (canonical portfolio domain).
 */
export function pruneDuplicatePmDemoProjects(workspaceId: string): number {
  const projectRepo = new PmProjectRepository(getDatabase())
  const workItemRepo = new PmWorkItemRepository(getDatabase())
  const relationRepo = new PmWorkItemRelationRepository(getDatabase())

  const mockProjects = projectRepo
    .listByWorkspace(workspaceId, { limit: 500 })
    .filter((project) => isMockSeedProject(project.metadata))

  const groups = new Map<string, typeof mockProjects>()
  for (const project of mockProjects) {
    const key = mockProjectKey(project.metadata, project.code)
    const group = groups.get(key) ?? []
    group.push(project)
    groups.set(key, group)
  }

  let removed = 0
  for (const group of groups.values()) {
    if (group.length <= 1) continue
    const ranked = [...group].sort((left, right) => {
      const leftCanonical = left.domain === PM_DEMO_PORTFOLIO_DOMAIN ? 0 : 1
      const rightCanonical = right.domain === PM_DEMO_PORTFOLIO_DOMAIN ? 0 : 1
      if (leftCanonical !== rightCanonical) return leftCanonical - rightCanonical
      return right.updatedAt - left.updatedAt
    })
    const [, ...duplicates] = ranked
    for (const duplicate of duplicates) {
      const items = workItemRepo.list({
        workspaceId,
        projectId: duplicate.id,
        limit: 5000,
      })
      for (const item of items) {
        workItemRepo.softDelete(item.id)
      }
      for (const relation of relationRepo.listByProject(duplicate.id, workspaceId)) {
        relationRepo.softDelete(relation.id)
      }
      projectRepo.softDelete(duplicate.id)
      removed += 1
    }
  }
  return removed
}

function createDemoProject(
  repo: PmProjectRepository,
  workspaceId: string,
  mock: EpcProjectRecord,
): void {
  repo.create({
    workspaceId,
    code: mock.code,
    name: mock.name,
    status: mock.status === 'critical' ? 'on_hold' : 'active',
    domain: PM_DEMO_PORTFOLIO_DOMAIN,
    description: mock.period,
    metadata: {
      source: 'mock_seed',
      mockProjectId: mock.id,
      contractValue: mock.contractValue,
      settledAmount: mock.settledAmount,
      pendingAmount: mock.pendingAmount,
      progressPercent: mock.progressPercent,
      planPhase: mock.planPhase,
      period: mock.period,
      epcStatus: mock.status,
      region: mock.region,
    },
  })
}

/**
 * Ensure the shared demo portfolio exists (exactly one row per MOCK_EPC_PROJECTS code).
 * Domain argument is ignored for project rows — work items stay domain-scoped.
 */
export function ensurePmDemoProjects(workspaceId: string, _domain?: PmDomain): void {
  pruneDuplicatePmDemoProjects(workspaceId)

  const repo = new PmProjectRepository(getDatabase())
  const existingMock = repo
    .listByWorkspace(workspaceId, { limit: 500 })
    .filter((project) => isMockSeedProject(project.metadata))
  const existingCodes = new Set(existingMock.map((project) => project.code))

  for (const mock of MOCK_EPC_PROJECTS) {
    if (existingCodes.has(mock.code)) continue
    createDemoProject(repo, workspaceId, mock)
  }
}

export function buildDemoWorkItemSeeds(
  mock: EpcProjectRecord,
  domain: PmDomain,
): DemoWorkItemSeed[] {
  if (domain === 'progress_management') {
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

  if (domain === 'cost_management') {
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

  if (domain === 'resource_management') {
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

  if (domain === 'security_management') {
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

  if (domain === 'quality_management') {
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

  if (domain === 'archive_management') {
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

  if (domain === 'key_projects') {
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

  return []
}

export function ensurePmDemoWorkItems(
  workspaceId: string,
  projectId: string,
  domain: PmDomain,
): void {
  if (!SEEDABLE_DOMAINS.includes(domain)) {
    return
  }

  const workItemRepo = new PmWorkItemRepository(getDatabase())
  const project = new PmProjectRepository(getDatabase()).getById(projectId)
  if (!project || project.workspaceId !== workspaceId) {
    return
  }

  const mock = MOCK_EPC_PROJECTS.find((entry) => entry.code === project.code)
  if (!mock) {
    return
  }

  // Existing demo DBs: drop the legacy progress WBS wrapper under the project root.
  if (domain === 'progress_management' && isMockSeedProject(project.metadata)) {
    stripDemoProgressWbsNode(workItemRepo, workspaceId, projectId)
  }

  const existing = workItemRepo.list({ workspaceId, projectId, domain, limit: 1 })
  if (existing.length > 0) {
    return
  }

  const idByKey = new Map<string, string>()
  const seeds = buildDemoWorkItemSeeds(mock, domain)
  for (const itemSeed of seeds) {
    const created = workItemRepo.create({
      workspaceId,
      projectId,
      domain,
      parentId: itemSeed.parentKey ? idByKey.get(itemSeed.parentKey) : undefined,
      type: itemSeed.type,
      title: itemSeed.title,
      status: itemSeed.status,
      priority: itemSeed.priority,
      progressPercent: itemSeed.progressPercent,
      sortOrder: itemSeed.sortOrder,
      description: itemSeed.description,
      assignee: itemSeed.assignee,
      startDate: itemSeed.startDate,
      dueDate: itemSeed.dueDate,
      metadata: {
        source: 'mock_seed',
        mockProjectId: mock.id,
        seedKey: itemSeed.key,
        ...itemSeed.metadata,
      },
    })
    idByKey.set(itemSeed.key, created.id)
  }

  if (domain === 'progress_management') {
    ensurePmDemoRelations(workspaceId, projectId, idByKey)
  }
}

/**
 * Remove the obsolete `${code} 进度 WBS` seed row and promote its children to roots.
 * Safe no-op when the wrapper was never created or already removed.
 */
function stripDemoProgressWbsNode(
  workItemRepo: PmWorkItemRepository,
  workspaceId: string,
  projectId: string,
): void {
  const items = workItemRepo.list({
    workspaceId,
    projectId,
    domain: 'progress_management',
    limit: 500,
  })
  const wbs = items.find((item) => {
    if (item.metadata?.seedKey !== 'wbs') return false
    if (item.metadata?.source !== 'mock_seed') return false
    return item.type === 'wbs_node' || item.title.includes('进度 WBS')
  })
  if (!wbs) return

  for (const item of items) {
    if (item.parentId !== wbs.id) continue
    workItemRepo.update(item.id, { parentId: null })
  }
  workItemRepo.softDelete(wbs.id)
}

export function ensurePmDemoRelations(
  workspaceId: string,
  projectId: string,
  idByKey: Map<string, string>,
): void {
  const relationRepo = new PmWorkItemRelationRepository(getDatabase())
  const existing = relationRepo.listByProject(projectId, workspaceId)
  const linked = new Set(
    existing.map((relation) => `${relation.fromWorkItemId}->${relation.toWorkItemId}`),
  )

  // Always ensure the demo critical-path chain exists (add only missing FS links).
  const chain = ['phase', 'review', 'critical', 'acceptance'] as const
  for (let index = 0; index < chain.length - 1; index += 1) {
    const fromId = idByKey.get(chain[index]!)
    const toId = idByKey.get(chain[index + 1]!)
    if (!fromId || !toId) continue
    const key = `${fromId}->${toId}`
    if (linked.has(key)) continue
    relationRepo.create({
      workspaceId,
      projectId,
      fromWorkItemId: fromId,
      toWorkItemId: toId,
      type: 'FS',
    })
    linked.add(key)
  }
}

/** Rebuild seed-key map from existing demo work items and repair missing FS links. */
export function ensurePmDemoRelationsForProject(workspaceId: string, projectId: string): void {
  const workItemRepo = new PmWorkItemRepository(getDatabase())
  const items = workItemRepo.list({ workspaceId, projectId, domain: 'progress_management', limit: 500 })
  const idByKey = new Map<string, string>()
  for (const item of items) {
    const seedKey = item.metadata?.seedKey
    if (typeof seedKey === 'string' && seedKey.length > 0) {
      idByKey.set(seedKey, item.id)
    }
  }
  if (idByKey.size === 0) return
  ensurePmDemoRelations(workspaceId, projectId, idByKey)
}

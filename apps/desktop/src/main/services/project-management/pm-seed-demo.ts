import type { EpcProjectRecord, PmDomain } from '@toolman/shared'
import { MOCK_EPC_PROJECTS, PM_BUILTIN_EMP_2401 } from '@toolman/shared'
import {
  PmProjectRepository,
  PmWorkItemRelationRepository,
  PmWorkItemRepository,
} from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'
import { ensurePmBuiltinEmp2401 } from './pm-seed-emp2401'
import {
  PM_DEMO_PORTFOLIO_DOMAIN,
  SEEDABLE_DOMAINS,
  isMockSeedProject,
  mockProjectKey,
  type DemoWorkItemSeed,
} from './pm-seed-types'
import { buildCoreWorkItemSeeds } from './pm-seed-work-items-core'
import { buildOpsWorkItemSeeds } from './pm-seed-work-items-ops'

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
 * Also ensures the built-in EMP-2401 owner-managed master-plan sample.
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

  ensurePmBuiltinEmp2401(workspaceId)
}

export function buildDemoWorkItemSeeds(
  mock: EpcProjectRecord,
  domain: PmDomain,
): DemoWorkItemSeed[] {
  return (
    buildCoreWorkItemSeeds(mock, domain) ??
    buildOpsWorkItemSeeds(mock, domain) ??
    []
  )
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

  if (project.code === PM_BUILTIN_EMP_2401.code) {
    ensurePmBuiltinEmp2401(workspaceId)
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

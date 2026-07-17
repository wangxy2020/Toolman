import {
  PmWorkItemCreateInputSchema,
  PmWorkItemDeleteInputSchema,
  PmWorkItemGetInputSchema,
  PmWorkItemListInputSchema,
  PmWorkItemUpdateInputSchema,
  PM_VERTICAL_DOMAINS,
} from '@toolman/shared'
import { PmProjectRepository, PmWorkItemRepository } from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'
import { assertValidPmWorkItemParent } from './pm-work-item-hierarchy'
import { ensurePmDemoProjects, ensurePmDemoWorkItems } from './pm-seed.service'

function getProjectRepo(): PmProjectRepository {
  return new PmProjectRepository(getDatabase())
}

function getWorkItemRepo(): PmWorkItemRepository {
  return new PmWorkItemRepository(getDatabase())
}

export function listPmWorkItems(input: unknown) {
  const data = PmWorkItemListInputSchema.parse(input)

  ensurePmDemoProjects(data.workspaceId, data.domain)
  const portfolio = getProjectRepo().listByWorkspace(data.workspaceId, { limit: 500 })

  if (data.urgentOnly || data.domain === 'all_projects' || data.domain === 'urgent_tasks') {
    for (const project of portfolio) {
      ensurePmDemoWorkItems(data.workspaceId, project.id, 'cost_management')
      ensurePmDemoWorkItems(data.workspaceId, project.id, 'progress_management')
    }
  } else if (
    data.domain &&
    (data.domain === 'cost_management' ||
      data.domain === 'progress_management' ||
      (PM_VERTICAL_DOMAINS as readonly string[]).includes(data.domain))
  ) {
    for (const project of portfolio) {
      ensurePmDemoWorkItems(data.workspaceId, project.id, data.domain)
    }
  } else if (data.projectId && data.domain) {
    ensurePmDemoWorkItems(data.workspaceId, data.projectId, data.domain)
  }

  const items = getWorkItemRepo().list({
    workspaceId: data.workspaceId,
    projectId: data.projectId,
    parentId: data.parentId,
    rootOnly: data.rootOnly,
    domain: data.domain,
    status: data.status,
    priority: data.priority,
    type: data.type,
    assignee: data.assignee,
    urgentOnly: data.urgentOnly,
    limit: data.limit,
  })
  return { items }
}

export function getPmWorkItem(input: unknown) {
  const data = PmWorkItemGetInputSchema.parse(input)
  const item = getWorkItemRepo().getById(data.id)
  if (!item) {
    throw new Error('工作项不存在')
  }
  return item
}

export function createPmWorkItem(input: unknown) {
  const data = PmWorkItemCreateInputSchema.parse(input)
  const project = getProjectRepo().getById(data.projectId)
  if (!project) {
    throw new Error('所属项目不存在')
  }
  if (project.workspaceId !== data.workspaceId) {
    throw new Error('工作区与项目不匹配')
  }
  assertValidPmWorkItemParent({
    workspaceId: data.workspaceId,
    projectId: data.projectId,
    parentId: data.parentId,
  })
  const created = getWorkItemRepo().create({
    workspaceId: data.workspaceId,
    projectId: data.projectId,
    parentId: data.parentId,
    type: data.type,
    title: data.title,
    status: data.status,
    priority: data.priority,
    domain: data.domain,
    assignee: data.assignee,
    description: data.description,
    startDate: data.startDate,
    dueDate: data.dueDate,
    progressPercent: data.progressPercent,
    sortOrder: data.sortOrder,
    metadata: data.metadata,
  })
  return created
}

export function updatePmWorkItem(input: unknown) {
  const data = PmWorkItemUpdateInputSchema.parse(input)
  const existing = getWorkItemRepo().getById(data.id)
  if (!existing) {
    throw new Error('工作项不存在')
  }
  if (data.parentId !== undefined) {
    assertValidPmWorkItemParent({
      workspaceId: existing.workspaceId,
      projectId: existing.projectId,
      workItemId: existing.id,
      parentId: data.parentId,
    })
  }
  const updated = getWorkItemRepo().update(data.id, {
    parentId: data.parentId,
    type: data.type,
    title: data.title,
    status: data.status,
    priority: data.priority,
    domain: data.domain,
    assignee: data.assignee,
    description: data.description,
    startDate: data.startDate,
    dueDate: data.dueDate,
    progressPercent: data.progressPercent,
    sortOrder: data.sortOrder,
    metadata: data.metadata,
  })
  if (!updated) {
    throw new Error('工作项不存在')
  }
  return updated
}

export function deletePmWorkItem(input: unknown) {
  const data = PmWorkItemDeleteInputSchema.parse(input)
  const deleted = getWorkItemRepo().softDelete(data.id)
  if (!deleted) {
    throw new Error('工作项不存在')
  }
  return { ok: true as const }
}

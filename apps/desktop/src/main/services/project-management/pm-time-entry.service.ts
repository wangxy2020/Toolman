import {
  PmTimeEntryCreateInputSchema,
  PmTimeEntryDeleteInputSchema,
  PmTimeEntryListInputSchema,
  PmTimeEntryUpdateInputSchema,
} from '@toolman/shared'
import { PmProjectRepository, PmTimeEntryRepository } from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'
import { ensurePmDemoProjects } from './pm-seed.service'

function getTimeEntryRepo(): PmTimeEntryRepository {
  return new PmTimeEntryRepository(getDatabase())
}

function getProjectRepo(): PmProjectRepository {
  return new PmProjectRepository(getDatabase())
}

function ensurePmDemoTimeEntries(workspaceId: string, projectId: string): void {
  const repo = getTimeEntryRepo()
  const existing = repo.list({ workspaceId, projectId, limit: 1 })
  if (existing.length > 0) return

  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  repo.create({
    workspaceId,
    projectId,
    assignee: '现场工程师',
    spentHours: 6,
    workDate: now - day,
    description: '进度协调会议',
  })
  repo.create({
    workspaceId,
    projectId,
    assignee: '商务经理',
    spentHours: 3.5,
    workDate: now - 2 * day,
    description: 'IPC 资料整理',
  })
}

export function listPmTimeEntries(input: unknown) {
  const data = PmTimeEntryListInputSchema.parse(input)
  if (data.projectId) {
    ensurePmDemoProjects(data.workspaceId, 'cost_management')
    ensurePmDemoTimeEntries(data.workspaceId, data.projectId)
  }
  const entries = getTimeEntryRepo().list({
    workspaceId: data.workspaceId,
    projectId: data.projectId,
    workItemId: data.workItemId,
    limit: data.limit,
  })
  return { entries }
}

export function createPmTimeEntry(input: unknown) {
  const data = PmTimeEntryCreateInputSchema.parse(input)
  const project = getProjectRepo().getById(data.projectId)
  if (!project || project.workspaceId !== data.workspaceId) {
    throw new Error('项目不存在或工作区不匹配')
  }
  const entry = getTimeEntryRepo().create({
    workspaceId: data.workspaceId,
    projectId: data.projectId,
    workItemId: data.workItemId,
    assignee: data.assignee,
    spentHours: data.spentHours,
    workDate: data.workDate,
    description: data.description,
    metadata: data.metadata,
  })
  return entry
}

export function updatePmTimeEntry(input: unknown) {
  const data = PmTimeEntryUpdateInputSchema.parse(input)
  const existing = getTimeEntryRepo().getById(data.id)
  if (!existing) {
    throw new Error('工时记录不存在')
  }
  const updated = getTimeEntryRepo().update(data.id, {
    workItemId: data.workItemId,
    assignee: data.assignee,
    spentHours: data.spentHours,
    workDate: data.workDate,
    description: data.description,
    metadata: data.metadata,
  })
  if (!updated) {
    throw new Error('工时记录不存在')
  }
  const project = getProjectRepo().getById(updated.projectId)
  if (project) {
  }
  return updated
}

export function deletePmTimeEntry(input: unknown) {
  const data = PmTimeEntryDeleteInputSchema.parse(input)
  const existing = getTimeEntryRepo().getById(data.id)
  const deleted = getTimeEntryRepo().softDelete(data.id)
  if (!deleted || !existing) {
    throw new Error('工时记录不存在')
  }
  const project = getProjectRepo().getById(existing.projectId)
  if (project) {
  }
  return { ok: true as const }
}

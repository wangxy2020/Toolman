import {
  markPendingAgentScheduleRevision,
  nextDefaultPmProjectCode,
  resolvePmWbsSuggestionDates,
  type PmProject,
  type PmWbsSuggestion,
} from '@toolman/shared'
import {
  PmProjectRepository,
  PmWorkItemRelationRepository,
  PmWorkItemRepository,
} from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'
import { createPmProject, updatePmProject } from './pm-project.service'
import { deletePmWorkItem } from './pm-work-item.service'

export function getWorkItemRepo(): PmWorkItemRepository {
  return new PmWorkItemRepository(getDatabase())
}

export function getRelationRepo(): PmWorkItemRelationRepository {
  return new PmWorkItemRelationRepository(getDatabase())
}

export function getProjectRepo(): PmProjectRepository {
  return new PmProjectRepository(getDatabase())
}

export function resolveDefaultParentId(projectId: string, workspaceId: string): string | undefined {
  const items = getWorkItemRepo().list({
    workspaceId,
    projectId,
    domain: 'progress_management',
    limit: 1000,
  })
  return items.find((item) => item.type === 'wbs_node')?.id ?? items[0]?.id
}

/** Soft-delete all progress work items and relations for a project (clear-and-rebuild). */
export function clearPmProjectPlanData(workspaceId: string, projectId: string): {
  deletedWorkItems: number
  deletedRelations: number
} {
  const relationRepo = getRelationRepo()
  const relations = relationRepo.listByProject(projectId, workspaceId)
  let deletedRelations = 0
  for (const relation of relations) {
    if (relationRepo.softDelete(relation.id)) {
      deletedRelations += 1
    }
  }

  const items = getWorkItemRepo().list({
    workspaceId,
    projectId,
    domain: 'progress_management',
    limit: 5000,
  })
  let deletedWorkItems = 0
  for (const item of items) {
    try {
      deletePmWorkItem({ id: item.id })
      deletedWorkItems += 1
    } catch {
      // skip already-deleted
    }
  }

  return { deletedWorkItems, deletedRelations }
}

export function findProjectByName(workspaceId: string, name: string): PmProject | undefined {
  const normalized = name.trim().toLowerCase()
  return getProjectRepo()
    .listByWorkspace(workspaceId, { limit: 500 })
    .find((project) => project.name.trim().toLowerCase() === normalized)
}

export function resolveOrCreateProject(data: {
  workspaceId: string
  projectId?: string
  createProject?: {
    name: string
    description?: string
    code?: string
    clearExisting?: boolean
  }
  projectPlan?: {
    planStart?: string
    planFinish?: string
    durationDays?: number
  }
}): { project: PmProject; cleared: boolean } {
  if (data.createProject) {
    const existing = findProjectByName(data.workspaceId, data.createProject.name)
    if (existing) {
      if (!data.createProject.clearExisting) {
        throw new Error(
          `项目名称「${data.createProject.name}」已存在。请确认后清空重建，或更换名称。`,
        )
      }
      clearPmProjectPlanData(data.workspaceId, existing.id)
      const metadata = {
        ...existing.metadata,
        ...(data.projectPlan?.planStart
          ? { planStartDate: data.projectPlan.planStart }
          : {}),
        ...(data.projectPlan?.planFinish
          ? { planFinishDate: data.projectPlan.planFinish }
          : {}),
        ...(data.projectPlan?.durationDays != null
          ? { planDurationDays: data.projectPlan.durationDays }
          : {}),
      }
      const updated = updatePmProject({
        id: existing.id,
        description: data.createProject.description ?? existing.description ?? null,
        metadata,
      })
      return { project: updated, cleared: true }
    }

    const existingCodes = getProjectRepo()
      .listByWorkspace(data.workspaceId, { limit: 500 })
      .map((project) => project.code)
    const created = createPmProject({
      workspaceId: data.workspaceId,
      code: data.createProject.code ?? nextDefaultPmProjectCode(existingCodes),
      name: data.createProject.name,
      domain: 'progress_management',
      status: 'active',
      description: data.createProject.description,
      metadata: {
        ...(data.projectPlan?.planStart
          ? { planStartDate: data.projectPlan.planStart }
          : {}),
        ...(data.projectPlan?.planFinish
          ? { planFinishDate: data.projectPlan.planFinish }
          : {}),
        ...(data.projectPlan?.durationDays != null
          ? { planDurationDays: data.projectPlan.durationDays }
          : {}),
      },
    })
    return { project: created, cleared: false }
  }

  if (!data.projectId) {
    throw new Error('缺少 projectId 或 createProject')
  }
  const project = getProjectRepo().getById(data.projectId)
  if (!project) {
    throw new Error('项目不存在')
  }
  return { project, cleared: false }
}

export function writebackProjectPlan(
  project: PmProject,
  options: {
    description?: string
    projectPlan?: {
      planStart?: string
      planFinish?: string
      durationDays?: number
    }
    suggestions: PmWbsSuggestion[]
  },
): PmProject {
  const plan = options.projectPlan
  let planStart = plan?.planStart
  let planFinish = plan?.planFinish
  if (!planStart || !planFinish) {
    const starts = options.suggestions
      .map((item) => resolvePmWbsSuggestionDates(item).startDate)
      .filter((value): value is number => value != null)
    const finishes = options.suggestions
      .map((item) => resolvePmWbsSuggestionDates(item).dueDate)
      .filter((value): value is number => value != null)
    if (!planStart && starts.length > 0) {
      planStart = new Date(Math.min(...starts)).toISOString().slice(0, 10)
    }
    if (!planFinish && finishes.length > 0) {
      planFinish = new Date(Math.max(...finishes)).toISOString().slice(0, 10)
    }
  }

  const metadata = markPendingAgentScheduleRevision({
    ...project.metadata,
    ...(planStart ? { planStartDate: planStart } : {}),
    ...(planFinish ? { planFinishDate: planFinish } : {}),
    ...(plan?.durationDays != null ? { planDurationDays: plan.durationDays } : {}),
  })

  return updatePmProject({
    id: project.id,
    description:
      options.description !== undefined
        ? options.description || null
        : project.description ?? null,
    metadata,
  })
}


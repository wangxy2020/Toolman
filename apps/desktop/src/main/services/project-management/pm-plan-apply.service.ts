import {
  markPendingAgentScheduleRevision,
  mergePmScheduleIntoWbsSuggestions,
  nextDefaultPmProjectCode,
  PmApplyWbsInputSchema,
  PmApplyScheduleInputSchema,
  parsePmScheduleDateToMs,
  pmWbsSuggestionsNeedTreeApply,
  resolvePmWbsSuggestionDates,
  type PmProject,
  type PmWbsSuggestion,
  type PmWorkItem,
} from '@toolman/shared'
import {
  PmProjectRepository,
  PmWorkItemRelationRepository,
  PmWorkItemRepository,
} from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'
import { createPmProject, updatePmProject } from './pm-project.service'
import { createPmRelation } from './pm-relation.service'
import { createPmWorkItem, deletePmWorkItem, updatePmWorkItem } from './pm-work-item.service'

function getWorkItemRepo(): PmWorkItemRepository {
  return new PmWorkItemRepository(getDatabase())
}

function getRelationRepo(): PmWorkItemRelationRepository {
  return new PmWorkItemRelationRepository(getDatabase())
}

function getProjectRepo(): PmProjectRepository {
  return new PmProjectRepository(getDatabase())
}

function resolveDefaultParentId(projectId: string, workspaceId: string): string | undefined {
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

function findProjectByName(workspaceId: string, name: string): PmProject | undefined {
  const normalized = name.trim().toLowerCase()
  return getProjectRepo()
    .listByWorkspace(workspaceId, { limit: 500 })
    .find((project) => project.name.trim().toLowerCase() === normalized)
}

function resolveOrCreateProject(data: {
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

function writebackProjectPlan(
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

function applyFlatWbs(
  workspaceId: string,
  projectId: string,
  parentWorkItemId: string | undefined,
  suggestions: PmWbsSuggestion[],
): PmWorkItem[] {
  const parentId = parentWorkItemId ?? resolveDefaultParentId(projectId, workspaceId)
  const existing = getWorkItemRepo().list({
    workspaceId,
    projectId,
    domain: 'progress_management',
    limit: 1000,
  })
  let sortOrder = existing.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1

  const created: PmWorkItem[] = []
  for (const suggestion of suggestions) {
    const dates = resolvePmWbsSuggestionDates(suggestion)
    const item = createPmWorkItem({
      workspaceId,
      projectId,
      parentId,
      domain: 'progress_management',
      type: suggestion.type ?? 'task',
      title: suggestion.title,
      priority: suggestion.priority ?? 'normal',
      startDate: dates.startDate,
      dueDate: dates.dueDate,
      sortOrder,
      metadata: {
        source: 'ai_wbs_apply',
        ...(suggestion.durationDays != null ? { durationDays: suggestion.durationDays } : {}),
      },
    })
    created.push(item)
    sortOrder += 1
  }
  return created
}

function applyTreeWbs(
  workspaceId: string,
  projectId: string,
  suggestions: PmWbsSuggestion[],
): { items: PmWorkItem[]; relationCount: number } {
  const existing = getWorkItemRepo().list({
    workspaceId,
    projectId,
    domain: 'progress_management',
    limit: 1000,
  })
  let sortOrder = existing.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1

  const idByTitle = new Map<string, string>()
  for (const item of existing) {
    idByTitle.set(item.title.trim().toLowerCase(), item.id)
  }

  const created: PmWorkItem[] = []
  for (const suggestion of suggestions) {
    const parentTitle = suggestion.parentTitle?.trim()
    let parentId: string | undefined
    if (parentTitle) {
      parentId = idByTitle.get(parentTitle.toLowerCase())
    }

    const dates = resolvePmWbsSuggestionDates(suggestion)
    const item = createPmWorkItem({
      workspaceId,
      projectId,
      parentId,
      domain: 'progress_management',
      type: suggestion.type ?? 'task',
      title: suggestion.title,
      priority: suggestion.priority ?? 'normal',
      startDate: dates.startDate,
      dueDate: dates.dueDate,
      sortOrder,
      metadata: {
        source: 'ai_wbs_apply',
        ...(suggestion.durationDays != null ? { durationDays: suggestion.durationDays } : {}),
      },
    })
    created.push(item)
    idByTitle.set(suggestion.title.trim().toLowerCase(), item.id)
    sortOrder += 1
  }

  let relationCount = 0
  for (const suggestion of suggestions) {
    const toId = idByTitle.get(suggestion.title.trim().toLowerCase())
    if (!toId || !suggestion.predecessors?.length) continue
    for (const predecessor of suggestion.predecessors) {
      const fromId = idByTitle.get(predecessor.title.trim().toLowerCase())
      if (!fromId || fromId === toId) continue
      try {
        createPmRelation({
          workspaceId,
          projectId,
          fromWorkItemId: fromId,
          toWorkItemId: toId,
          type: predecessor.type ?? 'FS',
          lagDays: predecessor.lagDays ?? 0,
        })
        relationCount += 1
      } catch {
        // skip invalid / duplicate edges
      }
    }
  }

  return { items: created, relationCount }
}

export function applyPmWbsSuggestions(input: unknown) {
  const data = PmApplyWbsInputSchema.parse(input)
  const { project, cleared } = resolveOrCreateProject({
    workspaceId: data.workspaceId,
    projectId: data.projectId,
    createProject: data.createProject,
    projectPlan: data.projectPlan,
  })

  const merged = mergePmScheduleIntoWbsSuggestions(
    data.suggestions,
    data.scheduleSuggestions ?? [],
  )

  const useTree =
    Boolean(data.createProject) ||
    cleared ||
    pmWbsSuggestionsNeedTreeApply(merged) ||
    Boolean(data.projectPlan)

  let created: PmWorkItem[]
  let relationCount = 0
  if (useTree) {
    const result = applyTreeWbs(data.workspaceId, project.id, merged)
    created = result.items
    relationCount = result.relationCount
  } else {
    created = applyFlatWbs(
      data.workspaceId,
      project.id,
      data.parentWorkItemId,
      merged,
    )
  }

  const updatedProject = writebackProjectPlan(project, {
    description: data.createProject?.description,
    projectPlan: data.projectPlan,
    suggestions: merged,
  })

  return {
    projectId: updatedProject.id,
    project: updatedProject,
    createdCount: created.length,
    relationCount,
    cleared,
    items: created,
  }
}

export function applyPmScheduleSuggestions(input: unknown) {
  const data = PmApplyScheduleInputSchema.parse(input)
  const items = getWorkItemRepo().list({
    workspaceId: data.workspaceId,
    projectId: data.projectId,
    domain: 'progress_management',
    limit: 1000,
  })

  const updated = []
  for (const suggestion of data.suggestions) {
    const normalizedTitle = suggestion.workItemTitle.trim().toLowerCase()
    const item = items.find((entry) => entry.title.trim().toLowerCase() === normalizedTitle)
    if (!item) continue

    const startDate = parsePmScheduleDateToMs(suggestion.suggestedStartDate)
    const dueDate = parsePmScheduleDateToMs(suggestion.suggestedDueDate)
    const next = updatePmWorkItem({
      id: item.id,
      startDate: startDate ?? null,
      dueDate: dueDate ?? null,
      description: suggestion.reason ?? item.description ?? null,
      metadata: {
        ...item.metadata,
        scheduleAppliedAt: Date.now(),
      },
    })
    updated.push(next)
  }

  if (updated.length > 0) {
    const project = getProjectRepo().getById(data.projectId)
    if (project) {
      updatePmProject({
        id: project.id,
        metadata: markPendingAgentScheduleRevision(project.metadata),
      })
    }
  }

  return { updatedCount: updated.length, items: updated, projectId: data.projectId }
}

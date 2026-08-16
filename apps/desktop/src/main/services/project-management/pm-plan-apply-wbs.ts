import {
  mergePmScheduleIntoWbsSuggestions,
  PmApplyWbsInputSchema,
  pmWbsSuggestionsNeedTreeApply,
  resolvePmWbsSuggestionDates,
  type PmWbsSuggestion,
  type PmWorkItem,
} from '@toolman/shared'

import { createPmRelation } from './pm-relation.service'
import { createPmWorkItem } from './pm-work-item.service'
import {
  getWorkItemRepo,
  resolveDefaultParentId,
  resolveOrCreateProject,
  writebackProjectPlan,
} from './pm-plan-apply-project'

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

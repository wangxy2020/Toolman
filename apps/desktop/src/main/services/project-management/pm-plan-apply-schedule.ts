import {
  markPendingAgentScheduleRevision,
  PmApplyScheduleInputSchema,
  parsePmScheduleDateToMs,
} from '@toolman/shared'

import { getProjectRepo, getWorkItemRepo } from './pm-plan-apply-project'
import { updatePmProject } from './pm-project.service'
import { updatePmWorkItem } from './pm-work-item.service'

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

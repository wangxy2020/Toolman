import {
  findPmWorkItemForAgentSuggestion,
  markPendingAgentScheduleRevision,
  mergeTaskCostAssignmentsByName,
  normalizeCostAssignmentSuggestion,
  PmApplyCostPlanInputSchema,
  readTaskCostAssignmentsFromMetadata,
  replaceTaskCostAssignmentsMetadata,
  resolvePmAgentResourceTypeLabel,
  type PmWorkItem,
} from '@toolman/shared'
import { PmProjectRepository, PmWorkItemRepository } from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'
import { updatePmProject } from './pm-project.service'
import { updatePmWorkItem } from './pm-work-item.service'
import { upsertSharedCostCatalog } from './pm-shared-cost-catalog.service'

function getWorkItemRepo(): PmWorkItemRepository {
  return new PmWorkItemRepository(getDatabase())
}

function getProjectRepo(): PmProjectRepository {
  return new PmProjectRepository(getDatabase())
}

export function applyPmCostPlanSuggestions(input: unknown) {
  const data = PmApplyCostPlanInputSchema.parse(input)
  const items = getWorkItemRepo().list({
    workspaceId: data.workspaceId,
    projectId: data.projectId,
    domain: 'progress_management',
    limit: 5000,
  })

  const catalogUpserts: Array<{
    type: string
    name: string
    unit?: string
    quantity?: number | null
    unitPrice?: number | null
  }> = []
  const upsertKeys = new Set<string>()
  const updated: PmWorkItem[] = []

  for (const suggestion of data.suggestions) {
    const item = findPmWorkItemForAgentSuggestion(items, suggestion)
    if (!item) continue

    const incoming = suggestion.assignments.map((entry) => normalizeCostAssignmentSuggestion(entry))
    for (const assignment of suggestion.assignments) {
      const type =
        assignment.type ??
        (assignment.typeLabel ? resolvePmAgentResourceTypeLabel(assignment.typeLabel) : null) ??
        'other'
      const name = assignment.name.trim()
      if (!name) continue
      const key = `${type}::${name.toLowerCase()}`
      if (upsertKeys.has(key)) continue
      upsertKeys.add(key)
      catalogUpserts.push({
        type,
        name,
        unit: assignment.unit,
        quantity: assignment.quantity ?? null,
        unitPrice: assignment.unitPrice ?? null,
      })
    }

    const existing = readTaskCostAssignmentsFromMetadata(item.metadata)
    const merged = mergeTaskCostAssignmentsByName(existing, incoming)
    const next = updatePmWorkItem({
      id: item.id,
      metadata: {
        ...replaceTaskCostAssignmentsMetadata(item.metadata, merged),
        costPlanAppliedAt: Date.now(),
      },
    })
    updated.push(next)
  }

  let catalogChanged = false
  if (catalogUpserts.length > 0) {
    const result = upsertSharedCostCatalog(
      data.workspaceId,
      catalogUpserts.map((entry) => ({
        type: entry.type as Parameters<typeof upsertSharedCostCatalog>[1][number]['type'],
        name: entry.name,
        unit: entry.unit,
        quantity: entry.quantity,
        unitPrice: entry.unitPrice,
      })),
    )
    catalogChanged = result.changed
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

  return {
    projectId: data.projectId,
    updatedCount: updated.length,
    items: updated,
    catalogUpserts,
    catalogChanged,
  }
}

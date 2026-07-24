import {
  findPmWorkItemForAgentSuggestion,
  markPendingAgentScheduleRevision,
  mergeTaskResourceAssignmentsByName,
  normalizeResourceAssignmentSuggestion,
  PmApplyResourcePlanInputSchema,
  readTaskResourceAssignmentsFromMetadata,
  replaceTaskResourceAssignmentsMetadata,
  resolvePmAgentResourceTypeLabel,
  type PmResourceCatalogUpsert,
  type PmWorkItem,
} from '@toolman/shared'
import { PmProjectRepository, PmWorkItemRepository } from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'
import { updatePmProject } from './pm-project.service'
import { updatePmWorkItem } from './pm-work-item.service'
import { upsertSharedResourceCatalog } from './pm-shared-resource-catalog.service'

function getWorkItemRepo(): PmWorkItemRepository {
  return new PmWorkItemRepository(getDatabase())
}

function getProjectRepo(): PmProjectRepository {
  return new PmProjectRepository(getDatabase())
}

export function applyPmResourcePlanSuggestions(input: unknown) {
  const data = PmApplyResourcePlanInputSchema.parse(input)
  const items = getWorkItemRepo().list({
    workspaceId: data.workspaceId,
    projectId: data.projectId,
    domain: 'progress_management',
    limit: 5000,
  })

  const catalogUpserts: PmResourceCatalogUpsert[] = []
  const upsertKeys = new Set<string>()
  const updated: PmWorkItem[] = []

  for (const suggestion of data.suggestions) {
    const item = findPmWorkItemForAgentSuggestion(items, suggestion)
    if (!item) continue

    const incoming = suggestion.assignments.map((entry) =>
      normalizeResourceAssignmentSuggestion(entry),
    )
    for (const assignment of suggestion.assignments) {
      const type =
        assignment.type ??
        (assignment.typeLabel
          ? resolvePmAgentResourceTypeLabel(assignment.typeLabel)
          : null) ??
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
        unitPrice: assignment.unitPrice ?? null,
      })
    }

    const existing = readTaskResourceAssignmentsFromMetadata(item.metadata)
    const merged = mergeTaskResourceAssignmentsByName(existing, incoming)
    const next = updatePmWorkItem({
      id: item.id,
      metadata: {
        ...replaceTaskResourceAssignmentsMetadata(item.metadata, merged),
        resourcePlanAppliedAt: Date.now(),
      },
    })
    updated.push(next)
  }

  let catalogChanged = false
  if (catalogUpserts.length > 0) {
    const result = upsertSharedResourceCatalog(data.workspaceId, catalogUpserts)
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

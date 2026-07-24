import { z } from 'zod'

import {
  costCatalogMatchKey,
  estimatePmAssignmentQuantityFromDuration,
  markPendingAgentScheduleRevision,
  matchPmCatalogNamesInTitle,
  mergeTaskCostAssignmentsByName,
  mergeTaskResourceAssignmentsByName,
  parseSharedCostCatalogRows,
  PM_PROJECT_COST_CATALOG_KEY,
  readTaskCostAssignmentsFromMetadata,
  readTaskResourceAssignmentsFromMetadata,
  replaceTaskCostAssignmentsMetadata,
  replaceTaskResourceAssignmentsMetadata,
  type PmAgentResourceType,
  type PmSharedCostCatalogRow,
  type PmTaskCostAssignment,
  type PmTaskResourceAssignment,
  type PmWorkItem,
} from '@toolman/shared'
import { PmProjectRepository, PmWorkItemRepository } from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'
import { updatePmProject } from './pm-project.service'
import { updatePmWorkItem } from './pm-work-item.service'
import { getSharedResourceCatalog } from './pm-shared-resource-catalog.service'
import { getSharedCostCatalog } from './pm-shared-cost-catalog.service'

export const PmSmartAssignInputSchema = z.object({
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  kind: z.enum(['resource', 'cost']),
})

export type PmSmartAssignInput = z.infer<typeof PmSmartAssignInputSchema>

function getWorkItemRepo(): PmWorkItemRepository {
  return new PmWorkItemRepository(getDatabase())
}

function getProjectRepo(): PmProjectRepository {
  return new PmProjectRepository(getDatabase())
}

/** Non-summary schedule items eligible for auto assignment (skip WBS grouping nodes). */
function isLeafPmWorkItem(item: PmWorkItem): boolean {
  return item.type === 'task' || item.type === 'milestone'
}

function smartAssignResources(workspaceId: string, projectId: string) {
  const items = getWorkItemRepo().list({
    workspaceId,
    projectId,
    domain: 'progress_management',
    limit: 5000,
  })
  const catalog = getSharedResourceCatalog(workspaceId)
  const catalogNames = catalog.rows.map((row) => row.name.trim()).filter(Boolean)
  const rowsByName = new Map<string, (typeof catalog.rows)[number]>()
  for (const row of catalog.rows) {
    const name = row.name.trim().toLowerCase()
    if (!name || rowsByName.has(name)) continue
    rowsByName.set(name, row)
  }

  const updated: PmWorkItem[] = []

  for (const item of items) {
    if (!isLeafPmWorkItem(item)) continue
    const existing = readTaskResourceAssignmentsFromMetadata(item.metadata)
    if (existing.length > 0) continue

    const matchedNames = matchPmCatalogNamesInTitle(item.title, catalogNames)
    if (matchedNames.length === 0) continue

    const quantity = estimatePmAssignmentQuantityFromDuration(item.startDate, item.dueDate)
    const incoming: PmTaskResourceAssignment[] = matchedNames.map((name) => {
      const row = rowsByName.get(name.toLowerCase())
      return {
        resourceId: row?.id ?? null,
        type: row?.type ?? null,
        name,
        quantity,
        note: '',
      }
    })

    const merged = mergeTaskResourceAssignmentsByName(existing, incoming)
    const next = updatePmWorkItem({
      id: item.id,
      metadata: replaceTaskResourceAssignmentsMetadata(item.metadata, merged),
    })
    updated.push(next)
  }

  return updated
}

function findCostCatalogRow(
  rows: readonly PmSharedCostCatalogRow[],
  type: PmAgentResourceType | null,
  name: string,
): PmSharedCostCatalogRow | undefined {
  const trimmed = name.trim()
  if (!trimmed) return undefined
  if (type) {
    const key = costCatalogMatchKey(type, trimmed)
    const byKey = rows.find((row) => costCatalogMatchKey(row.type, row.name) === key)
    if (byKey) return byKey
  }
  return rows.find((row) => row.name.trim().toLowerCase() === trimmed.toLowerCase())
}

function smartAssignCosts(workspaceId: string, projectId: string) {
  const items = getWorkItemRepo().list({
    workspaceId,
    projectId,
    domain: 'progress_management',
    limit: 5000,
  })
  const project = getProjectRepo().getById(projectId)
  const sharedRows = getSharedCostCatalog(workspaceId).rows
  const ownedRows = parseSharedCostCatalogRows(project?.metadata?.[PM_PROJECT_COST_CATALOG_KEY])

  const updated: PmWorkItem[] = []

  for (const item of items) {
    const resourceAssignments = readTaskResourceAssignmentsFromMetadata(item.metadata)
    if (resourceAssignments.length === 0) continue

    const existingCosts = readTaskCostAssignmentsFromMetadata(item.metadata)
    const incoming: PmTaskCostAssignment[] = []
    for (const assignment of resourceAssignments) {
      const name = assignment.name.trim()
      if (!name) continue
      const row =
        (ownedRows && findCostCatalogRow(ownedRows, assignment.type, name)) ??
        findCostCatalogRow(sharedRows, assignment.type, name)
      const quantity = assignment.quantity
      const unitPrice = row?.unitPrice ?? null
      const amount =
        quantity != null &&
        Number.isFinite(quantity) &&
        unitPrice != null &&
        Number.isFinite(unitPrice)
          ? quantity * unitPrice
          : null
      incoming.push({
        costId: row?.id ?? null,
        type: row?.type ?? assignment.type,
        name,
        amount,
        note: '',
      })
    }
    if (incoming.length === 0) continue

    const merged = mergeTaskCostAssignmentsByName(existingCosts, incoming)
    const next = updatePmWorkItem({
      id: item.id,
      metadata: replaceTaskCostAssignmentsMetadata(item.metadata, merged),
    })
    updated.push(next)
  }

  return updated
}

export function smartAssignPmWorkItems(input: unknown) {
  const data = PmSmartAssignInputSchema.parse(input)
  const updated =
    data.kind === 'resource'
      ? smartAssignResources(data.workspaceId, data.projectId)
      : smartAssignCosts(data.workspaceId, data.projectId)

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
    updatedCount: updated.length,
    items: updated,
  }
}

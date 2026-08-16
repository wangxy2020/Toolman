/** Resource column ordering and quantity upsert helpers. */

import {
  canonicalizeResourceName,
  type PmResourceRow,
} from '../resource/pm-resource-catalog'
import {
  resourceMatchKey,
  resourceTypeRank,
  type TaskResourceAssignment,
} from './pm-gantt-resource-assignment-types'

/**
 * Order「全部项目」resources for Gantt resource columns:
 * labor → auxiliary → material → equipment (then other types), then by name.
 */
export function orderResourcesForGanttColumns(
  catalog: readonly PmResourceRow[],
): PmResourceRow[] {
  return catalog
    .filter((row) => row.name.trim().length > 0)
    .slice()
    .sort((left, right) => {
      const typeDelta = resourceTypeRank(left.type) - resourceTypeRank(right.type)
      if (typeDelta !== 0) return typeDelta
      return left.name.localeCompare(right.name, 'zh')
    })
}

export function findAssignmentIndexForResource(
  assignments: readonly TaskResourceAssignment[],
  resource: PmResourceRow,
): number {
  const byId = assignments.findIndex(
    (entry) => entry.resourceId != null && entry.resourceId === resource.id,
  )
  if (byId >= 0) return byId
  const key = resourceMatchKey(resource.type, resource.name)
  const byTypeName = assignments.findIndex(
    (entry) => resourceMatchKey(entry.type, entry.name) === key,
  )
  if (byTypeName >= 0) return byTypeName
  // Catalog reclassification (e.g. material→auxiliary) leaves stale stored types.
  const name = canonicalizeResourceName(resource.name)
  if (!name) return -1
  return assignments.findIndex(
    (entry) => canonicalizeResourceName(entry.name) === name,
  )
}

/** Set / clear quantity for a catalog resource column (match by id or type+name). */
export function upsertResourceColumnQuantity(
  assignments: readonly TaskResourceAssignment[],
  resource: PmResourceRow,
  quantity: number | null,
): TaskResourceAssignment[] {
  const list = assignments.map((entry) => ({ ...entry }))
  const index = findAssignmentIndexForResource(list, resource)
  if (quantity == null) {
    if (index < 0) return list
    list.splice(index, 1)
    return list
  }
  if (index >= 0) {
    list[index] = {
      ...list[index]!,
      resourceId: resource.id,
      type: resource.type,
      name: resource.name,
      quantity,
    }
    return list
  }
  list.push({
    resourceId: resource.id,
    type: resource.type,
    name: resource.name,
    quantity,
    note: '',
  })
  return list
}

/** Resource catalog helpers for task assignments. */

import type { PmResourceRow, PmResourceType } from '../resource/pm-resource-catalog'
import { resolveAssignmentAgainstCatalog } from './pm-gantt-resource-assignment-metadata'
import {
  EMPTY_TASK_RESOURCE_ASSIGNMENT,
  isEmptyAssignment,
  resourceTypeRank,
  type TaskResourceAssignment,
} from './pm-gantt-resource-assignment-types'

/** Options for a type picker — keep resource-list order, only filter by type. */
export function catalogRowsForType(
  catalog: readonly PmResourceRow[],
  type: PmResourceType | null,
): PmResourceRow[] {
  const named = catalog.filter((row) => row.name.trim().length > 0)
  if (!type) return named
  return named.filter((row) => row.type === type)
}

/** True when the slot has a concrete catalog resource (name or id), not type-only draft. */
export function isAssignedResource(assignment: TaskResourceAssignment): boolean {
  return Boolean(assignment.resourceId || assignment.name.trim())
}

/**
 * Manually reorder assignments (popup up/down). Preserves relative order otherwise.
 * Indexes refer to the stored dense list (empty draft rows are not persisted).
 */
export function moveTaskResourceAssignment(
  assignments: readonly TaskResourceAssignment[],
  fromIndex: number,
  toIndex: number,
): TaskResourceAssignment[] {
  const list = assignments.map((entry) => ({ ...entry }))
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= list.length ||
    toIndex >= list.length ||
    fromIndex === toIndex
  ) {
    return list
  }
  const [entry] = list.splice(fromIndex, 1)
  if (!entry) return list
  list.splice(toIndex, 0, entry)
  return list
}

/**
 * Optional helper: order by labor → auxiliary → material → equipment, then name.
 * Not applied automatically — call only from explicit user actions if needed.
 */
export function orderAssignmentsByResourceCatalog(
  assignments: readonly TaskResourceAssignment[],
  catalog: readonly PmResourceRow[],
  maxSlots = Number.POSITIVE_INFINITY,
): TaskResourceAssignment[] {
  const ranked = assignments
    .map((entry) => resolveAssignmentAgainstCatalog(entry, catalog))
    .filter((entry) => isAssignedResource(entry))
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const typeDelta =
        resourceTypeRank(left.entry.type ?? 'other') -
        resourceTypeRank(right.entry.type ?? 'other')
      if (typeDelta !== 0) return typeDelta
      const nameDelta = left.entry.name
        .trim()
        .localeCompare(right.entry.name.trim(), 'zh')
      if (nameDelta !== 0) return nameDelta
      return left.index - right.index
    })
    .map(({ entry }) => ({ ...entry }))

  if (!Number.isFinite(maxSlots)) return ranked
  return ranked.slice(0, Math.max(0, Math.floor(maxSlots)))
}

export function catalogTypesInUse(catalog: readonly PmResourceRow[]): PmResourceType[] {
  const seen = new Set<PmResourceType>()
  const ordered: PmResourceType[] = []
  for (const row of catalog) {
    if (!row.name.trim() || seen.has(row.type)) continue
    seen.add(row.type)
    ordered.push(row.type)
  }
  return ordered
}

/** Count non-empty assignments, optionally limited to one resource type. */
export function countResourceAssignmentsForTypeFilter(
  assignments: readonly TaskResourceAssignment[],
  typeFilter: 'all' | PmResourceType,
): number {
  let count = 0
  for (const entry of assignments) {
    if (isEmptyAssignment(entry)) continue
    if (typeFilter !== 'all' && entry.type !== typeFilter) continue
    count += 1
  }
  return count
}

/**
 * Map a visible (filtered) slot index to the source assignment index.
 * When the display slot is beyond matching rows, returns `assignments.length` (append).
 */
export function resolveResourceAssignSourceIndex(
  assignments: readonly TaskResourceAssignment[],
  displaySlot: number,
  typeFilter: 'all' | PmResourceType,
): number {
  const slot = Math.max(0, Math.floor(displaySlot))
  if (typeFilter === 'all') return slot
  let matched = -1
  for (let index = 0; index < assignments.length; index += 1) {
    const entry = assignments[index]!
    if (isEmptyAssignment(entry)) continue
    if (entry.type !== typeFilter) continue
    matched += 1
    if (matched === slot) return index
  }
  return assignments.length
}

export function readResourceAssignmentAtFilteredSlot(
  assignments: readonly TaskResourceAssignment[],
  displaySlot: number,
  typeFilter: 'all' | PmResourceType,
): TaskResourceAssignment {
  const sourceIndex = resolveResourceAssignSourceIndex(assignments, displaySlot, typeFilter)
  return assignments[sourceIndex] ?? { ...EMPTY_TASK_RESOURCE_ASSIGNMENT }
}

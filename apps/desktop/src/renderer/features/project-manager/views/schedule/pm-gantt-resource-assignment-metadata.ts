/** Read / write task resource assignment metadata and catalog hydration. */

import {
  canonicalizeResourceName,
  isPmResourceType,
  type PmResourceRow,
} from '../resource/pm-resource-catalog'
import {
  EMPTY_TASK_RESOURCE_ASSIGNMENT,
  isEmptyAssignment,
  TASK_RESOURCE_ASSIGNMENT_KEY,
  TASK_RESOURCE_ASSIGNMENTS_KEY,
  type TaskResourceAssignment,
} from './pm-gantt-resource-assignment-types'

function parseAssignment(raw: unknown): TaskResourceAssignment {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...EMPTY_TASK_RESOURCE_ASSIGNMENT }
  }
  const row = raw as Record<string, unknown>
  const quantity =
    typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : null
  return {
    resourceId: typeof row.resourceId === 'string' && row.resourceId ? row.resourceId : null,
    type: isPmResourceType(row.type) ? row.type : null,
    name: canonicalizeResourceName(typeof row.name === 'string' ? row.name : ''),
    quantity,
    note: typeof row.note === 'string' ? row.note : '',
  }
}

/** Read all slots (migrates legacy single `resourceAssignment`). */
export function readTaskResourceAssignments(
  metadata: Record<string, unknown> | null | undefined,
): TaskResourceAssignment[] {
  const list = metadata?.[TASK_RESOURCE_ASSIGNMENTS_KEY]
  if (Array.isArray(list)) {
    return list.map((entry) => parseAssignment(entry))
  }
  const legacy = metadata?.[TASK_RESOURCE_ASSIGNMENT_KEY]
  if (legacy != null) {
    return [parseAssignment(legacy)]
  }
  return []
}

export function readTaskResourceAssignmentAt(
  metadata: Record<string, unknown> | null | undefined,
  slot: number,
): TaskResourceAssignment {
  const list = readTaskResourceAssignments(metadata)
  return list[slot] ? { ...list[slot]! } : { ...EMPTY_TASK_RESOURCE_ASSIGNMENT }
}

/**
 * Patch one slot. Writes `resourceAssignments` array and clears legacy key via `null`
 * so shallow metadata merges on the server actually drop the old single object.
 */
export function patchTaskResourceAssignmentMetadata(
  metadata: Record<string, unknown> | null | undefined,
  patch: Partial<TaskResourceAssignment>,
  slot = 0,
): Record<string, unknown> {
  const index = Math.max(0, Math.floor(slot))
  const currentList = readTaskResourceAssignments(metadata)
  const current = currentList[index] ?? { ...EMPTY_TASK_RESOURCE_ASSIGNMENT }
  const next: TaskResourceAssignment = {
    resourceId: patch.resourceId !== undefined ? patch.resourceId : current.resourceId,
    type: patch.type !== undefined ? patch.type : current.type,
    name: patch.name !== undefined ? patch.name : current.name,
    quantity: patch.quantity !== undefined ? patch.quantity : current.quantity,
    note: patch.note !== undefined ? patch.note : current.note,
  }

  const list: Array<TaskResourceAssignment | null> = []
  const maxIndex = Math.max(currentList.length - 1, index)
  for (let i = 0; i <= maxIndex; i += 1) {
    if (i === index) {
      list[i] = isEmptyAssignment(next) ? null : next
    } else {
      const entry = currentList[i]
      list[i] = entry && !isEmptyAssignment(entry) ? entry : null
    }
  }

  while (list.length > 0 && list[list.length - 1] == null) {
    list.pop()
  }

  const base = { ...(metadata ?? {}) }
  base[TASK_RESOURCE_ASSIGNMENT_KEY] = null
  if (list.length === 0) {
    base[TASK_RESOURCE_ASSIGNMENTS_KEY] = null
  } else {
    base[TASK_RESOURCE_ASSIGNMENTS_KEY] = list.map((entry) =>
      entry ? entry : { ...EMPTY_TASK_RESOURCE_ASSIGNMENT },
    )
  }
  return base
}

export function replaceTaskResourceAssignmentsMetadata(
  metadata: Record<string, unknown> | null | undefined,
  assignments: readonly TaskResourceAssignment[],
): Record<string, unknown> {
  const list = assignments.filter((entry) => !isEmptyAssignment(entry))
  const base = { ...(metadata ?? {}) }
  base[TASK_RESOURCE_ASSIGNMENT_KEY] = null
  if (list.length === 0) {
    base[TASK_RESOURCE_ASSIGNMENTS_KEY] = null
  } else {
    base[TASK_RESOURCE_ASSIGNMENTS_KEY] = list.map((entry) => ({ ...entry }))
  }
  return base
}

/**
 * Match an assignment to a catalog row (id → type+name → name-only).
 * Returns null when nothing in the catalog matches.
 */
export function findCatalogRowForAssignment(
  assignment: TaskResourceAssignment,
  catalog: readonly PmResourceRow[],
): PmResourceRow | null {
  if (assignment.resourceId) {
    const found = catalog.find((row) => row.id === assignment.resourceId)
    if (found) return found
  }
  const name = canonicalizeResourceName(assignment.name)
  if (!name) return null
  const typedMatch = catalog.find(
    (row) =>
      canonicalizeResourceName(row.name) === name &&
      (assignment.type == null || row.type === assignment.type),
  )
  if (typedMatch) return typedMatch
  // Fall back to name-only so stale/wrong stored types still resolve after catalog reclass.
  return catalog.find((row) => canonicalizeResourceName(row.name) === name) ?? null
}

/** Resolve display fields against the live catalog (prefer catalog name/type by id). */
export function resolveAssignmentAgainstCatalog(
  assignment: TaskResourceAssignment,
  catalog: readonly PmResourceRow[],
): TaskResourceAssignment {
  const found = findCatalogRowForAssignment(assignment, catalog)
  if (found) {
    return {
      resourceId: found.id,
      type: found.type,
      name: found.name,
      quantity: assignment.quantity,
      note: assignment.note,
    }
  }

  // Identity not in the assignable catalog → drop ghost names (e.g. shared defaults).
  if (assignment.resourceId || assignment.name.trim()) {
    return {
      ...EMPTY_TASK_RESOURCE_ASSIGNMENT,
      quantity: assignment.quantity,
      note: typeof assignment.note === 'string' ? assignment.note : '',
    }
  }

  return assignment
}

/**
 * Rewrite stored assignment type/name/id to match the live resource list.
 * Unlike display resolve, unmatched (ghost) rows are left unchanged so hydrate
 * does not wipe free-text entries.
 */
export function hydrateTaskResourceAssignmentsAgainstCatalog(
  assignments: readonly TaskResourceAssignment[],
  catalog: readonly PmResourceRow[],
): { assignments: TaskResourceAssignment[]; changed: boolean } {
  let changed = false
  const next = assignments.map((assignment) => {
    if (isEmptyAssignment(assignment)) return assignment
    const found = findCatalogRowForAssignment(assignment, catalog)
    if (!found) return assignment
    if (
      assignment.resourceId === found.id &&
      assignment.type === found.type &&
      canonicalizeResourceName(assignment.name) === canonicalizeResourceName(found.name)
    ) {
      return assignment
    }
    changed = true
    return {
      resourceId: found.id,
      type: found.type,
      name: found.name,
      quantity: assignment.quantity,
      note: assignment.note,
    }
  })
  return { assignments: changed ? next : [...assignments], changed }
}

/** True when assignment identity (id or name) exists in the catalog. */
export function isAssignmentInCatalog(
  assignment: TaskResourceAssignment,
  catalog: readonly PmResourceRow[],
): boolean {
  if (isEmptyAssignment(assignment)) return false
  if (assignment.resourceId && catalog.some((row) => row.id === assignment.resourceId)) {
    return true
  }
  const name = canonicalizeResourceName(assignment.name)
  if (!name) return false
  return (
    catalog.some(
      (row) =>
        canonicalizeResourceName(row.name) === name &&
        (assignment.type == null || row.type === assignment.type),
    ) || catalog.some((row) => canonicalizeResourceName(row.name) === name)
  )
}

/** Read / write task cost assignment metadata and catalog hydration. */

import { isPmCostType, type PmCostRow } from '../cost/pm-cost-catalog'
import { canonicalizeResourceName } from '../resource/pm-resource-catalog'
import {
  EMPTY_TASK_COST_ASSIGNMENT,
  isEmptyCostAssignment,
  TASK_COST_ASSIGNMENTS_KEY,
  type TaskCostAssignment,
} from './pm-gantt-cost-assignment-types'

export function canonicalizeCostName(name: string): string {
  return canonicalizeResourceName(name)
}

function parseAmountValue(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const trimmed = raw.trim().replace(/,/g, '')
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function parseAssignment(raw: unknown): TaskCostAssignment {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...EMPTY_TASK_COST_ASSIGNMENT }
  }
  const row = raw as Record<string, unknown>
  return {
    costId: typeof row.costId === 'string' && row.costId ? row.costId : null,
    type: isPmCostType(row.type) ? row.type : null,
    name: canonicalizeCostName(typeof row.name === 'string' ? row.name : ''),
    percent: parseAmountValue(row.percent),
    amount: parseAmountValue(row.amount),
    note: typeof row.note === 'string' ? row.note : '',
  }
}

export function readTaskCostAssignments(
  metadata: Record<string, unknown> | null | undefined,
): TaskCostAssignment[] {
  const list = metadata?.[TASK_COST_ASSIGNMENTS_KEY]
  if (!Array.isArray(list)) return []
  return list.map(parseAssignment)
}

export function patchTaskCostAssignmentMetadata(
  metadata: Record<string, unknown> | null | undefined,
  patch: Partial<TaskCostAssignment>,
  slot = 0,
): Record<string, unknown> {
  const index = Math.max(0, Math.floor(slot))
  const currentList = readTaskCostAssignments(metadata)
  const current = currentList[index] ?? { ...EMPTY_TASK_COST_ASSIGNMENT }
  const next: TaskCostAssignment = {
    costId: patch.costId !== undefined ? patch.costId : current.costId,
    type: patch.type !== undefined ? patch.type : current.type,
    name: patch.name !== undefined ? patch.name : current.name,
    percent: patch.percent !== undefined ? patch.percent : current.percent,
    amount: patch.amount !== undefined ? patch.amount : current.amount,
    note: patch.note !== undefined ? patch.note : current.note,
  }

  const list: Array<TaskCostAssignment | null> = []
  const maxIndex = Math.max(currentList.length - 1, index)
  for (let i = 0; i <= maxIndex; i += 1) {
    if (i === index) {
      list[i] = isEmptyCostAssignment(next) ? null : next
    } else {
      const entry = currentList[i]
      list[i] = entry && !isEmptyCostAssignment(entry) ? entry : null
    }
  }

  while (list.length > 0 && list[list.length - 1] == null) {
    list.pop()
  }

  const base = { ...(metadata ?? {}) }
  if (list.length === 0) {
    base[TASK_COST_ASSIGNMENTS_KEY] = null
  } else {
    base[TASK_COST_ASSIGNMENTS_KEY] = list.map((entry) =>
      entry ? entry : { ...EMPTY_TASK_COST_ASSIGNMENT },
    )
  }
  return base
}

export function replaceTaskCostAssignmentsMetadata(
  metadata: Record<string, unknown> | null | undefined,
  assignments: readonly TaskCostAssignment[],
): Record<string, unknown> {
  const list = assignments.filter((entry) => !isEmptyCostAssignment(entry))
  const base = { ...(metadata ?? {}) }
  if (list.length === 0) {
    base[TASK_COST_ASSIGNMENTS_KEY] = null
  } else {
    base[TASK_COST_ASSIGNMENTS_KEY] = list.map((entry) => ({ ...entry }))
  }
  return base
}

/**
 * Match an assignment to a price-list row (id → type+name → name-only).
 * Returns null when nothing in the catalog matches.
 */
export function findCatalogRowForCostAssignment(
  assignment: TaskCostAssignment,
  catalog: readonly PmCostRow[],
): PmCostRow | null {
  if (assignment.costId) {
    const found = catalog.find((row) => row.id === assignment.costId)
    if (found) return found
  }
  const name = canonicalizeCostName(assignment.name)
  if (!name) return null
  const typedMatch = catalog.find(
    (row) =>
      canonicalizeCostName(row.name) === name &&
      (assignment.type == null || row.type === assignment.type),
  )
  if (typedMatch) return typedMatch
  return catalog.find((row) => canonicalizeCostName(row.name) === name) ?? null
}

/** Resolve display fields against the live price list (prefer catalog name/type by id). */
export function resolveCostAssignmentAgainstCatalog(
  assignment: TaskCostAssignment,
  catalog: readonly PmCostRow[],
): TaskCostAssignment {
  const found = findCatalogRowForCostAssignment(assignment, catalog)
  if (found) {
    return {
      costId: found.id,
      type: found.type,
      name: found.name,
      percent: assignment.percent,
      amount: assignment.amount,
      note: assignment.note,
    }
  }
  return assignment
}

/**
 * Rewrite stored assignment type/name/id to match the live price list.
 * Unmatched (ghost / free-text) rows are left unchanged.
 */
export function hydrateTaskCostAssignmentsAgainstCatalog(
  assignments: readonly TaskCostAssignment[],
  catalog: readonly PmCostRow[],
): { assignments: TaskCostAssignment[]; changed: boolean } {
  let changed = false
  const next = assignments.map((assignment) => {
    if (isEmptyCostAssignment(assignment)) return assignment
    const found = findCatalogRowForCostAssignment(assignment, catalog)
    if (!found) return assignment
    if (
      assignment.costId === found.id &&
      assignment.type === found.type &&
      canonicalizeCostName(assignment.name) === canonicalizeCostName(found.name)
    ) {
      return assignment
    }
    changed = true
    return {
      costId: found.id,
      type: found.type,
      name: found.name,
      percent: assignment.percent,
      amount: assignment.amount,
      note: assignment.note,
    }
  })
  return { assignments: changed ? next : [...assignments], changed }
}

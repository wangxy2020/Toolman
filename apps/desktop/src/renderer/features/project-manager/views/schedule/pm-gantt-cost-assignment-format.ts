/** Format / parse cost assignment input strings and filtered slot helpers. */

import { isPmCostType, type PmCostRow, type PmCostType } from '../cost/pm-cost-catalog'
import { canonicalizeCostName } from './pm-gantt-cost-assignment-metadata'
import {
  EMPTY_TASK_COST_ASSIGNMENT,
  isEmptyCostAssignment,
  type TaskCostAssignment,
} from './pm-gantt-cost-assignment-types'

/** Display one assignment as `类型，名称，金额` (empty → blank). */
export function formatCostAssignmentInput(
  assignment: TaskCostAssignment,
  typeLabel: (type: PmCostType) => string = (type) => type,
): string {
  if (isEmptyCostAssignment(assignment)) return ''
  const typePart = assignment.type ? typeLabel(assignment.type) : ''
  const namePart = assignment.name.trim()
  const amountPart = assignment.amount != null ? String(assignment.amount) : ''
  return [typePart, namePart, amountPart].join('，')
}

/**
 * Join multiple assignments with `；` — no trailing semicolon.
 * Example: `材料，水泥，1200；机械，塔吊，800`
 */
export function formatCostAssignmentsInput(
  assignments: readonly TaskCostAssignment[],
  typeLabel: (type: PmCostType) => string = (type) => type,
): string {
  return assignments
    .map((entry) => formatCostAssignmentInput(entry, typeLabel))
    .filter((part) => part.length > 0)
    .join('；')
}

/**
 * Parse one `类型，名称，金额` (or legacy `名称，金额`) group.
 * Resolves catalog rows by name (+ optional type) when possible.
 */
export function parseCostAssignmentInput(
  raw: string,
  catalog: readonly PmCostRow[] = [],
  resolveTypeLabel: (label: string) => PmCostType | null = () => null,
): TaskCostAssignment {
  const trimmed = raw.trim()
  if (!trimmed) return { ...EMPTY_TASK_COST_ASSIGNMENT }

  const parts = trimmed.split(/[,，]/u).map((part) => part.trim())
  let type: PmCostType | null = null
  let name = ''
  let amount: number | null = null

  if (parts.length === 1) {
    const only = parts[0] ?? ''
    const asNumber = Number(only)
    if (only !== '' && Number.isFinite(asNumber) && /^-?\d/.test(only)) {
      return { ...EMPTY_TASK_COST_ASSIGNMENT, amount: asNumber }
    }
    type = resolveTypeLabel(only) ?? (isPmCostType(only) ? only : null)
    if (!type) name = only
  } else if (parts.length === 2) {
    const first = parts[0] ?? ''
    const second = parts[1] ?? ''
    const secondAsNumber = Number(second)
    if (second !== '' && Number.isFinite(secondAsNumber) && /^-?\d/.test(second)) {
      // Legacy: 名称，金额
      name = first
      amount = secondAsNumber
    } else {
      type = resolveTypeLabel(first) ?? (isPmCostType(first) ? first : null)
      name = second
    }
  } else {
    const typeRaw = parts[0] ?? ''
    name = parts[1] ?? ''
    const amountRaw = parts[2] ?? ''
    type = resolveTypeLabel(typeRaw) ?? (isPmCostType(typeRaw) ? typeRaw : null)
    if (amountRaw !== '') {
      const parsed = Number(amountRaw)
      amount = Number.isFinite(parsed) ? parsed : null
    }
  }

  if (name) {
    const canon = canonicalizeCostName(name)
    const matched =
      catalog.find(
        (row) =>
          canonicalizeCostName(row.name) === canon && (type == null || row.type === type),
      ) ?? catalog.find((row) => canonicalizeCostName(row.name) === canon)
    if (matched) {
      return {
        costId: matched.id,
        type: matched.type,
        name: matched.name,
        percent: null,
        amount,
        note: '',
      }
    }
    name = canon
  }

  return {
    costId: null,
    type,
    name,
    percent: null,
    amount,
    note: '',
  }
}

/**
 * Parse `类型，名称，金额；…` (groups split on `;` / `；`).
 * Trailing semicolon is ignored.
 */
export function parseCostAssignmentsInput(
  raw: string,
  catalog: readonly PmCostRow[] = [],
  resolveTypeLabel: (label: string) => PmCostType | null = () => null,
): TaskCostAssignment[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  return trimmed
    .split(/[;；]/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => parseCostAssignmentInput(part, catalog, resolveTypeLabel))
    .filter((entry) => !isEmptyCostAssignment(entry))
}

export function moveTaskCostAssignment(
  assignments: readonly TaskCostAssignment[],
  fromIndex: number,
  toIndex: number,
): TaskCostAssignment[] {
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

/** Count non-empty cost assignments, optionally limited to one cost type. */
export function countCostAssignmentsForTypeFilter(
  assignments: readonly TaskCostAssignment[],
  typeFilter: 'all' | PmCostType,
): number {
  let count = 0
  for (const entry of assignments) {
    if (isEmptyCostAssignment(entry)) continue
    if (typeFilter !== 'all' && entry.type !== typeFilter) continue
    count += 1
  }
  return count
}

/**
 * Map a visible (filtered) slot index to the source cost-assignment index.
 * When the display slot is beyond matching rows, returns `assignments.length` (append).
 */
export function resolveCostAssignSourceIndex(
  assignments: readonly TaskCostAssignment[],
  displaySlot: number,
  typeFilter: 'all' | PmCostType,
): number {
  const slot = Math.max(0, Math.floor(displaySlot))
  if (typeFilter === 'all') return slot
  let matched = -1
  for (let index = 0; index < assignments.length; index += 1) {
    const entry = assignments[index]!
    if (isEmptyCostAssignment(entry)) continue
    if (entry.type !== typeFilter) continue
    matched += 1
    if (matched === slot) return index
  }
  return assignments.length
}

export function readCostAssignmentAtFilteredSlot(
  assignments: readonly TaskCostAssignment[],
  displaySlot: number,
  typeFilter: 'all' | PmCostType,
): TaskCostAssignment {
  const sourceIndex = resolveCostAssignSourceIndex(assignments, displaySlot, typeFilter)
  return assignments[sourceIndex] ?? { ...EMPTY_TASK_COST_ASSIGNMENT }
}

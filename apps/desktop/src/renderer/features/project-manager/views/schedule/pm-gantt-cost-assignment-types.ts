/** Task ↔ cost catalog assignment types and column ids. */

import type { PmCostRow, PmCostType } from '../cost/pm-cost-catalog'

export const TASK_COST_ASSIGNMENTS_KEY = 'costAssignments'

export type TaskCostAssignment = {
  /** Linked price-list row id when assigned from the project cost catalog. */
  costId: string | null
  type: PmCostType | null
  name: string
  /**
   * Allocation ratio of the linked price-list row's 工程数量.
   * `0–1` (`1` = 100% of that row's catalog quantity).
   * Monetary `amount` stays in sync as 合价 × percent for rollups.
   */
  percent: number | null
  /** Monetary amount (金额); typically catalog 合价 × percent. */
  amount: number | null
  /** Free-form note (说明). Kept for compatibility; popup shows 工程数量 instead. */
  note: string
}

export type CostColumnField = 'name' | 'amount' | 'qty' | 'input'

/** Default allocation ratio when picking a price-list row (`1` = 100% of 工程数量). */
export const DEFAULT_COST_ASSIGNMENT_PERCENT = 1

export const EMPTY_TASK_COST_ASSIGNMENT: TaskCostAssignment = {
  costId: null,
  type: null,
  name: '',
  percent: null,
  amount: null,
  note: '',
}

export type DefaultCostAssignmentAmountOptions = {
  /** Full price list — enables parent-row 合价 rollup. */
  catalog?: readonly PmCostRow[]
  /** Sum of amounts already assigned to this price-list row across tasks. */
  allocatedById?: ReadonlyMap<string, number>
  /**
   * Amount on the slot being edited (so re-picking the same row does not
   * subtract its own prior amount from the remaining budget).
   */
  excludeAllocated?: number
}

export type CostSectionalGroup = {
  /** Trimmed `sectionalWork`, or `''` when blank. */
  key: string
  rows: PmCostRow[]
}

const COST_COLUMN_RE = /^cost:(\d+):(name|amount|qty|input)$/

export function makeCostColumnId(slot: number, field: CostColumnField): string {
  return `cost:${Math.max(0, Math.floor(slot))}:${field}`
}

export function parseCostColumnId(
  id: string,
): { slot: number; field: CostColumnField } | null {
  const match = COST_COLUMN_RE.exec(id)
  if (!match) return null
  const slot = Number(match[1])
  const field = match[2] as CostColumnField
  if (!Number.isFinite(slot) || slot < 0) return null
  return { slot, field }
}

export function isEmptyCostAssignment(assignment: TaskCostAssignment): boolean {
  return (
    assignment.costId == null &&
    assignment.type == null &&
    !assignment.name.trim() &&
    assignment.amount == null
  )
}

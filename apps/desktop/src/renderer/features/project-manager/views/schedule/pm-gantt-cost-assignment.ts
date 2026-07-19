/** Task cost assignment(s) stored on `PmWorkItem.metadata`. */

export const TASK_COST_ASSIGNMENTS_KEY = 'costAssignments'

export type TaskCostAssignment = {
  name: string
  amount: number | null
}

export type CostColumnField = 'name' | 'amount' | 'input'

export const EMPTY_TASK_COST_ASSIGNMENT: TaskCostAssignment = {
  name: '',
  amount: null,
}

const COST_COLUMN_RE = /^cost:(\d+):(name|amount|input)$/

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

export function isCostColumnId(id: string): boolean {
  return parseCostColumnId(id) != null
}

export function isEmptyCostAssignment(assignment: TaskCostAssignment): boolean {
  return !assignment.name.trim() && assignment.amount == null
}

function parseAssignment(raw: unknown): TaskCostAssignment {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...EMPTY_TASK_COST_ASSIGNMENT }
  }
  const row = raw as Record<string, unknown>
  const amount =
    typeof row.amount === 'number' && Number.isFinite(row.amount) ? row.amount : null
  return {
    name: typeof row.name === 'string' ? row.name : '',
    amount,
  }
}

export function readTaskCostAssignments(
  metadata: Record<string, unknown> | null | undefined,
): TaskCostAssignment[] {
  const list = metadata?.[TASK_COST_ASSIGNMENTS_KEY]
  if (!Array.isArray(list)) return []
  return list.map(parseAssignment)
}

export function readTaskCostAssignmentAt(
  metadata: Record<string, unknown> | null | undefined,
  slot = 0,
): TaskCostAssignment {
  const index = Math.max(0, Math.floor(slot))
  return readTaskCostAssignments(metadata)[index] ?? { ...EMPTY_TASK_COST_ASSIGNMENT }
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
    name: patch.name !== undefined ? patch.name : current.name,
    amount: patch.amount !== undefined ? patch.amount : current.amount,
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

/** Display one assignment as `名称，金额` (empty → blank). */
export function formatCostAssignmentInput(assignment: TaskCostAssignment): string {
  if (isEmptyCostAssignment(assignment)) return ''
  const namePart = assignment.name.trim()
  const amountPart = assignment.amount != null ? String(assignment.amount) : ''
  return [namePart, amountPart].join('，')
}

/**
 * Join multiple assignments with `；` — no trailing semicolon.
 * Example: `材料费，1200；机械费，800`
 */
export function formatCostAssignmentsInput(
  assignments: readonly TaskCostAssignment[],
): string {
  return assignments
    .map((entry) => formatCostAssignmentInput(entry))
    .filter((part) => part.length > 0)
    .join('；')
}

/** Parse one `名称，金额` group (also accepts ASCII commas). */
export function parseCostAssignmentInput(raw: string): TaskCostAssignment {
  const trimmed = raw.trim()
  if (!trimmed) return { ...EMPTY_TASK_COST_ASSIGNMENT }

  const parts = trimmed.split(/[,，]/u).map((part) => part.trim())
  if (parts.length === 1) {
    const only = parts[0] ?? ''
    const asNumber = Number(only)
    if (only !== '' && Number.isFinite(asNumber) && /^-?\d/.test(only)) {
      return { name: '', amount: asNumber }
    }
    return { name: only, amount: null }
  }

  const name = parts[0] ?? ''
  const amountRaw = parts[1] ?? ''
  let amount: number | null = null
  if (amountRaw !== '') {
    const parsed = Number(amountRaw)
    amount = Number.isFinite(parsed) ? parsed : null
  }
  return { name, amount }
}

/**
 * Parse `名称，金额；名称，金额` (groups split on `;` / `；`).
 * Trailing semicolon is ignored.
 */
export function parseCostAssignmentsInput(raw: string): TaskCostAssignment[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  return trimmed
    .split(/[;；]/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => parseCostAssignmentInput(part))
    .filter((entry) => !isEmptyCostAssignment(entry))
}

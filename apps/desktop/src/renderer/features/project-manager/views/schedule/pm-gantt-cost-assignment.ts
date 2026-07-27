/** Task ↔ price-list (cost catalog) assignment(s) stored on `PmWorkItem.metadata`. */

import {
  computeCostRowTotalPrice,
  computeCostTotalPrice,
  isPmCostType,
  type PmCostRow,
  type PmCostType,
} from '../cost/pm-cost-catalog'
import { canonicalizeResourceName } from '../resource/pm-resource-catalog'

export const TASK_COST_ASSIGNMENTS_KEY = 'costAssignments'

export type TaskCostAssignment = {
  /** Linked price-list row id when assigned from the project cost catalog. */
  costId: string | null
  type: PmCostType | null
  name: string
  /**
   * Allocation ratio (百分比). Default `1` = 100% of the price-list 合价.
   * Monetary `amount` should stay in sync: catalogAmount × percent.
   */
  percent: number | null
  /** Monetary amount (金额); typically catalog 合价 × percent. */
  amount: number | null
  /** Free-form note (说明). Kept for compatibility; popup shows amount instead. */
  note: string
}

export type CostColumnField = 'name' | 'amount' | 'qty' | 'input'

/** Default 百分比 when picking a price-list row. */
export const DEFAULT_COST_ASSIGNMENT_PERCENT = 1

export const EMPTY_TASK_COST_ASSIGNMENT: TaskCostAssignment = {
  costId: null,
  type: null,
  name: '',
  percent: null,
  amount: null,
  note: '',
}

/**
 * Monetary amount from price-list 合价 × 百分比.
 * Missing percent is treated as {@link DEFAULT_COST_ASSIGNMENT_PERCENT}.
 */
export function computeCostAssignmentMoney(
  catalogAmount: number | null | undefined,
  percent: number | null | undefined,
): number | null {
  if (catalogAmount == null || !Number.isFinite(catalogAmount)) return null
  const ratio =
    percent != null && Number.isFinite(percent) ? percent : DEFAULT_COST_ASSIGNMENT_PERCENT
  return Math.round(catalogAmount * ratio * 100) / 100
}

/** Effective percent for display/edit.
 * Legacy rows without `percent` infer ratio from amount ÷ catalog 合价 when possible.
 */
export function resolveCostAssignmentPercent(
  assignment: Pick<TaskCostAssignment, 'percent' | 'amount'>,
  catalogAmount?: number | null,
): number {
  if (assignment.percent != null && Number.isFinite(assignment.percent)) {
    return assignment.percent
  }
  if (
    catalogAmount != null &&
    Number.isFinite(catalogAmount) &&
    catalogAmount !== 0 &&
    assignment.amount != null &&
    Number.isFinite(assignment.amount)
  ) {
    return Math.round((assignment.amount / catalogAmount) * 1e6) / 1e6
  }
  return DEFAULT_COST_ASSIGNMENT_PERCENT
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

/** Catalog 合价 / unit price / quantity — whichever is available. */
export function catalogCostAmountLimit(
  row: Pick<PmCostRow, 'id' | 'quantity' | 'unitPrice'>,
  catalog?: readonly PmCostRow[],
): number | null {
  if (catalog && catalog.length > 0) {
    const full = catalog.find((entry) => entry.id === row.id) ?? (row as PmCostRow)
    const rolled = computeCostRowTotalPrice(full, catalog)
    if (rolled != null) return rolled
  }
  const total = computeCostTotalPrice(row.quantity, row.unitPrice)
  if (total != null) return total
  if (row.unitPrice != null && Number.isFinite(row.unitPrice)) {
    return Math.round(row.unitPrice * 100) / 100
  }
  if (row.quantity != null && Number.isFinite(row.quantity)) {
    return Math.round(row.quantity * 100) / 100
  }
  return null
}

/**
 * Default 金额 when picking a price-list row: remaining 合价
 * (catalog total minus amounts already allocated), falling back to unit price
 * or quantity when only one is set.
 */
export function defaultCostAssignmentAmount(
  row: Pick<PmCostRow, 'id' | 'quantity' | 'unitPrice'> | Pick<PmCostRow, 'quantity' | 'unitPrice'>,
  options?: DefaultCostAssignmentAmountOptions,
): number | null {
  const rowId = 'id' in row && typeof row.id === 'string' ? row.id : null
  const limit = catalogCostAmountLimit(
    rowId ? { ...row, id: rowId } : { id: '', quantity: row.quantity, unitPrice: row.unitPrice },
    options?.catalog,
  )
  if (limit == null) return null
  const allocated =
    rowId && options?.allocatedById ? (options.allocatedById.get(rowId) ?? 0) : 0
  const exclude =
    options?.excludeAllocated != null && Number.isFinite(options.excludeAllocated)
      ? options.excludeAllocated
      : 0
  const remaining = Math.round((limit - allocated + exclude) * 100) / 100
  if (remaining <= 0) return null
  return remaining
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

function canonicalizeCostName(name: string): string {
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

/** Options for a name picker — named rows only, optionally filtered by type. */
export function costCatalogRowsForType(
  catalog: readonly PmCostRow[],
  type: PmCostType | null,
): PmCostRow[] {
  const named = catalog.filter((row) => row.name.trim().length > 0)
  if (!type) return named
  return named.filter((row) => row.type === type)
}

export type CostSectionalGroup = {
  /** Trimmed `sectionalWork`, or `''` when blank. */
  key: string
  rows: PmCostRow[]
}

/**
 * Group named catalog rows by 分部工程 for cascading name pickers.
 * Groups follow first appearance order in the price list (top → bottom).
 * Rows within a group keep catalog order.
 */
export function groupCostCatalogBySectionalWork(
  catalog: readonly PmCostRow[],
  type: PmCostType | null = null,
): CostSectionalGroup[] {
  const named = costCatalogRowsForType(catalog, type)
  const byKey = new Map<string, PmCostRow[]>()
  const keyOrder: string[] = []
  for (const row of named) {
    const key = row.sectionalWork?.trim() ?? ''
    const list = byKey.get(key)
    if (list) {
      list.push(row)
    } else {
      byKey.set(key, [row])
      keyOrder.push(key)
    }
  }
  return keyOrder.map((key) => ({
    key,
    rows: byKey.get(key) ?? [],
  }))
}

function resolveAssignmentCostId(
  assignment: TaskCostAssignment,
  catalog: readonly PmCostRow[],
): string | null {
  const resolved = resolveCostAssignmentAgainstCatalog(assignment, catalog)
  if (resolved.costId) return resolved.costId
  const name = resolved.name.trim()
  if (!name) return null
  const matched = catalog.find(
    (row) =>
      row.name.trim() === name &&
      (resolved.type == null || row.type === resolved.type),
  )
  return matched?.id ?? null
}

/**
 * Sum assigned amounts for each price-list row id across all tasks.
 * Used to gray out fully allocated items in the cost name cascade.
 */
export function buildCostAllocatedAmountById(
  items: ReadonlyArray<{ metadata?: Record<string, unknown> | null }>,
  catalog: readonly PmCostRow[] = [],
): Map<string, number> {
  const totals = new Map<string, number>()
  for (const item of items) {
    for (const raw of readTaskCostAssignments(item.metadata)) {
      const costId = resolveAssignmentCostId(raw, catalog)
      if (!costId) continue
      const amount = raw.amount
      if (amount == null || !Number.isFinite(amount)) continue
      totals.set(costId, (totals.get(costId) ?? 0) + amount)
    }
  }
  return totals
}

/** True when assigned amounts cover the catalog 合价 / quantity (null = unlimited). */
export function isCostQuantityFullyAllocated(
  row: PmCostRow,
  allocatedById: ReadonlyMap<string, number>,
  catalog: readonly PmCostRow[] = [],
): boolean {
  const limit = catalogCostAmountLimit(row, catalog)
  if (limit == null || !Number.isFinite(limit)) return false
  if (limit <= 0) return true
  const allocated = allocatedById.get(row.id) ?? 0
  return allocated + 1e-9 >= limit
}

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

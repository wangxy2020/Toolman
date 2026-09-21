import {
  reindexCostRows,
  type PmCostRow,
} from './pm-cost-catalog'
import {
  compareCostItemCodes,
  compareCostSectionalWorkKeys,
} from './pm-cost-catalog-sectional'
import { normalizeCostIpcAmounts } from './pm-cost-ipc-cols'
import { isCostMeteringFactor } from './pm-cost-metering-cols'

function normalizePart(value: string): string {
  return value.trim().replace(/\s+/g, '').toLowerCase()
}

function hasFiniteIpcAmount(row: Pick<PmCostRow, 'ipcAmounts'>): boolean {
  if (!row.ipcAmounts) return false
  return Object.values(row.ipcAmounts).some(
    (value) => typeof value === 'number' && Number.isFinite(value),
  )
}

/** True when name is only a copy of the item code (false identity from older sanitize). */
export function isCostCodeFilledWorkName(
  row: Pick<PmCostRow, 'name' | 'code' | 'featureDescription'>,
): boolean {
  const name = row.name.trim()
  const code = row.code.trim()
  if (!name || !code) return false
  if (row.featureDescription.trim()) return false
  return normalizePart(name) === normalizePart(code)
}

function hasRealWorkLabel(
  row: Pick<PmCostRow, 'name' | 'code' | 'featureDescription'>,
): boolean {
  if (row.featureDescription.trim()) return true
  const name = row.name.trim()
  if (!name) return false
  return !isCostCodeFilledWorkName(row)
}

function clearCodeFilledWorkName(row: PmCostRow): PmCostRow {
  if (!isCostCodeFilledWorkName(row)) return row
  return { ...row, name: '' }
}

function fillBlankWorkName(row: PmCostRow): PmCostRow {
  const cleared = clearCodeFilledWorkName(row)
  if (cleared.name.trim()) return cleared
  const fromFeature = cleared.featureDescription.trim()
  // Never fill 工作名称 from 编码 — that creates fake duplicates after IPC fetch.
  return fromFeature ? { ...cleared, name: fromFeature } : cleared
}

/**
 * Keep 累计完成工程量 from exceeding 合同工程数量 so percent cannot exceed 100%.
 */
export function clampCostMeteringQuantities(row: PmCostRow): PmCostRow {
  const quantity = row.quantity
  if (!isCostMeteringFactor(quantity)) return row
  const prior = row.priorQuantity ?? 0
  const period = row.periodQuantity
  const periodForSum = period ?? 0
  const cumulative = prior + periodForSum
  if (!(cumulative > quantity)) return row
  if (prior >= quantity) {
    return { ...row, priorQuantity: quantity, periodQuantity: null }
  }
  return { ...row, periodQuantity: quantity - prior }
}

function foldIpcAmounts(
  target: Record<string, number | null> | undefined,
  incoming: Record<string, number | null> | undefined,
): Record<string, number | null> | undefined {
  const left = normalizeCostIpcAmounts(target)
  const right = normalizeCostIpcAmounts(incoming)
  if (!left && !right) return undefined
  const next: Record<string, number | null> = { ...left }
  for (const [key, value] of Object.entries(right ?? {})) {
    if (value != null && Number.isFinite(value)) {
      next[key] = value
      continue
    }
    if (!(key in next)) next[key] = value ?? null
  }
  return Object.keys(next).length > 0 ? next : undefined
}

function practiceDedupeKey(row: Pick<PmCostRow, 'id' | 'code' | 'sectionalWork' | 'subproject'>): string {
  const code = normalizePart(row.code)
  if (!code) return `id:${row.id}`
  return `${code}\0${normalizePart(row.sectionalWork)}\0${normalizePart(row.subproject)}`
}

function rowKeepScore(row: PmCostRow): number {
  let score = 0
  if (hasRealWorkLabel(row)) score += 8
  if (row.featureDescription.trim()) score += 2
  if (row.quantity != null && Number.isFinite(row.quantity)) score += 2
  if (row.unitPrice != null && Number.isFinite(row.unitPrice)) score += 1
  if (row.unit.trim()) score += 1
  return score
}

function mergeDuplicatePracticeRow(keeper: PmCostRow, other: PmCostRow): PmCostRow {
  const next = { ...keeper }
  next.ipcAmounts = foldIpcAmounts(keeper.ipcAmounts, other.ipcAmounts)
  if (!hasRealWorkLabel(next) && hasRealWorkLabel(other)) {
    next.name = other.name
    if (!next.featureDescription.trim() && other.featureDescription.trim()) {
      next.featureDescription = other.featureDescription
    }
  }
  if (!next.featureDescription.trim() && other.featureDescription.trim()) {
    next.featureDescription = other.featureDescription
  }
  const keeperHasQty = keeper.quantity != null && Number.isFinite(keeper.quantity)
  const otherHasQty = other.quantity != null && Number.isFinite(other.quantity)
  // Prefer BOQ-shaped contract fields (has 工程数量) over metering-only rates.
  if (!keeperHasQty && otherHasQty) {
    next.quantity = other.quantity
    if (other.unitPrice != null) next.unitPrice = other.unitPrice
    if (other.unit.trim()) next.unit = other.unit
  } else {
    if (next.unitPrice == null && other.unitPrice != null) next.unitPrice = other.unitPrice
    if (next.quantity == null && other.quantity != null) next.quantity = other.quantity
    if (!next.unit.trim() && other.unit.trim()) next.unit = other.unit
  }
  if (next.periodQuantity == null && other.periodQuantity != null) {
    next.periodQuantity = other.periodQuantity
  }
  if ((next.priorQuantity ?? 0) === 0 && other.priorQuantity != null) {
    next.priorQuantity = other.priorQuantity
  }
  return next
}

/** Collapse same 编码+分部+子项目 ghosts; keep the better row's original list position. */
function dedupeCostPracticeRows(rows: readonly PmCostRow[]): PmCostRow[] {
  type Slot = { row: PmCostRow; position: number; score: number }
  const groups = new Map<string, Slot>()
  const order: string[] = []
  rows.forEach((raw, index) => {
    const row = fillBlankWorkName(raw)
    const key = practiceDedupeKey(row)
    const score = rowKeepScore(row)
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, { row, position: index, score })
      order.push(key)
      return
    }
    if (score > existing.score) {
      groups.set(key, {
        row: mergeDuplicatePracticeRow(row, existing.row),
        position: index,
        score,
      })
      return
    }
    groups.set(key, {
      row: mergeDuplicatePracticeRow(existing.row, row),
      position: existing.position,
      score: existing.score,
    })
  })
  return order
    .map((key) => groups.get(key)!)
    .sort((left, right) => left.position - right.position)
    .map((slot) => slot.row)
}

/** Restore 1 / 1.1 / 1.2 order within 子项目 + 分部工程. */
export function sortCostPracticeRowsByCode(rows: readonly PmCostRow[]): PmCostRow[] {
  const indexed = rows.map((row, index) => ({ row, index }))
  indexed.sort((left, right) => {
    const sub = compareCostSectionalWorkKeys(left.row.subproject, right.row.subproject)
    if (sub !== 0) return sub
    const section = compareCostSectionalWorkKeys(
      left.row.sectionalWork,
      right.row.sectionalWork,
    )
    if (section !== 0) return section
    const code = compareCostItemCodes(left.row.code, right.row.code)
    if (code !== 0) return code
    return left.index - right.index
  })
  return indexed.map((entry) => entry.row)
}

/**
 * Drop nameless amount orphans, clear code-as-name ghosts, dedupe, clamp % ≤ 100,
 * and restore bill-item code order.
 */
export function sanitizeCostPracticeRows(rows: readonly PmCostRow[]): PmCostRow[] {
  const deduped = dedupeCostPracticeRows(rows)
  const next = deduped
    .map(clampCostMeteringQuantities)
    .map((row) => {
      const ipcAmounts = normalizeCostIpcAmounts(row.ipcAmounts)
      return ipcAmounts === row.ipcAmounts ? row : { ...row, ipcAmounts }
    })
    .filter((row) => {
      if (hasRealWorkLabel(row) || row.code.trim() || row.featureDescription.trim()) {
        return true
      }
      // Keep empty draft rows; drop amount-only ghosts with no identity.
      return !hasFiniteIpcAmount(row) && row.periodQuantity == null && (row.priorQuantity ?? 0) === 0
    })
  return reindexCostRows(sortCostPracticeRowsByCode(next))
}

export function costPracticeRowsNeedSanitize(
  before: readonly PmCostRow[],
  after: readonly PmCostRow[],
): boolean {
  if (before.length !== after.length) return true
  for (let index = 0; index < before.length; index += 1) {
    const left = before[index]!
    const right = after[index]!
    if (
      left.id !== right.id ||
      left.name !== right.name ||
      left.periodQuantity !== right.periodQuantity ||
      left.priorQuantity !== right.priorQuantity ||
      left.code !== right.code ||
      left.sortOrder !== right.sortOrder
    ) {
      return true
    }
  }
  return false
}

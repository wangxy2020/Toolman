/** Price list (成本/价格表) column visibility (localStorage). */

export const COST_TOGGLE_COLUMNS = [
  'type',
  'sectionalWork',
  'code',
  'name',
  'featureDescription',
  'unit',
  'quantity',
  'unitPrice',
  'totalPrice',
  'baseline',
  'note',
] as const

export type CostToggleColumn = (typeof COST_TOGGLE_COLUMNS)[number]

export type CostColumnVisibility = Record<CostToggleColumn, boolean>

export const DEFAULT_COST_COLUMN_VISIBILITY: CostColumnVisibility = {
  type: true,
  sectionalWork: true,
  code: true,
  name: true,
  featureDescription: true,
  unit: true,
  quantity: true,
  unitPrice: true,
  totalPrice: true,
  baseline: true,
  note: true,
}

const STORAGE_KEY = 'toolman.pm.cost.columnVisibility'

function isToggleColumn(value: string): value is CostToggleColumn {
  return (COST_TOGGLE_COLUMNS as readonly string[]).includes(value)
}

export function loadCostColumnVisibility(): CostColumnVisibility {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_COST_COLUMN_VISIBILITY }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const next = { ...DEFAULT_COST_COLUMN_VISIBILITY }
    for (const key of COST_TOGGLE_COLUMNS) {
      if (typeof parsed[key] === 'boolean') next[key] = parsed[key]
    }
    // Keep at least the name column so the table remains usable.
    if (!next.name) next.name = true
    return next
  } catch {
    return { ...DEFAULT_COST_COLUMN_VISIBILITY }
  }
}

export function saveCostColumnVisibility(value: CostColumnVisibility): void {
  try {
    const sanitized: CostColumnVisibility = { ...value, name: true }
    const payload: Record<string, boolean> = {}
    for (const key of COST_TOGGLE_COLUMNS) {
      if (!isToggleColumn(key)) continue
      payload[key] = sanitized[key]
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

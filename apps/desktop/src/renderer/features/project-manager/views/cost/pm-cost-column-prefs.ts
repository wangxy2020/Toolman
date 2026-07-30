/** Price list (成本/价格表) column visibility + custom header labels (localStorage). */

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

/** Columns whose header text can be renamed (excludes 序号). */
export const COST_LABEL_COLUMNS = COST_TOGGLE_COLUMNS

export type CostLabelColumn = (typeof COST_LABEL_COLUMNS)[number]

export type CostColumnVisibility = Record<CostToggleColumn, boolean>

export type CostColumnLabels = Partial<Record<CostLabelColumn, string>>

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

const VISIBILITY_STORAGE_KEY = 'toolman.pm.cost.columnVisibility'
const LABELS_STORAGE_KEY = 'toolman.pm.cost.columnLabels'

function isToggleColumn(value: string): value is CostToggleColumn {
  return (COST_TOGGLE_COLUMNS as readonly string[]).includes(value)
}

function isLabelColumn(value: string): value is CostLabelColumn {
  return (COST_LABEL_COLUMNS as readonly string[]).includes(value)
}

export function loadCostColumnVisibility(): CostColumnVisibility {
  try {
    const raw = localStorage.getItem(VISIBILITY_STORAGE_KEY)
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
    localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function loadCostColumnLabels(): CostColumnLabels {
  try {
    const raw = localStorage.getItem(LABELS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const next: CostColumnLabels = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (!isLabelColumn(key)) continue
      if (typeof value !== 'string') continue
      const trimmed = value.trim()
      if (!trimmed) continue
      next[key] = trimmed
    }
    return next
  } catch {
    return {}
  }
}

export function saveCostColumnLabels(value: CostColumnLabels): void {
  try {
    const payload: Record<string, string> = {}
    for (const key of COST_LABEL_COLUMNS) {
      const trimmed = value[key]?.trim()
      if (trimmed) payload[key] = trimmed
    }
    localStorage.setItem(LABELS_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

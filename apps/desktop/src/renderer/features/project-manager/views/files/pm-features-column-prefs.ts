/** Practice (实务) table column visibility (localStorage). */

export const FEATURES_TOGGLE_COLUMNS = [
  'type',
  'name',
  'unit',
  'pricingUnit',
  'purchaseCycle',
  'transportCycle',
  'quantity',
  'start',
  'finish',
  'months',
  'remark',
] as const

export type FeaturesToggleColumn = (typeof FEATURES_TOGGLE_COLUMNS)[number]

export type FeaturesColumnVisibility = Record<FeaturesToggleColumn, boolean>

export const DEFAULT_FEATURES_COLUMN_VISIBILITY: FeaturesColumnVisibility = {
  type: true,
  name: true,
  unit: true,
  pricingUnit: true,
  purchaseCycle: true,
  transportCycle: true,
  quantity: true,
  start: true,
  finish: true,
  months: true,
  remark: true,
}

/** Columns only shown on the 采购 page. */
export const FEATURES_PROCUREMENT_COLUMNS = [
  'pricingUnit',
  'purchaseCycle',
  'transportCycle',
] as const satisfies readonly FeaturesToggleColumn[]

export function isFeaturesProcurementColumn(
  column: FeaturesToggleColumn,
): boolean {
  return (FEATURES_PROCUREMENT_COLUMNS as readonly string[]).includes(column)
}

const STORAGE_KEY = 'toolman.pm.features.columnVisibility'

function isToggleColumn(value: string): value is FeaturesToggleColumn {
  return (FEATURES_TOGGLE_COLUMNS as readonly string[]).includes(value)
}

export function loadFeaturesColumnVisibility(): FeaturesColumnVisibility {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_FEATURES_COLUMN_VISIBILITY }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const next = { ...DEFAULT_FEATURES_COLUMN_VISIBILITY }
    for (const key of FEATURES_TOGGLE_COLUMNS) {
      if (typeof parsed[key] === 'boolean') next[key] = parsed[key]
    }
    // Keep at least the name column so the table remains usable.
    if (!next.name) next.name = true
    return next
  } catch {
    return { ...DEFAULT_FEATURES_COLUMN_VISIBILITY }
  }
}

export function saveFeaturesColumnVisibility(value: FeaturesColumnVisibility): void {
  try {
    const sanitized: FeaturesColumnVisibility = { ...value, name: true }
    const payload: Record<string, boolean> = {}
    for (const key of FEATURES_TOGGLE_COLUMNS) {
      if (!isToggleColumn(key)) continue
      payload[key] = sanitized[key]
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

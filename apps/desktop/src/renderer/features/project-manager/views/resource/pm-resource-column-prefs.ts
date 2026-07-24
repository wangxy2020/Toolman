/** Resource list column visibility (localStorage). */

export const RESOURCE_TOGGLE_COLUMNS = [
  'type',
  'name',
  'spec',
  'unit',
  'pricingUnit',
  'unitPrice',
  'baseline',
  'note',
] as const

export type ResourceToggleColumn = (typeof RESOURCE_TOGGLE_COLUMNS)[number]

export type ResourceColumnVisibility = Record<ResourceToggleColumn, boolean>

export const DEFAULT_RESOURCE_COLUMN_VISIBILITY: ResourceColumnVisibility = {
  type: true,
  name: true,
  spec: true,
  unit: true,
  pricingUnit: true,
  unitPrice: true,
  baseline: true,
  note: true,
}

const STORAGE_KEY = 'toolman.pm.resource.columnVisibility'

function isToggleColumn(value: string): value is ResourceToggleColumn {
  return (RESOURCE_TOGGLE_COLUMNS as readonly string[]).includes(value)
}

export function loadResourceColumnVisibility(): ResourceColumnVisibility {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_RESOURCE_COLUMN_VISIBILITY }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const next = { ...DEFAULT_RESOURCE_COLUMN_VISIBILITY }
    for (const key of RESOURCE_TOGGLE_COLUMNS) {
      if (typeof parsed[key] === 'boolean') next[key] = parsed[key]
    }
    // Keep at least the name column so the table remains usable.
    if (!next.name) next.name = true
    return next
  } catch {
    return { ...DEFAULT_RESOURCE_COLUMN_VISIBILITY }
  }
}

export function saveResourceColumnVisibility(value: ResourceColumnVisibility): void {
  try {
    const sanitized: ResourceColumnVisibility = { ...value, name: true }
    const payload: Record<string, boolean> = {}
    for (const key of RESOURCE_TOGGLE_COLUMNS) {
      if (!isToggleColumn(key)) continue
      payload[key] = sanitized[key]
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

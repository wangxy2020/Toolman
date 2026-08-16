/** Feature catalog row factory, parse, and fingerprint helpers. */

import {
  PM_FEATURE_APPLICABLE_ALL,
  isPmFeatureType,
  type PmFeatureRow,
  type PmFeatureType,
} from './pm-features-catalog-types'

const DEFAULT_FEATURE_DEFS: ReadonlyArray<{
  type: PmFeatureType
  name: string
  unit: string
  quantity: number | null
  remark: string
}> = [
  // labor / auxiliary / material / machinery are seeded from Gantt — no placeholders.
  { type: 'procurement', name: '招标采购计划', unit: '包', quantity: null, remark: '' },
  { type: 'metering', name: '工程计量节点', unit: '期', quantity: null, remark: '' },
  // node rows are seeded from Gantt milestones — no placeholder.
]

function parseOptionalCycleDays(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function parseOptionalNumber(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function isFeatureRow(value: unknown): value is PmFeatureRow {
  if (value == null || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.id === 'string' &&
    row.id.length > 0 &&
    isPmFeatureType(row.type) &&
    typeof row.name === 'string' &&
    typeof row.unit === 'string' &&
    (row.quantity == null ||
      (typeof row.quantity === 'number' && Number.isFinite(row.quantity))) &&
    typeof row.remark === 'string' &&
    typeof row.applicable === 'string' &&
    typeof row.sortOrder === 'number' &&
    Number.isFinite(row.sortOrder)
  )
}

/** Parse a stored catalog. `null` = key missing/invalid; `[]` = explicit empty (do not reseed). */
export function parseFeatureRows(raw: unknown): PmFeatureRow[] | null {
  if (!Array.isArray(raw)) return null
  if (raw.length === 0) return []
  const parsed = raw
    .filter(isFeatureRow)
    .map((row) => {
      const record = row as PmFeatureRow & Record<string, unknown>
      return {
        id: row.id,
        type: row.type,
        name: row.name,
        unit: row.unit,
        pricingUnit: typeof record.pricingUnit === 'string' ? record.pricingUnit : '',
        purchaseCycle: parseOptionalCycleDays(record.purchaseCycle),
        transportCycle: parseOptionalCycleDays(record.transportCycle),
        quantity:
          typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : null,
        remark: typeof row.remark === 'string' ? row.remark : '',
        code: typeof record.code === 'string' ? record.code : '',
        featureDescription:
          typeof record.featureDescription === 'string' ? record.featureDescription : '',
        sectionalWork: typeof record.sectionalWork === 'string' ? record.sectionalWork : '',
        unitPrice: parseOptionalNumber(record.unitPrice),
        applicable:
          typeof row.applicable === 'string' && row.applicable.trim()
            ? row.applicable.trim()
            : PM_FEATURE_APPLICABLE_ALL,
        sortOrder: Math.floor(row.sortOrder),
        parentId: typeof row.parentId === 'string' ? row.parentId : null,
      }
    })
    .sort((left, right) => left.sortOrder - right.sortOrder)
  if (parsed.length === 0) return []
  return parsed
}

export function createDefaultFeatureCatalog(
  applicable: string = PM_FEATURE_APPLICABLE_ALL,
): PmFeatureRow[] {
  return DEFAULT_FEATURE_DEFS.map((entry, index) => ({
    id: crypto.randomUUID(),
    type: entry.type,
    name: entry.name,
    unit: entry.unit,
    pricingUnit: entry.unit,
    purchaseCycle: null,
    transportCycle: null,
    quantity: entry.quantity,
    remark: entry.remark,
    code: '',
    featureDescription: '',
    sectionalWork: '',
    unitPrice: null,
    applicable,
    sortOrder: index,
    parentId: null,
  }))
}

export function cloneFeatureCatalog(rows: PmFeatureRow[], applicable: string): PmFeatureRow[] {
  return rows.map((row, index) => ({
    ...row,
    id: crypto.randomUUID(),
    applicable,
    sortOrder: index,
    parentId: null,
  }))
}

export function createEmptyFeatureRow(
  sortOrder: number,
  type: PmFeatureType = 'labor',
  parentId: string | null = null,
  applicable: string = PM_FEATURE_APPLICABLE_ALL,
): PmFeatureRow {
  return {
    id: crypto.randomUUID(),
    type,
    name: '',
    unit: '',
    pricingUnit: '',
    purchaseCycle: null,
    transportCycle: null,
    quantity: null,
    remark: '',
    code: '',
    featureDescription: '',
    sectionalWork: '',
    unitPrice: null,
    applicable,
    sortOrder,
    parentId,
  }
}

export function reindexFeatureRows(rows: PmFeatureRow[]): PmFeatureRow[] {
  return rows.map((row, index) => ({ ...row, sortOrder: index }))
}

export function featureRowDepth(row: PmFeatureRow, byId: Map<string, PmFeatureRow>): number {
  let depth = 0
  let parentId = row.parentId ?? null
  const seen = new Set<string>()
  while (parentId) {
    if (seen.has(parentId)) break
    seen.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) break
    depth += 1
    parentId = parent.parentId ?? null
  }
  return depth
}

/** Stable fingerprint of persisted 手工目录 rows (schedule-synced types excluded upstream). */
export function fingerprintFeatureCatalog(rows: readonly PmFeatureRow[]): string {
  return JSON.stringify(
    rows.map((row) => ({
      type: row.type,
      name: row.name.trim(),
      unit: row.unit.trim(),
      pricingUnit: row.pricingUnit.trim(),
      purchaseCycle: row.purchaseCycle,
      transportCycle: row.transportCycle,
      quantity: row.quantity,
      remark: row.remark,
      code: row.code.trim(),
      featureDescription: row.featureDescription.trim(),
      sectionalWork: row.sectionalWork.trim(),
      unitPrice: row.unitPrice,
      applicable: row.applicable,
      sortOrder: row.sortOrder,
      parentId: row.parentId ?? null,
    })),
  )
}

import {
  DEFAULT_RESOURCE_DEFS,
  DEFAULT_UNIT_PRICE_BY_NAME,
  ENSURE_DEFAULT_TYPES,
  ENSURE_NAMED_DEFAULTS,
  isRetiredSharedBudgetDefault,
  PM_RESOURCE_APPLICABLE_ALL,
  PM_RESOURCE_TYPES,
  resourceCustomTypeName,
  resourceMatchKey,
  type PmResourceRow,
  type PmResourceType,
} from './pm-resource-catalog-types'

export function createDefaultResourceCatalog(
  applicable: string = PM_RESOURCE_APPLICABLE_ALL,
): PmResourceRow[] {
  return DEFAULT_RESOURCE_DEFS.map((entry, index) => ({
    id: crypto.randomUUID(),
    type: entry.type,
    customTypeName: '',
    name: entry.name,
    spec: '',
    unit: entry.unit,
    pricingUnit: entry.pricingUnit,
    unitPrice: entry.unitPrice,
    applicable,
    note: '',
    sortOrder: index,
    parentId: null,
  }))
}

function defaultResourceRow(
  def: (typeof DEFAULT_RESOURCE_DEFS)[number],
  sortOrder: number,
): PmResourceRow {
  return {
    id: crypto.randomUUID(),
    type: def.type,
    customTypeName: '',
    name: def.name,
    spec: '',
    unit: def.unit,
    pricingUnit: def.pricingUnit,
    unitPrice: def.unitPrice,
    applicable: PM_RESOURCE_APPLICABLE_ALL,
    note: '',
    sortOrder,
    parentId: null,
  }
}

export function stripRetiredSharedBudgetDefaults(rows: readonly PmResourceRow[]): {
  rows: PmResourceRow[]
  changed: boolean
} {
  const next = rows.filter((row) => !isRetiredSharedBudgetDefault(row.type, row.name))
  if (next.length === rows.length) return { rows: [...rows], changed: false }
  return { rows: reindexResourceRows(next), changed: true }
}

/**
 * Append built-in defaults for newly introduced types / named resources that are
 * missing from a catalog.
 */
export function ensureDefaultResourcesInCatalog(rows: PmResourceRow[]): {
  rows: PmResourceRow[]
  changed: boolean
} {
  const stripped = stripRetiredSharedBudgetDefaults(rows)
  rows = stripped.rows
  const typesPresent = new Set<PmResourceType>()
  const keysPresent = new Set<string>()
  for (const row of rows) {
    const name = row.name.trim()
    if (!name) continue
    typesPresent.add(row.type)
    keysPresent.add(resourceMatchKey(row.type, name, row.customTypeName))
  }

  const defByKey = new Map(
    DEFAULT_RESOURCE_DEFS.map((entry) => [resourceMatchKey(entry.type, entry.name), entry] as const),
  )
  const additions: PmResourceRow[] = []

  for (const entry of DEFAULT_RESOURCE_DEFS) {
    if (!ENSURE_DEFAULT_TYPES.includes(entry.type)) continue
    if (typesPresent.has(entry.type)) continue
    const key = resourceMatchKey(entry.type, entry.name)
    if (keysPresent.has(key)) continue
    keysPresent.add(key)
    additions.push(defaultResourceRow(entry, rows.length + additions.length))
  }

  for (const named of ENSURE_NAMED_DEFAULTS) {
    const key = resourceMatchKey(named.type, named.name)
    if (keysPresent.has(key)) continue
    const def = defByKey.get(key)
    if (!def) continue
    keysPresent.add(key)
    additions.push(defaultResourceRow(def, rows.length + additions.length))
  }

  if (additions.length === 0) return { rows, changed: stripped.changed }
  return { rows: reindexResourceRows([...rows, ...additions]), changed: true }
}

/** Fill missing unit prices for known built-in resource names. */
export function applyDefaultUnitPrices(rows: PmResourceRow[]): {
  rows: PmResourceRow[]
  changed: boolean
} {
  let changed = false
  const next = rows.map((row) => {
    if (row.unitPrice != null) return row
    const price = DEFAULT_UNIT_PRICE_BY_NAME.get(row.name.trim())
    if (price == null) return row
    changed = true
    return { ...row, unitPrice: price }
  })
  return { rows: next, changed }
}

export function createEmptyResourceRow(
  sortOrder: number,
  type: PmResourceType = 'labor',
  parentId: string | null = null,
  applicable: string = PM_RESOURCE_APPLICABLE_ALL,
  customTypeName = '',
): PmResourceRow {
  return {
    id: crypto.randomUUID(),
    type,
    customTypeName: type === 'custom' ? customTypeName : '',
    name: '',
    spec: '',
    unit: '',
    pricingUnit: '',
    unitPrice: null,
    applicable,
    note: '',
    sortOrder,
    parentId,
  }
}

export function reindexResourceRows(rows: PmResourceRow[]): PmResourceRow[] {
  return rows.map((row, index) => ({ ...row, sortOrder: index }))
}

export function resourceTypeMenuRank(type: PmResourceType): number {
  const index = PM_RESOURCE_TYPES.indexOf(type)
  return index >= 0 ? index : PM_RESOURCE_TYPES.length
}

/**
 * Sort by type-menu order, preserving relative order within the same type.
 * Used for「全部项目」so types follow the type dropdown.
 */
export function sortResourceRowsByTypeMenu(rows: readonly PmResourceRow[]): PmResourceRow[] {
  const indexed = rows.map((row, index) => ({ row, index }))
  indexed.sort((left, right) => {
    const typeDelta = resourceTypeMenuRank(left.row.type) - resourceTypeMenuRank(right.row.type)
    if (typeDelta !== 0) return typeDelta
    if (left.row.type === 'custom' && right.row.type === 'custom') {
      const nameDelta = resourceCustomTypeName(left.row).localeCompare(
        resourceCustomTypeName(right.row),
        'zh-CN',
      )
      if (nameDelta !== 0) return nameDelta
    }
    if (left.row.sortOrder !== right.row.sortOrder) {
      return left.row.sortOrder - right.row.sortOrder
    }
    return left.index - right.index
  })
  return reindexResourceRows(indexed.map((entry) => entry.row))
}

/**
 * Project catalogs: type-menu order, then name order of「全部项目」within each type.
 * Project-only rows (not in shared) stay after shared rows of the same type.
 */
export function sortResourceRowsLikeSharedCatalog(
  rows: readonly PmResourceRow[],
  sharedRows: readonly PmResourceRow[],
): PmResourceRow[] {
  const sharedRank = new Map<string, number>()
  sharedRows.forEach((row, index) => {
    const name = row.name.trim()
    if (!name) return
    const key = resourceMatchKey(row.type, name, row.customTypeName)
    if (!sharedRank.has(key)) sharedRank.set(key, index)
  })

  const indexed = rows.map((row, index) => ({ row, index }))
  indexed.sort((left, right) => {
    const typeDelta = resourceTypeMenuRank(left.row.type) - resourceTypeMenuRank(right.row.type)
    if (typeDelta !== 0) return typeDelta
    if (left.row.type === 'custom' && right.row.type === 'custom') {
      const nameDelta = resourceCustomTypeName(left.row).localeCompare(
        resourceCustomTypeName(right.row),
        'zh-CN',
      )
      if (nameDelta !== 0) return nameDelta
    }
    const leftKey = resourceMatchKey(left.row.type, left.row.name, left.row.customTypeName)
    const rightKey = resourceMatchKey(right.row.type, right.row.name, right.row.customTypeName)
    const leftShared = sharedRank.get(leftKey)
    const rightShared = sharedRank.get(rightKey)
    if (leftShared != null && rightShared != null && leftShared !== rightShared) {
      return leftShared - rightShared
    }
    if (leftShared != null && rightShared == null) return -1
    if (leftShared == null && rightShared != null) return 1
    if (left.row.sortOrder !== right.row.sortOrder) {
      return left.row.sortOrder - right.row.sortOrder
    }
    return left.index - right.index
  })
  return reindexResourceRows(indexed.map((entry) => entry.row))
}

export function resourceRowDepth(
  row: PmResourceRow,
  byId: Map<string, PmResourceRow>,
): number {
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

/** Map「全部项目」catalog prices by type+name (and name-only fallback). */
export function buildBaselinePriceIndex(baselineRows: PmResourceRow[]): {
  byTypeAndName: Map<string, number>
  byName: Map<string, number>
} {
  const byTypeAndName = new Map<string, number>()
  const byName = new Map<string, number>()
  for (const row of baselineRows) {
    const name = row.name.trim()
    if (!name || row.unitPrice == null || !(row.unitPrice > 0)) continue
    byTypeAndName.set(resourceMatchKey(row.type, name, row.customTypeName), row.unitPrice)
    if (!byName.has(name)) byName.set(name, row.unitPrice)
  }
  return { byTypeAndName, byName }
}

export function lookupBaselineUnitPrice(
  row: PmResourceRow,
  index: ReturnType<typeof buildBaselinePriceIndex>,
): number | null {
  const name = row.name.trim()
  if (!name) return null
  return (
    index.byTypeAndName.get(resourceMatchKey(row.type, name, row.customTypeName)) ??
    index.byName.get(name) ??
    null
  )
}

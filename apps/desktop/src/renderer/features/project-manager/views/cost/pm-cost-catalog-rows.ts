/** Parse, create, fingerprint, and sort cost catalog rows. */

import {
  PM_COST_APPLICABLE_ALL,
  costMatchKey,
  costTypeMenuRank,
  isPmCostType,
  type PmCostRow,
  type PmCostType,
} from './pm-cost-catalog-types'

export function createEmptyCostRow(
  sortOrder: number,
  type: PmCostType = 'other',
  parentId: string | null = null,
  applicable: string = PM_COST_APPLICABLE_ALL,
): PmCostRow {
  return {
    id: crypto.randomUUID(),
    type,
    code: '',
    name: '',
    featureDescription: '',
    unit: '',
    quantity: null,
    unitPrice: null,
    applicable,
    note: '',
    sectionalWork: '',
    sectionCode: '',
    sectionNote: '',
    sectionName: '',
    sectionFeatureDescription: '',
    sectionTotalFormula: '',
    sortOrder,
    parentId,
  }
}

export function reindexCostRows(rows: PmCostRow[]): PmCostRow[] {
  return rows.map((row, index) => ({ ...row, sortOrder: index }))
}

export function parseCostRows(raw: unknown): PmCostRow[] | null {
  if (!Array.isArray(raw)) return null
  const rows: PmCostRow[] = []
  for (const entry of raw) {
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) continue
    const row = entry as Record<string, unknown>
    const id = typeof row.id === 'string' && row.id.trim() ? row.id : crypto.randomUUID()
    const type = isPmCostType(row.type) ? row.type : 'other'
    const code = typeof row.code === 'string' ? row.code : ''
    const name = typeof row.name === 'string' ? row.name : ''
    const featureDescription =
      typeof row.featureDescription === 'string' ? row.featureDescription : ''
    const unit = typeof row.unit === 'string' ? row.unit : ''
    const quantity =
      typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : null
    const unitPrice =
      typeof row.unitPrice === 'number' && Number.isFinite(row.unitPrice) ? row.unitPrice : null
    const applicable =
      typeof row.applicable === 'string' && row.applicable.trim()
        ? row.applicable
        : PM_COST_APPLICABLE_ALL
    const note = typeof row.note === 'string' ? row.note : ''
    const sectionalWork = typeof row.sectionalWork === 'string' ? row.sectionalWork : ''
    const sectionCode = typeof row.sectionCode === 'string' ? row.sectionCode : ''
    const sectionNote = typeof row.sectionNote === 'string' ? row.sectionNote : ''
    const sectionName = typeof row.sectionName === 'string' ? row.sectionName : ''
    const sectionFeatureDescription =
      typeof row.sectionFeatureDescription === 'string' ? row.sectionFeatureDescription : ''
    const sectionTotalFormula =
      typeof row.sectionTotalFormula === 'string' ? row.sectionTotalFormula : ''
    const sortOrder =
      typeof row.sortOrder === 'number' && Number.isFinite(row.sortOrder)
        ? Math.floor(row.sortOrder)
        : rows.length
    const parentId =
      row.parentId === null
        ? null
        : typeof row.parentId === 'string'
          ? row.parentId
          : undefined
    rows.push({
      id,
      type,
      code,
      name,
      featureDescription,
      unit,
      quantity,
      unitPrice,
      applicable,
      note,
      sectionalWork,
      sectionCode,
      sectionNote,
      sectionName,
      sectionFeatureDescription,
      sectionTotalFormula,
      sortOrder,
      ...(parentId !== undefined ? { parentId } : {}),
    })
  }
  return reindexCostRows(rows)
}

export function fingerprintCostCatalog(rows: readonly PmCostRow[]): string {
  return JSON.stringify(
    rows.map((row) => ({
      id: row.id,
      type: row.type,
      code: row.code,
      name: row.name,
      featureDescription: row.featureDescription,
      unit: row.unit,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      applicable: row.applicable,
      note: row.note,
      sectionalWork: row.sectionalWork,
      sectionCode: row.sectionCode,
      sectionNote: row.sectionNote,
      sectionName: row.sectionName,
      sectionFeatureDescription: row.sectionFeatureDescription,
      sectionTotalFormula: row.sectionTotalFormula,
      sortOrder: row.sortOrder,
      parentId: row.parentId ?? null,
    })),
  )
}

export function sortCostRowsByTypeMenu(rows: readonly PmCostRow[]): PmCostRow[] {
  const indexed = rows.map((row, index) => ({ row, index }))
  indexed.sort((left, right) => {
    const typeDelta = costTypeMenuRank(left.row.type) - costTypeMenuRank(right.row.type)
    if (typeDelta !== 0) return typeDelta
    if (left.row.sortOrder !== right.row.sortOrder) {
      return left.row.sortOrder - right.row.sortOrder
    }
    return left.index - right.index
  })
  return reindexCostRows(indexed.map((entry) => entry.row))
}

export function sortCostRowsLikeSharedCatalog(
  rows: readonly PmCostRow[],
  sharedRows: readonly PmCostRow[],
): PmCostRow[] {
  const sharedRank = new Map<string, number>()
  sharedRows.forEach((row, index) => {
    const name = row.name.trim()
    if (!name) return
    const key = costMatchKey(row.type, name)
    if (!sharedRank.has(key)) sharedRank.set(key, index)
  })

  const indexed = rows.map((row, index) => ({ row, index }))
  indexed.sort((left, right) => {
    const typeDelta = costTypeMenuRank(left.row.type) - costTypeMenuRank(right.row.type)
    if (typeDelta !== 0) return typeDelta
    const leftKey = costMatchKey(left.row.type, left.row.name)
    const rightKey = costMatchKey(right.row.type, right.row.name)
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
  return reindexCostRows(indexed.map((entry) => entry.row))
}

import {
  type CostDatabaseImportedRow,
  type CostDatabaseFieldKey,
  COST_DATABASE_VIEW_KEYS,
  type CostDatabaseViewKey,
} from '@toolman/shared'

import { createEmptyCostRow, reindexCostRows, isPmCostPracticeQuotaType, isPmCostType, type PmCostRow, type PmCostType } from './pm-cost-catalog'

export function costDatabaseRowsToCatalog(
  imported: CostDatabaseImportedRow[],
  applicable: string,
  defaultType: PmCostType = 'constructionQuota',
): PmCostRow[] {
  const rows = imported.map((item, index) => {
    const row = createEmptyCostRow(index, defaultType, null, applicable)
    row.code = item.code
    row.name = item.name
    row.featureDescription = item.featureDescription
    row.unit = item.unit
    const isMetering = defaultType === 'budgetQuota'
    row.quantity = isMetering ? null : item.quantity
    row.periodQuantity = item.periodQuantity ?? (isMetering ? item.quantity : null)
    row.priorQuantity = item.priorQuantity ?? null
    row.unitPrice = item.unitPrice
    row.sectionalWork = item.sectionalWork
    row.subproject = item.subproject
    row.note = item.note
    if (isPmCostType(item.type)) {
      row.type = isPmCostPracticeQuotaType(defaultType)
        ? item.type
        : isPmCostPracticeQuotaType(item.type)
          ? defaultType
          : item.type
    }
    return row
  })
  return reindexCostRows(rows)
}

export function mergeCostDatabaseViewRows(
  byView: Partial<Record<CostDatabaseViewKey, CostDatabaseImportedRow[]>>,
  applicable: string,
): PmCostRow[] {
  const rows: PmCostRow[] = []
  for (const view of COST_DATABASE_VIEW_KEYS) {
    const imported = byView[view] ?? []
    if (imported.length === 0) continue
    rows.push(
      ...costDatabaseRowsToCatalog(imported, applicable, view).map((row) => ({
        ...row,
        type: view,
      })),
    )
  }
  return reindexCostRows(rows)
}

function meteringFetchMatchKey(row: Pick<PmCostRow, 'code' | 'sectionalWork'>): string {
  return `${row.code.trim()}\0${row.sectionalWork.trim()}`
}

/** Overlay 本期 / 往期 quantities onto the current table; append unmatched fetched rows. */
export function mergeMeteringFetchRows(
  existing: readonly PmCostRow[],
  fetched: readonly PmCostRow[],
): PmCostRow[] {
  if (existing.length === 0) return [...fetched]
  if (fetched.length === 0) return [...existing]
  const byExact = new Map<string, PmCostRow[]>()
  const byCode = new Map<string, PmCostRow[]>()
  for (const row of fetched) {
    const code = row.code.trim()
    if (!code) continue
    const exactKey = meteringFetchMatchKey(row)
    const exactList = byExact.get(exactKey) ?? []
    exactList.push(row)
    byExact.set(exactKey, exactList)
    const codeList = byCode.get(code) ?? []
    codeList.push(row)
    byCode.set(code, codeList)
  }
  const used = new Set<PmCostRow>()
  const take = (list: PmCostRow[] | undefined) => {
    const found = list?.find((item) => !used.has(item))
    if (found) used.add(found)
    return found
  }
  const next = existing.map((row) => {
    const incoming =
      take(byExact.get(meteringFetchMatchKey(row))) ?? take(byCode.get(row.code.trim()))
    if (!incoming) return row
    return {
      ...row,
      periodQuantity: incoming.periodQuantity ?? null,
      priorQuantity: incoming.priorQuantity ?? null,
    }
  })
  const extras = fetched.filter((row) => !used.has(row))
  return extras.length === 0 ? next : reindexCostRows([...next, ...extras])
}

export function overlayCostDatabaseViewRows(
  existing: PmCostRow[],
  byView: Partial<Record<CostDatabaseViewKey, CostDatabaseImportedRow[]>>,
  applicable: string,
): PmCostRow[] {
  const fetched = new Set(Object.keys(byView) as CostDatabaseViewKey[])
  const kept = existing.filter((row) => !fetched.has(row.type as CostDatabaseViewKey))
  return reindexCostRows([...kept, ...mergeCostDatabaseViewRows(byView, applicable)])
}

export const COST_DATABASE_FIELD_LABEL_KEYS: Record<CostDatabaseFieldKey, string> = {
  code: 'projectManagerPage.costTable.columns.code',
  name: 'projectManagerPage.costTable.columns.name',
  featureDescription: 'projectManagerPage.costTable.columns.featureDescription',
  unit: 'projectManagerPage.costTable.columns.unit',
  quantity: 'projectManagerPage.costTable.columns.quantity',
  periodQuantity: 'projectManagerPage.costTable.columns.periodQuantity',
  priorQuantity: 'projectManagerPage.costTable.columns.priorQuantity',
  unitPrice: 'projectManagerPage.costTable.columns.unitPrice',
  sectionalWork: 'projectManagerPage.costTable.columns.sectionalWork',
  subproject: 'projectManagerPage.costTable.columns.subproject',
  type: 'projectManagerPage.costTable.columns.type',
  note: 'projectManagerPage.costTable.columns.note',
  currency: 'projectManagerPage.costTable.columns.currency',
  billingPeriod: 'projectManagerPage.costTable.columns.billingPeriod',
  priceAdjustment: 'projectManagerPage.costTable.columns.priceAdjustment',
  priceCorrection: 'projectManagerPage.costTable.columns.priceCorrection',
  applicationDate: 'projectManagerPage.costTable.columns.applicationDate',
  effectiveDate: 'projectManagerPage.costTable.columns.effectiveDate',
  actualPaymentDate1: 'projectManagerPage.costTable.columns.actualPaymentDate1',
  actualPaymentDate2: 'projectManagerPage.costTable.columns.actualPaymentDate2',
  periodClaimAmount: 'projectManagerPage.costTable.columns.periodClaimAmount',
  payableAmount: 'projectManagerPage.costTable.columns.payableAmount',
}

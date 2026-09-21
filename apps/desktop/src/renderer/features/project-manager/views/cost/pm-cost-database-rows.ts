import {
  type CostDatabaseImportedRow,
  type CostDatabaseFieldKey,
  COST_DATABASE_VIEW_KEYS,
  type CostDatabaseViewKey,
} from '@toolman/shared'

import { createEmptyCostRow, reindexCostRows, isPmCostPracticeQuotaType, isPmCostType, type PmCostRow, type PmCostType } from './pm-cost-catalog'
import {
  normalizeCostIpcAmountKey,
  normalizeCostIpcAmounts,
  parseCostIpcNoIndex,
} from './pm-cost-ipc-cols'
import { sanitizeCostPracticeRows, sortCostPracticeRowsByCode } from './pm-cost-practice-sanitize'

function importedToCostRow(
  item: CostDatabaseImportedRow,
  index: number,
  applicable: string,
  defaultType: PmCostType,
): PmCostRow {
  const row = createEmptyCostRow(index, defaultType, null, applicable)
  row.code = item.code
  const isMetering = defaultType === 'budgetQuota'
  // 中期计量 often maps description but not 工作名称 — use feature text as the name.
  row.name =
    item.name.trim() ||
    (isMetering && item.featureDescription.trim() ? item.featureDescription : '') ||
    ''
  row.featureDescription = item.featureDescription
  row.unit = item.unit
  row.quantity = isMetering ? null : item.quantity
  row.unitPrice = item.unitPrice
  row.sectionalWork = item.sectionalWork
  row.subproject = item.subproject
  row.note = item.note
  const ipcNo = item.ipcNo?.trim() ?? ''
  const hasIpcPeriod = isMetering && Boolean(ipcNo)
  // With ipc_no, DB quantity is not 本期完成工程量 — keep period/prior empty unless explicit.
  row.periodQuantity =
    item.periodQuantity ?? (isMetering && !hasIpcPeriod ? item.quantity : null)
  row.priorQuantity = item.priorQuantity ?? null
  if (hasIpcPeriod) {
    const amount =
      item.currentTotalPrice != null && Number.isFinite(item.currentTotalPrice)
        ? item.currentTotalPrice
        : null
    const key = normalizeCostIpcAmountKey(ipcNo)
    if (key) row.ipcAmounts = { [key]: amount }
  }
  if (isPmCostType(item.type)) {
    row.type = isPmCostPracticeQuotaType(defaultType)
      ? item.type
      : isPmCostPracticeQuotaType(item.type)
        ? defaultType
        : item.type
  }
  return row
}

function normalizeMeteringPart(value: string): string {
  return value.trim().replace(/\s+/g, '').toLowerCase()
}

/** Normalize bill codes so `01.2` matches price-list `1.2`. */
function normalizeMeteringCode(value: string): string {
  const trimmed = normalizeMeteringPart(value)
  if (!trimmed) return ''
  return trimmed
    .split('.')
    .map((part) => (/^\d+$/.test(part) ? String(Number(part)) : part))
    .join('.')
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

function meteringImportedGroupKey(item: CostDatabaseImportedRow, index: number): string {
  // Pivot by item + schedule + lot so Kisada/Schedule1/1.1 stays separate from other lots.
  const code = normalizeMeteringCode(item.code)
  const section = normalizeMeteringPart(item.sectionalWork)
  const subproject = normalizeMeteringPart(item.subproject)
  if (code) return `c:${code}\0${section}\0${subproject}`
  const name = normalizeMeteringPart(item.name)
  if (name) return `n:${name}\0${section}\0${subproject}`
  const feature = normalizeMeteringPart(item.featureDescription)
  if (feature) return `f:${feature}\0${section}\0${subproject}`
  // Last resort: keep index so unrelated blank rows do not collapse together.
  if (section || subproject) return `s:${section}\0${subproject}\0${index}`
  return `i:${index}`
}

function foldMeteringCatalogRow(
  target: PmCostRow,
  incoming: PmCostRow,
  incomingIpcIndex: number,
  latestIpcIndex: number,
): number {
  target.ipcAmounts = foldIpcAmounts(target.ipcAmounts, incoming.ipcAmounts)
  if (incomingIpcIndex < latestIpcIndex) return latestIpcIndex
  target.periodQuantity = incoming.periodQuantity ?? null
  target.priorQuantity = incoming.priorQuantity ?? null
  if (incoming.unitPrice != null) target.unitPrice = incoming.unitPrice
  if (incoming.sectionalWork.trim()) target.sectionalWork = incoming.sectionalWork
  if (incoming.subproject.trim()) target.subproject = incoming.subproject
  if (incoming.note.trim()) target.note = incoming.note
  if (incoming.name.trim() && !target.name.trim()) target.name = incoming.name
  if (incoming.featureDescription.trim() && !target.name.trim()) {
    target.name = incoming.featureDescription
  }
  if (incoming.code.trim() && !target.code.trim()) target.code = incoming.code
  return incomingIpcIndex
}

/** True when a metering row can stand as a work item (not a nameless amount orphan). */
export function hasCostMeteringWorkIdentity(
  row: Pick<PmCostRow, 'name' | 'code' | 'featureDescription'>,
): boolean {
  return Boolean(row.name.trim() || row.code.trim() || row.featureDescription.trim())
}

function sanitizeMeteringCatalogRows(rows: readonly PmCostRow[]): PmCostRow[] {
  return sanitizeCostPracticeRows(rows)
}

export function costDatabaseRowsToCatalog(
  imported: CostDatabaseImportedRow[],
  applicable: string,
  defaultType: PmCostType = 'constructionQuota',
): PmCostRow[] {
  if (defaultType !== 'budgetQuota') {
    return reindexCostRows(
      imported.map((item, index) => importedToCostRow(item, index, applicable, defaultType)),
    )
  }
  const groups = new Map<string, { row: PmCostRow; latestIpcIndex: number }>()
  const order: string[] = []
  imported.forEach((item, index) => {
    const key = meteringImportedGroupKey(item, index)
    const mapped = importedToCostRow(item, index, applicable, defaultType)
    const ipcIndex = parseCostIpcNoIndex(item.ipcNo ?? '') ?? -1
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, { row: mapped, latestIpcIndex: ipcIndex })
      order.push(key)
      return
    }
    existing.latestIpcIndex = foldMeteringCatalogRow(
      existing.row,
      mapped,
      ipcIndex,
      existing.latestIpcIndex,
    )
  })
  return sanitizeMeteringCatalogRows(
    sortCostPracticeRowsByCode(order.map((key) => groups.get(key)!.row)),
  )
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

function meteringFetchMatchKey(
  row: Pick<PmCostRow, 'code' | 'sectionalWork' | 'subproject'>,
): string {
  const code = normalizeMeteringCode(row.code)
  const section = normalizeMeteringPart(row.sectionalWork)
  const subproject = normalizeMeteringPart(row.subproject)
  // 中期计量金额必须同时对上 编码 + 分部工程 + 子项目；缺一不可。
  if (!code || !section || !subproject) return ''
  return `${code}\0${section}\0${subproject}`
}

function meteringFetchCodeKey(row: Pick<PmCostRow, 'code'>): string {
  return normalizeMeteringCode(row.code)
}

function meteringPartBlank(value: string): boolean {
  return !normalizeMeteringPart(value)
}

function canLooseCodeMatch(
  existing: Pick<PmCostRow, 'sectionalWork' | 'subproject'>,
  incoming: Pick<PmCostRow, 'sectionalWork' | 'subproject'>,
): boolean {
  // Only fall back to item-code when schedule/lot is blank on either side.
  return (
    meteringPartBlank(existing.sectionalWork) ||
    meteringPartBlank(existing.subproject) ||
    meteringPartBlank(incoming.sectionalWork) ||
    meteringPartBlank(incoming.subproject)
  )
}

function hasRealMeteringLabel(
  row: Pick<PmCostRow, 'name' | 'code' | 'featureDescription'>,
): boolean {
  if (row.featureDescription.trim()) return true
  const name = row.name.trim()
  if (!name) return false
  const code = row.code.trim()
  if (!code) return true
  return name.trim().replace(/\s+/g, '').toLowerCase() !== code.trim().replace(/\s+/g, '').toLowerCase()
}

function stripIpcAmounts(row: PmCostRow): PmCostRow {
  if (!row.ipcAmounts) return row
  const next = { ...row }
  delete next.ipcAmounts
  return next
}

function rowHasFiniteIpcAmounts(row: Pick<PmCostRow, 'ipcAmounts'>): boolean {
  if (!row.ipcAmounts) return false
  return Object.values(row.ipcAmounts).some(
    (value) => value != null && Number.isFinite(value),
  )
}

/**
 * Restore 合同工程数量 / 单价 / 单位 / 工作名称 from the price list (BOQ) for the
 * same 编码+分部工程+子项目. Metering IPC money must not redefine contract rates.
 */
function applyPriceListContractFields(
  row: PmCostRow,
  price: PmCostRow | undefined,
): PmCostRow {
  if (!price) return row
  const name =
    price.name.trim() ||
    row.name.trim() ||
    price.featureDescription.trim() ||
    row.featureDescription.trim() ||
    row.name
  return {
    ...row,
    name,
    featureDescription: price.featureDescription.trim() || row.featureDescription,
    unit: price.unit.trim() || row.unit,
    quantity: price.quantity,
    unitPrice: price.unitPrice,
  }
}

function indexPriceListByTriple(
  priceList: readonly PmCostRow[],
): Map<string, PmCostRow> {
  const byExact = new Map<string, PmCostRow>()
  for (const row of priceList) {
    const key = meteringFetchMatchKey(row)
    if (!key || byExact.has(key)) continue
    byExact.set(key, row)
  }
  return byExact
}

/** Overlay 本期 / 往期 / IPC amounts onto the current table by item+schedule+lot. */
export function mergeMeteringFetchRows(
  existing: readonly PmCostRow[],
  fetched: readonly PmCostRow[],
  priceList: readonly PmCostRow[] = [],
): PmCostRow[] {
  const byPrice = indexPriceListByTriple(priceList)
  const base =
    existing.length > 0
      ? existing
      : priceList.length > 0
        ? priceList
        : []
  if (base.length === 0) {
    // No price list to anchor contract rates — do not present metering unitPrice as 单价.
    return sanitizeMeteringCatalogRows(
      fetched.map((row) => ({ ...row, quantity: null, unitPrice: null })),
    )
  }
  if (fetched.length === 0) {
    return sanitizeMeteringCatalogRows(
      base.map((row) => applyPriceListContractFields(row, byPrice.get(meteringFetchMatchKey(row)))),
    )
  }
  const fetchedHasIpc = fetched.some(rowHasFiniteIpcAmounts)

  // One overlay payload per 编码+分部工程+子项目 (pivot may already fold IPC periods).
  const byExact = new Map<string, PmCostRow>()
  const byCode = new Map<string, PmCostRow[]>()
  for (const row of fetched) {
    const exactKey = meteringFetchMatchKey(row)
    if (exactKey) {
      const prev = byExact.get(exactKey)
      if (!prev) {
        byExact.set(exactKey, { ...row, ipcAmounts: normalizeCostIpcAmounts(row.ipcAmounts) })
      } else {
        byExact.set(exactKey, {
          ...prev,
          name: prev.name.trim() || row.name,
          featureDescription: prev.featureDescription.trim() || row.featureDescription,
          ipcAmounts: foldIpcAmounts(prev.ipcAmounts, row.ipcAmounts),
          periodQuantity: row.periodQuantity ?? prev.periodQuantity,
          priorQuantity: row.priorQuantity ?? prev.priorQuantity,
        })
      }
    }
    const code = meteringFetchCodeKey(row)
    if (!code) continue
    const list = byCode.get(code) ?? []
    list.push(row)
    byCode.set(code, list)
  }

  const matchedExactKeys = new Set<string>()
  const usedLoose = new Set<PmCostRow>()
  const takeLoose = (list: PmCostRow[] | undefined, existingRow: PmCostRow) => {
    const found = list?.find((item) => {
      if (usedLoose.has(item)) return false
      return canLooseCodeMatch(existingRow, item)
    })
    if (found) usedLoose.add(found)
    return found
  }

  let matchedWithIpc = 0
  const next = base.map((row) => {
    const exactKey = meteringFetchMatchKey(row)
    const withContract = applyPriceListContractFields(
      row,
      exactKey ? byPrice.get(exactKey) : undefined,
    )
    // IPC money: only exact 编码+分部工程+子项目. Same amounts apply to every
    // duplicate price-list row that shares the triple (do not one-shot consume).
    if (fetchedHasIpc) {
      const incoming = exactKey ? byExact.get(exactKey) : undefined
      if (!incoming) {
        // Drop stale amounts / 本期往期 from earlier bad overlays.
        return {
          ...stripIpcAmounts(withContract),
          periodQuantity: null,
          priorQuantity: null,
        }
      }
      matchedExactKeys.add(exactKey)
      const incomingIpc = normalizeCostIpcAmounts(incoming.ipcAmounts)
      if (rowHasFiniteIpcAmounts({ ipcAmounts: incomingIpc })) matchedWithIpc += 1
      const filledName =
        withContract.name.trim() ||
        incoming.name.trim() ||
        incoming.featureDescription.trim() ||
        withContract.featureDescription.trim() ||
        withContract.name
      // IPC fetch replaces money totals; clear quantity-based 本期/往期 so they
      // cannot fake 累计完成金额 when IPCx are blank.
      return incomingIpc
        ? {
            ...withContract,
            name: filledName,
            ipcAmounts: incomingIpc,
            periodQuantity: null,
            priorQuantity: null,
          }
        : {
            ...stripIpcAmounts(withContract),
            name: filledName,
            periodQuantity: null,
            priorQuantity: null,
          }
    }

    const incoming =
      (exactKey ? byExact.get(exactKey) : undefined) ??
      takeLoose(byCode.get(meteringFetchCodeKey(row)), row)
    if (!incoming) return withContract
    if (exactKey) matchedExactKeys.add(exactKey)
    const incomingIpc = normalizeCostIpcAmounts(incoming.ipcAmounts)
    const filledName =
      withContract.name.trim() ||
      incoming.name.trim() ||
      incoming.featureDescription.trim() ||
      withContract.featureDescription.trim() ||
      withContract.name
    const incomingHasIpc = rowHasFiniteIpcAmounts({ ipcAmounts: incomingIpc })
    const ipcAmounts = foldIpcAmounts(withContract.ipcAmounts, incomingIpc)
    return {
      ...withContract,
      name: filledName,
      ...(incomingHasIpc
        ? {}
        : {
            periodQuantity: incoming.periodQuantity ?? null,
            priorQuantity: incoming.priorQuantity ?? null,
          }),
      ...(ipcAmounts ? { ipcAmounts } : {}),
    }
  })

  const occupiedKeys = new Set(
    next.map((row) => meteringFetchMatchKey(row)).filter((key) => Boolean(key)),
  )
  // Append unmatched full-triple rows. Prefer BOQ contract fields when present.
  const extras = [...byExact.entries()]
    .filter(([key, row]) => {
      if (matchedExactKeys.has(key) || occupiedKeys.has(key)) return false
      if (fetchedHasIpc && matchedWithIpc > 0 && !hasRealMeteringLabel(row)) return false
      if (fetchedHasIpc && matchedWithIpc === 0 && !hasRealMeteringLabel(row)) return false
      return true
    })
    .map(([key, row]) => {
      const price = byPrice.get(key)
      if (price) {
        return {
          ...applyPriceListContractFields(price, price),
          ipcAmounts: normalizeCostIpcAmounts(row.ipcAmounts),
        }
      }
      // Metering-only: keep IPC money but do not show ipc unitPrice as 合同单价.
      return { ...row, quantity: null, unitPrice: null }
    })

  const merged =
    extras.length === 0 ? next : reindexCostRows([...next, ...sanitizeMeteringCatalogRows(extras)])
  return sanitizeMeteringCatalogRows(merged)
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
  ipcNo: 'projectManagerPage.costTable.columns.ipcNo',
  currentTotalPrice: 'projectManagerPage.costTable.columns.currentTotalPrice',
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

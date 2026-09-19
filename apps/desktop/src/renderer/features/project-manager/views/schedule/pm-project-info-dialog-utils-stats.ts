/** Schedule/resource/cost stats and format helpers for `ProjectInfoDialog`. */

import type { PmWorkItem } from '@toolman/shared'

import {
  costSectionCurrencyKey,
  DEFAULT_COST_CURRENCY,
  getCostCardCurrency,
} from '../cost/pm-cost-currency'
import {
  costSectionalWorkKey,
  PM_COST_TYPES,
  sumCostRowsTotalPrice,
  uniqueSortedSectionalKeys,
  type PmCostRow,
  type PmCostType,
} from '../cost/pm-cost-catalog'
import { PM_RESOURCE_TYPES, type PmResourceRow, type PmResourceType } from '../resource/pm-resource-catalog'

export function computeScheduleBounds(items: PmWorkItem[]): {
  earliestStart: number | null
  latestFinish: number | null
} {
  let earliestStart: number | null = null
  let latestFinish: number | null = null
  for (const item of items) {
    if (item.startDate != null) {
      earliestStart =
        earliestStart == null ? item.startDate : Math.min(earliestStart, item.startDate)
    }
    if (item.dueDate != null) {
      latestFinish = latestFinish == null ? item.dueDate : Math.max(latestFinish, item.dueDate)
    }
  }
  return { earliestStart, latestFinish }
}

export function formatDateTime(ms: number, locale: string): string {
  return new Date(ms).toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatMoney(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })
}

export function computeResourceStats(rows: PmResourceRow[]) {
  const byType = Object.fromEntries(PM_RESOURCE_TYPES.map((type) => [type, 0])) as Record<
    PmResourceType,
    number
  >
  let priced = 0
  let priceSum = 0
  let minPrice: number | null = null
  let maxPrice: number | null = null
  for (const row of rows) {
    byType[row.type] += 1
    if (row.unitPrice == null || !Number.isFinite(row.unitPrice)) continue
    priced += 1
    priceSum += row.unitPrice
    minPrice = minPrice == null ? row.unitPrice : Math.min(minPrice, row.unitPrice)
    maxPrice = maxPrice == null ? row.unitPrice : Math.max(maxPrice, row.unitPrice)
  }
  return {
    total: rows.length,
    priced,
    unpriced: rows.length - priced,
    avgUnitPrice: priced === 0 ? null : Math.round((priceSum / priced) * 100) / 100,
    priceSum,
    minPrice,
    maxPrice,
    byType,
  }
}

export type CostStatsCurrencyContext = {
  costCurrencies: Record<string, string>
  unsetCostCurrency: string
}

export type CostAmountByCurrency = {
  currency: string
  amount: number | null
}

export function resolveCostSectionCurrency(
  sectionKey: string,
  currency?: CostStatsCurrencyContext,
): string {
  if (!currency) return DEFAULT_COST_CURRENCY
  return (
    getCostCardCurrency(
      currency.costCurrencies,
      currency.unsetCostCurrency,
      costSectionCurrencyKey(sectionKey),
    ).trim() || DEFAULT_COST_CURRENCY
  )
}

/** Sum 综合单价 合价 by each row's 分部工程 currency. */
export function groupComprehensiveAmountsByCurrency(
  rows: readonly PmCostRow[],
  currency?: CostStatsCurrencyContext,
): CostAmountByCurrency[] {
  const comprehensive = rows.filter((row) => row.type === 'comprehensive')
  if (comprehensive.length === 0) return []
  const groups = new Map<string, PmCostRow[]>()
  const order: string[] = []
  for (const key of uniqueSortedSectionalKeys(comprehensive)) {
    const code = resolveCostSectionCurrency(key, currency)
    if (!groups.has(code)) {
      groups.set(code, [])
      order.push(code)
    }
  }
  for (const row of comprehensive) {
    const code = resolveCostSectionCurrency(costSectionalWorkKey(row), currency)
    groups.get(code)?.push(row)
  }
  return order.map((code) => ({
    currency: code,
    amount: sumCostRowsTotalPrice(groups.get(code) ?? []),
  }))
}

export function computeCostStats(rows: PmCostRow[], currency?: CostStatsCurrencyContext) {
  const sectionOrder = uniqueSortedSectionalKeys(rows)
  const sectionTotals = new Map<string, number | null>()
  const rowsByType = Object.fromEntries(PM_COST_TYPES.map((type) => [type, [] as PmCostRow[]])) as Record<
    PmCostType,
    PmCostRow[]
  >
  let priced = 0
  let priceSum = 0
  let minPrice: number | null = null
  let maxPrice: number | null = null
  for (const row of rows) {
    rowsByType[row.type].push(row)
    if (row.unitPrice != null && Number.isFinite(row.unitPrice)) {
      priced += 1
      priceSum += row.unitPrice
      minPrice = minPrice == null ? row.unitPrice : Math.min(minPrice, row.unitPrice)
      maxPrice = maxPrice == null ? row.unitPrice : Math.max(maxPrice, row.unitPrice)
    }
  }
  for (const key of sectionOrder) {
    const group = rows.filter((row) => costSectionalWorkKey(row) === key)
    sectionTotals.set(key, sumCostRowsTotalPrice(group))
  }
  const totalPriceSum = sumCostRowsTotalPrice(rows)
  return {
    total: rows.length,
    priced,
    unpriced: rows.length - priced,
    avgUnitPrice: priced === 0 ? null : Math.round((priceSum / priced) * 100) / 100,
    totalPriceSum,
    minPrice,
    maxPrice,
    /** 分部工程 cards: name + 合价 (Schedule1 → Schedule4). */
    sections: sectionOrder.map((key) => ({
      key,
      amount: sectionTotals.get(key) ?? null,
    })),
    /** Per-type 合价合计 (child rollup; no double-count). */
    amountByType: Object.fromEntries(
      PM_COST_TYPES.map((type) => [type, sumCostRowsTotalPrice(rowsByType[type])]),
    ) as Record<PmCostType, number | null>,
    /** 综合单价 card: one total per 分部工程 currency. */
    comprehensiveByCurrency: groupComprehensiveAmountsByCurrency(rows, currency),
  }
}

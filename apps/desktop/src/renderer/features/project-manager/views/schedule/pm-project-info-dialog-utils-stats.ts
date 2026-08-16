/** Schedule/resource/cost stats and format helpers for `ProjectInfoDialog`. */

import type { PmWorkItem } from '@toolman/shared'

import {
  costSectionalWorkKey,
  PM_COST_TYPES,
  sumCostRowsTotalPrice,
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

export function computeCostStats(rows: PmCostRow[]) {
  const sectionTotals = new Map<string, number | null>()
  const sectionOrder: string[] = []
  const rowsByType = Object.fromEntries(PM_COST_TYPES.map((type) => [type, [] as PmCostRow[]])) as Record<
    PmCostType,
    PmCostRow[]
  >
  let priced = 0
  let priceSum = 0
  let minPrice: number | null = null
  let maxPrice: number | null = null
  for (const row of rows) {
    const sectionKey = costSectionalWorkKey(row)
    if (!sectionTotals.has(sectionKey)) {
      sectionTotals.set(sectionKey, null)
      sectionOrder.push(sectionKey)
    }
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
    /** 分部工程 cards: name + 合价 (first-appearance order). */
    sections: sectionOrder.map((key) => ({
      key,
      amount: sectionTotals.get(key) ?? null,
    })),
    /** Per-type 合价合计 (child rollup; no double-count). */
    amountByType: Object.fromEntries(
      PM_COST_TYPES.map((type) => [type, sumCostRowsTotalPrice(rowsByType[type])]),
    ) as Record<PmCostType, number | null>,
  }
}

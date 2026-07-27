/** Price-list currency stored on `PmProject.metadata` (项目信息 · 价格卡片). */

/** Default currency for price-list project info (价格 tab). */
export const DEFAULT_COST_CURRENCY = '元'
/** Legacy single currency; also used as default for cards without a per-card override. */
export const COST_CURRENCY_META_KEY = 'costCurrency'
/** Per price-card currency overrides (`PmCostType` or `section:<key>`). */
export const COST_CURRENCIES_META_KEY = 'costCurrencies'

export function costSectionCurrencyKey(sectionKey: string): string {
  return `section:${sectionKey || '__empty__'}`
}

export function readCostCurrenciesMap(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!metadata) return {}
  const raw = metadata[COST_CURRENCIES_META_KEY]
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') result[key] = value
  }
  return result
}

export function readUnsetCostCurrency(
  metadata: Record<string, unknown> | null | undefined,
): string {
  if (!metadata) return DEFAULT_COST_CURRENCY
  const value = metadata[COST_CURRENCY_META_KEY]
  if (typeof value === 'string' && value.trim()) return value.trim()
  return DEFAULT_COST_CURRENCY
}

export function readCostCurrencyState(
  metadata: Record<string, unknown> | null | undefined,
  projectCode?: string,
): {
  costCurrencies: Record<string, string>
  unsetCostCurrency: string
} {
  const costCurrencies = { ...readCostCurrenciesMap(metadata) }
  let unsetCostCurrency = readUnsetCostCurrency(metadata)
  // EMP-2401 sample: default 元; 投资估算 card stays 万元 unless already overridden.
  if (projectCode === 'EMP-2401') {
    unsetCostCurrency = DEFAULT_COST_CURRENCY
    if (!Object.prototype.hasOwnProperty.call(costCurrencies, 'investment')) {
      costCurrencies.investment = '万元'
    }
  }
  return { costCurrencies, unsetCostCurrency }
}

export function getCostCardCurrency(
  costCurrencies: Record<string, string>,
  unsetCostCurrency: string,
  cardKey: string,
): string {
  if (Object.prototype.hasOwnProperty.call(costCurrencies, cardKey)) {
    return costCurrencies[cardKey] ?? ''
  }
  return unsetCostCurrency.trim() || DEFAULT_COST_CURRENCY
}

export function normalizeCostCurrencies(map: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(map)) {
    result[key] = value.trim() || DEFAULT_COST_CURRENCY
  }
  return result
}

/** Currency shown on the price-table 合价 column.
 * Prefer 分部工程 card currencies when set (and unanimous / majority);
 * otherwise the project default (`costCurrency` / unset).
 */
export function resolveCostTableTotalPriceCurrency(
  metadata: Record<string, unknown> | null | undefined,
  projectCode?: string,
): string {
  const { costCurrencies, unsetCostCurrency } = readCostCurrencyState(metadata, projectCode)
  const sectionCurrencies: string[] = []
  for (const [key, value] of Object.entries(costCurrencies)) {
    if (!key.startsWith('section:')) continue
    const trimmed = value.trim()
    if (trimmed) sectionCurrencies.push(trimmed)
  }
  if (sectionCurrencies.length > 0) {
    const counts = new Map<string, number>()
    for (const currency of sectionCurrencies) {
      counts.set(currency, (counts.get(currency) ?? 0) + 1)
    }
    let best = sectionCurrencies[0]!
    let bestCount = 0
    for (const [currency, count] of counts) {
      if (count > bestCount) {
        best = currency
        bestCount = count
      }
    }
    return best
  }
  return unsetCostCurrency.trim() || DEFAULT_COST_CURRENCY
}

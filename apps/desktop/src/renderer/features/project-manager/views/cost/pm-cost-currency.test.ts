import { describe, expect, it } from 'vitest'

import {
  DEFAULT_COST_CURRENCY,
  resolveCostTableTotalPriceCurrency,
  readCostCurrencyState,
} from './pm-cost-currency'

describe('pm-cost-currency', () => {
  it('defaults to 元 when metadata is empty', () => {
    expect(resolveCostTableTotalPriceCurrency(null)).toBe(DEFAULT_COST_CURRENCY)
    expect(resolveCostTableTotalPriceCurrency({})).toBe(DEFAULT_COST_CURRENCY)
  })

  it('reads project default costCurrency when no section cards override', () => {
    expect(
      resolveCostTableTotalPriceCurrency({ costCurrency: '万元' }),
    ).toBe('万元')
    expect(
      resolveCostTableTotalPriceCurrency({
        costCurrency: '元',
        costCurrencies: { investment: '万元' },
      }),
    ).toBe('元')
  })

  it('prefers 分部工程 card currency over default costCurrency', () => {
    expect(
      resolveCostTableTotalPriceCurrency({
        costCurrency: '元',
        costCurrencies: {
          'section:工程费': '万元',
          'section:工程建设其他费': '万元',
          investment: '万元',
        },
      }),
    ).toBe('万元')
  })

  it('uses the majority when section card currencies differ', () => {
    expect(
      resolveCostTableTotalPriceCurrency({
        costCurrency: '元',
        costCurrencies: {
          'section:A': '万元',
          'section:B': '万元',
          'section:C': '元',
        },
      }),
    ).toBe('万元')
  })

  it('applies EMP-2401 defaults', () => {
    const state = readCostCurrencyState({}, 'EMP-2401')
    expect(state.unsetCostCurrency).toBe('元')
    expect(state.costCurrencies.investment).toBe('万元')
  })
})

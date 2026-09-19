import { describe, expect, it } from 'vitest'

import type { PmCostRow } from '../cost/pm-cost-catalog'
import { PM_COST_INFO_COST_CARD_TYPES } from './pm-project-info-dialog-utils-types'
import { computeCostStats, groupComprehensiveAmountsByCurrency } from './pm-project-info-dialog-utils-stats'

function row(partial: Partial<PmCostRow> & Pick<PmCostRow, 'id' | 'name'>): PmCostRow {
  return {
    id: partial.id,
    type: partial.type ?? 'comprehensive',
    code: partial.code ?? '',
    name: partial.name,
    featureDescription: partial.featureDescription ?? '',
    unit: partial.unit ?? '',
    quantity: partial.quantity ?? null,
    unitPrice: partial.unitPrice ?? null,
    applicable: partial.applicable ?? 'all',
    note: partial.note ?? '',
    sectionalWork: partial.sectionalWork ?? '',
    subproject: partial.subproject ?? '',
    sectionCode: partial.sectionCode ?? '',
    sectionNote: partial.sectionNote ?? '',
    sectionName: partial.sectionName ?? '',
    sectionFeatureDescription: partial.sectionFeatureDescription ?? '',
    sectionTotalFormula: partial.sectionTotalFormula ?? '',
    sortOrder: partial.sortOrder ?? 0,
    parentId: partial.parentId ?? null,
  }
}

describe('computeCostStats', () => {
  it('lists 分部工程 cards from Schedule1 to Schedule4', () => {
    const stats = computeCostStats([
      row({ id: '4', name: 'D', sectionalWork: 'Schedule4', quantity: 1, unitPrice: 40 }),
      row({ id: '2', name: 'B', sectionalWork: 'Schedule2', quantity: 1, unitPrice: 20 }),
      row({ id: '1', name: 'A', sectionalWork: 'Schedule1', quantity: 1, unitPrice: 10 }),
      row({ id: '3', name: 'C', sectionalWork: 'Schedule3', quantity: 1, unitPrice: 30 }),
    ])
    expect(stats.sections.map((section) => section.key)).toEqual([
      'Schedule1',
      'Schedule2',
      'Schedule3',
      'Schedule4',
    ])
  })

  it('groups 综合单价 amounts by 分部工程 currency and does not mix them', () => {
    const rows = [
      row({ id: '1', name: 'A', sectionalWork: 'Schedule1', quantity: 2, unitPrice: 100 }),
      row({ id: '2', name: 'B', sectionalWork: 'Schedule2', quantity: 3, unitPrice: 50 }),
      row({
        id: '3',
        name: 'C',
        type: 'management',
        sectionalWork: 'Schedule1',
        quantity: 1,
        unitPrice: 999,
      }),
    ]
    expect(
      groupComprehensiveAmountsByCurrency(rows, {
        costCurrencies: {
          'section:Schedule1': '元',
          'section:Schedule2': 'USD',
        },
        unsetCostCurrency: '元',
      }),
    ).toEqual([
      { currency: '元', amount: 200 },
      { currency: 'USD', amount: 150 },
    ])
  })

  it('sums 综合单价 sections that share a currency', () => {
    const stats = computeCostStats(
      [
        row({ id: '1', name: 'A', sectionalWork: 'Schedule1', quantity: 1, unitPrice: 10 }),
        row({ id: '2', name: 'B', sectionalWork: 'Schedule2', quantity: 1, unitPrice: 20 }),
      ],
      {
        costCurrencies: {
          'section:Schedule1': '元',
          'section:Schedule2': '元',
        },
        unsetCostCurrency: '元',
      },
    )
    expect(stats.comprehensiveByCurrency).toEqual([{ currency: '元', amount: 30 }])
  })
})

describe('PM_COST_INFO_COST_CARD_TYPES', () => {
  it('omits 资金 from the 成本 cards', () => {
    expect(PM_COST_INFO_COST_CARD_TYPES).not.toContain('funds')
    expect(PM_COST_INFO_COST_CARD_TYPES).toContain('comprehensive')
  })
})

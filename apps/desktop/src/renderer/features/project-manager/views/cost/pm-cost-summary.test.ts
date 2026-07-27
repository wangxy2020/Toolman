import { describe, expect, it } from 'vitest'

import type { PmCostRow } from './pm-cost-catalog'
import {
  appendCostFormulaRef,
  buildCostSectionalRollupDisplayEntries,
  buildDefaultCostSummaryRows,
  evaluateCostFormula,
  normalizeCostSummaryRows,
} from './pm-cost-summary'

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
    sectionCode: partial.sectionCode ?? '',
    sectionNote: partial.sectionNote ?? '',
    sectionName: partial.sectionName ?? '',
    sectionFeatureDescription: partial.sectionFeatureDescription ?? '',
    sectionTotalFormula: partial.sectionTotalFormula ?? '',
    sortOrder: partial.sortOrder ?? 0,
    parentId: partial.parentId ?? null,
  }
}

describe('appendCostFormulaRef', () => {
  it('builds and extends formulas from picked section refs', () => {
    expect(appendCostFormulaRef('', '工程费')).toBe('=工程费')
    expect(appendCostFormulaRef('=', '工程费')).toBe('=工程费')
    expect(appendCostFormulaRef('=工程费', '工程建设其他费')).toBe('=工程费+工程建设其他费')
    expect(appendCostFormulaRef('=工程费+', '工程建设其他费')).toBe('=工程费+工程建设其他费')
  })
})

describe('evaluateCostFormula', () => {
  it('evaluates arithmetic with section name refs', () => {
    const refs = new Map([
      ['工程费', 100],
      ['安装', 40],
    ])
    expect(evaluateCostFormula('=工程费+安装', refs)).toBe(140)
    expect(evaluateCostFormula('=工程费*2', refs)).toBe(200)
    expect(evaluateCostFormula('=(工程费+安装)*2', refs)).toBe(280)
    expect(evaluateCostFormula('=工程费-安装', refs)).toBe(60)
    expect(evaluateCostFormula('=工程费/2', refs)).toBe(50)
    expect(evaluateCostFormula('100', refs)).toBe(100)
    expect(evaluateCostFormula('', refs)).toBeNull()
    expect(evaluateCostFormula('=未知项+安装', refs)).toBeNull()
  })

  it('prefers longer section names that share a prefix', () => {
    const refs = new Map([
      ['工程费', 10],
      ['工程建设其他费', 20],
    ])
    expect(evaluateCostFormula('=工程费+工程建设其他费', refs)).toBe(30)
    expect(evaluateCostFormula('＝工程费＋工程建设其他费', refs)).toBe(30)
  })
})

describe('buildDefaultCostSummaryRows', () => {
  it('always creates a single default summary row', () => {
    expect(
      buildDefaultCostSummaryRows(['元'], '汇总', (c) => `汇总（${c}）`).map((row) => ({
        name: row.name,
        currency: row.currency,
      })),
    ).toEqual([{ name: '汇总', currency: '元' }])

    expect(
      buildDefaultCostSummaryRows(['元', '万元', '元'], '汇总', (c) => `汇总（${c}）`).map(
        (row) => ({ name: row.name, currency: row.currency }),
      ),
    ).toEqual([{ name: '汇总', currency: '元' }])
  })
})

describe('normalizeCostSummaryRows', () => {
  it('collapses legacy per-currency auto rows into one', () => {
    const result = normalizeCostSummaryRows(
      [
        {
          id: 'cost-summary:万元',
          code: '',
          name: '汇总（万元）',
          featureDescription: '',
          totalFormula: '',
          currency: '万元',
          sortOrder: 0,
        },
        {
          id: 'cost-summary:元',
          code: '',
          name: '汇总（元）',
          featureDescription: '',
          totalFormula: '',
          currency: '元',
          sortOrder: 1,
        },
      ],
      ['万元', '元'],
      '汇总',
      (currency) => `汇总（${currency}）`,
    )
    expect(result.changed).toBe(true)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ name: '汇总', id: 'cost-summary:default' })
  })

  it('keeps manually added summary rows', () => {
    const result = normalizeCostSummaryRows(
      [
        {
          id: 'cost-summary:default',
          code: '',
          name: '汇总',
          featureDescription: '',
          totalFormula: '',
          currency: '元',
          sortOrder: 0,
        },
        {
          id: 'manual-2',
          code: '',
          name: '汇总 2',
          featureDescription: '',
          totalFormula: '',
          currency: '元',
          sortOrder: 1,
        },
      ],
      ['元'],
      '汇总',
      (currency) => `汇总（${currency}）`,
    )
    expect(result.changed).toBe(false)
    expect(result.rows).toHaveLength(2)
  })
})

describe('buildCostSectionalRollupDisplayEntries', () => {
  it('defaults to one top summary row even with multiple section currencies', () => {
    const rows = [
      row({
        id: '1',
        name: 'A',
        sectionalWork: '工程费',
        quantity: 1,
        unitPrice: 10,
        sectionCode: 'GCF',
      }),
      row({
        id: '2',
        name: 'B',
        sectionalWork: '其他费',
        quantity: 1,
        unitPrice: 20,
        sectionCode: 'QTF',
      }),
    ]
    const entries = buildCostSectionalRollupDisplayEntries(rows, {
      metadata: {
        costCurrencies: {
          'section:工程费': '万元',
          'section:其他费': '元',
        },
      },
      summaryLabel: '汇总',
      summaryLabelWithCurrency: (currency) => `汇总（${currency}）`,
    })
    expect(entries.map((entry) => entry.kind)).toEqual(['summary', 'section', 'section'])
    expect(entries[0]).toMatchObject({
      kind: 'summary',
      row: { name: '汇总', currency: '万元' },
      // Empty formula auto-sums all 分部工程 amounts.
      total: 30,
    })
  })

  it('evaluates a custom top-level formula across section codes', () => {
    const rows = [
      row({
        id: '1',
        name: 'A',
        sectionalWork: '工程费',
        quantity: 1,
        unitPrice: 10,
        sectionCode: 'GCF',
      }),
      row({
        id: '2',
        name: 'B',
        sectionalWork: '其他费',
        quantity: 1,
        unitPrice: 20,
        sectionCode: 'QTF',
      }),
    ]
    const entries = buildCostSectionalRollupDisplayEntries(rows, {
      summaryRows: [
        {
          id: 's1',
          code: 'HJ',
          name: '合计',
          featureDescription: '',
          totalFormula: '=GCF+QTF',
          currency: '元',
          sortOrder: 0,
        },
      ],
      summaryLabel: '汇总',
      summaryLabelWithCurrency: (currency) => `汇总（${currency}）`,
    })
    expect(entries[0]).toMatchObject({
      kind: 'summary',
      total: 30,
      row: { code: 'HJ', name: '合计' },
    })
  })
})

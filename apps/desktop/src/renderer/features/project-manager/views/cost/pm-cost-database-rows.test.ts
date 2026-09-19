import { describe, expect, it } from 'vitest'

import { createEmptyCostRow } from './pm-cost-catalog'
import {
  costDatabaseRowsToCatalog,
  mergeCostDatabaseViewRows,
  mergeMeteringFetchRows,
} from './pm-cost-database-rows'

describe('costDatabaseRowsToCatalog', () => {
  it('maps imported sqlite rows onto the cost catalog', () => {
    const rows = costDatabaseRowsToCatalog(
      [
        {
          code: '0101',
          name: '挖土方',
          featureDescription: '三类土',
          unit: 'm3',
          quantity: 12,
          unitPrice: 45.5,
          sectionalWork: '土石方',
          subproject: '挖方',
          type: 'constructionQuota',
          note: '含外运',
        },
      ],
      'proj-1',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      code: '0101',
      name: '挖土方',
      featureDescription: '三类土',
      unit: 'm3',
      quantity: 12,
      unitPrice: 45.5,
      sectionalWork: '土石方',
      subproject: '挖方',
      type: 'constructionQuota',
      note: '含外运',
      applicable: 'proj-1',
    })
  })

  it('keeps the work name blank when the source does not map that column', () => {
    const rows = costDatabaseRowsToCatalog(
      [
        {
          code: '1.1',
          name: '',
          featureDescription: 'ZNO lightning arrester',
          unit: 'ea.',
          quantity: 30,
          unitPrice: 3842336,
          sectionalWork: 'Schedule4',
          subproject: 'Kisada',
          type: 'constructionQuota',
          note: '',
        },
      ],
      'proj-1',
    )
    expect(rows[0]?.name).toBe('')
    expect(rows[0]?.featureDescription).toBe('ZNO lightning arrester')
  })

  it('maps 施工定额 rows onto 综合单价 when importing into the price list', () => {
    const rows = costDatabaseRowsToCatalog(
      [
        {
          code: '1.1',
          name: '项',
          featureDescription: '',
          unit: 'ea.',
          quantity: 1,
          unitPrice: 2,
          sectionalWork: 'Schedule1',
          subproject: 'Kisada',
          type: 'constructionQuota',
          note: '',
        },
      ],
      'proj-1',
      'comprehensive',
    )
    expect(rows[0]?.type).toBe('comprehensive')
  })

  it('keeps a real price-list type from the source column', () => {
    const rows = costDatabaseRowsToCatalog(
      [
        {
          code: 'A',
          name: '项',
          featureDescription: '',
          unit: '',
          quantity: null,
          unitPrice: null,
          sectionalWork: '',
          subproject: '',
          type: 'labor',
          note: '',
        },
      ],
      'all',
      'comprehensive',
    )
    expect(rows[0]?.type).toBe('labor')
  })

  it('falls back to constructionQuota when the source type is unknown', () => {
    const rows = costDatabaseRowsToCatalog(
      [
        {
          code: 'A',
          name: '项',
          featureDescription: '',
          unit: '',
          quantity: null,
          unitPrice: null,
          sectionalWork: '',
          subproject: '',
          type: 'unknown-type',
          note: '',
        },
      ],
      'all',
    )
    expect(rows[0]?.type).toBe('constructionQuota')
  })

  it('merges imported rows by data view type', () => {
    const rows = mergeCostDatabaseViewRows(
      {
        constructionQuota: [
          {
            code: 'A',
            name: '价',
            featureDescription: '',
            unit: '',
            quantity: 1,
            unitPrice: 2,
            sectionalWork: '',
            subproject: '',
            type: '',
            note: '',
          },
        ],
        budgetQuota: [
          {
            code: 'B',
            name: '计量',
            featureDescription: '',
            unit: '',
            quantity: 3,
            unitPrice: 4,
            sectionalWork: '',
            subproject: '',
            type: '',
            note: '',
          },
        ],
      },
      'proj-1',
    )
    expect(rows.map((row) => row.type)).toEqual(['constructionQuota', 'budgetQuota'])
    expect(rows[1]?.name).toBe('计量')
  })

  it('maps 中期计量 quantity onto 本期完成工程量', () => {
    const rows = costDatabaseRowsToCatalog(
      [
        {
          code: 'M1',
          name: '',
          featureDescription: '',
          unit: '',
          quantity: 8,
          periodQuantity: 5,
          priorQuantity: 3,
          unitPrice: 10,
          sectionalWork: 'Schedule1',
          subproject: '',
          type: '',
          note: '',
        },
      ],
      'proj-1',
      'budgetQuota',
    )
    expect(rows[0]).toMatchObject({
      type: 'budgetQuota',
      quantity: null,
      periodQuantity: 5,
      priorQuantity: 3,
    })
  })

  it('falls back to the source quantity when 中期计量 has no period column', () => {
    const rows = costDatabaseRowsToCatalog(
      [
        {
          code: 'M2',
          name: '',
          featureDescription: '',
          unit: '',
          quantity: 8,
          unitPrice: 10,
          sectionalWork: '',
          subproject: '',
          type: '',
          note: '',
        },
      ],
      'proj-1',
      'budgetQuota',
    )
    expect(rows[0]).toMatchObject({
      quantity: null,
      periodQuantity: 8,
      priorQuantity: null,
    })
  })
})

describe('mergeMeteringFetchRows', () => {
  it('fills 本期 / 往期 on matching codes and keeps unmatched price-list rows', () => {
    const existing = createEmptyCostRow(0, 'comprehensive', null, 'proj-1')
    existing.code = 'A'
    existing.name = '挖土'
    const extra = createEmptyCostRow(1, 'comprehensive', null, 'proj-1')
    extra.code = 'B'
    extra.name = '回填'
    const fetched = createEmptyCostRow(0, 'budgetQuota', null, 'proj-1')
    fetched.code = 'A'
    fetched.periodQuantity = 4
    fetched.priorQuantity = 11
    const next = mergeMeteringFetchRows([existing, extra], [fetched])
    expect(next).toHaveLength(2)
    expect(next[0]).toMatchObject({
      code: 'A',
      name: '挖土',
      periodQuantity: 4,
      priorQuantity: 11,
    })
    expect(next[1]).toMatchObject({ code: 'B', name: '回填' })
  })
})

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

  it('uses feature description as 工作名称 for 中期计量 when name is blank', () => {
    const rows = costDatabaseRowsToCatalog(
      [
        {
          code: '1.1',
          name: '',
          featureDescription: 'ZNO lightning arrester',
          unit: 'ea.',
          quantity: 2,
          ipcNo: '1',
          currentTotalPrice: 100,
          unitPrice: null,
          sectionalWork: 'Schedule4',
          subproject: 'Kisada',
          type: '',
          note: '',
        },
      ],
      'proj-1',
      'budgetQuota',
    )
    expect(rows[0]?.name).toBe('ZNO lightning arrester')
    expect(rows[0]?.ipcAmounts).toEqual({ '1': 100 })
  })

  it('drops nameless metering orphans that only have schedule and amounts', () => {
    const rows = costDatabaseRowsToCatalog(
      [
        {
          code: '',
          name: '',
          featureDescription: '',
          unit: '',
          quantity: null,
          ipcNo: '1',
          currentTotalPrice: 50,
          unitPrice: null,
          sectionalWork: 'Schedule1',
          subproject: 'Kisada',
          type: '',
          note: '',
        },
        {
          code: '2.1',
          name: '',
          featureDescription: '',
          unit: '',
          quantity: null,
          ipcNo: '1',
          currentTotalPrice: 80,
          unitPrice: null,
          sectionalWork: 'Schedule1',
          subproject: 'Kisada',
          type: '',
          note: '',
        },
      ],
      'proj-1',
      'budgetQuota',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ code: '2.1', name: '', ipcAmounts: { '1': 80 } })
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

  it('pivots 中期计量 rows by ipc_no within the same item+schedule+lot', () => {
    const rows = costDatabaseRowsToCatalog(
      [
        {
          code: '1.1',
          name: '',
          featureDescription: '',
          unit: '',
          quantity: null,
          periodQuantity: 2,
          priorQuantity: 10,
          ipcNo: '1',
          currentTotalPrice: 200,
          unitPrice: 100,
          sectionalWork: 'Schedule1',
          subproject: 'Kisada',
          type: '',
          note: '',
        },
        {
          code: '1.1',
          name: '',
          featureDescription: '',
          unit: '',
          quantity: null,
          periodQuantity: 3,
          priorQuantity: 12,
          ipcNo: '2',
          currentTotalPrice: 300,
          unitPrice: 100,
          sectionalWork: 'Schedule1',
          subproject: 'Kisada',
          type: '',
          note: '',
        },
        {
          code: '1.1',
          name: '',
          featureDescription: '',
          unit: '',
          quantity: null,
          periodQuantity: 1,
          priorQuantity: 0,
          ipcNo: '1',
          currentTotalPrice: 50,
          unitPrice: 100,
          sectionalWork: 'Schedule2',
          subproject: 'Kisada',
          type: '',
          note: '',
        },
      ],
      'proj-1',
      'budgetQuota',
    )
    expect(rows).toHaveLength(2)
    const schedule1 = rows.find((row) => row.sectionalWork === 'Schedule1')
    const schedule2 = rows.find((row) => row.sectionalWork === 'Schedule2')
    expect(schedule1).toMatchObject({
      code: '1.1',
      subproject: 'Kisada',
      periodQuantity: 3,
      priorQuantity: 12,
      ipcAmounts: { '1': 200, '2': 300 },
    })
    expect(schedule2).toMatchObject({
      code: '1.1',
      ipcAmounts: { '1': 50 },
    })
  })

  it('overlays IPC amounts onto the matching Kisada / Schedule1 price-list row', () => {
    const existing = createEmptyCostRow(0, 'comprehensive', null, 'proj-1')
    existing.code = '1.1'
    existing.sectionalWork = 'Schedule1'
    existing.subproject = 'Kisada'
    existing.quantity = 10
    const other = createEmptyCostRow(1, 'comprehensive', null, 'proj-1')
    other.code = '1.1'
    other.sectionalWork = 'Schedule2'
    other.subproject = 'Kisada'
    other.quantity = 10
    const fetched = costDatabaseRowsToCatalog(
      [
        {
          code: '1.1',
          name: '',
          featureDescription: '',
          unit: '',
          quantity: null,
          periodQuantity: 0,
          priorQuantity: 10,
          ipcNo: '3',
          currentTotalPrice: 1250,
          unitPrice: 100,
          sectionalWork: 'Schedule1',
          subproject: 'Kisada',
          type: '',
          note: '',
        },
      ],
      'proj-1',
      'budgetQuota',
    )
    const next = mergeMeteringFetchRows([existing, other], fetched)
    expect(next[0]).toMatchObject({
      code: '1.1',
      sectionalWork: 'Schedule1',
      subproject: 'Kisada',
      // IPC money fetch must not overlay 往期/本期 (avoids % > 100 from DB qty).
      priorQuantity: null,
      periodQuantity: null,
      ipcAmounts: { '3': 1250 },
    })
    expect(next[1]?.ipcAmounts).toBeUndefined()
  })

  it('keeps the price list and clears stale IPC when no 编码+分部+子项目 triple matches', () => {
    const existing = createEmptyCostRow(0, 'comprehensive', null, 'proj-1')
    existing.code = 'OTHER'
    existing.name = '价格表项'
    existing.sectionalWork = 'Schedule1'
    existing.subproject = 'Kisada'
    existing.ipcAmounts = { '1': 999 }
    const fetched = costDatabaseRowsToCatalog(
      [
        {
          code: '7.1',
          name: '计量项',
          featureDescription: '',
          unit: '',
          quantity: null,
          ipcNo: 'IPC1',
          currentTotalPrice: 50,
          unitPrice: null,
          sectionalWork: 'Schedule1',
          subproject: 'Kisada',
          type: '',
          note: '',
        },
        {
          code: '7.1',
          name: '计量项',
          featureDescription: '',
          unit: '',
          quantity: null,
          ipcNo: 'IPC2',
          currentTotalPrice: 80,
          unitPrice: null,
          sectionalWork: 'Schedule1',
          subproject: 'Kisada',
          type: '',
          note: '',
        },
      ],
      'proj-1',
      'budgetQuota',
    )
    const next = mergeMeteringFetchRows([existing], fetched)
    const priceRow = next.find((row) => row.code === 'OTHER')
    expect(priceRow?.name).toBe('价格表项')
    expect(priceRow?.ipcAmounts).toBeUndefined()
    expect(next.find((row) => row.code === '7.1')?.ipcAmounts).toEqual({ '1': 50, '2': 80 })
  })

  it('replaces IPC amounts on the exact triple and ignores incomplete-key fetched rows', () => {
    const existing = createEmptyCostRow(0, 'comprehensive', null, 'proj-1')
    existing.code = '1.1'
    existing.sectionalWork = 'Schedule1'
    existing.subproject = 'Kisada'
    existing.periodQuantity = 10
    existing.ipcAmounts = { '9': 1 }
    const withAmounts = createEmptyCostRow(0, 'budgetQuota', null, 'proj-1')
    withAmounts.code = '1.1'
    withAmounts.sectionalWork = 'Schedule1'
    withAmounts.subproject = 'Kisada'
    withAmounts.ipcAmounts = { '1': 100, '2': 200 }
    const next = mergeMeteringFetchRows([existing], [withAmounts])
    expect(next[0]?.ipcAmounts).toEqual({ '1': 100, '2': 200 })
    // IPC fetch clears quantity-based 本期/往期 so they cannot fake 累计完成金额.
    expect(next[0]?.periodQuantity).toBeNull()
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

  it('overlays fetched IPC amounts onto matching codes', () => {
    const existing = createEmptyCostRow(0, 'comprehensive', null, 'proj-1')
    existing.code = 'A'
    existing.sectionalWork = 'Schedule1'
    existing.subproject = 'Kisada'
    const fetched = createEmptyCostRow(0, 'budgetQuota', null, 'proj-1')
    fetched.code = 'A'
    fetched.sectionalWork = 'Schedule1'
    fetched.subproject = 'Kisada'
    fetched.ipcAmounts = { '1': 120, '2': 80 }
    const next = mergeMeteringFetchRows([existing], [fetched])
    expect(next[0]?.ipcAmounts).toEqual({ '1': 120, '2': 80 })
  })

  it('clears 本期/往期 when fetched rows carry IPC money', () => {
    const existing = createEmptyCostRow(0, 'comprehensive', null, 'proj-1')
    existing.code = 'A'
    existing.name = '挖土'
    existing.quantity = 10
    existing.periodQuantity = 2
    existing.priorQuantity = 1
    existing.sectionalWork = 'Schedule1'
    existing.subproject = 'Kisada'
    const fetched = createEmptyCostRow(0, 'budgetQuota', null, 'proj-1')
    fetched.code = 'A'
    fetched.sectionalWork = 'Schedule1'
    fetched.subproject = 'Kisada'
    fetched.periodQuantity = 99
    fetched.priorQuantity = 50
    fetched.ipcAmounts = { IPC1: 120 }
    const next = mergeMeteringFetchRows([existing], [fetched])
    expect(next[0]).toMatchObject({
      periodQuantity: null,
      priorQuantity: null,
      ipcAmounts: { '1': 120 },
    })
  })

  it('clears stale IPC on rows that do not match the fetched triple', () => {
    const existing = createEmptyCostRow(0, 'comprehensive', null, 'proj-1')
    existing.code = '1.2'
    existing.name = '挖土方'
    existing.subproject = 'Kisada'
    existing.sectionalWork = 'Schedule1'
    existing.ipcAmounts = { '1': 999 }
    const fetched = createEmptyCostRow(0, 'budgetQuota', null, 'proj-1')
    fetched.code = '1.2'
    fetched.name = '挖土方'
    fetched.subproject = 'Kisada'
    fetched.sectionalWork = 'Schedule3'
    fetched.ipcAmounts = { '1': 500 }
    const next = mergeMeteringFetchRows([existing], [fetched])
    expect(next.find((row) => row.sectionalWork === 'Schedule1')?.ipcAmounts).toBeUndefined()
    expect(next.find((row) => row.sectionalWork === 'Schedule3')?.ipcAmounts).toEqual({ '1': 500 })
  })

  it('applies the same IPC overlay to every existing row that shares the triple', () => {
    const named = createEmptyCostRow(0, 'comprehensive', null, 'proj-1')
    named.code = '1.2'
    named.name = '挖土方'
    named.subproject = 'Kisada'
    named.sectionalWork = 'Schedule3'
    const ghost = createEmptyCostRow(1, 'comprehensive', null, 'proj-1')
    ghost.code = '1.2'
    ghost.name = ''
    ghost.subproject = 'Kisada'
    ghost.sectionalWork = 'Schedule3'
    ghost.ipcAmounts = { '9': 1 }
    const fetched = createEmptyCostRow(0, 'budgetQuota', null, 'proj-1')
    fetched.code = '1.2'
    fetched.subproject = 'Kisada'
    fetched.sectionalWork = 'Schedule3'
    fetched.ipcAmounts = { '1': 500, '4': 80 }
    const next = mergeMeteringFetchRows([named, ghost], [fetched])
    // Dedupe keeps the named row; amounts must land on that triple (not stay on a consumed ghost).
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({
      name: '挖土方',
      sectionalWork: 'Schedule3',
      ipcAmounts: { '1': 500, '4': 80 },
    })
  })

  it('does not append code-named IPC ghosts when the price-list row already matched', () => {
    const existing = createEmptyCostRow(0, 'comprehensive', null, 'proj-1')
    existing.code = '1.2'
    existing.name = '挖土方'
    existing.subproject = 'Kisada'
    existing.sectionalWork = 'Schedule3'
    existing.quantity = 100
    const matched = createEmptyCostRow(0, 'budgetQuota', null, 'proj-1')
    matched.code = '1.2'
    matched.name = ''
    matched.subproject = 'Kisada'
    matched.sectionalWork = 'Schedule3'
    matched.ipcAmounts = { IPC1: 200, IPC4: 50 }
    // Unmatched twin (same key already occupied after overlay) must not be appended.
    const ghost = createEmptyCostRow(1, 'budgetQuota', null, 'proj-1')
    ghost.code = '1.2'
    ghost.name = '1.2'
    ghost.subproject = 'Kisada'
    ghost.sectionalWork = 'Schedule3'
    ghost.ipcAmounts = { IPC1: 200, IPC4: 50 }
    const next = mergeMeteringFetchRows([existing], [matched, ghost])
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({
      name: '挖土方',
      ipcAmounts: { '1': 200, '4': 50 },
    })
  })

  it('does not loose-match IPC amounts onto a different schedule of the same code', () => {
    const schedule1 = createEmptyCostRow(0, 'comprehensive', null, 'proj-1')
    schedule1.code = '1.2'
    schedule1.name = 'Schedule1 item'
    schedule1.subproject = 'Kisada'
    schedule1.sectionalWork = 'Schedule1'
    schedule1.quantity = 10
    const schedule3 = createEmptyCostRow(1, 'comprehensive', null, 'proj-1')
    schedule3.code = '1.2'
    schedule3.name = 'Schedule3 item'
    schedule3.subproject = 'Kisada'
    schedule3.sectionalWork = 'Schedule3'
    schedule3.quantity = 20
    const fetched = createEmptyCostRow(0, 'budgetQuota', null, 'proj-1')
    fetched.code = '1.2'
    fetched.subproject = 'Kisada'
    fetched.sectionalWork = 'Schedule3'
    fetched.ipcAmounts = { IPC1: 500, '4': 80 }
    const next = mergeMeteringFetchRows([schedule1, schedule3], [fetched])
    expect(next[0]?.ipcAmounts).toBeUndefined()
    expect(next[1]?.ipcAmounts).toEqual({ '1': 500, '4': 80 })
  })

  it('restores 单价 / 工程数量 from the price list triple when overlaying IPC', () => {
    const polluted = createEmptyCostRow(0, 'comprehensive', null, 'proj-1')
    polluted.code = '1.2'
    polluted.name = '挖土方'
    polluted.subproject = 'Kisada'
    polluted.sectionalWork = 'Schedule3'
    polluted.quantity = 99
    polluted.unitPrice = 1
    polluted.unit = 'wrong'
    const price = createEmptyCostRow(0, 'comprehensive', null, 'proj-1')
    price.code = '1.2'
    price.name = '挖土方'
    price.subproject = 'Kisada'
    price.sectionalWork = 'Schedule3'
    price.quantity = 1
    price.unitPrice = 1005530
    price.unit = 'lot'
    const fetched = createEmptyCostRow(0, 'budgetQuota', null, 'proj-1')
    fetched.code = '1.2'
    fetched.subproject = 'Kisada'
    fetched.sectionalWork = 'Schedule3'
    fetched.unitPrice = 999999
    fetched.ipcAmounts = { '1': 703871, '4': 201106 }
    const next = mergeMeteringFetchRows([polluted], [fetched], [price])
    expect(next[0]).toMatchObject({
      quantity: 1,
      unitPrice: 1005530,
      unit: 'lot',
      ipcAmounts: { '1': 703871, '4': 201106 },
    })
  })

  it('uses the synced price list as the base when practice rows are empty', () => {
    const price = createEmptyCostRow(0, 'comprehensive', null, 'proj-1')
    price.code = '1.1'
    price.name = '设计'
    price.subproject = 'Kisada'
    price.sectionalWork = 'Schedule3'
    price.quantity = 1
    price.unitPrice = 536283
    const fetched = createEmptyCostRow(0, 'budgetQuota', null, 'proj-1')
    fetched.code = '1.1'
    fetched.subproject = 'Kisada'
    fetched.sectionalWork = 'Schedule3'
    fetched.unitPrice = 111
    fetched.ipcAmounts = { '1': 268141.5 }
    const next = mergeMeteringFetchRows([], [fetched], [price])
    expect(next[0]).toMatchObject({
      name: '设计',
      quantity: 1,
      unitPrice: 536283,
      ipcAmounts: { '1': 268141.5 },
    })
  })

  it('does not map DB quantity onto 本期 when ipc_no is present', () => {
    const rows = costDatabaseRowsToCatalog(
      [
        {
          code: 'M3',
          name: '路面',
          featureDescription: '',
          unit: 'm2',
          quantity: 1000,
          ipcNo: '1',
          currentTotalPrice: 500,
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
      periodQuantity: null,
      priorQuantity: null,
      ipcAmounts: { '1': 500 },
    })
  })
})

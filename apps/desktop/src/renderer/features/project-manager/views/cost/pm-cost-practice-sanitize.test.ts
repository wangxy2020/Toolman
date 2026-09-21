import { describe, expect, it } from 'vitest'

import { createEmptyCostRow } from './pm-cost-catalog'
import {
  clampCostMeteringQuantities,
  sanitizeCostPracticeRows,
  sortCostPracticeRowsByCode,
} from './pm-cost-practice-sanitize'

describe('clampCostMeteringQuantities', () => {
  it('reduces 本期 when 往期+本期 exceeds 合同工程数量', () => {
    const row = createEmptyCostRow(0, 'comprehensive', null, 'p')
    row.quantity = 10
    row.priorQuantity = 4
    row.periodQuantity = 20
    expect(clampCostMeteringQuantities(row)).toMatchObject({
      priorQuantity: 4,
      periodQuantity: 6,
    })
  })

  it('caps 往期 and clears 本期 when 往期 alone exceeds quantity', () => {
    const row = createEmptyCostRow(0, 'comprehensive', null, 'p')
    row.quantity = 10
    row.priorQuantity = 15
    row.periodQuantity = 3
    expect(clampCostMeteringQuantities(row)).toMatchObject({
      priorQuantity: 10,
      periodQuantity: null,
    })
  })
})

describe('sanitizeCostPracticeRows', () => {
  it('fills blank names from feature text and clamps overflow quantities', () => {
    const named = createEmptyCostRow(0, 'comprehensive', null, 'p')
    named.featureDescription = '清表'
    named.quantity = 10
    named.periodQuantity = 50
    const next = sanitizeCostPracticeRows([named])
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({
      name: '清表',
      periodQuantity: 10,
      priorQuantity: null,
    })
  })

  it('does not fill 工作名称 from 编码', () => {
    const row = createEmptyCostRow(0, 'comprehensive', null, 'p')
    row.code = '1.2'
    row.name = ''
    row.quantity = 5
    const next = sanitizeCostPracticeRows([row])
    expect(next[0]?.name).toBe('')
    expect(next[0]?.code).toBe('1.2')
  })

  it('dedupes Kisada/Schedule3 code-named clones and keeps IPC on the real row', () => {
    const real = createEmptyCostRow(0, 'comprehensive', null, 'p')
    real.code = '1.2'
    real.name = '挖土方'
    real.subproject = 'Kisada'
    real.sectionalWork = 'Schedule3'
    real.quantity = 100
    real.unitPrice = 10
    real.ipcAmounts = { IPC1: 200, IPC4: 50 }

    const ghost = createEmptyCostRow(1, 'budgetQuota', null, 'p')
    ghost.code = '1.2'
    ghost.name = '1.2'
    ghost.subproject = 'Kisada'
    ghost.sectionalWork = 'Schedule3'
    ghost.ipcAmounts = { IPC1: 200, IPC4: 50 }

    const next = sanitizeCostPracticeRows([real, ghost])
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({
      name: '挖土方',
      code: '1.2',
      subproject: 'Kisada',
      sectionalWork: 'Schedule3',
      ipcAmounts: { '1': 200, '4': 50 },
    })
  })

  it('clears previously persisted code-as-name when a real twin exists', () => {
    const ghostFirst = createEmptyCostRow(0, 'budgetQuota', null, 'p')
    ghostFirst.code = '1.3'
    ghostFirst.name = '1.3'
    ghostFirst.subproject = 'Kisada'
    ghostFirst.sectionalWork = 'Schedule3'
    ghostFirst.ipcAmounts = { IPC1: 10 }

    const real = createEmptyCostRow(1, 'comprehensive', null, 'p')
    real.code = '1.3'
    real.name = '回填'
    real.subproject = 'Kisada'
    real.sectionalWork = 'Schedule3'
    real.quantity = 20

    const next = sanitizeCostPracticeRows([ghostFirst, real])
    expect(next).toHaveLength(1)
    expect(next[0]?.name).toBe('回填')
    expect(next[0]?.ipcAmounts).toEqual({ '1': 10 })
  })

  it('restores bill-item code order 1 → 1.1 → 1.2 within the same schedule', () => {
    const rows = ['1.2', '1', '1.10', '1.1'].map((code, index) => {
      const row = createEmptyCostRow(index, 'comprehensive', null, 'p')
      row.code = code
      row.name = `项${code}`
      row.subproject = 'Kisada'
      row.sectionalWork = 'Schedule3'
      return row
    })
    expect(sortCostPracticeRowsByCode(rows).map((row) => row.code)).toEqual([
      '1',
      '1.1',
      '1.2',
      '1.10',
    ])
    expect(sanitizeCostPracticeRows(rows).map((row) => row.code)).toEqual([
      '1',
      '1.1',
      '1.2',
      '1.10',
    ])
  })
})

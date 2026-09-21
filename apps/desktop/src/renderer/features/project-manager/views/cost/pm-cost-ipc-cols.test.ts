import { describe, expect, it } from 'vitest'

import {
  computeCostIpcStatement,
  costIpcColumns,
  costIpcColumnsFromNos,
  parseCostIpcQuantities,
  resolveCostIpcColumns,
  stripCostIpcQuantities,
  sumCostIpcStatements,
} from './pm-cost-ipc-cols'
import type { PmCostRow } from './pm-cost-catalog'
import type { MeteringBaseline } from './pm-metering-baselines'

function baseline(
  partial: Pick<MeteringBaseline, 'id' | 'name'> & Partial<MeteringBaseline>,
): MeteringBaseline {
  return {
    createdAt: partial.createdAt ?? 1,
    asOfDate: partial.asOfDate ?? '2026-01-01',
    ...partial,
  }
}

function row(partial: Partial<PmCostRow> & Pick<PmCostRow, 'id'>): PmCostRow {
  return {
    id: partial.id,
    type: 'comprehensive',
    code: '',
    name: '',
    featureDescription: '',
    unit: '',
    quantity: partial.quantity ?? null,
    unitPrice: partial.unitPrice ?? null,
    periodQuantity: partial.periodQuantity ?? null,
    priorQuantity: partial.priorQuantity ?? null,
    ipcQuantities: partial.ipcQuantities,
    ipcAmounts: partial.ipcAmounts,
    applicable: 'all',
    note: '',
    sectionalWork: '',
    subproject: '',
    sectionCode: '',
    sectionNote: '',
    sectionName: '',
    sectionFeatureDescription: '',
    sectionTotalFormula: '',
    sortOrder: 0,
    parentId: partial.parentId ?? null,
  }
}

describe('costIpcColumns', () => {
  it('adds one IPCx column per metering period, ordered by 周期 index', () => {
    const columns = costIpcColumns([
      baseline({ id: 'b', name: '周期2 (2026-02-01)', createdAt: 20 }),
      baseline({ id: 'a', name: '周期1 (2026-01-01)', createdAt: 10 }),
    ])
    expect(columns.map((column) => [column.id, column.label])).toEqual([
      ['a', 'IPC1'],
      ['b', 'IPC2'],
    ])
  })
})

describe('costIpcColumnsFromNos', () => {
  it('normalizes ipc_no variants onto IPC1 / IPC2 columns', () => {
    const columns = costIpcColumnsFromNos(['007', 'IPC2', '1'])
    expect(columns.map((column) => [column.id, column.label])).toEqual([
      ['1', 'IPC1'],
      ['2', 'IPC2'],
      ['7', 'IPC7'],
    ])
  })
})

describe('resolveCostIpcColumns', () => {
  it('prefers fetched ipc_no columns over captured metering periods', () => {
    const columns = resolveCostIpcColumns(
      [row({ id: 'r1', ipcAmounts: { IPC2: 80, IPC1: 40 } })],
      [baseline({ id: 'b', name: '周期1' })],
    )
    expect(columns.map((column) => column.id)).toEqual(['1', '2'])
  })

  it('does not fall back to metering baselines for 中期计量表', () => {
    const columns = resolveCostIpcColumns(
      [row({ id: 'r1' })],
      [baseline({ id: 'b', name: '周期1' }), baseline({ id: 'c', name: '周期2' })],
      { allowBaselineFallback: false },
    )
    expect(columns).toEqual([])
  })
})

describe('computeCostIpcStatement', () => {
  const columns = costIpcColumns([
    baseline({ id: 'ipc-1', name: '周期1' }),
    baseline({ id: 'ipc-2', name: '周期2' }),
  ])

  it('multiplies captured IPC quantities by unit price and sums the last two columns', () => {
    const statement = computeCostIpcStatement(
      row({
        id: 'r1',
        quantity: 20,
        unitPrice: 10,
        ipcQuantities: { 'ipc-1': 4, 'ipc-2': 6 },
      }),
      columns,
      200,
    )
    expect(statement.amounts).toEqual([40, 60])
    expect(statement.cumulativeAmount).toBe(100)
    expect(statement.cumulativePercent).toBe(50)
  })

  it('uses current_total_price from ipcAmounts without multiplying unit price', () => {
    const statement = computeCostIpcStatement(
      row({
        id: 'r1',
        quantity: 20,
        unitPrice: 10,
        ipcAmounts: { 'ipc-1': 125.5, 'ipc-2': 80 },
      }),
      columns,
      200,
    )
    expect(statement.amounts).toEqual([125.5, 80])
    expect(statement.cumulativeAmount).toBe(205.5)
  })

  it('uses IPC money totals for cumulative amount/percent when present', () => {
    const statement = computeCostIpcStatement(
      row({
        id: 'r1',
        quantity: 10,
        unitPrice: 5,
        periodQuantity: 2,
        priorQuantity: 3,
        ipcAmounts: { 'ipc-1': 20, 'ipc-2': 10 },
      }),
      columns,
      50,
    )
    expect(statement.amounts).toEqual([20, 10])
    expect(statement.cumulativeAmount).toBe(30)
    expect(statement.cumulativePercent).toBe(60)
  })

  it('caps cumulative percent at 100 when IPC sum exceeds 合价', () => {
    const statement = computeCostIpcStatement(
      row({
        id: 'r1',
        quantity: 10,
        unitPrice: 5,
        ipcAmounts: { 'ipc-1': 1000, 'ipc-2': 1000 },
      }),
      columns,
      50,
    )
    expect(statement.cumulativeAmount).toBe(2000)
    expect(statement.cumulativePercent).toBe(100)
  })

  it('lists every ipc_no column even when some periods have no amount yet', () => {
    const columns = resolveCostIpcColumns([
      row({ id: 'a', ipcAmounts: { '1': 10, '2': null, '12': 5 } }),
      row({ id: 'b', ipcAmounts: { '7': null, '8': null } }),
    ])
    expect(columns.map((column) => column.label)).toEqual([
      'IPC1',
      'IPC2',
      'IPC7',
      'IPC8',
      'IPC12',
    ])
  })

  it('leaves 累计完成金额 empty when IPCx cells are blank (no 本期/往期 fallback)', () => {
    const statement = computeCostIpcStatement(
      row({
        id: 'r1',
        quantity: 10,
        unitPrice: 5,
        periodQuantity: 2,
        priorQuantity: 3,
      }),
      columns,
      50,
    )
    expect(statement.amounts).toEqual([null, null])
    expect(statement.cumulativeAmount).toBeNull()
    expect(statement.cumulativePercent).toBeNull()
  })
})

describe('sumCostIpcStatements', () => {
  it('sums IPC amounts across section rows', () => {
    const columns = costIpcColumns([baseline({ id: 'ipc-1', name: '周期1' })])
    const statement = sumCostIpcStatements(
      [
        row({ id: 'a', unitPrice: 10, ipcQuantities: { 'ipc-1': 2 } }),
        row({ id: 'b', unitPrice: 4, ipcQuantities: { 'ipc-1': 3 } }),
      ],
      columns,
      100,
    )
    expect(statement.amounts).toEqual([32])
    expect(statement.cumulativeAmount).toBe(32)
    expect(statement.cumulativePercent).toBe(32)
  })

  it('does not invent section cumulative from 本期/往期 when IPCx are empty', () => {
    const columns = costIpcColumnsFromNos(['1', '2'])
    const statement = sumCostIpcStatements(
      [
        row({
          id: 'child-a',
          quantity: 100,
          unitPrice: 10,
          periodQuantity: 20,
          priorQuantity: 30,
        }),
        row({
          id: 'child-b',
          quantity: 50,
          unitPrice: 20,
          periodQuantity: 10,
          priorQuantity: 15,
        }),
      ],
      columns,
      2000,
    )
    expect(statement.amounts).toEqual([null, null])
    expect(statement.cumulativeAmount).toBeNull()
    expect(statement.cumulativePercent).toBeNull()
  })

  it('sums IPC-only cumulative amounts when metering factors are empty', () => {
    const columns = costIpcColumnsFromNos(['1', '2'])
    const statement = sumCostIpcStatements(
      [
        row({
          id: 'a',
          quantity: 10,
          unitPrice: 10,
          ipcAmounts: { '1': 40, '2': 60 },
        }),
        row({
          id: 'b',
          quantity: 20,
          unitPrice: 5,
          ipcAmounts: { '1': 10, '2': 15 },
        }),
      ],
      columns,
      200,
    )
    expect(statement.amounts).toEqual([50, 75])
    expect(statement.cumulativeAmount).toBe(125)
    expect(statement.cumulativePercent).toBe(62.5)
  })
})

describe('parseCostIpcQuantities / stripCostIpcQuantities', () => {
  it('keeps finite IPC quantities and drops a deleted period', () => {
    expect(parseCostIpcQuantities({ a: 3, b: 'x', c: null })).toEqual({ a: 3, c: null })
    const next = stripCostIpcQuantities(
      [row({ id: 'r', ipcQuantities: { keep: 1, gone: 2 } })],
      'gone',
    )
    expect(next[0]?.ipcQuantities).toEqual({ keep: 1 })
  })
})

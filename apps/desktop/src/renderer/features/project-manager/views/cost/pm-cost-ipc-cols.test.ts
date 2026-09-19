import { describe, expect, it } from 'vitest'

import {
  computeCostIpcStatement,
  costIpcColumns,
  parseCostIpcQuantities,
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
    parentId: null,
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

  it('falls back to 计量 cumulative amount when no IPC values exist', () => {
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
    expect(statement.cumulativeAmount).toBe(25)
    expect(statement.cumulativePercent).toBe(50)
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

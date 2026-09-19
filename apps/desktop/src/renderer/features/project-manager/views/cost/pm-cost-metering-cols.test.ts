import { describe, expect, it } from 'vitest'

import {
  computeCostMeteringProgress,
  formatCostMeteringAmount,
  formatCostMeteringPercent,
  rollCostMeteringPeriodIntoPrior,
} from './pm-cost-metering-cols'
import type { PmCostRow } from './pm-cost-catalog'

function row(
  partial: Partial<PmCostRow> & Pick<PmCostRow, 'id'>,
): PmCostRow {
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

describe('computeCostMeteringProgress', () => {
  it('defaults prior quantity to 0 and skips amount/percent when factors are empty', () => {
    expect(
      computeCostMeteringProgress({
        quantity: 100,
        unitPrice: 10,
        periodQuantity: null,
        priorQuantity: null,
      }),
    ).toEqual({
      periodQuantity: null,
      priorQuantity: 0,
      cumulativeQuantity: 0,
      periodAmount: null,
      cumulativeAmount: null,
      cumulativePercent: null,
    })
  })

  it('adds prior and period quantities, then prices and percent against the contract qty', () => {
    expect(
      computeCostMeteringProgress({
        quantity: 80,
        unitPrice: 25,
        periodQuantity: 10,
        priorQuantity: 30,
      }),
    ).toEqual({
      periodQuantity: 10,
      priorQuantity: 30,
      cumulativeQuantity: 40,
      periodAmount: 250,
      cumulativeAmount: 1000,
      cumulativePercent: 50,
    })
  })

  it('does not compute amounts or percent when unit price or contract quantity is 0', () => {
    expect(
      computeCostMeteringProgress({
        quantity: 0,
        unitPrice: 0,
        periodQuantity: 10,
        priorQuantity: 5,
      }),
    ).toEqual({
      periodQuantity: 10,
      priorQuantity: 5,
      cumulativeQuantity: 15,
      periodAmount: null,
      cumulativeAmount: null,
      cumulativePercent: null,
    })
  })

  it('does not compute period amount when this-period quantity is 0', () => {
    expect(
      computeCostMeteringProgress({
        quantity: 80,
        unitPrice: 25,
        periodQuantity: 0,
        priorQuantity: 30,
      }),
    ).toEqual({
      periodQuantity: 0,
      priorQuantity: 30,
      cumulativeQuantity: 30,
      periodAmount: null,
      cumulativeAmount: 750,
      cumulativePercent: 37.5,
    })
  })

  it('treats empty this-period quantity as 0 when summing cumulative quantity', () => {
    expect(
      computeCostMeteringProgress({
        quantity: 50,
        unitPrice: 8,
        periodQuantity: null,
        priorQuantity: 12,
      }),
    ).toEqual({
      periodQuantity: null,
      priorQuantity: 12,
      cumulativeQuantity: 12,
      periodAmount: null,
      cumulativeAmount: 96,
      cumulativePercent: 24,
    })
  })

  it('still computes percent when unit price is 0 but skips amounts', () => {
    expect(
      computeCostMeteringProgress({
        quantity: 40,
        unitPrice: 0,
        periodQuantity: 10,
        priorQuantity: 10,
      }),
    ).toEqual({
      periodQuantity: 10,
      priorQuantity: 10,
      cumulativeQuantity: 20,
      periodAmount: null,
      cumulativeAmount: null,
      cumulativePercent: 50,
    })
  })
})

describe('formatCostMeteringAmount / formatCostMeteringPercent', () => {
  it('keeps two decimals when the value is fractional', () => {
    expect(formatCostMeteringAmount(12)).toBe('12')
    expect(formatCostMeteringAmount(12.5)).toBe('12.50')
    expect(formatCostMeteringAmount(12.567)).toBe('12.57')
    expect(formatCostMeteringPercent(8)).toBe('8%')
    expect(formatCostMeteringPercent(8.5)).toBe('8.50%')
    expect(formatCostMeteringPercent(8.567)).toBe('8.57%')
  })
})

describe('rollCostMeteringPeriodIntoPrior', () => {
  it('folds this-period quantities into prior and clears the period field', () => {
    const next = rollCostMeteringPeriodIntoPrior([
      row({ id: 'a', periodQuantity: 8, priorQuantity: 2 }),
      row({ id: 'b', periodQuantity: null, priorQuantity: null }),
    ])
    expect(next[0]).toMatchObject({ id: 'a', priorQuantity: 10, periodQuantity: null })
    expect(next[1]).toMatchObject({ id: 'b', priorQuantity: 0, periodQuantity: null })
  })

  it('snapshots this-period quantities onto the captured IPC id', () => {
    const next = rollCostMeteringPeriodIntoPrior(
      [row({ id: 'a', periodQuantity: 8, priorQuantity: 2, ipcQuantities: { old: 1 } })],
      'ipc-2',
    )
    expect(next[0]).toMatchObject({
      priorQuantity: 10,
      periodQuantity: null,
      ipcQuantities: { old: 1, 'ipc-2': 8 },
    })
  })
})

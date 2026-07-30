import { describe, expect, it } from 'vitest'

import type { FeatureGanttRollup } from './pm-feature-gantt-rollup'
import { computeResourceStatTotals } from './pm-features-panel-utils'
import type { PmFeatureRow } from './pm-features-catalog'

function row(
  partial: Partial<PmFeatureRow> & Pick<PmFeatureRow, 'id' | 'type' | 'name'>,
): PmFeatureRow {
  return {
    unit: '',
    pricingUnit: '',
    purchaseCycle: null,
    transportCycle: null,
    quantity: null,
    remark: '',
    code: '',
    featureDescription: '',
    sectionalWork: '',
    unitPrice: null,
    applicable: 'all',
    sortOrder: 0,
    parentId: null,
    ...partial,
  }
}

function rollup(partial: Partial<FeatureGanttRollup>): FeatureGanttRollup {
  return {
    quantity: 0,
    pricingQuantity: 0,
    startDate: null,
    finishDate: null,
    monthly: {},
    ...partial,
  }
}

describe('computeResourceStatTotals', () => {
  it('sums only totalPrice for scheduleAll (sumQuantities=false)', () => {
    const rows = [
      row({ id: 'a', type: 'labor', name: '普通工', unit: '人', pricingUnit: '工日', unitPrice: 100 }),
      row({
        id: 'b',
        type: 'machinery',
        name: '挖掘机',
        unit: '台',
        pricingUnit: '台班',
        unitPrice: 500,
      }),
    ]
    const rollups = new Map<string, FeatureGanttRollup>([
      ['a', rollup({ quantity: 5, pricingQuantity: 50 })],
      ['b', rollup({ quantity: 2, pricingQuantity: 20 })],
    ])
    const totals = computeResourceStatTotals(rows, rollups, { sumQuantities: false })
    expect(totals.totalPrice).toBe(50 * 100 + 20 * 500)
    expect(totals.quantity).toBeNull()
    expect(totals.pricingQuantity).toBeNull()
  })

  it('sums quantity and pricingQuantity when type and units match', () => {
    const rows = [
      row({ id: 'a', type: 'labor', name: '普通工', unit: '人', pricingUnit: '工日', unitPrice: 100 }),
      row({ id: 'b', type: 'labor', name: '钢筋工', unit: '人', pricingUnit: '工日', unitPrice: 120 }),
    ]
    const rollups = new Map<string, FeatureGanttRollup>([
      ['a', rollup({ quantity: 5, pricingQuantity: 50 })],
      ['b', rollup({ quantity: 3, pricingQuantity: 30 })],
    ])
    const totals = computeResourceStatTotals(rows, rollups, { sumQuantities: true })
    expect(totals.quantity).toBe(8)
    expect(totals.pricingQuantity).toBe(80)
    expect(totals.totalPrice).toBe(50 * 100 + 30 * 120)
  })

  it('does not sum quantity or pricingQuantity when units differ', () => {
    const rows = [
      row({ id: 'a', type: 'labor', name: '普通工', unit: '人', pricingUnit: '工日', unitPrice: 100 }),
      row({ id: 'b', type: 'labor', name: '钢筋工', unit: '工日', pricingUnit: '工日', unitPrice: 120 }),
    ]
    const rollups = new Map<string, FeatureGanttRollup>([
      ['a', rollup({ quantity: 5, pricingQuantity: 50 })],
      ['b', rollup({ quantity: 3, pricingQuantity: 30 })],
    ])
    const totals = computeResourceStatTotals(rows, rollups, { sumQuantities: true })
    expect(totals.quantity).toBeNull()
    expect(totals.pricingQuantity).toBe(80)
    expect(totals.totalPrice).toBe(50 * 100 + 30 * 120)
  })

  it('does not sum pricingQuantity when pricing units differ', () => {
    const rows = [
      row({ id: 'a', type: 'labor', name: '普通工', unit: '人', pricingUnit: '工日', unitPrice: 100 }),
      row({ id: 'b', type: 'labor', name: '钢筋工', unit: '人', pricingUnit: '人·日', unitPrice: 120 }),
    ]
    const rollups = new Map<string, FeatureGanttRollup>([
      ['a', rollup({ quantity: 5, pricingQuantity: 50 })],
      ['b', rollup({ quantity: 3, pricingQuantity: 30 })],
    ])
    const totals = computeResourceStatTotals(rows, rollups, { sumQuantities: true })
    expect(totals.quantity).toBe(8)
    expect(totals.pricingQuantity).toBeNull()
    expect(totals.totalPrice).toBe(50 * 100 + 30 * 120)
  })
})

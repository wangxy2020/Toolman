import { describe, expect, it } from 'vitest'

import {
  buildFundsDisplayEntries,
  buildFundsSectionMetaByRowId,
  buildLiveFundsFeatureRows,
  collectGanttCostSeeds,
  computeFeatureCostRollups,
  formatMonthKey,
  rollupHorizontalAmount,
} from './pm-feature-gantt-rollup'
import { asCostRows, makeCostItem } from './pm-feature-gantt-rollup-test-utils'

describe('pm-feature-gantt-rollup funds', () => {
  it('collects cost seeds and rolls assigned amounts by month for funds', () => {
    const jan1 = new Date(2026, 0, 1).getTime()
    const jan31 = new Date(2026, 0, 31).getTime()
    const feb1 = new Date(2026, 1, 1).getTime()
    const feb28 = new Date(2026, 1, 28).getTime()
    const costItems = [
      makeCostItem('c1', jan1, jan31, [
        { costId: null, type: 'comprehensive', name: '土建综合', percent: 1, amount: 100 },
      ]),
      makeCostItem('c2', feb1, feb28, [
        { costId: null, type: 'comprehensive', name: '土建综合', percent: 1, amount: 50 },
        { costId: null, type: 'labor', name: '人工费', percent: 1, amount: 999 },
      ]),
    ]

    const seeds = collectGanttCostSeeds(costItems)
    expect(seeds).toEqual([
      {
        type: 'comprehensive',
        name: '土建综合',
        unit: '',
        unitPrice: null,
        costId: null,
        sectionalWork: '',
        sectionLabel: '',
      },
    ])

    const live = buildLiveFundsFeatureRows(seeds)
    expect(live).toHaveLength(1)
    expect(live[0]).toMatchObject({
      type: 'comprehensive',
      name: '土建综合',
      quantity: null,
      unitPrice: null,
    })

    const rollups = computeFeatureCostRollups(costItems, live)
    const rollup = rollups.get(live[0]!.id)!
    expect(rollup.quantity).toBe(150)
    expect(rollup.pricingQuantity).toBe(150)
    expect(rollup.startDate).toBe(jan1)
    expect(rollup.finishDate).toBe(feb28)
    expect(rollup.monthly[formatMonthKey(2026, 0)]).toBe(100)
    expect(rollup.monthly[formatMonthKey(2026, 1)]).toBe(50)
    expect(rollupHorizontalAmount(rollup)).toBe(150)
  })

  it('rolls funds engineering quantity from price-list qty × percent', () => {
    const day = new Date(2026, 0, 1).getTime()
    const catalog = asCostRows([
      {
        id: 'brick',
        type: 'comprehensive' as const,
        name: '砖基础',
        unit: 'm³',
        quantity: 1000,
        unitPrice: 500,
      },
    ])
    const items = [
      makeCostItem('t1', day, day, [
        { costId: 'brick', type: 'comprehensive', name: '砖基础', percent: 0.1, amount: 50_000 },
      ]),
    ]
    const seeds = collectGanttCostSeeds(items, catalog)
    expect(seeds[0]).toMatchObject({
      name: '砖基础',
      unit: 'm³',
      unitPrice: 500,
      costId: 'brick',
    })
    const live = buildLiveFundsFeatureRows(seeds)
    expect(live[0]?.unitPrice).toBe(500)
    const rollups = computeFeatureCostRollups(items, live, catalog)
    expect(rollups.get(live[0]!.id)?.quantity).toBe(100)
    expect(rollups.get(live[0]!.id)?.pricingQuantity).toBe(50_000)
  })

  it('orders cost seeds by type, sectional work, then price-table order', () => {
    const costItems = [
      makeCostItem('c1', new Date(2026, 0, 1).getTime(), new Date(2026, 0, 31).getTime(), [
        { costId: 'b', type: 'investment', name: '征地拆迁费', percent: 1, amount: 10 },
        { costId: 'c', type: 'investment', name: '市政配套', percent: 1, amount: 20 },
        { costId: 'a', type: 'investment', name: '产业园', percent: 1, amount: 30 },
        { costId: 'd', type: 'comprehensive', name: '土建综合', percent: 1, amount: 40 },
      ]),
    ]
    const catalog = asCostRows([
      { id: 'd', type: 'comprehensive' as const, name: '土建综合', sectionalWork: '主体', sortOrder: 0 },
      { id: 'a', type: 'investment' as const, name: '产业园', sectionalWork: '工程费', sortOrder: 1 },
      { id: 'c', type: 'investment' as const, name: '市政配套', sectionalWork: '工程费', sortOrder: 2 },
      { id: 'b', type: 'investment' as const, name: '征地拆迁费', sectionalWork: '工程建设其他费', sortOrder: 3 },
    ])
    const seeds = collectGanttCostSeeds(costItems, catalog)
    // comprehensive before investment; within investment: 工程费 then 工程建设其他费; within 工程费: sortOrder.
    expect(seeds.map((seed) => seed.name)).toEqual([
      '土建综合',
      '产业园',
      '市政配套',
      '征地拆迁费',
    ])
    expect(seeds.map((seed) => seed.sectionalWork)).toEqual([
      '主体',
      '工程费',
      '工程费',
      '工程建设其他费',
    ])
  })

  it('orders cost seeds by price-table catalog top-to-bottom', () => {
    const costItems = [
      makeCostItem('c1', new Date(2026, 0, 1).getTime(), new Date(2026, 0, 31).getTime(), [
        { costId: null, type: 'funds', name: '预付款', percent: 1, amount: 10 },
        { costId: null, type: 'comprehensive', name: '土建综合', percent: 1, amount: 20 },
      ]),
    ]
    const catalog = asCostRows([
      { id: 'a', type: 'comprehensive' as const, name: '土建综合', sortOrder: 0 },
      { id: 'b', type: 'funds' as const, name: '预付款', sortOrder: 1 },
    ])
    const seeds = collectGanttCostSeeds(costItems, catalog)
    expect(seeds.map((seed) => seed.name)).toEqual(['土建综合', '预付款'])
  })

  it('inserts 分部名称 header rows in funds display entries', () => {
    const jan1 = new Date(2026, 0, 1).getTime()
    const jan31 = new Date(2026, 0, 31).getTime()
    const costItems = [
      makeCostItem('c1', jan1, jan31, [
        { costId: 'a', type: 'investment', name: '产业园', percent: 1, amount: 100 },
        { costId: 'b', type: 'investment', name: '市政配套', percent: 1, amount: 50 },
        { costId: 'c', type: 'investment', name: '征地拆迁费', percent: 1, amount: 20 },
      ]),
    ]
    const catalog = asCostRows([
      {
        id: 'a',
        type: 'investment' as const,
        name: '产业园',
        sectionalWork: '工程费',
        sectionName: '工程费',
        sortOrder: 0,
      },
      {
        id: 'b',
        type: 'investment' as const,
        name: '市政配套',
        sectionalWork: '工程费',
        sectionName: '工程费',
        sortOrder: 1,
      },
      {
        id: 'c',
        type: 'investment' as const,
        name: '征地拆迁费',
        sectionalWork: '工程建设其他费',
        sectionName: '',
        sortOrder: 2,
      },
    ])
    const seeds = collectGanttCostSeeds(costItems, catalog)
    const live = buildLiveFundsFeatureRows(seeds)
    const rollups = computeFeatureCostRollups(costItems, live)
    const entries = buildFundsDisplayEntries(
      live,
      buildFundsSectionMetaByRowId(seeds),
      rollups,
      '未分类',
    )
    expect(entries.map((entry) => (entry.kind === 'section' ? `§${entry.label}` : entry.row.name))).toEqual([
      '§工程费',
      '产业园',
      '市政配套',
      '§工程建设其他费',
      '征地拆迁费',
    ])
    const firstSection = entries[0]
    expect(firstSection?.kind).toBe('section')
    if (firstSection?.kind === 'section') {
      expect(rollupHorizontalAmount(firstSection.rollup)).toBe(150)
    }
  })
})

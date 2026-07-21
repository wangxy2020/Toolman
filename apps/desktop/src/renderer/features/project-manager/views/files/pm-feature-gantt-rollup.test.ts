import { describe, expect, it } from 'vitest'

import type { PmWorkItem } from '@toolman/shared'

import { TASK_RESOURCE_ASSIGNMENTS_KEY } from '../schedule/pm-gantt-resource-assignment'
import type { PmFeatureRow } from './pm-features-catalog'
import {
  allocateQuantityByMonth,
  buildLiveScheduleFeatureRows,
  buildResourceUnitLookup,
  collectGanttFeatureSeeds,
  collectRollupMonthKeys,
  computeFeatureGanttRollups,
  featureTypeToResourceType,
  formatMonthKey,
  formatRollupMonthQuantity,
  groupMonthKeysByYear,
} from './pm-feature-gantt-rollup'

function makeItem(
  id: string,
  startDate: number | null,
  dueDate: number | null,
  assignments: Array<{ type: string; name: string; quantity: number | null }>,
): PmWorkItem {
  return {
    id,
    workspaceId: 'ws',
    projectId: 'p1',
    parentId: null,
    type: 'task',
    title: id,
    status: 'todo',
    priority: 'medium',
    sortOrder: 0,
    startDate,
    dueDate,
    percentComplete: 0,
    assignee: null,
    metadata: {
      [TASK_RESOURCE_ASSIGNMENTS_KEY]: assignments.map((entry) => ({
        resourceId: null,
        type: entry.type,
        name: entry.name,
        quantity: entry.quantity,
      })),
    },
    createdAt: 0,
    updatedAt: 0,
  } as unknown as PmWorkItem
}

function makeFeature(
  id: string,
  type: PmFeatureRow['type'],
  name: string,
): PmFeatureRow {
  return {
    id,
    type,
    name,
    unit: '',
    quantity: null,
    remark: '',
    applicable: 'all',
    sortOrder: 0,
    parentId: null,
  }
}

describe('pm-feature-gantt-rollup', () => {
  it('maps feature types to resource types', () => {
    expect(featureTypeToResourceType('labor')).toBe('labor')
    expect(featureTypeToResourceType('auxiliary')).toBe('auxiliary')
    expect(featureTypeToResourceType('material')).toBe('material')
    expect(featureTypeToResourceType('machinery')).toBe('equipment')
    expect(featureTypeToResourceType('procurement')).toBeNull()
  })

  it('peaks labor and sums material; derives start/finish by type+name', () => {
    const features = [
      makeFeature('f1', 'labor', '普通工'),
      makeFeature('f2', 'machinery', '挖掘机'),
      makeFeature('f3', 'funds', '支付计划'),
    ]
    const items = [
      makeItem('t1', 1_000, 2_000, [
        { type: 'labor', name: '普通工', quantity: 2 },
        { type: 'equipment', name: '挖掘机', quantity: 1 },
      ]),
      makeItem('t2', 500, 3_000, [
        { type: 'labor', name: '普通工', quantity: 3 },
      ]),
      makeItem('t3', 100, 200, [{ type: 'labor', name: '技术工人', quantity: 9 }]),
    ]

    const rollups = computeFeatureGanttRollups(items, features)
    // Labor overlapping on the same local day → peak concurrent = 2+3.
    expect(rollups.get('f1')).toMatchObject({
      quantity: 5,
      startDate: 500,
      finishDate: 3_000,
    })
    expect(rollups.get('f2')).toMatchObject({
      quantity: 1,
      startDate: 1_000,
      finishDate: 2_000,
    })
    expect(rollups.get('f3')).toEqual({
      quantity: 0,
      startDate: null,
      finishDate: null,
      monthly: {},
    })
  })

  it('allocates quantity by overlapping days across months', () => {
    // Jan 31 – Feb 1 (2 days) → half each month.
    const start = new Date(2026, 0, 31).getTime()
    const end = new Date(2026, 1, 1).getTime()
    const monthly = allocateQuantityByMonth(10, start, end)
    expect(monthly[formatMonthKey(2026, 0)]).toBeCloseTo(5)
    expect(monthly[formatMonthKey(2026, 1)]).toBeCloseTo(5)
    expect(Object.values(monthly).reduce((sum, value) => sum + value, 0)).toBeCloseTo(10)
  })

  it('puts full quantity in one month when task is within a month', () => {
    const start = new Date(2026, 2, 1).getTime()
    const end = new Date(2026, 2, 20).getTime()
    expect(allocateQuantityByMonth(8, start, end)).toEqual({
      [formatMonthKey(2026, 2)]: 8,
    })
  })

  it('rolls monthly quantities from multiple tasks', () => {
    const features = [makeFeature('f1', 'labor', '普通工')]
    const jan = new Date(2026, 0, 1).getTime()
    const janEnd = new Date(2026, 0, 10).getTime()
    const feb = new Date(2026, 1, 1).getTime()
    const febEnd = new Date(2026, 1, 10).getTime()
    const items = [
      makeItem('t1', jan, janEnd, [{ type: 'labor', name: '普通工', quantity: 4 }]),
      makeItem('t2', feb, febEnd, [{ type: 'labor', name: '普通工', quantity: 6 }]),
    ]
    const rollups = computeFeatureGanttRollups(items, features)
    const monthly = rollups.get('f1')!.monthly
    expect(monthly[formatMonthKey(2026, 0)]).toBe(4)
    expect(monthly[formatMonthKey(2026, 1)]).toBe(6)
    expect(rollups.get('f1')!.quantity).toBe(6)
    expect(collectRollupMonthKeys(rollups)).toEqual([
      formatMonthKey(2026, 0),
      formatMonthKey(2026, 1),
    ])
  })

  it('uses peak concurrent quantity for labor / auxiliary / machinery (not sum)', () => {
    const features = [makeFeature('f1', 'labor', '普通工')]
    // Sequential: 10 then 20 in the same month → peak 20, not 30.
    const itemsSequential = [
      makeItem(
        't1',
        new Date(2026, 7, 1).getTime(),
        new Date(2026, 7, 10).getTime(),
        [{ type: 'labor', name: '普通工', quantity: 10 }],
      ),
      makeItem(
        't2',
        new Date(2026, 7, 11).getTime(),
        new Date(2026, 7, 20).getTime(),
        [{ type: 'labor', name: '普通工', quantity: 20 }],
      ),
    ]
    const sequential = computeFeatureGanttRollups(itemsSequential, features).get('f1')!
    expect(sequential.monthly[formatMonthKey(2026, 7)]).toBe(20)
    expect(sequential.quantity).toBe(20)

    // Overlapping days: 10 + 20 on shared days → peak 30.
    const itemsOverlap = [
      makeItem(
        't1',
        new Date(2026, 7, 1).getTime(),
        new Date(2026, 7, 15).getTime(),
        [{ type: 'labor', name: '普通工', quantity: 10 }],
      ),
      makeItem(
        't2',
        new Date(2026, 7, 10).getTime(),
        new Date(2026, 7, 20).getTime(),
        [{ type: 'labor', name: '普通工', quantity: 20 }],
      ),
    ]
    const overlap = computeFeatureGanttRollups(itemsOverlap, features).get('f1')!
    expect(overlap.monthly[formatMonthKey(2026, 7)]).toBe(30)
    expect(overlap.quantity).toBe(30)

    // Multi-day span does not multiply headcount by days.
    const longTask = computeFeatureGanttRollups(
      [
        makeItem(
          't1',
          new Date(2026, 7, 1).getTime(),
          new Date(2026, 7, 31).getTime(),
          [{ type: 'labor', name: '普通工', quantity: 10 }],
        ),
      ],
      features,
    ).get('f1')!
    expect(longTask.monthly[formatMonthKey(2026, 7)]).toBe(10)
    expect(longTask.quantity).toBe(10)

    // Auxiliary and machinery also use peak, not cumulative sum.
    const auxFeatures = [makeFeature('a1', 'auxiliary', '模板')]
    const auxSequential = computeFeatureGanttRollups(
      [
        makeItem(
          't1',
          new Date(2026, 7, 1).getTime(),
          new Date(2026, 7, 10).getTime(),
          [{ type: 'auxiliary', name: '模板', quantity: 100 }],
        ),
        makeItem(
          't2',
          new Date(2026, 7, 11).getTime(),
          new Date(2026, 7, 20).getTime(),
          [{ type: 'auxiliary', name: '模板', quantity: 200 }],
        ),
      ],
      auxFeatures,
    ).get('a1')!
    expect(auxSequential.quantity).toBe(200)

    const machFeatures = [makeFeature('m1', 'machinery', '挖掘机')]
    const machSequential = computeFeatureGanttRollups(
      [
        makeItem(
          't1',
          new Date(2026, 7, 1).getTime(),
          new Date(2026, 7, 10).getTime(),
          [{ type: 'equipment', name: '挖掘机', quantity: 2 }],
        ),
        makeItem(
          't2',
          new Date(2026, 7, 11).getTime(),
          new Date(2026, 7, 20).getTime(),
          [{ type: 'equipment', name: '挖掘机', quantity: 3 }],
        ),
      ],
      machFeatures,
    ).get('m1')!
    expect(machSequential.quantity).toBe(3)
  })

  it('keeps day-weighted month allocation for material (cumulative)', () => {
    const features = [makeFeature('f1', 'material', '钢筋')]
    const start = new Date(2026, 0, 31).getTime()
    const end = new Date(2026, 1, 1).getTime()
    const items = [
      makeItem('t1', start, end, [{ type: 'material', name: '钢筋', quantity: 10 }]),
      makeItem(
        't2',
        new Date(2026, 7, 1).getTime(),
        new Date(2026, 7, 10).getTime(),
        [{ type: 'material', name: '钢筋', quantity: 5 }],
      ),
    ]
    const rollup = computeFeatureGanttRollups(items, features).get('f1')!
    expect(rollup.monthly[formatMonthKey(2026, 0)]).toBeCloseTo(5)
    expect(rollup.monthly[formatMonthKey(2026, 1)]).toBeCloseTo(5)
    expect(rollup.quantity).toBe(15)
  })

  it('groups consecutive month keys by year for colspan headers', () => {
    expect(
      groupMonthKeysByYear([
        formatMonthKey(2026, 7),
        formatMonthKey(2026, 8),
        formatMonthKey(2026, 11),
        formatMonthKey(2027, 0),
        formatMonthKey(2027, 3),
      ]),
    ).toEqual([
      {
        year: 2026,
        monthKeys: [formatMonthKey(2026, 7), formatMonthKey(2026, 8), formatMonthKey(2026, 11)],
      },
      {
        year: 2027,
        monthKeys: [formatMonthKey(2027, 0), formatMonthKey(2027, 3)],
      },
    ])
  })

  it('formats month quantities with two decimals', () => {
    expect(formatRollupMonthQuantity(12)).toBe('12.00')
    expect(formatRollupMonthQuantity(12.345)).toBe('12.35')
    expect(formatRollupMonthQuantity(0)).toBe('—')
    expect(formatRollupMonthQuantity(null)).toBe('—')
  })

  it('collects distinct gantt seeds and builds live schedule rows only', () => {
    const items = [
      makeItem('t1', 1, 2, [
        { type: 'labor', name: '普通工', quantity: 10 },
        { type: 'equipment', name: '挖掘机', quantity: 2 },
        { type: 'labor', name: '幽灵工人', quantity: null },
      ]),
      makeItem('t2', 1, 2, [
        { type: 'labor', name: '普通工', quantity: 5 },
        { type: 'labor', name: '钢筋工', quantity: 3 },
      ]),
    ]
    const unitLookup = buildResourceUnitLookup([
      { type: 'labor', name: '普通工', unit: '人' },
      { type: 'equipment', name: '挖掘机', unit: '台' },
    ])
    const seeds = collectGanttFeatureSeeds(items, unitLookup)
    expect(seeds).toEqual([
      { type: 'labor', name: '普通工', unit: '人' },
      { type: 'machinery', name: '挖掘机', unit: '台' },
      { type: 'labor', name: '钢筋工', unit: '人' },
    ])

    const catalog = [
      {
        id: 'c1',
        type: 'labor' as const,
        name: '普通工',
        unit: '人',
        pricingUnit: '工日',
        unitPrice: 1,
        applicable: 'all',
        note: '',
        spec: '',
        sortOrder: 0,
        parentId: null,
      },
      {
        id: 'c2',
        type: 'equipment' as const,
        name: '挖掘机',
        unit: '台',
        pricingUnit: '台班',
        unitPrice: 1,
        applicable: 'all',
        note: '',
        spec: '',
        sortOrder: 1,
        parentId: null,
      },
    ]
    const filtered = collectGanttFeatureSeeds(items, unitLookup, catalog)
    expect(filtered.map((seed) => seed.name)).toEqual(['普通工', '挖掘机'])

    const orphanCatalog = [
      makeFeature('orphan', 'labor', '技术工人'),
      makeFeature('keep', 'procurement', '招标采购计划'),
    ]
    const live = buildLiveScheduleFeatureRows(seeds, orphanCatalog, 'all')
    expect(live.map((row) => row.name)).toEqual(['普通工', '挖掘机', '钢筋工'])
    expect(live.some((row) => row.name === '技术工人')).toBe(false)
  })
})

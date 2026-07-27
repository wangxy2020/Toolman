import { describe, expect, it } from 'vitest'

import type { PmWorkItem } from '@toolman/shared'

import type { PmCostRow } from '../cost/pm-cost-catalog'
import type { PmResourceRow } from '../resource/pm-resource-catalog'
import { TASK_COST_ASSIGNMENTS_KEY } from '../schedule/pm-gantt-cost-assignment'
import { TASK_RESOURCE_ASSIGNMENTS_KEY } from '../schedule/pm-gantt-resource-assignment'
import type { PmFeatureRow } from './pm-features-catalog'
import {
  allocateQuantityByMonth,
  buildLiveFundsFeatureRows,
  buildFundsDisplayEntries,
  buildFundsSectionMetaByRowId,
  buildLiveProcurementFeatureRows,
  buildLiveScheduleFeatureRows,
  buildResourceUnitLookup,
  collectGanttCostSeeds,
  collectGanttFeatureSeeds,
  collectGanttProcurementSeeds,
  collectRollupMonthKeys,
  computeFeatureCostRollups,
  computeFeatureGanttRollups,
  featureTypeToResourceType,
  formatMonthKey,
  formatRollupMonthQuantity,
  groupMonthKeysByYear,
  resourceTypeToFeatureType,
  rollupHorizontalAmount,
} from './pm-feature-gantt-rollup'

function asCostRows(
  rows: ReadonlyArray<{
    id: string
    type: PmCostRow['type']
    name: string
    code?: string
    featureDescription?: string
    unit?: string
    quantity?: number | null
    unitPrice?: number | null
    applicable?: string
    note?: string
    sectionalWork?: string
    sectionCode?: string
    sectionNote?: string
    sectionName?: string
    sectionFeatureDescription?: string
    sectionTotalFormula?: string
    sortOrder?: number
    parentId?: string | null
  }>,
): PmCostRow[] {
  return rows.map((row, index) => ({
    id: row.id,
    type: row.type,
    code: row.code ?? '',
    name: row.name,
    featureDescription: row.featureDescription ?? '',
    unit: row.unit ?? '',
    quantity: row.quantity ?? null,
    unitPrice: row.unitPrice ?? null,
    applicable: row.applicable ?? 'all',
    note: row.note ?? '',
    sectionalWork: row.sectionalWork ?? '',
    sectionCode: row.sectionCode ?? '',
    sectionNote: row.sectionNote ?? '',
    sectionName: row.sectionName ?? '',
    sectionFeatureDescription: row.sectionFeatureDescription ?? '',
    sectionTotalFormula: row.sectionTotalFormula ?? '',
    sortOrder: row.sortOrder ?? index,
    parentId: row.parentId ?? null,
  }))
}

function asResourceRows(
  rows: ReadonlyArray<{
    id: string
    type: PmResourceRow['type']
    name: string
    unit?: string
    pricingUnit?: string
    unitPrice?: number | null
    note?: string
    applicable?: string
    sortOrder?: number
    parentId?: string | null
    spec?: string
    customTypeName?: string
  }>,
): PmResourceRow[] {
  return rows.map((row, index) => ({
    id: row.id,
    type: row.type,
    name: row.name,
    unit: row.unit ?? '',
    pricingUnit: row.pricingUnit ?? row.unit ?? '',
    unitPrice: row.unitPrice ?? null,
    note: row.note ?? '',
    applicable: row.applicable ?? 'all',
    sortOrder: row.sortOrder ?? index,
    parentId: row.parentId ?? null,
    spec: row.spec ?? '',
    customTypeName: row.customTypeName ?? '',
  }))
}

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
    pricingUnit: '',
    purchaseCycle: null,
    transportCycle: null,
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
    expect(featureTypeToResourceType('device')).toBe('device')
    expect(featureTypeToResourceType('instrument')).toBe('instrument')
    expect(featureTypeToResourceType('procurement')).toBe('material')
    expect(resourceTypeToFeatureType('equipment')).toBe('machinery')
    expect(resourceTypeToFeatureType('device')).toBe('device')
    expect(resourceTypeToFeatureType('instrument')).toBe('instrument')
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

    // Auxiliary keeps stacking peak (sum concurrent). Machinery does not stack.
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

    // Overlapping critical + normal work: take max (2), not sum (2+3=5).
    const machOverlap = computeFeatureGanttRollups(
      [
        makeItem(
          't1',
          new Date(2026, 7, 1).getTime(),
          new Date(2026, 7, 15).getTime(),
          [{ type: 'equipment', name: '挖掘机', quantity: 2 }],
        ),
        makeItem(
          't2',
          new Date(2026, 7, 10).getTime(),
          new Date(2026, 7, 20).getTime(),
          [{ type: 'equipment', name: '挖掘机', quantity: 3 }],
        ),
      ],
      machFeatures,
    ).get('m1')!
    expect(machOverlap.quantity).toBe(3)
    expect(machOverlap.monthly[formatMonthKey(2026, 7)]).toBe(3)
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
        customTypeName: '',
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
        customTypeName: '',
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

  it('collects cost seeds and rolls assigned amounts by month for funds', () => {
    const jan1 = new Date(2026, 0, 1).getTime()
    const jan31 = new Date(2026, 0, 31).getTime()
    const feb1 = new Date(2026, 1, 1).getTime()
    const feb28 = new Date(2026, 1, 28).getTime()

    const costItems: PmWorkItem[] = [
      {
        ...makeItem('c1', jan1, jan31, []),
        metadata: {
          [TASK_COST_ASSIGNMENTS_KEY]: [
            {
              costId: null,
              type: 'comprehensive',
              name: '土建综合',
              percent: 1,
              amount: 100,
            },
          ],
        },
      } as unknown as PmWorkItem,
      {
        ...makeItem('c2', feb1, feb28, []),
        metadata: {
          [TASK_COST_ASSIGNMENTS_KEY]: [
            {
              costId: null,
              type: 'comprehensive',
              name: '土建综合',
              percent: 1,
              amount: 50,
            },
            {
              costId: null,
              type: 'labor',
              name: '人工费',
              percent: 1,
              amount: 999,
            },
          ],
        },
      } as unknown as PmWorkItem,
    ]

    const seeds = collectGanttCostSeeds(costItems)
    expect(seeds).toEqual([
      {
        type: 'comprehensive',
        name: '土建综合',
        unit: '',
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
    })

    const rollups = computeFeatureCostRollups(costItems, live)
    const rollup = rollups.get(live[0]!.id)!
    expect(rollup.quantity).toBe(150)
    expect(rollup.startDate).toBe(jan1)
    expect(rollup.finishDate).toBe(feb28)
    expect(rollup.monthly[formatMonthKey(2026, 0)]).toBe(100)
    expect(rollup.monthly[formatMonthKey(2026, 1)]).toBe(50)
    expect(rollupHorizontalAmount(rollup)).toBe(150)
  })

  it('orders cost seeds by type, sectional work, then price-table order', () => {
    const costItems: PmWorkItem[] = [
      {
        ...makeItem('c1', new Date(2026, 0, 1).getTime(), new Date(2026, 0, 31).getTime(), []),
        metadata: {
          [TASK_COST_ASSIGNMENTS_KEY]: [
            {
              costId: 'b',
              type: 'investment',
              name: '征地拆迁费',
              percent: 1,
              amount: 10,
            },
            {
              costId: 'c',
              type: 'investment',
              name: '市政配套',
              percent: 1,
              amount: 20,
            },
            {
              costId: 'a',
              type: 'investment',
              name: '产业园',
              percent: 1,
              amount: 30,
            },
            {
              costId: 'd',
              type: 'comprehensive',
              name: '土建综合',
              percent: 1,
              amount: 40,
            },
          ],
        },
      } as unknown as PmWorkItem,
    ]
    const catalog = asCostRows([
      {
        id: 'd',
        type: 'comprehensive' as const,
        code: '',
        name: '土建综合',
        featureDescription: '',
        unit: '',
        quantity: null,
        unitPrice: null,
        sectionalWork: '主体',
        note: '',
        applicable: 'all',
        sortOrder: 0,
        parentId: null,
      },
      {
        id: 'a',
        type: 'investment' as const,
        code: '',
        name: '产业园',
        featureDescription: '',
        unit: '',
        quantity: null,
        unitPrice: null,
        sectionalWork: '工程费',
        note: '',
        applicable: 'all',
        sortOrder: 1,
        parentId: null,
      },
      {
        id: 'c',
        type: 'investment' as const,
        code: '',
        name: '市政配套',
        featureDescription: '',
        unit: '',
        quantity: null,
        unitPrice: null,
        sectionalWork: '工程费',
        note: '',
        applicable: 'all',
        sortOrder: 2,
        parentId: null,
      },
      {
        id: 'b',
        type: 'investment' as const,
        code: '',
        name: '征地拆迁费',
        featureDescription: '',
        unit: '',
        quantity: null,
        unitPrice: null,
        sectionalWork: '工程建设其他费',
        note: '',
        applicable: 'all',
        sortOrder: 3,
        parentId: null,
      },
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
    const costItems: PmWorkItem[] = [
      {
        ...makeItem('c1', new Date(2026, 0, 1).getTime(), new Date(2026, 0, 31).getTime(), []),
        metadata: {
          [TASK_COST_ASSIGNMENTS_KEY]: [
            {
              costId: null,
              type: 'funds',
              name: '预付款',
              percent: 1,
              amount: 10,
            },
            {
              costId: null,
              type: 'comprehensive',
              name: '土建综合',
              percent: 1,
              amount: 20,
            },
          ],
        },
      } as unknown as PmWorkItem,
    ]
    const catalog = asCostRows([
      {
        id: 'a',
        type: 'comprehensive' as const,
        code: '',
        name: '土建综合',
        featureDescription: '',
        unit: '',
        quantity: null,
        unitPrice: null,
        sectionalWork: '',
        note: '',
        applicable: 'all',
        sortOrder: 0,
        parentId: null,
      },
      {
        id: 'b',
        type: 'funds' as const,
        code: '',
        name: '预付款',
        featureDescription: '',
        unit: '',
        quantity: null,
        unitPrice: null,
        sectionalWork: '',
        note: '',
        applicable: 'all',
        sortOrder: 1,
        parentId: null,
      },
    ])
    const seeds = collectGanttCostSeeds(costItems, catalog)
    expect(seeds.map((seed) => seed.name)).toEqual(['土建综合', '预付款'])
  })

  it('inserts 分部名称 header rows in funds display entries', () => {
    const jan1 = new Date(2026, 0, 1).getTime()
    const jan31 = new Date(2026, 0, 31).getTime()
    const costItems: PmWorkItem[] = [
      {
        ...makeItem('c1', jan1, jan31, []),
        metadata: {
          [TASK_COST_ASSIGNMENTS_KEY]: [
            {
              costId: 'a',
              type: 'investment',
              name: '产业园',
              percent: 1,
              amount: 100,
            },
            {
              costId: 'b',
              type: 'investment',
              name: '市政配套',
              percent: 1,
              amount: 50,
            },
            {
              costId: 'c',
              type: 'investment',
              name: '征地拆迁费',
              percent: 1,
              amount: 20,
            },
          ],
        },
      } as unknown as PmWorkItem,
    ]
    const catalog = asCostRows([
      {
        id: 'a',
        type: 'investment' as const,
        code: '',
        name: '产业园',
        featureDescription: '',
        unit: '',
        quantity: null,
        unitPrice: null,
        sectionalWork: '工程费',
        sectionName: '工程费',
        note: '',
        applicable: 'all',
        sortOrder: 0,
        parentId: null,
      },
      {
        id: 'b',
        type: 'investment' as const,
        code: '',
        name: '市政配套',
        featureDescription: '',
        unit: '',
        quantity: null,
        unitPrice: null,
        sectionalWork: '工程费',
        sectionName: '工程费',
        note: '',
        applicable: 'all',
        sortOrder: 1,
        parentId: null,
      },
      {
        id: 'c',
        type: 'investment' as const,
        code: '',
        name: '征地拆迁费',
        featureDescription: '',
        unit: '',
        quantity: null,
        unitPrice: null,
        sectionalWork: '工程建设其他费',
        sectionName: '',
        note: '',
        applicable: 'all',
        sortOrder: 2,
        parentId: null,
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

  it('builds procurement rows from Gantt material assignments with quantity rollup', () => {
    const jan1 = new Date(2026, 0, 1).getTime()
    const jan31 = new Date(2026, 0, 31).getTime()
    const items: PmWorkItem[] = [
      makeItem('t1', jan1, jan31, [
        { type: 'material', name: '钢筋', quantity: 12 },
        { type: 'labor', name: '普通工', quantity: 3 },
        { type: 'material', name: '水泥', quantity: 5 },
      ]),
      makeItem('t2', jan1, jan31, [{ type: 'material', name: '钢筋', quantity: 8 }]),
    ]
    const catalog = asResourceRows([
      {
        id: 'm1',
        type: 'material' as const,
        name: '水泥',
        unit: 't',
        pricingUnit: 't',
        unitPrice: 400,
        note: '',
        applicable: 'all',
        sortOrder: 0,
        parentId: null,
        spec: '',
        customTypeName: '',
      },
      {
        id: 'm2',
        type: 'material' as const,
        name: '钢筋',
        unit: 't',
        pricingUnit: 't',
        unitPrice: 3800,
        note: '',
        applicable: 'all',
        sortOrder: 1,
        parentId: null,
        spec: '',
        customTypeName: '',
      },
    ])
    const seeds = collectGanttProcurementSeeds(items, catalog)
    expect(seeds.map((seed) => seed.name)).toEqual(['水泥', '钢筋'])

    const live = buildLiveProcurementFeatureRows(seeds, catalog)
    expect(live.map((row) => ({ type: row.type, name: row.name, unit: row.unit, pricingUnit: row.pricingUnit }))).toEqual([
      { type: 'procurement', name: '水泥', unit: 't', pricingUnit: 't' },
      { type: 'procurement', name: '钢筋', unit: 't', pricingUnit: 't' },
    ])

    const rollups = computeFeatureGanttRollups(items, live)
    expect(rollups.get(live[0]!.id)?.quantity).toBe(5)
    expect(rollups.get(live[1]!.id)?.quantity).toBe(20)
  })
})

import { describe, expect, it } from 'vitest'

import type { PmWorkItem } from '@toolman/shared'

import {
  buildLiveProcurementFeatureRows,
  buildLiveScheduleFeatureRows,
  buildResourceUnitLookup,
  collectGanttFeatureSeeds,
  collectGanttProcurementSeeds,
  computeFeatureGanttRollups,
} from './pm-feature-gantt-rollup'
import { asResourceRows, makeFeature, makeItem } from './pm-feature-gantt-rollup-test-utils'

describe('pm-feature-gantt-rollup procurement', () => {
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
    const live = buildLiveScheduleFeatureRows(seeds, [], orphanCatalog, 'all')
    expect(live.map((row) => row.name)).toEqual(['普通工', '挖掘机', '钢筋工'])
    expect(live.some((row) => row.name === '技术工人')).toBe(false)
  })

  it('joins pricingUnit and unitPrice from the resource catalog into live schedule rows', () => {
    const items: PmWorkItem[] = [
      makeItem('t1', Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 10), [
        { type: 'labor', name: '普通工', quantity: 2 },
        { type: 'equipment', name: '挖掘机', quantity: 1 },
      ]),
    ]
    const catalog = asResourceRows([
      {
        id: 'r1',
        type: 'labor',
        name: '普通工',
        unit: '人',
        pricingUnit: '工日',
        unitPrice: 280,
      },
      {
        id: 'r2',
        type: 'equipment',
        name: '挖掘机',
        unit: '台',
        pricingUnit: '台班',
        unitPrice: 1500,
      },
    ])
    const unitLookup = buildResourceUnitLookup(catalog)
    const seeds = collectGanttFeatureSeeds(items, unitLookup, catalog)
    const live = buildLiveScheduleFeatureRows(seeds, catalog, [], 'all')
    expect(live).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'labor',
          name: '普通工',
          unit: '人',
          pricingUnit: '工日',
          unitPrice: 280,
        }),
        expect.objectContaining({
          type: 'machinery',
          name: '挖掘机',
          unit: '台',
          pricingUnit: '台班',
          unitPrice: 1500,
        }),
      ]),
    )
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
      },
      {
        id: 'm2',
        type: 'material' as const,
        name: '钢筋',
        unit: 't',
        pricingUnit: 't',
        unitPrice: 3800,
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

import { describe, expect, it } from 'vitest'

import type { PmCostRow } from '../cost/pm-cost-catalog'
import {
  formatCostAssignmentInput,
  formatCostAssignmentsInput,
  buildCostAllocatedAmountById,
  catalogCostAmountLimit,
  computeCostAssignmentMoney,
  computeCostAssignmentQuantity,
  catalogCostQuantity,
  defaultCostAssignmentAmount,
  DEFAULT_COST_ASSIGNMENT_PERCENT,
  formatCostPercentRatio,
  groupCostCatalogBySectionalWork,
  hydrateTaskCostAssignmentsAgainstCatalog,
  isCostQuantityFullyAllocated,
  parseCostAssignmentInput,
  parseCostAssignmentsInput,
  parseCostPercentRatioInput,
  replaceTaskCostAssignmentsMetadata,
  readTaskCostAssignments,
  resolveCostAssignmentAgainstCatalog,
  resolveCostAssignmentPercent,
  TASK_COST_ASSIGNMENTS_KEY,
} from './pm-gantt-cost-assignment'

const catalog: PmCostRow[] = [
  {
    id: 'c-material',
    type: 'material',
    code: '',
    name: '水泥',
    featureDescription: '',
    unit: 't',
    quantity: 1,
    unitPrice: 500,
    applicable: 'all',
    note: '',
    sectionalWork: '',
    sectionCode: '',
    sectionNote: '',
    sectionName: '',
    sectionFeatureDescription: '',
    sectionTotalFormula: '',
    sortOrder: 0,
    parentId: null,
  },
  {
    id: 'c-equip',
    type: 'equipment',
    code: '',
    name: '塔吊',
    featureDescription: '',
    unit: '台班',
    quantity: 1,
    unitPrice: 800,
    applicable: 'all',
    note: '',
    sectionalWork: '',
    sectionCode: '',
    sectionNote: '',
    sectionName: '',
    sectionFeatureDescription: '',
    sectionTotalFormula: '',
    sortOrder: 1,
    parentId: null,
  },
]

describe('pm-gantt-cost-assignment', () => {
  it('formats and parses cost input text with catalog binding', () => {
    expect(
      formatCostAssignmentInput(
        {
          costId: 'c-material',
          type: 'material',
          name: '水泥',
          percent: 1,
          amount: 1200,
          note: '',
        },
        (type) => (type === 'material' ? '材料' : type),
      ),
    ).toBe('材料，水泥，1200')

    expect(
      formatCostAssignmentsInput(
        [
          {
            costId: 'c-material',
            type: 'material',
            name: '水泥',
            percent: 1,
            amount: 1200,
            note: '',
          },
          {
            costId: 'c-equip',
            type: 'equipment',
            name: '塔吊',
            percent: 1,
            amount: 800,
            note: '',
          },
        ],
        (type) =>
          type === 'material' ? '材料' : type === 'equipment' ? '机械' : type,
      ),
    ).toBe('材料，水泥，1200；机械，塔吊，800')

    expect(
      parseCostAssignmentInput('水泥，1200', catalog, (label) =>
        label === '材料' ? 'material' : null,
      ),
    ).toEqual({
      costId: 'c-material',
      type: 'material',
      name: '水泥',
      percent: null,
      amount: 1200,
      note: '',
    })

    expect(
      parseCostAssignmentsInput('材料，水泥，1200；机械，塔吊，800；', catalog, (label) => {
        if (label === '材料') return 'material'
        if (label === '机械') return 'equipment'
        return null
      }),
    ).toEqual([
      {
        costId: 'c-material',
        type: 'material',
        name: '水泥',
        percent: null,
        amount: 1200,
        note: '',
      },
      {
        costId: 'c-equip',
        type: 'equipment',
        name: '塔吊',
        percent: null,
        amount: 800,
        note: '',
      },
    ])
  })

  it('keeps unmatched free-text without costId', () => {
    expect(parseCostAssignmentInput('自定义费，99', catalog)).toEqual({
      costId: null,
      type: null,
      name: '自定义费',
      percent: null,
      amount: 99,
      note: '',
    })
  })

  it('hydrates legacy name-only assignments to catalog ids', () => {
    const hydrated = hydrateTaskCostAssignmentsAgainstCatalog(
      [{ costId: null, type: null, name: '水泥', percent: null, amount: 10, note: '' }],
      catalog,
    )
    expect(hydrated.changed).toBe(true)
    expect(hydrated.assignments[0]).toEqual({
      costId: 'c-material',
      type: 'material',
      name: '水泥',
      percent: null,
      amount: 10,
      note: '',
    })
  })

  it('resolves display fields against catalog by id', () => {
    expect(
      resolveCostAssignmentAgainstCatalog(
        {
          costId: 'c-equip',
          type: 'other',
          name: '旧名',
          percent: 0.5,
          amount: 1,
          note: '备注',
        },
        catalog,
      ),
    ).toEqual({
      costId: 'c-equip',
      type: 'equipment',
      name: '塔吊',
      percent: 0.5,
      amount: 1,
      note: '备注',
    })
  })

  it('replaces cost assignment metadata including costId', () => {
    const meta = replaceTaskCostAssignmentsMetadata({}, [
      {
        costId: 'c-material',
        type: 'material',
        name: '水泥',
        percent: 1,
        amount: 100,
        note: '',
      },
    ])
    expect(meta[TASK_COST_ASSIGNMENTS_KEY]).toEqual([
      {
        costId: 'c-material',
        type: 'material',
        name: '水泥',
        percent: 1,
        amount: 100,
        note: '',
      },
    ])
    expect(readTaskCostAssignments(meta)).toHaveLength(1)

    const cleared = replaceTaskCostAssignmentsMetadata(meta, [])
    expect(cleared[TASK_COST_ASSIGNMENTS_KEY]).toBeNull()
  })

  it('reads legacy rows without costId / percent', () => {
    const meta = {
      [TASK_COST_ASSIGNMENTS_KEY]: [{ name: '材料费', amount: 1200 }],
    }
    expect(readTaskCostAssignments(meta)).toEqual([
      {
        costId: null,
        type: null,
        name: '材料费',
        percent: null,
        amount: 1200,
        note: '',
      },
    ])
  })

  it('groups catalog rows by sectional work in price-list order', () => {
    const rows: PmCostRow[] = [
      { ...catalog[0]!, id: 'a', name: '项A', sectionalWork: '土建', sortOrder: 0 },
      { ...catalog[0]!, id: 'b', name: '项B', sectionalWork: ' 土建 ', sortOrder: 1 },
      { ...catalog[0]!, id: 'c', name: '项C', sectionalWork: '安装', sortOrder: 2 },
      { ...catalog[0]!, id: 'd', name: '项D', sectionalWork: '', sortOrder: 3 },
      { ...catalog[0]!, id: 'e', name: '', sectionalWork: '土建', sortOrder: 4 },
    ]
    expect(groupCostCatalogBySectionalWork(rows)).toEqual([
      { key: '土建', rows: [rows[0], rows[1]] },
      { key: '安装', rows: [rows[2]] },
      { key: '', rows: [rows[3]] },
    ])
    expect(groupCostCatalogBySectionalWork(rows, 'equipment')).toEqual([])
  })

  it('marks catalog rows fully allocated when task amounts cover 合价', () => {
    const items = [
      {
        metadata: {
          [TASK_COST_ASSIGNMENTS_KEY]: [
            { costId: 'c-material', type: 'material', name: '水泥', amount: 300 },
          ],
        },
      },
      {
        metadata: {
          [TASK_COST_ASSIGNMENTS_KEY]: [
            { costId: 'c-material', type: 'material', name: '水泥', amount: 200 },
            { costId: 'c-equip', type: 'equipment', name: '塔吊', amount: 400 },
          ],
        },
      },
    ]
    const allocated = buildCostAllocatedAmountById(items, catalog)
    expect(allocated.get('c-material')).toBeCloseTo(500)
    expect(allocated.get('c-equip')).toBeCloseTo(400)
    expect(isCostQuantityFullyAllocated(catalog[0]!, allocated, catalog)).toBe(true)
    expect(isCostQuantityFullyAllocated(catalog[1]!, allocated, catalog)).toBe(false)
    expect(
      isCostQuantityFullyAllocated(
        { ...catalog[0]!, id: 'unknown', quantity: null, unitPrice: null },
        allocated,
        catalog,
      ),
    ).toBe(false)
  })

  it('defaultCostAssignmentAmount prefers quantity × unitPrice', () => {
    expect(defaultCostAssignmentAmount(catalog[0]!)).toBe(500)
    expect(
      defaultCostAssignmentAmount({ quantity: null, unitPrice: 80 }),
    ).toBe(80)
    expect(
      defaultCostAssignmentAmount({ quantity: 3, unitPrice: null }),
    ).toBe(3)
    expect(
      defaultCostAssignmentAmount({ quantity: null, unitPrice: null }),
    ).toBeNull()
  })

  it('defaultCostAssignmentAmount returns remaining 合价 after allocations', () => {
    const allocated = new Map<string, number>([['c-material', 200]])
    expect(
      defaultCostAssignmentAmount(catalog[0]!, {
        catalog,
        allocatedById: allocated,
      }),
    ).toBe(300)
    expect(
      defaultCostAssignmentAmount(catalog[0]!, {
        catalog,
        allocatedById: allocated,
        excludeAllocated: 200,
      }),
    ).toBe(500)
  })

  it('computes amount as catalog 合价 × percent', () => {
    expect(DEFAULT_COST_ASSIGNMENT_PERCENT).toBe(1)
    expect(catalogCostAmountLimit(catalog[0]!, catalog)).toBe(500)
    expect(computeCostAssignmentMoney(500, 1)).toBe(500)
    expect(computeCostAssignmentMoney(500, 0.5)).toBe(250)
    expect(computeCostAssignmentMoney(null, 1)).toBeNull()
    expect(resolveCostAssignmentPercent({ percent: null, amount: null })).toBe(1)
    expect(resolveCostAssignmentPercent({ percent: 0.25, amount: 100 })).toBe(0.25)
    expect(resolveCostAssignmentPercent({ percent: null, amount: 250 }, 500)).toBe(0.5)
  })

  it('treats percent as 0–1 share of price-list 工程数量', () => {
    expect(catalogCostQuantity(catalog[0]!)).toBe(1)
    expect(computeCostAssignmentQuantity(100, 1)).toBe(100)
    expect(computeCostAssignmentQuantity(100, 0.5)).toBe(50)
    expect(computeCostAssignmentQuantity(100, 0.0016)).toBe(0.16)
    expect(formatCostPercentRatio(1)).toBe('1')
    expect(formatCostPercentRatio(0.5)).toBe('0.5')
    expect(formatCostPercentRatio(0.0016)).toBe('0.0016')
    expect(parseCostPercentRatioInput('1')).toBe(1)
    expect(parseCostPercentRatioInput('0.5')).toBe(0.5)
    expect(parseCostPercentRatioInput('0.0016')).toBe(0.0016)
    expect(parseCostPercentRatioInput('')).toBe(1)
    expect(parseCostPercentRatioInput('50%')).toBe(0.5)
  })

  it('resolves percent=1 when amount was stored as catalog 工程数量', () => {
    // amount=8.37 (qty) against 合价=8.37×500 must not become ~0.002
    expect(
      resolveCostAssignmentPercent({ percent: null, amount: 8.37 }, 8.37 * 500, 8.37),
    ).toBe(1)
    expect(
      resolveCostAssignmentPercent({ percent: 0.002, amount: 8.37 }, 8.37 * 500, 8.37),
    ).toBe(1)
    expect(computeCostAssignmentQuantity(8.37, 1)).toBe(8.37)
    // True money half-share still resolves via 合价
    expect(
      resolveCostAssignmentPercent({ percent: null, amount: 8.37 * 250 }, 8.37 * 500, 8.37),
    ).toBe(0.5)
  })
})

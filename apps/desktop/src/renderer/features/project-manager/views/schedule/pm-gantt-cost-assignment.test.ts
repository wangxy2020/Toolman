import { describe, expect, it } from 'vitest'

import type { PmCostRow } from '../cost/pm-cost-catalog'
import {
  formatCostAssignmentInput,
  formatCostAssignmentsInput,
  buildCostAllocatedAmountById,
  groupCostCatalogBySectionalWork,
  hydrateTaskCostAssignmentsAgainstCatalog,
  isCostQuantityFullyAllocated,
  parseCostAssignmentInput,
  parseCostAssignmentsInput,
  replaceTaskCostAssignmentsMetadata,
  readTaskCostAssignments,
  resolveCostAssignmentAgainstCatalog,
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
    sortOrder: 1,
    parentId: null,
  },
]

describe('pm-gantt-cost-assignment', () => {
  it('formats and parses cost input text with catalog binding', () => {
    expect(
      formatCostAssignmentInput(
        { costId: 'c-material', type: 'material', name: '水泥', amount: 1200, note: '' },
        (type) => (type === 'material' ? '材料' : type),
      ),
    ).toBe('材料，水泥，1200')

    expect(
      formatCostAssignmentsInput(
        [
          { costId: 'c-material', type: 'material', name: '水泥', amount: 1200, note: '' },
          { costId: 'c-equip', type: 'equipment', name: '塔吊', amount: 800, note: '' },
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
      { costId: 'c-material', type: 'material', name: '水泥', amount: 1200, note: '' },
      { costId: 'c-equip', type: 'equipment', name: '塔吊', amount: 800, note: '' },
    ])
  })

  it('keeps unmatched free-text without costId', () => {
    expect(parseCostAssignmentInput('自定义费，99', catalog)).toEqual({
      costId: null,
      type: null,
      name: '自定义费',
      amount: 99,
      note: '',
    })
  })

  it('hydrates legacy name-only assignments to catalog ids', () => {
    const hydrated = hydrateTaskCostAssignmentsAgainstCatalog(
      [{ costId: null, type: null, name: '水泥', amount: 10, note: '' }],
      catalog,
    )
    expect(hydrated.changed).toBe(true)
    expect(hydrated.assignments[0]).toEqual({
      costId: 'c-material',
      type: 'material',
      name: '水泥',
      amount: 10,
      note: '',
    })
  })

  it('resolves display fields against catalog by id', () => {
    expect(
      resolveCostAssignmentAgainstCatalog(
        { costId: 'c-equip', type: 'other', name: '旧名', amount: 1, note: '备注' },
        catalog,
      ),
    ).toEqual({
      costId: 'c-equip',
      type: 'equipment',
      name: '塔吊',
      amount: 1,
      note: '备注',
    })
  })

  it('replaces cost assignment metadata including costId', () => {
    const meta = replaceTaskCostAssignmentsMetadata({}, [
      { costId: 'c-material', type: 'material', name: '水泥', amount: 100, note: '' },
    ])
    expect(meta[TASK_COST_ASSIGNMENTS_KEY]).toEqual([
      { costId: 'c-material', type: 'material', name: '水泥', amount: 100, note: '' },
    ])
    expect(readTaskCostAssignments(meta)).toHaveLength(1)

    const cleared = replaceTaskCostAssignmentsMetadata(meta, [])
    expect(cleared[TASK_COST_ASSIGNMENTS_KEY]).toBeNull()
  })

  it('reads legacy rows without costId', () => {
    const meta = {
      [TASK_COST_ASSIGNMENTS_KEY]: [{ name: '材料费', amount: 1200 }],
    }
    expect(readTaskCostAssignments(meta)).toEqual([
      { costId: null, type: null, name: '材料费', amount: 1200, note: '' },
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

  it('marks catalog rows fully allocated when task amounts cover quantity', () => {
    const items = [
      {
        metadata: {
          [TASK_COST_ASSIGNMENTS_KEY]: [
            { costId: 'c-material', type: 'material', name: '水泥', amount: 0.6 },
          ],
        },
      },
      {
        metadata: {
          [TASK_COST_ASSIGNMENTS_KEY]: [
            { costId: 'c-material', type: 'material', name: '水泥', amount: 0.4 },
            { costId: 'c-equip', type: 'equipment', name: '塔吊', amount: 0.5 },
          ],
        },
      },
    ]
    const allocated = buildCostAllocatedAmountById(items, catalog)
    expect(allocated.get('c-material')).toBeCloseTo(1)
    expect(allocated.get('c-equip')).toBeCloseTo(0.5)
    expect(isCostQuantityFullyAllocated(catalog[0]!, allocated)).toBe(true)
    expect(isCostQuantityFullyAllocated(catalog[1]!, allocated)).toBe(false)
    expect(
      isCostQuantityFullyAllocated({ ...catalog[0]!, quantity: null }, allocated),
    ).toBe(false)
  })
})

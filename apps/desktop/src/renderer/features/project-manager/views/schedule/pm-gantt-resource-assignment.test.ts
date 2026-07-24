import { describe, expect, it } from 'vitest'

import type { PmResourceRow, PmResourceType } from '../resource/pm-resource-catalog'
import {
  catalogRowsForType,
  catalogTypesInUse,
  countResourceAssignmentsForTypeFilter,
  findAssignmentIndexForResource,
  formatResourceAssignmentInput,
  formatResourceAssignmentsInput,
  hydrateTaskResourceAssignmentsAgainstCatalog,
  moveTaskResourceAssignment,
  orderAssignmentsByResourceCatalog,
  orderResourcesForGanttColumns,
  parseResourceAssignmentInput,
  parseResourceAssignmentsInput,
  patchTaskResourceAssignmentMetadata,
  readResourceAssignmentAtFilteredSlot,
  readTaskResourceAssignmentAt,
  readTaskResourceAssignments,
  resolveAssignmentAgainstCatalog,
  resolveResourceAssignSourceIndex,
  TASK_RESOURCE_ASSIGNMENT_KEY,
  TASK_RESOURCE_ASSIGNMENTS_KEY,
  upsertResourceColumnQuantity,
} from './pm-gantt-resource-assignment'

function catalogRow(
  partial: Partial<PmResourceRow> &
    Pick<PmResourceRow, 'id' | 'name' | 'type' | 'unit' | 'unitPrice'>,
): PmResourceRow {
  const unit = partial.unit
  const defaultPricing =
    partial.type === 'labor'
      ? '工日'
      : partial.type === 'equipment' ||
          partial.type === 'device' ||
          partial.type === 'instrument'
        ? '台班'
        : unit
  return {
    id: partial.id,
    type: partial.type,
    customTypeName: partial.customTypeName ?? '',
    name: partial.name,
    spec: partial.spec ?? '',
    unit,
    pricingUnit: partial.pricingUnit ?? defaultPricing,
    unitPrice: partial.unitPrice,
    applicable: partial.applicable ?? 'all',
    note: partial.note ?? '',
    sortOrder: partial.sortOrder ?? 0,
    parentId: partial.parentId ?? null,
  }
}

const catalog: PmResourceRow[] = [
  catalogRow({
    id: 'r1',
    type: 'labor',
    name: '普通工',
    unit: '人',
    unitPrice: 250,
    sortOrder: 0,
  }),
  catalogRow({
    id: 'r2',
    type: 'equipment',
    name: '挖掘机',
    unit: '台',
    unitPrice: 1500,
    sortOrder: 1,
  }),
]

describe('pm-gantt-resource-assignment', () => {
  it('reads and patches assignment metadata into a slot array', () => {
    const meta = patchTaskResourceAssignmentMetadata({}, {
      resourceId: 'r1',
      type: 'labor',
      name: '普通工',
      quantity: 3,
    })
    expect(meta[TASK_RESOURCE_ASSIGNMENT_KEY]).toBeNull()
    expect(meta[TASK_RESOURCE_ASSIGNMENTS_KEY]).toEqual([
      {
        resourceId: 'r1',
        type: 'labor',
        name: '普通工',
        quantity: 3,
        note: '',
      },
    ])
    expect(readTaskResourceAssignmentAt(meta, 0).quantity).toBe(3)
  })

  it('clears an assignment so shallow metadata merges drop the value', () => {
    const seeded = patchTaskResourceAssignmentMetadata({}, {
      type: 'labor',
      name: '',
      resourceId: null,
      quantity: null,
    })
    const cleared = patchTaskResourceAssignmentMetadata(seeded, {
      type: null,
      name: '',
      resourceId: null,
      quantity: null,
    })
    expect(cleared[TASK_RESOURCE_ASSIGNMENTS_KEY]).toBeNull()
    expect(cleared[TASK_RESOURCE_ASSIGNMENT_KEY]).toBeNull()
    // Simulate server shallow merge: null overwrites previous object.
    const merged = {
      ...seeded,
      ...cleared,
    }
    expect(readTaskResourceAssignments(merged)).toEqual([])
  })

  it('resolves stale names against the live catalog by id', () => {
    const resolved = resolveAssignmentAgainstCatalog(
      { resourceId: 'r2', type: 'labor', name: '旧名称', quantity: 1, note: '备注' },
      catalog,
    )
    expect(resolved).toEqual({
      resourceId: 'r2',
      type: 'equipment',
      name: '挖掘机',
      quantity: 1,
      note: '备注',
    })
  })

  it('matches resource columns and hydrates when stored type lags catalog reclass', () => {
    const auxCatalog = [
      catalogRow({
        id: 'a1',
        type: 'auxiliary',
        name: '模板',
        unit: 'm²',
        unitPrice: 50,
      }),
    ]
    const stale = [
      {
        resourceId: null,
        type: 'material' as const,
        name: '模板',
        quantity: 12,
        note: '',
      },
    ]
    expect(findAssignmentIndexForResource(stale, auxCatalog[0]!)).toBe(0)

    const hydrated = hydrateTaskResourceAssignmentsAgainstCatalog(stale, auxCatalog)
    expect(hydrated.changed).toBe(true)
    expect(hydrated.assignments).toEqual([
      {
        resourceId: 'a1',
        type: 'auxiliary',
        name: '模板',
        quantity: 12,
        note: '',
      },
    ])

    // Ghost free-text rows are left alone (not cleared) during hydrate.
    const ghost = hydrateTaskResourceAssignmentsAgainstCatalog(
      [{ resourceId: null, type: 'material', name: '自定义材料', quantity: 1, note: '' }],
      auxCatalog,
    )
    expect(ghost.changed).toBe(false)
    expect(ghost.assignments[0]?.name).toBe('自定义材料')
  })

  it('drops ghost resource names that are not in the assignable catalog', () => {
    const resolved = resolveAssignmentAgainstCatalog(
      { resourceId: 'ghost', type: 'labor', name: '技术工人', quantity: 5, note: '' },
      catalog,
    )
    expect(resolved).toEqual({
      resourceId: null,
      type: null,
      name: '',
      quantity: 5,
      note: '',
    })
  })

  it('filters catalog options by type and keeps resource-list order', () => {
    expect(catalogTypesInUse(catalog)).toEqual(['labor', 'equipment'])
    const shuffled = [
      catalogRow({
        id: 'b',
        type: 'labor',
        name: '普通工',
        unit: '人',
        unitPrice: 1,
        sortOrder: 1,
      }),
      catalogRow({
        id: 'a',
        type: 'labor',
        name: '技术工人',
        unit: '人',
        unitPrice: 1,
        sortOrder: 0,
      }),
      catalogRow({
        id: 'c',
        type: 'material',
        name: '水泥',
        unit: 't',
        unitPrice: 1,
        sortOrder: 2,
      }),
    ]
    expect(catalogRowsForType(shuffled, 'labor').map((row) => row.id)).toEqual(['b', 'a'])
    expect(catalogRowsForType(catalog, 'labor').map((row) => row.id)).toEqual(['r1'])
    expect(catalogRowsForType(catalog, null)).toHaveLength(2)
  })

  it('formats and parses input-mode assignment text', () => {
    const typeLabel = (type: PmResourceType): string =>
      (
        {
          labor: '人力',
          auxiliary: '辅材',
          material: '材料',
          equipment: '机械',
          device: '设备',
          instrument: '仪器',
          management: '管理',
          fees: '规费',
          comprehensive: '综合单价',
          measures: '措施费',
          tax: '税金',
          investment: '投资估算',
          designEstimate: '设计概算',
          constructionBudget: '施工预算',
          costBudget: '成本预算',
          funds: '资金',
          other: '其他',
          custom: '自定义',
        } satisfies Record<PmResourceType, string>
      )[type]

    expect(
      formatResourceAssignmentInput(
        {
          resourceId: 'r1',
          type: 'labor',
          name: '普通工',
          quantity: 3,
          note: '',
        },
        typeLabel,
      ),
    ).toBe('人力，普通工，3')

    expect(
      formatResourceAssignmentsInput(
        [
          {
            resourceId: 'r1',
            type: 'labor',
            name: '普通工',
            quantity: 3,
            note: '甲',
          },
          {
            resourceId: 'r2',
            type: 'equipment',
            name: '挖掘机',
            quantity: 1,
            note: '乙',
          },
        ],
        typeLabel,
      ),
    ).toBe('人力，普通工，3；机械，挖掘机，1')

    expect(
      parseResourceAssignmentInput('人力，普通工，3', catalog, (label) =>
        label === '人力' ? 'labor' : null,
      ),
    ).toEqual({
      resourceId: 'r1',
      type: 'labor',
      name: '普通工',
      quantity: 3,
      note: '',
    })

    expect(
      parseResourceAssignmentsInput(
        '人力，普通工，3；机械，挖掘机，1',
        catalog,
        (label) => (label === '人力' ? 'labor' : label === '机械' ? 'equipment' : null),
        [
          {
            resourceId: 'r1',
            type: 'labor',
            name: '普通工',
            quantity: 3,
            note: '保留说明',
          },
        ],
      ),
    ).toEqual([
      {
        resourceId: 'r1',
        type: 'labor',
        name: '普通工',
        quantity: 3,
        note: '保留说明',
      },
      {
        resourceId: 'r2',
        type: 'equipment',
        name: '挖掘机',
        quantity: 1,
        note: '',
      },
    ])

    expect(
      parseResourceAssignmentInput('人力, 普通工, 2', catalog, (label) =>
        label === '人力' ? 'labor' : null,
      ).quantity,
    ).toBe(2)

    expect(
      parseResourceAssignmentsInput(
        '人力，普通工，3；机械，挖掘机，1；',
        catalog,
        (label) => (label === '人力' ? 'labor' : label === '机械' ? 'equipment' : null),
      ),
    ).toEqual([
      {
        resourceId: 'r1',
        type: 'labor',
        name: '普通工',
        quantity: 3,
        note: '',
      },
      {
        resourceId: 'r2',
        type: 'equipment',
        name: '挖掘机',
        quantity: 1,
        note: '',
      },
    ])

    expect(parseResourceAssignmentInput('', catalog, () => null)).toEqual({
      resourceId: null,
      type: null,
      name: '',
      quantity: null,
      note: '',
    })
  })

  it('orders shared catalog columns labor → material → equipment, then by name', () => {
    const ordered = orderResourcesForGanttColumns([
      catalogRow({
        id: 'e1',
        type: 'equipment',
        name: '挖掘机',
        unit: '台',
        unitPrice: 1,
      }),
      catalogRow({
        id: 'm1',
        type: 'material',
        name: '水泥',
        unit: 't',
        unitPrice: 1,
      }),
      catalogRow({
        id: 'l1',
        type: 'labor',
        name: '普通工',
        unit: '人',
        unitPrice: 1,
      }),
      catalogRow({
        id: 'l0',
        type: 'labor',
        name: '技术工人',
        unit: '人',
        unitPrice: 1,
        // Higher sortOrder must not override name order within type.
        sortOrder: 99,
      }),
    ])
    expect(ordered.map((row) => row.name)).toEqual([
      '技术工人',
      '普通工',
      '水泥',
      '挖掘机',
    ])
  })

  it('orders task assignments left-to-right by type then name', () => {
    const catalog = [
      catalogRow({
        id: 'e1',
        type: 'equipment',
        name: '挖掘机',
        unit: '台',
        unitPrice: 1,
      }),
      catalogRow({
        id: 'l1',
        type: 'labor',
        name: '普通工',
        unit: '人',
        unitPrice: 1,
      }),
      catalogRow({
        id: 'l2',
        type: 'labor',
        name: '技术工人',
        unit: '人',
        unitPrice: 1,
      }),
      catalogRow({
        id: 'm1',
        type: 'material',
        name: '水泥',
        unit: 't',
        unitPrice: 1,
      }),
    ]
    const ordered = orderAssignmentsByResourceCatalog(
      [
        {
          resourceId: 'e1',
          type: 'equipment',
          name: '挖掘机',
          quantity: 2,
          note: '',
        },
        {
          resourceId: null,
          type: 'labor',
          name: '',
          quantity: null,
          note: '',
        },
        {
          resourceId: 'm1',
          type: 'material',
          name: '水泥',
          quantity: 1,
          note: '',
        },
        {
          resourceId: 'l1',
          type: 'labor',
          name: '普通工',
          quantity: 3,
          note: '',
        },
        {
          resourceId: 'l2',
          type: 'labor',
          name: '技术工人',
          quantity: 1,
          note: '',
        },
      ],
      catalog,
    )
    expect(ordered.map((entry) => entry.name)).toEqual([
      '技术工人',
      '普通工',
      '水泥',
      '挖掘机',
    ])
  })

  it('reorders even when stored types are stale, using catalog name match', () => {
    const catalog = [
      catalogRow({
        id: 'm1',
        type: 'material',
        name: '混凝土',
        unit: 'm³',
        unitPrice: 1,
      }),
      catalogRow({
        id: 'l1',
        type: 'labor',
        name: '钢筋工',
        unit: '人',
        unitPrice: 1,
      }),
      catalogRow({
        id: 'l2',
        type: 'labor',
        name: '架子工',
        unit: '人',
        unitPrice: 1,
      }),
      catalogRow({
        id: 'e1',
        type: 'equipment',
        name: '吊车',
        unit: '台',
        unitPrice: 1,
      }),
    ]
    const ordered = orderAssignmentsByResourceCatalog(
      [
        { resourceId: null, type: 'labor', name: '钢筋工', quantity: 1, note: '' },
        // Stale type: stored as labor but catalog says material.
        { resourceId: null, type: 'labor', name: '混凝土', quantity: 2, note: '' },
        { resourceId: null, type: 'material', name: '架子工', quantity: 1, note: '' },
        { resourceId: null, type: 'equipment', name: '吊车', quantity: 1, note: '' },
      ],
      catalog,
    )
    expect(ordered.map((entry) => `${entry.type}:${entry.name}`)).toEqual([
      'labor:钢筋工',
      'labor:架子工',
      'material:混凝土',
      'equipment:吊车',
    ])
  })

  it('upserts quantity onto a named resource column without dropdown slots', () => {
    const resource = catalog[0]!
    const withQty = upsertResourceColumnQuantity([], resource, 4)
    expect(withQty).toEqual([
      {
        resourceId: 'r1',
        type: 'labor',
        name: '普通工',
        quantity: 4,
        note: '',
      },
    ])
    expect(upsertResourceColumnQuantity(withQty, resource, null)).toEqual([])
  })

  it('moves assignment slots with up/down without compacting siblings', () => {
    const list = [
      { resourceId: 'a', type: 'labor' as const, name: 'A', quantity: 1, note: '' },
      { resourceId: 'b', type: 'material' as const, name: 'B', quantity: 2, note: '' },
      { resourceId: 'c', type: 'equipment' as const, name: 'C', quantity: 3, note: '' },
    ]
    expect(moveTaskResourceAssignment(list, 0, 1).map((entry) => entry.name)).toEqual([
      'B',
      'A',
      'C',
    ])
    expect(moveTaskResourceAssignment(list, 2, 0).map((entry) => entry.name)).toEqual([
      'C',
      'A',
      'B',
    ])
    expect(moveTaskResourceAssignment(list, 1, 1)).toEqual(list)
  })
})

describe('resource assign type filter slots', () => {
  it('maps filtered display slots to source indices', () => {
    const assignments = [
      { resourceId: 'a', type: 'labor' as const, name: '普通工', quantity: 2, note: '' },
      { resourceId: 'b', type: 'material' as const, name: '砂子', quantity: 10, note: '' },
      { resourceId: 'c', type: 'labor' as const, name: '钢筋工', quantity: 3, note: '' },
    ]
    expect(countResourceAssignmentsForTypeFilter(assignments, 'labor')).toBe(2)
    expect(resolveResourceAssignSourceIndex(assignments, 0, 'labor')).toBe(0)
    expect(resolveResourceAssignSourceIndex(assignments, 1, 'labor')).toBe(2)
    expect(resolveResourceAssignSourceIndex(assignments, 2, 'labor')).toBe(3)
    expect(readResourceAssignmentAtFilteredSlot(assignments, 1, 'labor').name).toBe('钢筋工')
  })
})

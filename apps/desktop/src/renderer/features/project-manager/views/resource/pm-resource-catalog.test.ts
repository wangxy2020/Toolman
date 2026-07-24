import { beforeEach, describe, expect, it } from 'vitest'

import {
  applyAuxiliaryResourceMigration,
  applyBudgetTypeMigration,
  applyLaborUnitAliases,
  applyResourceNameAliases,
  applyResourceUnitConventions,
  buildBaselinePriceIndex,
  canonicalizeLaborUnit,
  canonicalizeResourceName,
  deriveResourceApplicable,
  ensureDefaultResourcesInCatalog,
  mergeSharedIntoProjectCatalog,
  PM_RESOURCE_APPLICABLE_ALL,
  readSharedResourceCatalog,
  resolveProjectResourceCatalog,
  sortResourceRowsLikeSharedCatalog,
  upsertSharedResourceCatalog,
  writeSharedResourceCatalog,
  type PmResourceRow,
} from './pm-resource-catalog'

function row(
  partial: Partial<PmResourceRow> & Pick<PmResourceRow, 'id' | 'name' | 'type'>,
): PmResourceRow {
  const {
    id,
    type,
    name,
    customTypeName = '',
    spec = '',
    unit = '人',
    pricingUnit,
    unitPrice = 100,
    applicable = PM_RESOURCE_APPLICABLE_ALL,
    note = '',
    sortOrder = 0,
    parentId = null,
  } = partial
  const defaultPricing =
    type === 'labor'
      ? '工日'
      : type === 'equipment' || type === 'device' || type === 'instrument'
        ? '台班'
        : unit
  return {
    id,
    type,
    customTypeName,
    name,
    spec,
    unit,
    pricingUnit: pricingUnit ?? defaultPricing,
    unitPrice,
    applicable,
    note,
    sortOrder,
    parentId,
  }
}

describe('mergeSharedIntoProjectCatalog', () => {
  it('adds missing shared resources into the project catalog', () => {
    const project = [
      row({ id: 'p1', type: 'labor', name: '普通工', applicable: 'project-a', unitPrice: 260 }),
    ]
    const shared = [
      row({ id: 's1', type: 'labor', name: '普通工', unitPrice: 250 }),
      row({ id: 's2', type: 'material', name: '砂子', unit: 'm³', unitPrice: 100 }),
    ]

    const merged = mergeSharedIntoProjectCatalog(project, shared)
    expect(merged.changed).toBe(true)
    expect(merged.rows).toHaveLength(2)
    expect(merged.rows[0]?.unitPrice).toBe(260)
    expect(merged.rows[1]?.name).toBe('砂子')
    expect(merged.rows[1]?.applicable).toBe(PM_RESOURCE_APPLICABLE_ALL)
  })

  it('does not duplicate when type+name already exists', () => {
    const project = [row({ id: 'p1', type: 'labor', name: '普通工', applicable: 'project-a' })]
    const shared = [row({ id: 's1', type: 'labor', name: '普通工' })]
    const merged = mergeSharedIntoProjectCatalog(project, shared)
    expect(merged.changed).toBe(false)
    expect(merged.rows).toHaveLength(1)
  })
})

describe('readSharedResourceCatalog', () => {
  const workspaceId = 'ws-resource-empty-test'
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value)
        },
        removeItem: (key: string) => {
          store.delete(key)
        },
      },
    })
  })

  it('keeps an explicit empty catalog instead of reseeding defaults', () => {
    writeSharedResourceCatalog(workspaceId, [])
    const shared = readSharedResourceCatalog(workspaceId)
    expect(shared.isDefault).toBe(false)
    expect(shared.rows).toEqual([])
  })
})

describe('resolveProjectResourceCatalog', () => {
  const workspaceId = 'ws-resource-resolve-test'
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value)
        },
        removeItem: (key: string) => {
          store.delete(key)
        },
      },
    })
  })

  it('keeps an existing project catalog without re-adding shared deletions', () => {
    writeSharedResourceCatalog(workspaceId, [
      row({ id: 's1', type: 'labor', name: '普通工', unitPrice: 250 }),
      row({ id: 's2', type: 'funds', name: '投资估算', unit: '元', unitPrice: null }),
      row({ id: 's3', type: 'funds', name: '设计概算', unit: '元', unitPrice: null }),
    ])
    const stored = [row({ id: 'p1', type: 'labor', name: '普通工', unitPrice: 260 })]
    const resolved = resolveProjectResourceCatalog(
      workspaceId,
      'project-a',
      { resourceCatalog: stored },
      { projectCode: 'PRJ-2601' },
    )
    expect(resolved.needsPersist).toBe(false)
    expect(resolved.rows).toHaveLength(1)
    expect(resolved.rows[0]?.unitPrice).toBe(260)
    expect(resolved.rows.some((entry) => entry.name === '投资估算')).toBe(false)
  })

  it('clones shared catalog when the project never saved one', () => {
    writeSharedResourceCatalog(workspaceId, [
      row({ id: 's1', type: 'labor', name: '普通工', unitPrice: 250 }),
    ])
    const resolved = resolveProjectResourceCatalog(
      workspaceId,
      'project-emp',
      {},
      { projectCode: 'EMP-2401' },
    )
    expect(resolved.needsPersist).toBe(false)
    expect(resolved.usesSharedFallback).toBe(true)
    expect(resolved.rows).toHaveLength(1)
    expect(resolved.rows[0]?.name).toBe('普通工')
    expect(resolved.rows[0]?.id).toBe('s1')
  })

  it('keeps an explicit empty project catalog empty', () => {
    writeSharedResourceCatalog(workspaceId, [
      row({ id: 's1', type: 'labor', name: '普通工', unitPrice: 250 }),
    ])
    const resolved = resolveProjectResourceCatalog(
      workspaceId,
      'project-emp',
      { resourceCatalog: [] },
      { projectCode: 'EMP-2401' },
    )
    expect(resolved.needsPersist).toBe(false)
    expect(resolved.usesSharedFallback).toBe(false)
    expect(resolved.rows).toHaveLength(0)
  })

  it('rewrites legacy labor unit 工日 to 人 and marks persist', () => {
    writeSharedResourceCatalog(workspaceId, [
      row({ id: 's1', type: 'labor', name: '普通工', unit: '人', unitPrice: 250 }),
    ])
    const resolved = resolveProjectResourceCatalog(
      workspaceId,
      'project-a',
      {
        resourceCatalog: [
          row({ id: 'p1', type: 'labor', name: '普通工', unit: '工日', unitPrice: 260 }),
        ],
      },
      { projectCode: 'PRJ-2601' },
    )
    expect(resolved.needsPersist).toBe(true)
    expect(resolved.rows[0]?.unit).toBe('人')
  })
})

describe('upsertSharedResourceCatalog', () => {
  it('appends new rows and updates matching ones', () => {
    const shared = [row({ id: 's1', type: 'labor', name: '普通工', unitPrice: 250 })]
    const incoming = [
      row({ id: 'p1', type: 'labor', name: '普通工', unitPrice: 280, applicable: 'project-a' }),
      row({
        id: 'p2',
        type: 'equipment',
        name: '吊车',
        unit: '台班',
        unitPrice: 2000,
        applicable: 'project-a',
      }),
    ]

    const result = upsertSharedResourceCatalog(shared, incoming)
    expect(result.changed).toBe(true)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]?.unitPrice).toBe(280)
    expect(result.rows[0]?.applicable).toBe(PM_RESOURCE_APPLICABLE_ALL)
    expect(result.rows[1]?.name).toBe('吊车')
    expect(result.rows[1]?.applicable).toBe(PM_RESOURCE_APPLICABLE_ALL)
  })
})

describe('ensureDefaultResourcesInCatalog', () => {
  it('appends missing device defaults into an existing catalog without re-seeding budgets', () => {
    const existing = [
      row({ id: 'p1', type: 'labor', name: '普通工', unitPrice: 250 }),
    ]
    const ensured = ensureDefaultResourcesInCatalog(existing)
    expect(ensured.changed).toBe(true)
    expect(ensured.rows.some((entry) => entry.type === 'device' && entry.name === '发电机')).toBe(
      true,
    )
    expect(ensured.rows.some((entry) => entry.type === 'investment')).toBe(false)
    expect(ensured.rows.some((entry) => entry.type === 'designEstimate')).toBe(false)
    expect(ensured.rows.some((entry) => entry.type === 'constructionBudget')).toBe(false)
    expect(ensured.rows.some((entry) => entry.type === 'costBudget')).toBe(false)
    expect(ensured.rows.some((entry) => entry.type === 'labor' && entry.name === '普通工')).toBe(
      true,
    )
  })

  it('does not resurrect deleted budget defaults', () => {
    const existing = [
      row({ id: 'p1', type: 'labor', name: '普通工', unitPrice: 250 }),
      row({ id: 'd1', type: 'device', name: '发电机', unit: '台', unitPrice: 600 }),
      row({ id: 'i1', type: 'instrument', name: '全站仪', unit: '台', unitPrice: 400 }),
      row({ id: 'i2', type: 'instrument', name: '水准仪', unit: '台', unitPrice: 150 }),
      row({ id: 'i3', type: 'instrument', name: '塔尺', unit: '台', unitPrice: 30 }),
      row({ id: 'a1', type: 'auxiliary', name: '模板', unit: 'm²', unitPrice: 50 }),
      row({ id: 'a2', type: 'auxiliary', name: '方木', unit: 'm³', unitPrice: 1800 }),
      row({ id: 'a3', type: 'auxiliary', name: '脚手架', unit: 't', unitPrice: 5000 }),
      row({ id: 'm1', type: 'material', name: '砌块/砖', unit: 'm³', unitPrice: 280 }),
      row({ id: 'm2', type: 'material', name: '防水卷材', unit: 'm²', unitPrice: 25 }),
      row({ id: 'm3', type: 'material', name: '预拌砂浆', unit: 'm³', unitPrice: 450 }),
      row({ id: 'm4', type: 'material', name: '电缆', unit: 'm', unitPrice: 20 }),
      row({ id: 'm5', type: 'material', name: '钢管', unit: 't', unitPrice: 4800 }),
    ]
    const ensured = ensureDefaultResourcesInCatalog(existing)
    expect(ensured.rows.some((entry) => entry.type === 'investment')).toBe(false)
    expect(ensured.rows.some((entry) => entry.type === 'costBudget')).toBe(false)
  })

  it('strips retired budget defaults from existing catalogs', () => {
    const existing = [
      row({ id: 'p1', type: 'labor', name: '普通工', unitPrice: 250 }),
      row({ id: 'b1', type: 'investment', name: '投资估算', unit: '元', unitPrice: null }),
      row({ id: 'b2', type: 'costBudget', name: '成本预算', unit: '元', unitPrice: null }),
    ]
    const ensured = ensureDefaultResourcesInCatalog(existing)
    expect(ensured.changed).toBe(true)
    expect(ensured.rows.some((entry) => entry.type === 'investment')).toBe(false)
    expect(ensured.rows.some((entry) => entry.type === 'costBudget')).toBe(false)
    expect(ensured.rows.some((entry) => entry.name === '普通工')).toBe(true)
  })

  it('maps legacy 普通工人 onto 普通工 and dedupes', () => {
    const aliased = applyResourceNameAliases([
      row({ id: 'a', type: 'labor', name: '普通工人', unitPrice: 250 }),
      row({ id: 'b', type: 'labor', name: '普通工', unitPrice: 260 }),
      row({ id: 'c', type: 'labor', name: '钢筋工', unitPrice: 300 }),
    ])
    expect(aliased.changed).toBe(true)
    expect(aliased.rows.map((entry) => entry.name)).toEqual(['普通工', '钢筋工'])
    expect(canonicalizeResourceName('普通工人')).toBe('普通工')
  })

  it('maps legacy labor unit 工日 onto 人', () => {
    expect(canonicalizeLaborUnit('labor', '工日')).toBe('人')
    expect(canonicalizeLaborUnit('material', '工日')).toBe('工日')
    const aliased = applyLaborUnitAliases([
      row({ id: 'a', type: 'labor', name: '普通工', unit: '工日', pricingUnit: '工日', unitPrice: 250 }),
      row({ id: 'b', type: 'material', name: '砂子', unit: 'm³', unitPrice: 100 }),
    ])
    expect(aliased.changed).toBe(true)
    expect(aliased.rows[0]?.unit).toBe('人')
    expect(aliased.rows[0]?.pricingUnit).toBe('工日')
    expect(aliased.rows[1]?.unit).toBe('m³')
  })

  it('applies labor pricing 工日 and machine measure 台 conventions', () => {
    const result = applyResourceUnitConventions([
      row({ id: 'l1', type: 'labor', name: '普通工', unit: '人', pricingUnit: '人' }),
      row({ id: 'e1', type: 'equipment', name: '挖掘机', unit: '台班', pricingUnit: '台班' }),
      row({ id: 'i1', type: 'instrument', name: '塔尺', unit: '天', pricingUnit: '天' }),
    ])
    expect(result.changed).toBe(true)
    expect(result.rows[0]).toMatchObject({ unit: '人', pricingUnit: '工日' })
    expect(result.rows[1]).toMatchObject({ unit: '台', pricingUnit: '台班' })
    expect(result.rows[2]).toMatchObject({ unit: '台', pricingUnit: '台班' })
  })

  it('strips retired budget defaults instead of keeping them', () => {
    const existing = [
      row({ id: 'd1', type: 'device', name: '发电机', unit: '台班', unitPrice: 600 }),
      row({ id: 'b1', type: 'investment', name: '投资估算', unit: '元', unitPrice: null }),
      row({ id: 'b2', type: 'designEstimate', name: '设计概算', unit: '元', unitPrice: null }),
      row({ id: 'b3', type: 'constructionBudget', name: '施工预算', unit: '元', unitPrice: null }),
      row({ id: 'b4', type: 'costBudget', name: '成本预算', unit: '元', unitPrice: null }),
      row({ id: 'i1', type: 'instrument', name: '全站仪', unit: '台班', unitPrice: 400 }),
      row({ id: 'i2', type: 'instrument', name: '水准仪', unit: '台班', unitPrice: 150 }),
      row({ id: 'i3', type: 'instrument', name: '塔尺', unit: '天', unitPrice: 30 }),
      row({ id: 'a1', type: 'auxiliary', name: '模板', unit: 'm²', unitPrice: 50 }),
      row({ id: 'a2', type: 'auxiliary', name: '方木', unit: 'm³', unitPrice: 1800 }),
      row({ id: 'a3', type: 'auxiliary', name: '脚手架', unit: 't', unitPrice: 5000 }),
      row({ id: 'm1', type: 'material', name: '砌块/砖', unit: 'm³', unitPrice: 280 }),
      row({ id: 'm2', type: 'material', name: '防水卷材', unit: 'm²', unitPrice: 25 }),
      row({ id: 'm3', type: 'material', name: '预拌砂浆', unit: 'm³', unitPrice: 450 }),
      row({ id: 'm4', type: 'material', name: '电缆', unit: 'm', unitPrice: 20 }),
      row({ id: 'm5', type: 'material', name: '钢管', unit: 't', unitPrice: 4800 }),
    ]
    const ensured = ensureDefaultResourcesInCatalog(existing)
    expect(ensured.changed).toBe(true)
    expect(ensured.rows.some((entry) => entry.type === 'investment')).toBe(false)
    expect(ensured.rows.some((entry) => entry.type === 'designEstimate')).toBe(false)
    expect(ensured.rows.some((entry) => entry.type === 'constructionBudget')).toBe(false)
    expect(ensured.rows.some((entry) => entry.type === 'costBudget')).toBe(false)
  })

  it('appends new instruments and materials into an existing catalog', () => {
    const existing = [
      row({ id: 'p1', type: 'labor', name: '普通工', unitPrice: 250 }),
      row({ id: 'm0', type: 'material', name: '砂子', unit: 'm³', unitPrice: 100 }),
    ]
    const ensured = ensureDefaultResourcesInCatalog(existing)
    expect(ensured.changed).toBe(true)
    expect(ensured.rows.some((entry) => entry.type === 'instrument' && entry.name === '全站仪')).toBe(
      true,
    )
    expect(ensured.rows.some((entry) => entry.type === 'instrument' && entry.name === '塔尺')).toBe(
      true,
    )
    expect(ensured.rows.some((entry) => entry.type === 'material' && entry.name === '钢管')).toBe(
      true,
    )
    expect(ensured.rows.some((entry) => entry.type === 'auxiliary' && entry.name === '模板')).toBe(
      true,
    )
  })

  it('migrates 模板/方木/脚手架 from material into auxiliary', () => {
    const migrated = applyAuxiliaryResourceMigration([
      row({ id: 'm1', type: 'material', name: '模板', unit: 'm²', unitPrice: 50 }),
      row({ id: 'm2', type: 'material', name: '方林', unit: 'm³', unitPrice: 1800 }),
      row({ id: 'm3', type: 'material', name: '脚手架', unit: 't', unitPrice: 5000 }),
      row({ id: 'm4', type: 'material', name: '砂子', unit: 'm³', unitPrice: 100 }),
    ])
    expect(migrated.changed).toBe(true)
    expect(migrated.rows.map((entry) => `${entry.type}:${entry.name}`)).toEqual([
      'auxiliary:模板',
      'auxiliary:方木',
      'auxiliary:脚手架',
      'material:砂子',
    ])
  })

  it('persists project catalogs that still store 模板 as material', () => {
    const resolved = resolveProjectResourceCatalog('ws-persist-aux', 'project-a', {
      resourceCatalog: [
        row({ id: 'm1', type: 'material', name: '模板', unit: 'm²', unitPrice: 50 }),
      ],
    })
    expect(resolved.rows.map((entry) => `${entry.type}:${entry.name}`)).toEqual([
      'auxiliary:模板',
    ])
    expect(resolved.needsPersist).toBe(true)
  })

  it('migrates legacy funds budget names into dedicated types', () => {
    const migrated = applyBudgetTypeMigration([
      row({ id: 'f1', type: 'funds', name: '投资估算', unit: '元', unitPrice: null }),
      row({ id: 'f2', type: 'funds', name: '设计概算', unit: '元', unitPrice: null }),
      row({ id: 'f3', type: 'funds', name: '施工图预算', unit: '元', unitPrice: null }),
      row({ id: 'f4', type: 'funds', name: '成本预算', unit: '元', unitPrice: null }),
      row({ id: 'f5', type: 'funds', name: '其他资金', unit: '元', unitPrice: null }),
    ])
    expect(migrated.changed).toBe(true)
    expect(migrated.rows.map((entry) => `${entry.type}:${entry.name}`)).toEqual([
      'investment:投资估算',
      'designEstimate:设计概算',
      'constructionBudget:施工预算',
      'costBudget:成本预算',
      'funds:其他资金',
    ])
  })
})

describe('deriveResourceApplicable', () => {
  it('uses 全部项目 when unit price matches baseline', () => {
    const baseline = buildBaselinePriceIndex([
      row({ id: 's1', type: 'labor', name: '普通工', unitPrice: 250 }),
    ])
    expect(
      deriveResourceApplicable(
        row({ id: 'p1', type: 'labor', name: '普通工', unitPrice: 250, applicable: 'project-a' }),
        baseline,
        'project-a',
      ),
    ).toBe(PM_RESOURCE_APPLICABLE_ALL)
  })

  it('uses project id when unit price differs from baseline', () => {
    const baseline = buildBaselinePriceIndex([
      row({ id: 's1', type: 'labor', name: '普通工', unitPrice: 250 }),
    ])
    expect(
      deriveResourceApplicable(
        row({ id: 'p1', type: 'labor', name: '普通工', unitPrice: 280 }),
        baseline,
        'project-a',
      ),
    ).toBe('project-a')
  })
})

describe('sortResourceRowsLikeSharedCatalog', () => {
  it('orders by type menu then shared name order', () => {
    const shared = [
      row({ id: 's1', type: 'labor', name: '普通工', sortOrder: 0 }),
      row({ id: 's2', type: 'labor', name: '技术工人', sortOrder: 1 }),
      row({ id: 's3', type: 'material', name: '砂子', unit: 'm³', sortOrder: 2 }),
      row({ id: 's4', type: 'funds', name: '成本预算', unit: '元', unitPrice: null, sortOrder: 3 }),
    ]
    const project = [
      row({ id: 'p1', type: 'funds', name: '成本预算', unit: '元', unitPrice: null, sortOrder: 0 }),
      row({ id: 'p2', type: 'material', name: '砂子', unit: 'm³', sortOrder: 1 }),
      row({ id: 'p3', type: 'labor', name: '技术工人', sortOrder: 2 }),
      row({ id: 'p4', type: 'labor', name: '普通工', sortOrder: 3 }),
      row({ id: 'p5', type: 'labor', name: '项目专属工种', sortOrder: 4 }),
    ]
    const sorted = sortResourceRowsLikeSharedCatalog(project, shared)
    expect(sorted.map((entry) => entry.name)).toEqual([
      '普通工',
      '技术工人',
      '项目专属工种',
      '砂子',
      '成本预算',
    ])
  })
})

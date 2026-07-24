import { describe, expect, it } from 'vitest'

import {
  buildPmResourcePlanFingerprint,
  mergeTaskResourceAssignmentsByName,
  parsePmResourcePlanFromText,
} from './pm-resource-apply.js'
import { upsertSharedResourceCatalogRows } from './pm-shared-resource-catalog.js'

describe('parsePmResourcePlanFromText', () => {
  it('parses fenced resourcePlan JSON', () => {
    const text = [
      '建议如下',
      '```json',
      JSON.stringify({
        resourcePlan: [
          {
            workItemTitle: '钢筋绑扎',
            assignments: [{ type: 'labor', name: '普通工', quantity: 12, unit: '工日' }],
          },
        ],
      }),
      '```',
    ].join('\n')
    const parsed = parsePmResourcePlanFromText(text)
    expect(parsed.resourcePlan).toHaveLength(1)
    expect(parsed.resourcePlan[0]?.workItemTitle).toBe('钢筋绑扎')
    expect(parsed.resourcePlan[0]?.assignments[0]?.name).toBe('普通工')
  })

  it('resolves Chinese type labels', () => {
    const text = JSON.stringify({
      resourcePlan: [
        {
          workItemTitle: '浇筑',
          assignments: [{ typeLabel: '材料', name: '商品混凝土', quantity: 30 }],
        },
      ],
    })
    const parsed = parsePmResourcePlanFromText(text)
    expect(parsed.resourcePlan[0]?.assignments[0]?.type).toBe('material')
  })
})

describe('mergeTaskResourceAssignmentsByName', () => {
  it('merges by name and keeps other resources', () => {
    const merged = mergeTaskResourceAssignmentsByName(
      [
        { resourceId: 'a', type: 'labor', name: '普通工', quantity: 5, note: '' },
        { resourceId: 'b', type: 'material', name: '钢筋', quantity: 2, note: '' },
      ],
      [{ resourceId: null, type: 'labor', name: '普通工', quantity: 8, note: '更新' }],
    )
    expect(merged).toHaveLength(2)
    expect(merged.find((row) => row.name === '普通工')?.quantity).toBe(8)
    expect(merged.find((row) => row.name === '钢筋')?.quantity).toBe(2)
  })
})

describe('buildPmResourcePlanFingerprint', () => {
  it('is stable for equal plans', () => {
    const plan = [
      {
        workItemTitle: 'A',
        assignments: [{ type: 'labor' as const, name: '普通工', quantity: 1 }],
      },
    ]
    expect(buildPmResourcePlanFingerprint(plan)).toBe(buildPmResourcePlanFingerprint(plan))
  })
})

describe('upsertSharedResourceCatalogRows', () => {
  it('inserts missing resources', () => {
    const result = upsertSharedResourceCatalogRows(
      [
        {
          id: '1',
          type: 'labor',
          customTypeName: '',
          name: '普通工',
          spec: '',
          unit: '工日',
          pricingUnit: '工日',
          unitPrice: 250,
          applicable: 'all',
          note: '',
          sortOrder: 0,
          parentId: null,
        },
      ],
      [{ type: 'material', name: '砂子', unit: 'm³', unitPrice: 100 }],
      () => 'new-id',
    )
    expect(result.changed).toBe(true)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[1]?.id).toBe('new-id')
  })
})

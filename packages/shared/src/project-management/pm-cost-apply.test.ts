import { describe, expect, it } from 'vitest'

import {
  buildPmCostPlanFingerprint,
  mergeTaskCostAssignmentsByName,
  normalizeCostAssignmentSuggestion,
  parsePmCostPlanFromText,
} from './pm-cost-apply.js'
import { upsertSharedCostCatalogRows } from './pm-shared-cost-catalog.js'

describe('parsePmCostPlanFromText', () => {
  it('parses fenced costPlan JSON', () => {
    const text = [
      '建议如下',
      '```json',
      JSON.stringify({
        costPlan: [
          {
            workItemTitle: '钢筋绑扎',
            assignments: [{ type: 'labor', name: '普通工', amount: 3000 }],
          },
        ],
      }),
      '```',
    ].join('\n')
    const parsed = parsePmCostPlanFromText(text)
    expect(parsed.costPlan).toHaveLength(1)
    expect(parsed.costPlan[0]?.workItemTitle).toBe('钢筋绑扎')
    expect(parsed.costPlan[0]?.assignments[0]?.name).toBe('普通工')
  })

  it('resolves Chinese type labels', () => {
    const text = JSON.stringify({
      costPlan: [
        {
          workItemTitle: '浇筑',
          assignments: [{ typeLabel: '材料', name: '商品混凝土', quantity: 30, unitPrice: 420 }],
        },
      ],
    })
    const parsed = parsePmCostPlanFromText(text)
    expect(parsed.costPlan[0]?.assignments[0]?.type).toBe('material')
  })

  it('accepts workItemId instead of workItemTitle', () => {
    const text = JSON.stringify({
      costPlan: [
        {
          workItemId: '11111111-1111-1111-1111-111111111111',
          assignments: [{ name: '钢筋', amount: 1000 }],
        },
      ],
    })
    const parsed = parsePmCostPlanFromText(text)
    expect(parsed.costPlan[0]?.workItemId).toBe('11111111-1111-1111-1111-111111111111')
  })

  it('carries workItemCode alongside workItemTitle', () => {
    const text = JSON.stringify({
      costPlan: [
        {
          workItemCode: 'WBS-02',
          workItemTitle: '钢筋绑扎',
          assignments: [{ name: '钢筋', amount: 1000 }],
        },
      ],
    })
    const parsed = parsePmCostPlanFromText(text)
    expect(parsed.costPlan[0]?.workItemCode).toBe('WBS-02')
  })
})

describe('normalizeCostAssignmentSuggestion', () => {
  it('computes amount from quantity * unitPrice when amount is omitted', () => {
    const normalized = normalizeCostAssignmentSuggestion({
      name: '商品混凝土',
      quantity: 30,
      unitPrice: 420,
    })
    expect(normalized.amount).toBe(12600)
  })

  it('prefers explicit amount over quantity * unitPrice', () => {
    const normalized = normalizeCostAssignmentSuggestion({
      name: '商品混凝土',
      amount: 5000,
      quantity: 30,
      unitPrice: 420,
    })
    expect(normalized.amount).toBe(5000)
  })
})

describe('mergeTaskCostAssignmentsByName', () => {
  it('merges by name and keeps other cost items', () => {
    const merged = mergeTaskCostAssignmentsByName(
      [
        { costId: 'a', type: 'labor', name: '普通工', amount: 500, note: '' },
        { costId: 'b', type: 'material', name: '钢筋', amount: 2000, note: '' },
      ],
      [{ costId: null, type: 'labor', name: '普通工', amount: 800, note: '更新' }],
    )
    expect(merged).toHaveLength(2)
    expect(merged.find((row) => row.name === '普通工')?.amount).toBe(800)
    expect(merged.find((row) => row.name === '钢筋')?.amount).toBe(2000)
  })
})

describe('buildPmCostPlanFingerprint', () => {
  it('is stable for equal plans', () => {
    const plan = [
      {
        workItemTitle: 'A',
        assignments: [{ type: 'labor' as const, name: '普通工', amount: 100 }],
      },
    ]
    expect(buildPmCostPlanFingerprint(plan)).toBe(buildPmCostPlanFingerprint(plan))
  })
})

describe('upsertSharedCostCatalogRows', () => {
  it('inserts missing cost items', () => {
    const result = upsertSharedCostCatalogRows(
      [
        {
          id: '1',
          type: 'labor',
          code: '',
          name: '普通工',
          featureDescription: '',
          unit: '工日',
          quantity: null,
          unitPrice: 250,
          applicable: 'all',
          note: '',
          sectionalWork: '',
          sectionCode: '',
          sectionNote: '',
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

import { describe, expect, it } from 'vitest'

import {
  buildPmResourcePlanFingerprint,
  formatPmResourcePlanAsMarkdownTable,
  mergeTaskResourceAssignmentsByName,
  parsePmResourcePlanFromText,
  presentPmResourcePlanMarkdownForDisplay,
  resolvePmAgentResourceTypeLabel,
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

  it('does not treat costPlan JSON as a resource plan', () => {
    const text = `JSON 数据结构（供系统确认）：${JSON.stringify({
      costPlan: [
        {
          workItemTitle: '满堂基础',
          assignments: [
            { type: 'comprehensive', name: '满堂基础', quantity: 180, unitPrice: 897.54, unit: 'm³' },
          ],
        },
      ],
    })}`
    expect(parsePmResourcePlanFromText(text).resourcePlan).toEqual([])
  })

  it('maps mechanical alias to equipment', () => {
    expect(resolvePmAgentResourceTypeLabel('mechanical')).toBe('equipment')
  })
})

describe('presentPmResourcePlanMarkdownForDisplay', () => {
  it('replaces fenced resourcePlan JSON with a readable table', () => {
    const source = [
      '资源建议如下。',
      '',
      '```json',
      JSON.stringify({
        resourcePlan: [
          {
            workItemTitle: '1层主体结构施工（含水电预埋）',
            assignments: [
              { type: 'labor', name: '钢筋工', quantity: 15, unit: '工日' },
              { type: 'material', name: '钢筋', quantity: 50, unit: 't' },
              { type: 'mechanical', name: '塔吊', quantity: 1, unit: '台班' },
            ],
          },
        ],
      }),
      '```',
    ].join('\n')
    const presented = presentPmResourcePlanMarkdownForDisplay(source)
    expect(presented).toContain('### 资源计划')
    expect(presented).toContain('| 任务名称 | 类型 | 资源名称 | 数量 | 单位 |')
    expect(presented).toContain('钢筋工')
    expect(presented).toContain('机械')
    expect(presented).toContain('塔吊')
    expect(presented).not.toContain('"resourcePlan"')
    expect(presented).not.toContain('```')
  })

  it('formatPmResourcePlanAsMarkdownTable expands one row per assignment', () => {
    const table = formatPmResourcePlanAsMarkdownTable({
      resourcePlan: [
        {
          workItemTitle: '浇筑',
          assignments: [
            { type: 'labor', name: '普通工', quantity: 10, unit: '工日' },
            { type: 'material', name: '砂', quantity: 2, unit: 'm³' },
          ],
        },
      ],
    })
    expect(table.split('\n').filter((line) => line.startsWith('| 浇筑'))).toHaveLength(2)
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

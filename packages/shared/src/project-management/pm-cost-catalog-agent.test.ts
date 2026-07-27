import { describe, expect, it } from 'vitest'

import {
  buildPmCostCatalogPatchFingerprint,
  normalizeCostCatalogPatchTarget,
  parsePmCostCatalogPatchesFromText,
  removeCostCatalogRows,
} from './pm-cost-catalog-agent.js'

describe('pm-cost-catalog-agent', () => {
  it('normalizes shared targets', () => {
    expect(normalizeCostCatalogPatchTarget('全部项目')).toBe('shared')
    expect(normalizeCostCatalogPatchTarget('all')).toBe('shared')
    expect(normalizeCostCatalogPatchTarget('EMP-2401')).toBe('EMP-2401')
  })

  it('parses costCatalogPatches JSON from assistant text', () => {
    const text = [
      '建议如下',
      '```json',
      JSON.stringify({
        costCatalogPatches: [
          {
            target: '全部项目',
            upserts: [{ type: 'material', name: '电缆', unit: 'm', unitPrice: 20 }],
            removes: [{ type: 'labor', name: '临时工' }],
          },
          {
            target: 'EMP-2401',
            upserts: [{ type: '仪器', name: '全站仪', unit: '台班', unitPrice: 400 }],
          },
        ],
      }),
      '```',
    ].join('\n')
    const parsed = parsePmCostCatalogPatchesFromText(text)
    expect(parsed.patches).toHaveLength(2)
    expect(parsed.patches[0]?.target).toBe('shared')
    expect(parsed.patches[0]?.upserts[0]?.name).toBe('电缆')
    expect(parsed.patches[1]?.upserts[0]?.type).toBe('instrument')
  })

  it('removes rows by type+name', () => {
    const rows = [
      {
        id: '1',
        type: 'labor' as const,
        code: '',
        name: '临时工',
        featureDescription: '',
        unit: '工日',
        quantity: null,
        unitPrice: 200,
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
        id: '2',
        type: 'material' as const,
        code: '',
        name: '砂子',
        featureDescription: '',
        unit: 'm³',
        quantity: null,
        unitPrice: 100,
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
    const result = removeCostCatalogRows(rows, [{ type: 'labor', name: '临时工' }])
    expect(result.changed).toBe(true)
    expect(result.removedCount).toBe(1)
    expect(result.rows.map((row) => row.name)).toEqual(['砂子'])
  })

  it('builds stable fingerprints', () => {
    const a = buildPmCostCatalogPatchFingerprint([
      {
        target: 'shared',
        upserts: [{ type: 'labor', name: '普通工', unit: '工日', unitPrice: 250 }],
        removes: [],
      },
    ])
    const b = buildPmCostCatalogPatchFingerprint([
      {
        target: '全部项目',
        upserts: [{ type: 'labor', name: '普通工', unit: '工日', unitPrice: 250 }],
        removes: [],
      },
    ])
    expect(a).toBe(b)
  })
})

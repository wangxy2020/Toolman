import { describe, expect, it } from 'vitest'

import {
  buildPmResourceCatalogPatchFingerprint,
  isPmSystemDefaultResourceProjectCode,
  normalizeResourceCatalogPatchTarget,
  parsePmResourceCatalogPatchesFromText,
  removeResourceCatalogRows,
} from './pm-resource-catalog-agent.js'

describe('pm-resource-catalog-agent', () => {
  it('recognizes system default project codes', () => {
    expect(isPmSystemDefaultResourceProjectCode('EMP-2401')).toBe(true)
    expect(isPmSystemDefaultResourceProjectCode('prj-2601')).toBe(true)
    expect(isPmSystemDefaultResourceProjectCode('PRJ-2602')).toBe(false)
  })

  it('normalizes shared targets', () => {
    expect(normalizeResourceCatalogPatchTarget('全部项目')).toBe('shared')
    expect(normalizeResourceCatalogPatchTarget('all')).toBe('shared')
    expect(normalizeResourceCatalogPatchTarget('EMP-2401')).toBe('EMP-2401')
  })

  it('parses resourceCatalogPatches JSON from assistant text', () => {
    const text = [
      '建议如下',
      '```json',
      JSON.stringify({
        resourceCatalogPatches: [
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
    const parsed = parsePmResourceCatalogPatchesFromText(text)
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
        customTypeName: '',
        name: '临时工',
        spec: '',
        unit: '工日',
        pricingUnit: '工日',
        unitPrice: 200,
        applicable: 'all',
        note: '',
        sortOrder: 0,
        parentId: null,
      },
      {
        id: '2',
        type: 'material' as const,
        customTypeName: '',
        name: '砂子',
        spec: '',
        unit: 'm³',
        pricingUnit: 'm³',
        unitPrice: 100,
        applicable: 'all',
        note: '',
        sortOrder: 1,
        parentId: null,
      },
    ]
    const result = removeResourceCatalogRows(rows, [{ type: 'labor', name: '临时工' }])
    expect(result.changed).toBe(true)
    expect(result.removedCount).toBe(1)
    expect(result.rows.map((row) => row.name)).toEqual(['砂子'])
  })

  it('builds stable fingerprints', () => {
    const a = buildPmResourceCatalogPatchFingerprint([
      {
        target: 'shared',
        upserts: [{ type: 'labor', name: '普通工', unit: '工日', unitPrice: 250 }],
        removes: [],
      },
    ])
    const b = buildPmResourceCatalogPatchFingerprint([
      {
        target: '全部项目',
        upserts: [{ type: 'labor', name: '普通工', unit: '工日', unitPrice: 250 }],
        removes: [],
      },
    ])
    expect(a).toBe(b)
  })
})

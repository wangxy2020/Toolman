import { describe, expect, it } from 'vitest'

import {
  buildCostSectionalDisplayEntries,
  buildCostSectionalRollupDisplayEntries,
  patchCostSectionMeta,
  type PmCostRow,
} from './pm-cost-catalog'

function row(partial: Partial<PmCostRow> & Pick<PmCostRow, 'id' | 'name'>): PmCostRow {
  return {
    id: partial.id,
    type: partial.type ?? 'comprehensive',
    code: partial.code ?? '',
    name: partial.name,
    featureDescription: partial.featureDescription ?? '',
    unit: partial.unit ?? '',
    quantity: partial.quantity ?? null,
    unitPrice: partial.unitPrice ?? null,
    applicable: partial.applicable ?? 'all',
    note: partial.note ?? '',
    sectionalWork: partial.sectionalWork ?? '',
    sectionCode: partial.sectionCode ?? '',
    sectionNote: partial.sectionNote ?? '',
    sortOrder: partial.sortOrder ?? 0,
    parentId: partial.parentId ?? null,
  }
}

describe('buildCostSectionalDisplayEntries', () => {
  it('inserts a subtotal row before each sectional group', () => {
    const rows = [
      row({
        id: '1',
        name: 'A',
        sectionalWork: '土建',
        quantity: 2,
        unitPrice: 10,
        sectionCode: 'TJ-01',
        sectionNote: '土建汇总',
      }),
      row({ id: '2', name: 'B', sectionalWork: '土建', quantity: 1, unitPrice: 5 }),
      row({ id: '3', name: 'C', sectionalWork: '安装', quantity: 3, unitPrice: 20 }),
    ]
    const entries = buildCostSectionalDisplayEntries(rows)
    expect(entries.map((entry) => entry.kind)).toEqual([
      'section',
      'row',
      'row',
      'section',
      'row',
    ])
    expect(entries[0]).toMatchObject({
      kind: 'section',
      summary: {
        key: '土建',
        total: 25,
        rowCount: 2,
        code: 'TJ-01',
        note: '土建汇总',
      },
    })
    expect(entries[3]).toMatchObject({
      kind: 'section',
      summary: { key: '安装', total: 60, rowCount: 1, code: '', note: '' },
    })
  })
})

describe('buildCostSectionalRollupDisplayEntries', () => {
  it('shows a grand total then each section summary without detail rows', () => {
    const rows = [
      row({ id: '1', name: 'A', sectionalWork: '土建', quantity: 2, unitPrice: 10 }),
      row({ id: '2', name: 'B', sectionalWork: '土建', quantity: 1, unitPrice: 5 }),
      row({ id: '3', name: 'C', sectionalWork: '安装', quantity: 3, unitPrice: 20 }),
    ]
    const entries = buildCostSectionalRollupDisplayEntries(rows)
    expect(entries.map((entry) => entry.kind)).toEqual(['grand', 'section', 'section'])
    expect(entries[0]).toMatchObject({
      kind: 'grand',
      summary: { total: 85, rowCount: 3 },
    })
    expect(entries[1]).toMatchObject({
      kind: 'section',
      summary: { key: '土建', total: 25 },
    })
    expect(entries[2]).toMatchObject({
      kind: 'section',
      summary: { key: '安装', total: 60 },
    })
  })
})

describe('patchCostSectionMeta', () => {
  it('writes summary code/note onto every row in the section', () => {
    const rows = [
      row({ id: '1', name: 'A', sectionalWork: '土建' }),
      row({ id: '2', name: 'B', sectionalWork: '土建' }),
      row({ id: '3', name: 'C', sectionalWork: '安装' }),
    ]
    const next = patchCostSectionMeta(rows, '土建', {
      sectionCode: 'TJ',
      sectionNote: '备注',
    })
    expect(next[0]).toMatchObject({ sectionCode: 'TJ', sectionNote: '备注' })
    expect(next[1]).toMatchObject({ sectionCode: 'TJ', sectionNote: '备注' })
    expect(next[2]).toMatchObject({ sectionCode: '', sectionNote: '' })
  })
})
import { describe, expect, it } from 'vitest'

import {
  buildCostSectionalDisplayEntries,
  computeCostRowTotalPrice,
  patchCostSectionMeta,
  suggestNextCostCode,
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
    sectionName: partial.sectionName ?? '',
    sectionFeatureDescription: partial.sectionFeatureDescription ?? '',
    sectionTotalFormula: partial.sectionTotalFormula ?? '',
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

  it('merges non-contiguous rows of the same 分部工程 into one summary', () => {
    const rows = [
      row({ id: '1', name: 'A', type: 'comprehensive', sectionalWork: '工程费', quantity: 1, unitPrice: 10 }),
      row({ id: '2', name: 'B', type: 'comprehensive', sectionalWork: '工程建设其他费', quantity: 1, unitPrice: 20 }),
      row({ id: '3', name: 'C', type: 'management', sectionalWork: '工程费', quantity: 1, unitPrice: 30 }),
      row({ id: '4', name: 'D', type: 'management', sectionalWork: '工程建设其他费', quantity: 1, unitPrice: 40 }),
    ]
    const entries = buildCostSectionalDisplayEntries(rows)
    expect(entries.map((entry) => entry.kind)).toEqual([
      'section',
      'row',
      'row',
      'section',
      'row',
      'row',
    ])
    expect(entries[0]).toMatchObject({
      kind: 'section',
      summary: { key: '工程费', total: 40, rowCount: 2 },
    })
    expect(entries[3]).toMatchObject({
      kind: 'section',
      summary: { key: '工程建设其他费', total: 60, rowCount: 2 },
    })
    expect(
      entries
        .filter(
          (entry): entry is { kind: 'row'; row: PmCostRow; index: number } =>
            entry.kind === 'row',
        )
        .map((entry) => entry.row.id),
    ).toEqual(['1', '3', '2', '4'])
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
describe('suggestNextCostCode', () => {
  it('increments the trailing number and preserves padding / prefix', () => {
    expect(suggestNextCostCode('')).toBe('')
    expect(suggestNextCostCode('ABC')).toBe('')
    expect(suggestNextCostCode('1')).toBe('2')
    expect(suggestNextCostCode('01')).toBe('02')
    expect(suggestNextCostCode('1.01')).toBe('1.02')
    expect(suggestNextCostCode('A-09')).toBe('A-10')
  })
})

describe('computeCostRowTotalPrice', () => {
  it('sums children when a row has a next level', () => {
    const rows = [
      row({ id: 'p', name: 'Parent', quantity: 99, unitPrice: 99 }),
      row({ id: 'c1', name: 'Child1', parentId: 'p', quantity: 2, unitPrice: 10 }),
      row({ id: 'c2', name: 'Child2', parentId: 'p', quantity: 3, unitPrice: 5 }),
    ]
    expect(computeCostRowTotalPrice(rows[0]!, rows)).toBe(35)
    expect(computeCostRowTotalPrice(rows[1]!, rows)).toBe(20)
  })

  it('does not double-count parent+child in sectional totals', () => {
    const rows = [
      row({
        id: 'p',
        name: 'Parent',
        sectionalWork: '土建',
        quantity: 1,
        unitPrice: 100,
      }),
      row({
        id: 'c1',
        name: 'Child',
        sectionalWork: '土建',
        parentId: 'p',
        quantity: 2,
        unitPrice: 10,
      }),
    ]
    const entries = buildCostSectionalDisplayEntries(rows)
    expect(entries[0]).toMatchObject({
      kind: 'section',
      summary: { key: '土建', total: 20 },
    })
  })
})

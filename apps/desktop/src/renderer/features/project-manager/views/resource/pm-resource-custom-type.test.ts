import { describe, expect, it } from 'vitest'

import {
  encodeCustomResourceViewFilter,
  formatResourceTypeDisplayLabel,
  listCustomResourceTypeNames,
  resourceRowMatchesViewFilter,
  type PmResourceRow,
} from './pm-resource-catalog'

function row(
  partial: Partial<PmResourceRow> & Pick<PmResourceRow, 'id' | 'name' | 'type'>,
): PmResourceRow {
  return {
    id: partial.id,
    type: partial.type,
    customTypeName: partial.customTypeName ?? '',
    name: partial.name,
    spec: '',
    unit: '个',
    pricingUnit: '个',
    unitPrice: null,
    applicable: 'all',
    note: '',
    sortOrder: 0,
    parentId: null,
  }
}

describe('custom resource type names', () => {
  it('lists unique custom type names in first-appearance order', () => {
    const rows = [
      row({ id: '1', type: 'labor', name: '工' }),
      row({ id: '2', type: 'custom', name: 'A', customTypeName: '周转材料' }),
      row({ id: '3', type: 'custom', name: 'B', customTypeName: '周转材料' }),
      row({ id: '4', type: 'custom', name: 'C', customTypeName: '临建' }),
      row({ id: '5', type: 'custom', name: 'D', customTypeName: '  ' }),
    ]
    expect(listCustomResourceTypeNames(rows)).toEqual(['周转材料', '临建'])
  })

  it('merges catalog names ahead of row names', () => {
    const rows = [row({ id: '1', type: 'custom', name: 'A', customTypeName: '临建' })]
    expect(listCustomResourceTypeNames(rows, ['周转材料', '临建'])).toEqual(['周转材料', '临建'])
  })

  it('formats display label from the user-defined name', () => {
    expect(
      formatResourceTypeDisplayLabel(
        { type: 'custom', customTypeName: '周转材料' },
        (type) => type,
        '自定义',
      ),
    ).toBe('周转材料')
    expect(
      formatResourceTypeDisplayLabel(
        { type: 'custom', customTypeName: '' },
        (type) => type,
        '自定义',
      ),
    ).toBe('自定义')
    expect(
      formatResourceTypeDisplayLabel(
        { type: 'labor', customTypeName: '忽略' },
        (type) => (type === 'labor' ? '人力' : type),
        '自定义',
      ),
    ).toBe('人力')
  })

  it('filters rows by named custom type view filter', () => {
    const rows = [
      row({ id: '1', type: 'custom', name: 'A', customTypeName: '周转材料' }),
      row({ id: '2', type: 'custom', name: 'B', customTypeName: '临建' }),
      row({ id: '3', type: 'labor', name: 'C' }),
    ]
    const filter = encodeCustomResourceViewFilter('周转材料')
    expect(rows.filter((entry) => resourceRowMatchesViewFilter(entry, filter)).map((r) => r.id)).toEqual([
      '1',
    ])
  })
})

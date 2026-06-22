import { describe, expect, it } from 'vitest'

import { computeGroupPickerSelectionCount } from './group-resource-picker-count'

describe('computeGroupPickerSelectionCount', () => {
  it('counts unloaded knowledge base by selectableCount', () => {
    expect(
      computeGroupPickerSelectionCount({
        groups: [
          {
            id: 'kb-1',
            name: '默认文件夹',
            items: [],
            selectableCount: 5,
          },
        ],
        selectedGroupIds: new Set(['kb-1']),
        selectedKeys: new Set(),
      }),
    ).toBe(5)
  })

  it('counts expanded selections by item keys', () => {
    expect(
      computeGroupPickerSelectionCount({
        groups: [
          {
            id: 'kb-1',
            name: '默认文件夹',
            items: [
              { id: 'doc-1', name: 'a.pdf' },
              { id: 'doc-2', name: 'b.pdf' },
              { id: 'doc-3', name: 'c.pdf' },
            ],
          },
        ],
        selectedGroupIds: new Set(),
        selectedKeys: new Set(['kb-1:doc-1', 'kb-1:doc-2', 'kb-1:doc-3']),
      }),
    ).toBe(3)
  })

  it('counts partial selection by selected item keys only', () => {
    expect(
      computeGroupPickerSelectionCount({
        groups: [
          {
            id: 'kb-1',
            name: '默认文件夹',
            items: [
              { id: 'doc-1', name: 'a.pdf' },
              { id: 'doc-2', name: 'b.pdf' },
            ],
          },
        ],
        selectedGroupIds: new Set(),
        selectedKeys: new Set(['kb-1:doc-2']),
      }),
    ).toBe(1)
  })
})

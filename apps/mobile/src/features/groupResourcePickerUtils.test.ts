import { describe, expect, it } from 'vitest'
import {
  buildPickerSelection,
  isPickerGroupFullySelected,
  isPickerGroupPartial,
  pickerItemKey,
  pickerSelectionCount,
} from './groupResourcePickerUtils'

const groups = [
  { id: 'g1', name: 'Notes', items: [{ id: 'n1', name: 'A' }, { id: 'n2', name: 'B' }] },
  { id: 'g2', name: 'Empty', items: [] },
]

describe('groupResourcePickerUtils', () => {
  it('counts empty-group selections separately from item keys', () => {
    const keys = new Set([pickerItemKey('g1', 'n1')])
    const groupIds = new Set(['g2'])
    expect(pickerSelectionCount(groups, keys, groupIds)).toBe(2)
    expect(isPickerGroupFullySelected(groups[0], keys, groupIds)).toBe(false)
    expect(isPickerGroupPartial(groups[0], keys, false)).toBe(true)
    expect(buildPickerSelection(groups, keys, groupIds)).toEqual([
      { groupId: 'g1', groupName: 'Notes', items: [{ id: 'n1', name: 'A' }] },
      { groupId: 'g2', groupName: 'Empty', items: [] },
    ])
  })
})

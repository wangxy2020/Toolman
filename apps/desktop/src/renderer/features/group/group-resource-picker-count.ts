import type { GroupPickerGroup } from './group-resource-picker-types'

function itemKey(groupId: string, itemId: string) {
  return `${groupId}:${itemId}`
}

function getSelectableItems(group: GroupPickerGroup) {
  return group.items.filter((item) => !item.disabled && !item.displayOnly)
}

export function computeGroupPickerSelectionCount(options: {
  groups: GroupPickerGroup[]
  selectedGroupIds: Set<string>
  selectedKeys: Set<string>
}): number {
  const selectableGroups = options.groups.filter((group) => !group.disabled)
  let count = options.selectedKeys.size

  for (const groupId of options.selectedGroupIds) {
    const group = selectableGroups.find((item) => item.id === groupId)
    if (!group) {
      count += 1
      continue
    }

    const selectableItems = getSelectableItems(group)
    if (selectableItems.length === 0) {
      count += group.selectableCount ?? 1
    }
  }

  return count
}

export { itemKey, getSelectableItems }

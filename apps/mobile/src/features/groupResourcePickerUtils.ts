import type { GroupPickerGroup, GroupPickerItem, GroupPickerSelection } from './GroupResourcePickerModal'

export function pickerItemKey(groupId: string, itemId: string): string {
  return `${groupId}::${itemId}`
}

export function pickerSelectionCount(
  groups: GroupPickerGroup[],
  selectedKeys: Set<string>,
  selectedGroupIds: Set<string>,
): number {
  let count = selectedKeys.size
  for (const group of groups) {
    if (group.items.length === 0 && selectedGroupIds.has(group.id)) count += 1
  }
  return count
}

export function toggleSetValue<T>(prev: Set<T>, value: T): Set<T> {
  const next = new Set(prev)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

export function togglePickerGroupKeys(
  prev: Set<string>,
  keys: string[],
  allSelected: boolean,
): Set<string> {
  const next = new Set(prev)
  for (const key of keys) {
    if (allSelected) next.delete(key)
    else next.add(key)
  }
  return next
}

export function pickerGroupKeys(group: GroupPickerGroup): string[] {
  return group.items.map((item) => pickerItemKey(group.id, item.id))
}

export function isPickerGroupFullySelected(
  group: GroupPickerGroup,
  selectedKeys: Set<string>,
  selectedGroupIds: Set<string>,
): boolean {
  if (group.items.length === 0) return selectedGroupIds.has(group.id)
  return group.items.every((item) => selectedKeys.has(pickerItemKey(group.id, item.id)))
}

export function isPickerGroupPartial(
  group: GroupPickerGroup,
  selectedKeys: Set<string>,
  groupChecked: boolean,
): boolean {
  return (
    group.items.length > 0 &&
    !groupChecked &&
    group.items.some((item) => selectedKeys.has(pickerItemKey(group.id, item.id)))
  )
}

export function buildPickerSelection(
  groups: GroupPickerGroup[],
  selectedKeys: Set<string>,
  selectedGroupIds: Set<string>,
): GroupPickerSelection[] {
  const selection: GroupPickerSelection[] = []
  for (const group of groups) {
    if (group.items.length === 0) {
      if (selectedGroupIds.has(group.id)) {
        selection.push({ groupId: group.id, groupName: group.name, items: [] })
      }
      continue
    }
    const items = group.items.filter((item) => selectedKeys.has(pickerItemKey(group.id, item.id)))
    if (items.length > 0) {
      selection.push({ groupId: group.id, groupName: group.name, items })
    }
  }
  return selection
}

export type { GroupPickerGroup, GroupPickerItem, GroupPickerSelection }

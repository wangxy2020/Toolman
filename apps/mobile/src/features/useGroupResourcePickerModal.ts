import { useMemo, useState } from 'react'
import type { GroupPickerGroup, GroupPickerSelection } from './GroupResourcePickerModal'
import {
  buildPickerSelection,
  isPickerGroupFullySelected,
  isPickerGroupPartial,
  pickerGroupKeys,
  pickerItemKey,
  pickerSelectionCount,
  togglePickerGroupKeys,
  toggleSetValue,
} from './groupResourcePickerUtils'

export type GroupResourcePickerModalProps = {
  visible: boolean
  title: string
  hint: string
  emptyLabel: string
  groups: GroupPickerGroup[]
  onClose: () => void
  onConfirm: (selection: GroupPickerSelection[]) => void
}

export function useGroupResourcePickerModal(props: GroupResourcePickerModalProps) {
  const { groups, onClose, onConfirm } = props
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(() => new Set())

  const reset = () => {
    setExpandedIds(new Set())
    setSelectedKeys(new Set())
    setSelectedGroupIds(new Set())
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const selectionCount = useMemo(
    () => pickerSelectionCount(groups, selectedKeys, selectedGroupIds),
    [groups, selectedGroupIds, selectedKeys],
  )

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => toggleSetValue(prev, id))
  }

  const toggleGroup = (group: GroupPickerGroup) => {
    if (group.items.length === 0) {
      setSelectedGroupIds((prev) => toggleSetValue(prev, group.id))
      return
    }
    const keys = pickerGroupKeys(group)
    const allSelected = keys.every((key) => selectedKeys.has(key))
    setSelectedKeys((prev) => togglePickerGroupKeys(prev, keys, allSelected))
  }

  const toggleItem = (groupId: string, itemId: string) => {
    setSelectedKeys((prev) => toggleSetValue(prev, pickerItemKey(groupId, itemId)))
  }

  const handleConfirm = () => {
    const selection = buildPickerSelection(groups, selectedKeys, selectedGroupIds)
    reset()
    onConfirm(selection)
  }

  const groupState = (group: GroupPickerGroup) => {
    const open = expandedIds.has(group.id)
    const groupChecked = isPickerGroupFullySelected(group, selectedKeys, selectedGroupIds)
    const partial = isPickerGroupPartial(group, selectedKeys, groupChecked)
    return { open, groupChecked, partial }
  }

  const isItemChecked = (groupId: string, itemId: string) =>
    selectedKeys.has(pickerItemKey(groupId, itemId))

  return {
    selectionCount,
    handleClose,
    toggleExpanded,
    toggleGroup,
    toggleItem,
    handleConfirm,
    groupState,
    isItemChecked,
  }
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { computeGroupPickerSelectionCount } from './group-resource-picker-count'
import type { GroupPickerGroup, GroupPickerSelection } from './group-resource-picker-types'
import { groupPickerItemKey } from './group-resource-picker-modal-utils'
import { useI18n } from '../../i18n/useI18n'

export interface GroupResourcePickerModalProps {
  title: string
  hint: string
  confirmLabel?: string
  groups: GroupPickerGroup[]
  loading?: boolean
  loadingGroupId?: string | null
  error?: string | null
  onClose: () => void
  onConfirm: (selection: GroupPickerSelection[]) => Promise<void>
  onGroupExpand?: (groupId: string) => void
}

export function useGroupResourcePickerModal({
  groups,
  confirmLabel,
  error: externalError = null,
  onClose,
  onConfirm,
  onGroupExpand,
}: GroupResourcePickerModalProps) {
  const { t } = useI18n()
  const resolvedConfirmLabel = confirmLabel ?? t('groupPage.picker.add')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectableGroups = useMemo(
    () => groups.filter((group) => !group.disabled),
    [groups],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const getSelectableItems = useCallback((group: GroupPickerGroup) => {
    return group.items.filter((item) => !item.disabled && !item.displayOnly)
  }, [])

  const isGroupFullySelected = useCallback(
    (group: GroupPickerGroup) => {
      const items = getSelectableItems(group)
      if (items.length === 0) return selectedGroupIds.has(group.id)
      return items.every((item) => selectedKeys.has(groupPickerItemKey(group.id, item.id)))
    },
    [getSelectableItems, selectedGroupIds, selectedKeys],
  )

  const isGroupPartiallySelected = useCallback(
    (group: GroupPickerGroup) => {
      const items = getSelectableItems(group)
      if (items.length === 0) return false
      const selectedCount = items.filter((item) =>
        selectedKeys.has(groupPickerItemKey(group.id, item.id)),
      ).length
      return selectedCount > 0 && selectedCount < items.length
    },
    [getSelectableItems, selectedKeys],
  )

  const toggleGroup = useCallback(
    (group: GroupPickerGroup) => {
      if (group.disabled) return
      const items = getSelectableItems(group)
      const fullySelected = isGroupFullySelected(group)

      if (items.length === 0) {
        setSelectedGroupIds((current) => {
          const next = new Set(current)
          if (fullySelected) next.delete(group.id)
          else next.add(group.id)
          return next
        })
        return
      }

      setSelectedGroupIds((current) => {
        const next = new Set(current)
        next.delete(group.id)
        return next
      })

      setSelectedKeys((current) => {
        const next = new Set(current)
        if (fullySelected) {
          for (const item of items) next.delete(groupPickerItemKey(group.id, item.id))
        } else {
          for (const item of items) next.add(groupPickerItemKey(group.id, item.id))
        }
        return next
      })
    },
    [getSelectableItems, isGroupFullySelected],
  )

  const toggleItem = useCallback((groupId: string, itemId: string) => {
    const key = groupPickerItemKey(groupId, itemId)
    setSelectedGroupIds((current) => {
      if (!current.has(groupId)) return current
      const next = new Set(current)
      next.delete(groupId)
      return next
    })
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleExpanded = useCallback(
    (groupId: string) => {
      setExpandedIds((current) => {
        const next = new Set(current)
        const willExpand = !next.has(groupId)
        if (willExpand) {
          next.add(groupId)
          onGroupExpand?.(groupId)
        } else {
          next.delete(groupId)
        }
        return next
      })
    },
    [onGroupExpand],
  )

  useEffect(() => {
    if (selectedGroupIds.size === 0) return

    const keysToAdd: string[] = []
    const groupIdsToClear: string[] = []

    for (const group of selectableGroups) {
      if (!selectedGroupIds.has(group.id)) continue
      const items = getSelectableItems(group)
      if (items.length === 0) continue
      for (const item of items) {
        keysToAdd.push(groupPickerItemKey(group.id, item.id))
      }
      groupIdsToClear.push(group.id)
    }

    if (keysToAdd.length === 0) return

    setSelectedKeys((current) => {
      const next = new Set(current)
      for (const key of keysToAdd) next.add(key)
      return next
    })
    setSelectedGroupIds((current) => {
      const next = new Set(current)
      for (const groupId of groupIdsToClear) next.delete(groupId)
      return next
    })
  }, [getSelectableItems, groups, selectableGroups, selectedGroupIds])

  const selectionCount = useMemo(
    () =>
      computeGroupPickerSelectionCount({
        groups: selectableGroups,
        selectedGroupIds,
        selectedKeys,
      }),
    [selectableGroups, selectedGroupIds, selectedKeys],
  )

  const buildSelection = useCallback((): GroupPickerSelection[] => {
    const result: GroupPickerSelection[] = []
    const processedGroupIds = new Set<string>()

    for (const group of selectableGroups) {
      processedGroupIds.add(group.id)
      const items = getSelectableItems(group)
      if (items.length === 0) {
        if (selectedGroupIds.has(group.id)) {
          result.push({ groupId: group.id, itemIds: [] })
        }
        continue
      }

      const selectedItemIds = items
        .filter((item) => selectedKeys.has(groupPickerItemKey(group.id, item.id)))
        .map((item) => item.id)

      if (selectedItemIds.length > 0) {
        result.push({ groupId: group.id, itemIds: selectedItemIds })
      } else if (selectedGroupIds.has(group.id)) {
        result.push({
          groupId: group.id,
          itemIds: items.map((item) => item.id),
        })
      }
    }

    for (const groupId of selectedGroupIds) {
      if (processedGroupIds.has(groupId)) continue
      result.push({ groupId, itemIds: [] })
    }

    return result
  }, [getSelectableItems, selectableGroups, selectedGroupIds, selectedKeys])

  const combinedError = error ?? externalError

  const handleConfirm = useCallback(async () => {
    const selection = buildSelection()
    if (selection.length === 0) {
      setError(
        selectionCount > 0
          ? t('groupPage.picker.selectionUnavailable')
          : t('groupPage.picker.selectFirst'),
      )
      return
    }

    setBusy(true)
    setError(null)
    try {
      await onConfirm(selection)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('groupPage.picker.addFailed'))
    } finally {
      setBusy(false)
    }
  }, [buildSelection, onClose, onConfirm, selectionCount, t])

  return {
    t,
    resolvedConfirmLabel,
    expandedIds,
    selectedKeys,
    selectableGroups,
    busy,
    combinedError,
    selectionCount,
    getSelectableItems,
    isGroupFullySelected,
    isGroupPartiallySelected,
    toggleGroup,
    toggleItem,
    toggleExpanded,
    handleConfirm,
  }
}

export type UseGroupResourcePickerModalResult = ReturnType<typeof useGroupResourcePickerModal>

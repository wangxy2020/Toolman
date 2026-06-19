import { useCallback, useEffect, useMemo, useState } from 'react'
import { IconChevronRight } from '../../components/icons'
import type { GroupPickerGroup, GroupPickerSelection } from './group-resource-picker-types'

function itemKey(groupId: string, itemId: string) {
  return `${groupId}:${itemId}`
}

function GroupPickerCheckbox({
  checked,
  indeterminate,
  small,
  disabled,
  onChange,
}: {
  checked: boolean
  indeterminate?: boolean
  small?: boolean
  disabled?: boolean
  onChange: () => void
}) {
  return (
    <label
      className={[
        'tm-group-resource-picker-check',
        small ? 'tm-group-resource-picker-check--small' : '',
        checked ? 'tm-group-resource-picker-check--checked' : '',
        indeterminate ? 'tm-group-resource-picker-check--indeterminate' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={(event) => event.stopPropagation()}
    >
      <input
        type="checkbox"
        className="tm-group-resource-picker-check-input"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span className="tm-group-resource-picker-check-box" aria-hidden="true">
        {checked ? '✓' : indeterminate ? '−' : ''}
      </span>
    </label>
  )
}

interface Props {
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

export function GroupResourcePickerModal({
  title,
  hint,
  confirmLabel = '添加',
  groups,
  loading = false,
  loadingGroupId = null,
  error: externalError = null,
  onClose,
  onConfirm,
  onGroupExpand,
}: Props) {
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
      return items.every((item) => selectedKeys.has(itemKey(group.id, item.id)))
    },
    [getSelectableItems, selectedGroupIds, selectedKeys],
  )

  const isGroupPartiallySelected = useCallback(
    (group: GroupPickerGroup) => {
      const items = getSelectableItems(group)
      if (items.length === 0) return false
      const selectedCount = items.filter((item) =>
        selectedKeys.has(itemKey(group.id, item.id)),
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
          for (const item of items) next.delete(itemKey(group.id, item.id))
        } else {
          for (const item of items) next.add(itemKey(group.id, item.id))
        }
        return next
      })
    },
    [getSelectableItems, isGroupFullySelected],
  )

  const toggleItem = useCallback((groupId: string, itemId: string) => {
    const key = itemKey(groupId, itemId)
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
        keysToAdd.push(itemKey(group.id, item.id))
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

  const selectionCount = useMemo(() => {
    const countedGroups = new Set<string>()
    let count = 0

    for (const groupId of selectedGroupIds) {
      countedGroups.add(groupId)
      count += 1
    }

    for (const group of selectableGroups) {
      const items = getSelectableItems(group)
      if (items.length === 0) continue

      const selectedItemCount = items.filter((item) =>
        selectedKeys.has(itemKey(group.id, item.id)),
      ).length

      if (selectedItemCount === 0) continue

      if (selectedItemCount === items.length && !countedGroups.has(group.id)) {
        countedGroups.add(group.id)
        count += 1
        continue
      }

      if (selectedItemCount < items.length) {
        count += selectedItemCount
      }
    }

    return count
  }, [getSelectableItems, selectableGroups, selectedGroupIds, selectedKeys])

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
        .filter((item) => selectedKeys.has(itemKey(group.id, item.id)))
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

  const handleConfirm = async () => {
    const selection = buildSelection()
    if (selection.length === 0) {
      setError(
        selectionCount > 0
          ? '所选内容已不可用，请重新选择'
          : '请先选择要添加的内容',
      )
      return
    }

    setBusy(true)
    setError(null)
    try {
      await onConfirm(selection)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div
        className="tm-modal tm-modal--knowledge-create tm-modal--resource-picker"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tm-modal-header">
          <h2 className="tm-modal-title">{title}</h2>
          <button type="button" className="tm-modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>
        <div className="tm-modal-body">
          <p className="tm-form-hint">{hint}</p>
          {loading && groups.length === 0 ? (
            <p className="tm-kb-file-panel-empty">加载中…</p>
          ) : selectableGroups.length === 0 ? (
            <p className="tm-kb-file-panel-empty">暂无可添加的内容</p>
          ) : (
            <div className="tm-group-resource-picker-scroll">
              <ul className="tm-group-resource-picker-list">
              {groups.map((group) => {
                const expanded = expandedIds.has(group.id)
                const fullySelected = isGroupFullySelected(group)
                const partiallySelected = isGroupPartiallySelected(group)
                const selectableItems = getSelectableItems(group)

                return (
                  <li
                    key={group.id}
                    className={[
                      'tm-group-resource-picker-group',
                      group.disabled ? 'tm-group-resource-picker-group--disabled' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <div className="tm-group-resource-picker-group-header">
                      <button
                        type="button"
                        className="tm-group-resource-picker-expand"
                        aria-expanded={expanded}
                        onClick={() => toggleExpanded(group.id)}
                      >
                        <IconChevronRight open={expanded} />
                      </button>
                      <button
                        type="button"
                        className="tm-group-resource-picker-group-main"
                        disabled={group.disabled}
                        onClick={() => toggleExpanded(group.id)}
                      >
                        <span className="tm-group-resource-picker-group-name">{group.name}</span>
                        {group.description ? (
                          <span className="tm-group-resource-picker-group-desc">
                            {group.description}
                          </span>
                        ) : null}
                      </button>
                      <GroupPickerCheckbox
                        checked={fullySelected}
                        indeterminate={partiallySelected}
                        disabled={
                          group.disabled ||
                          (selectableItems.length === 0 &&
                            group.items.length > 0 &&
                            !group.groupSelectable)
                        }
                        onChange={() => toggleGroup(group)}
                      />
                    </div>

                    {expanded ? (
                      <ul className="tm-group-resource-picker-items">
                        {loadingGroupId === group.id ? (
                          <li className="tm-group-resource-picker-item tm-group-resource-picker-item--loading">
                            加载中…
                          </li>
                        ) : group.items.length === 0 ? (
                          <li className="tm-group-resource-picker-item tm-group-resource-picker-item--empty">
                            暂无子项
                          </li>
                        ) : (
                          group.items.map((item) => {
                            const checked = selectedKeys.has(itemKey(group.id, item.id))
                            if (item.displayOnly) {
                              return (
                                <li
                                  key={item.id}
                                  className="tm-group-resource-picker-item tm-group-resource-picker-item--display-only"
                                >
                                  <div className="tm-group-resource-picker-item-main">
                                    <span className="tm-group-resource-picker-item-name">
                                      {item.name}
                                    </span>
                                    {item.meta ? (
                                      <span className="tm-group-resource-picker-item-meta">
                                        {item.meta}
                                      </span>
                                    ) : null}
                                  </div>
                                </li>
                              )
                            }

                            return (
                              <li
                                key={item.id}
                                className={[
                                  'tm-group-resource-picker-item',
                                  item.disabled ? 'tm-group-resource-picker-item--disabled' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                              >
                                <button
                                  type="button"
                                  className="tm-group-resource-picker-item-main"
                                  disabled={item.disabled || group.disabled}
                                  onClick={() => toggleItem(group.id, item.id)}
                                >
                                  <span className="tm-group-resource-picker-item-name">
                                    {item.name}
                                  </span>
                                  {item.meta ? (
                                    <span className="tm-group-resource-picker-item-meta">
                                      {item.meta}
                                    </span>
                                  ) : null}
                                </button>
                                <GroupPickerCheckbox
                                  small
                                  checked={checked}
                                  disabled={item.disabled || group.disabled}
                                  onChange={() => toggleItem(group.id, item.id)}
                                />
                              </li>
                            )
                          })
                        )}
                      </ul>
                    ) : null}
                  </li>
                )
              })}
              </ul>
            </div>
          )}
          {combinedError ? <p className="tm-form-error">{combinedError}</p> : null}
        </div>
        <footer className="tm-modal-footer">
          <button type="button" className="tm-btn tm-btn--ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            disabled={busy || selectionCount === 0}
            onClick={() => void handleConfirm()}
          >
            {busy ? '添加中…' : `${confirmLabel}${selectionCount > 0 ? ` (${selectionCount})` : ''}`}
          </button>
        </footer>
      </div>
    </div>
  )
}

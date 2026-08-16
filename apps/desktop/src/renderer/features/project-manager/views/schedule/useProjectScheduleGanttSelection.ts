import { useCallback, useEffect, useState } from 'react'

import { isGanttProjectRootId } from './pm-gantt-utils'

export function useProjectScheduleGanttSelection(selectedProjectId: string | null) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(() => new Set())
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(() => new Set())
  const [pendingDeleteSelected, setPendingDeleteSelected] = useState(false)

  useEffect(() => {
    setCheckedIds(new Set())
    setSelectedId(null)
  }, [selectedProjectId])

  const handleToggleCollapse = (itemId: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  const handleToggleChecked = useCallback((itemId: string) => {
    if (isGanttProjectRootId(itemId)) return
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }, [])

  const handleClearRowSelection = useCallback(() => {
    setCheckedIds(new Set())
  }, [])

  return {
    selectedId,
    setSelectedId,
    checkedIds,
    setCheckedIds,
    collapsedIds,
    setCollapsedIds,
    pendingDeleteSelected,
    setPendingDeleteSelected,
    handleToggleCollapse,
    handleToggleChecked,
    handleClearRowSelection,
  }
}

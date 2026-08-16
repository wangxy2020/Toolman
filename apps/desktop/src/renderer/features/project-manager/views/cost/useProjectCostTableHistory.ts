import { useCallback, useEffect, type MutableRefObject, type RefObject } from 'react'

import { isPmEditableEventTarget, isPmPanelDomActive } from '../../pm-editable-dom'
import { cloneCostRows, CostHistoryStack } from './pm-cost-history'
import type { PmCostRow } from './pm-cost-catalog'

export function useProjectCostTableHistory(args: {
  canEdit: boolean
  applyCatalogRows: (catalog: PmCostRow[], options?: { dirty?: boolean; clearHistory?: boolean }) => void
  rowsRef: MutableRefObject<PmCostRow[]>
  historyStackRef: MutableRefObject<CostHistoryStack>
  historyApplyingRef: MutableRefObject<boolean>
  setHistoryEpoch: (fn: (v: number) => number) => void
  panelRootRef: RefObject<HTMLDivElement | null>
  projectInfoOpen: boolean
  pendingDelete: unknown
}) {
  const {
    canEdit, applyCatalogRows, rowsRef, historyStackRef, historyApplyingRef, setHistoryEpoch,
    panelRootRef, projectInfoOpen, pendingDelete,
  } = args

  const handleUndo = useCallback(() => {
    if (!canEdit || !historyStackRef.current.canUndo) return
    const current = cloneCostRows(rowsRef.current)
    const previous = historyStackRef.current.popUndo(current)
    if (!previous) return
    historyApplyingRef.current = true
    applyCatalogRows(cloneCostRows(previous))
    setHistoryEpoch((value) => value + 1)
    historyApplyingRef.current = false
  }, [applyCatalogRows, canEdit])

  const handleRedo = useCallback(() => {
    if (!canEdit || !historyStackRef.current.canRedo) return
    const current = cloneCostRows(rowsRef.current)
    const next = historyStackRef.current.popRedo(current)
    if (!next) return
    historyApplyingRef.current = true
    applyCatalogRows(cloneCostRows(next))
    setHistoryEpoch((value) => value + 1)
    historyApplyingRef.current = false
  }, [applyCatalogRows, canEdit])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPmPanelDomActive(panelRootRef.current)) return
      if (projectInfoOpen || pendingDelete) return
      if (isPmEditableEventTarget(event.target)) return
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        handleUndo()
        return
      }
      if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault()
        handleRedo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleRedo, handleUndo, pendingDelete, projectInfoOpen])

  return { handleUndo, handleRedo }
}

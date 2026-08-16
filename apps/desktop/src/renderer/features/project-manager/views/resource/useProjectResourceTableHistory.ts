import { useCallback, useEffect, type MutableRefObject, type RefObject } from 'react'
import { isPmEditableEventTarget, isPmPanelDomActive } from '../../pm-editable-dom'
import { cloneResourceRows, type ResourceHistoryStack } from './pm-resource-history'
import type { PmResourceRow } from './pm-resource-catalog'

export function useProjectResourceTableHistory(args: {
  canEdit: boolean
  applyCatalogRows: (catalog: PmResourceRow[], options?: { dirty?: boolean; clearHistory?: boolean }) => void
  rowsRef: MutableRefObject<PmResourceRow[]>
  historyStackRef: MutableRefObject<ResourceHistoryStack>
  historyApplyingRef: MutableRefObject<boolean>
  setHistoryEpoch: (fn: (v: number) => number) => void
  panelRootRef: RefObject<HTMLDivElement | null>
  projectInfoOpen: boolean
  pendingDelete: unknown
  pendingDeleteCustomTypeName: string | null
  pendingRestoreVersion: number | null
}) {
  const {
    canEdit, applyCatalogRows, rowsRef, historyStackRef, historyApplyingRef, setHistoryEpoch,
    panelRootRef, projectInfoOpen, pendingDelete, pendingDeleteCustomTypeName, pendingRestoreVersion,
  } = args

  const handleUndo = useCallback(() => {
    if (!canEdit || !historyStackRef.current.canUndo) return
    const current = cloneResourceRows(rowsRef.current)
    const previous = historyStackRef.current.popUndo(current)
    if (!previous) return
    historyApplyingRef.current = true
    applyCatalogRows(cloneResourceRows(previous))
    setHistoryEpoch((value) => value + 1)
    historyApplyingRef.current = false
  }, [applyCatalogRows, canEdit])

  const handleRedo = useCallback(() => {
    if (!canEdit || !historyStackRef.current.canRedo) return
    const current = cloneResourceRows(rowsRef.current)
    const next = historyStackRef.current.popRedo(current)
    if (!next) return
    historyApplyingRef.current = true
    applyCatalogRows(cloneResourceRows(next))
    setHistoryEpoch((value) => value + 1)
    historyApplyingRef.current = false
  }, [applyCatalogRows, canEdit])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPmPanelDomActive(panelRootRef.current)) return
      if (projectInfoOpen || pendingDelete || pendingDeleteCustomTypeName || pendingRestoreVersion != null) return
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
  }, [handleRedo, handleUndo, pendingDelete, pendingDeleteCustomTypeName, pendingRestoreVersion, projectInfoOpen])

  return { handleUndo, handleRedo }
}

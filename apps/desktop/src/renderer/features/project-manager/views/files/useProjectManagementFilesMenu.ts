import type { MouseEvent as ReactMouseEvent } from 'react'
import { useCallback, useEffect } from 'react'
import { isPmEditableEventTarget } from '../../pm-editable-dom'
import { isPmFeatureType, type PmFeatureType, type PmFeatureViewFilter } from './pm-features-catalog'
import { computeColumnMenuPosition, computeContextMenuPosition } from './pm-features-panel-utils'
import { saveFeaturesColumnVisibility, type FeaturesToggleColumn } from './pm-features-column-prefs'
import { saveCostColumnVisibility, type CostToggleColumn } from '../cost/pm-cost-column-prefs'
import type { FeaturesMenuAction, FeaturesScheduleView } from './ProjectFeaturesMenuBar'
import { loadGanttUiPrefs, saveGanttUiPrefs, type GanttScheduleView } from '../schedule/pm-gantt-prefs'

export function useProjectManagementFilesMenu(args: {
  lockedViewFilter?: PmFeatureViewFilter
  setDraftType: (t: PmFeatureType) => void
  setViewFilter: (t: PmFeatureViewFilter) => void
  setScheduleView: (v: FeaturesScheduleView) => void
  onOpenScheduleView?: (view: FeaturesScheduleView) => void
  handleSave: () => void
  setPendingSaveAsNewVersion: (v: boolean) => void
  handlePrint: () => void
  setProjectInfoOpen: (v: boolean) => void
  handleAdd: () => void
  handleInsert: () => void
  handleDelete: () => void
  handleIndent: () => void
  handleOutdent: () => void
  handleMove: (d: -1 | 1) => void
  setContextMenu: (v: { left: number; top: number } | null) => void
  setColumnMenu: (v: { left: number; top: number } | null) => void
  setColumnVisibility: import('react').Dispatch<import('react').SetStateAction<import('./pm-features-column-prefs').FeaturesColumnVisibility>>
  setMeteringColumnVisibility: import('react').Dispatch<import('react').SetStateAction<import('../cost/pm-cost-column-prefs').CostColumnVisibility>>
  columnMenu: { left: number; top: number } | null
}) {
  const {
    lockedViewFilter, setDraftType, setViewFilter, setScheduleView, onOpenScheduleView, handleSave,
    setPendingSaveAsNewVersion, handlePrint, setProjectInfoOpen, handleAdd, handleInsert, handleDelete,
    handleIndent, handleOutdent, handleMove, setContextMenu, setColumnMenu, setColumnVisibility,
    setMeteringColumnVisibility, columnMenu,
  } = args

  const handleTypeChange = useCallback(
    (type: PmFeatureViewFilter) => {
      if (lockedViewFilter != null) return
      if (type !== 'scheduleAll') {
        setDraftType(type)
      }
      setViewFilter(type)
    },
    [lockedViewFilter],
  )

  const handleScheduleViewChange = useCallback(
    (view: FeaturesScheduleView) => {
      setScheduleView(view)
      const prefs = loadGanttUiPrefs()
      saveGanttUiPrefs({ ...prefs, scheduleView: view as GanttScheduleView })
      onOpenScheduleView?.(view)
    },
    [onOpenScheduleView],
  )

  const handleMenuAction = useCallback(
    (action: FeaturesMenuAction) => {
      if (action === 'scheduleAll') {
        handleTypeChange('scheduleAll')
        return
      }
      if (isPmFeatureType(action)) {
        handleTypeChange(action)
        return
      }
      switch (action) {
        case 'save':
          void handleSave()
          break
        case 'saveAsNewVersion':
          setPendingSaveAsNewVersion(true)
          break
        case 'print':
          handlePrint()
          break
        case 'projectInfo':
          setProjectInfoOpen(true)
          break
        case 'add':
          handleAdd()
          break
        case 'insert':
          handleInsert()
          break
        case 'delete':
          handleDelete()
          break
        case 'indent':
          handleIndent()
          break
        case 'outdent':
          handleOutdent()
          break
        case 'moveUp':
          handleMove(-1)
          break
        case 'moveDown':
          handleMove(1)
          break
        case 'undo':
        case 'redo':
          break
        default:
          break
      }
    },
    [
      handleAdd,
      handleDelete,
      handleIndent,
      handleInsert,
      handleMove,
      handleOutdent,
      handlePrint,
      handleSave,
      handleTypeChange,
    ],
  )
  const handleRowContextMenu = useCallback(
    (event: ReactMouseEvent, _rowId: string) => {
      if (isPmEditableEventTarget(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      setColumnMenu(null)
      // Right-click opens the menu only — do not enter selection mode until「选择」is clicked.
      setContextMenu(computeContextMenuPosition(event.clientX, event.clientY))
    },
    [],
  )

  const handleTableContextMenu = useCallback((event: ReactMouseEvent) => {
    if (isPmEditableEventTarget(event.target)) return
    event.preventDefault()
    setColumnMenu(null)
    setContextMenu(computeContextMenuPosition(event.clientX, event.clientY))
  }, [])

  const openColumnVisibilityMenu = useCallback((event: ReactMouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    setColumnMenu(computeColumnMenuPosition(event.clientX, event.clientY))
  }, [])

  const toggleColumnVisibility = useCallback((column: FeaturesToggleColumn) => {
    setColumnVisibility((prev) => {
      if (column === 'name' && prev.name) return prev
      const next = { ...prev, [column]: !prev[column] }
      if (!next.name) next.name = true
      saveFeaturesColumnVisibility(next)
      return next
    })
  }, [])

  const toggleMeteringColumnVisibility = useCallback((column: CostToggleColumn) => {
    setMeteringColumnVisibility((prev) => {
      if (column === 'name' && prev.name) return prev
      const next = { ...prev, [column]: !prev[column] }
      if (!next.name) next.name = true
      saveCostColumnVisibility(next)
      return next
    })
  }, [])

  useEffect(() => {
    if (!columnMenu) return
    const onDoc = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('.tm-pm-gantt-col-menu')) return
      setColumnMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setColumnMenu(null)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [columnMenu])

  return {
    handleTypeChange, handleScheduleViewChange, handleMenuAction, handleRowContextMenu,
    handleTableContextMenu, openColumnVisibilityMenu, toggleColumnVisibility, toggleMeteringColumnVisibility,
  }
}

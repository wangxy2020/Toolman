import { useCallback, useMemo } from 'react'

import type { CostDatabaseViewKey } from '@toolman/shared'
import type { FeaturesMenuAction, FeaturesVersionSwitchEntry } from '../files/ProjectFeaturesMenuBar'
import {
  isCostPracticeViewPage,
  type CostMenuAction,
  type CostViewFilter,
  type CostVersionSwitchEntry,
} from './ProjectCostMenuBar'

export function useProjectCostTableMenu(args: {
  selectedMeteringBaselineId: string | null
  versionSwitchEntries: CostVersionSwitchEntry[]
  handleSave: () => void
  setPendingSaveAsNewVersion: (v: boolean) => void
  handleImport: () => void
  handlePrint: () => void
  setProjectInfoOpen: (v: boolean) => void
  handleUndo: () => void
  handleRedo: () => void
  handleAdd: (count?: number) => void
  setPendingAddMultiple: (v: boolean) => void
  handleInsert: () => void
  handleDelete: () => void
  handleIndent: () => void
  handleOutdent: () => void
  handleMove: (dir: -1 | 1) => void
  setMeteringViewActive: (v: boolean) => void
  setViewFilter: (v: CostViewFilter) => void
  viewFilter: CostViewFilter
  setMeteringCaptureBaselineOpen: (v: boolean) => void
  setMeteringEditBaselineOpen: (v: boolean) => void
  setPendingMeteringDeleteBaseline: (v: boolean) => void
  fetchCostDatabase: (viewKey?: CostDatabaseViewKey) => void
}) {
  const {
    selectedMeteringBaselineId, versionSwitchEntries, handleSave, setPendingSaveAsNewVersion,
    handleImport, handlePrint, setProjectInfoOpen, handleUndo, handleRedo, handleAdd, setPendingAddMultiple,
    handleInsert, handleDelete, handleIndent, handleOutdent, handleMove, setMeteringViewActive,
    setViewFilter, viewFilter,
    setMeteringCaptureBaselineOpen, setMeteringEditBaselineOpen, setPendingMeteringDeleteBaseline,
    fetchCostDatabase,
  } = args

  const activateMeteringView = useCallback(() => {
    setMeteringViewActive(true)
    if (isCostPracticeViewPage(viewFilter)) setViewFilter('all')
  }, [setMeteringViewActive, setViewFilter, viewFilter])

  const handleMenuAction = useCallback(
    (
      action: CostMenuAction,
      event?: { metaKey?: boolean; ctrlKey?: boolean },
    ) => {
      switch (action) {
        case 'save':
          void handleSave()
          break
        case 'saveAsNewVersion':
          setPendingSaveAsNewVersion(true)
          break
        case 'fetch':
          void fetchCostDatabase()
          break
        case 'fetchMetering':
          void fetchCostDatabase('budgetQuota')
          break
        case 'import':
          void handleImport()
          break
        case 'print':
          handlePrint()
          break
        case 'projectInfo':
          setProjectInfoOpen(true)
          break
        case 'undo':
          handleUndo()
          break
        case 'redo':
          handleRedo()
          break
        case 'add':
          if (event?.metaKey || event?.ctrlKey) {
            setPendingAddMultiple(true)
          } else {
            handleAdd()
          }
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
        case 'metering':
          activateMeteringView()
          break
        case 'meteringCaptureBaseline':
          activateMeteringView()
          setMeteringCaptureBaselineOpen(true)
          break
        case 'meteringEditBaseline':
          if (selectedMeteringBaselineId) {
            activateMeteringView()
            setMeteringEditBaselineOpen(true)
          }
          break
        case 'meteringDeleteBaseline':
          if (selectedMeteringBaselineId) {
            activateMeteringView()
            setPendingMeteringDeleteBaseline(true)
          }
          break
      }
    },
    [
      fetchCostDatabase,
      handleAdd,
      handleDelete,
      handleImport,
      handleIndent,
      handleInsert,
      handleMove,
      handleOutdent,
      handlePrint,
      handleRedo,
      handleSave,
      handleUndo,
      selectedMeteringBaselineId,
      activateMeteringView,
    ],
  )
  const handleFeaturesMenuAction = useCallback(
    (action: FeaturesMenuAction) => {
      if (action === 'fetch') {
        void fetchCostDatabase()
        return
      }
      switch (action) {
        case 'save':
        case 'saveAsNewVersion':
        case 'print':
        case 'projectInfo':
        case 'undo':
        case 'redo':
        case 'add':
        case 'insert':
        case 'delete':
        case 'indent':
        case 'outdent':
        case 'moveUp':
        case 'moveDown':
          handleMenuAction(action)
          break
        default:
          break
      }
    },
    [fetchCostDatabase, handleMenuAction],
  )

  const practiceVersionEntries = useMemo((): FeaturesVersionSwitchEntry[] => {
    return versionSwitchEntries.map((entry) => ({
      version: entry.version,
      name: entry.name,
      hasSnapshot: entry.hasSnapshot,
      isCurrent: entry.isCurrent,
    }))
  }, [versionSwitchEntries])

  return { handleMenuAction, handleFeaturesMenuAction, practiceVersionEntries }
}

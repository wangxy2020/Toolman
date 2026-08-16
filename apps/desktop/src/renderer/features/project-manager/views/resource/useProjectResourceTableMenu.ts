import { useCallback, useMemo } from 'react'
import type { FeaturesMenuAction, FeaturesVersionSwitchEntry } from '../files/ProjectFeaturesMenuBar'
import type { ResourceMenuAction, ResourceVersionSwitchEntry } from './ProjectResourceMenuBar'
import {
  readMaxResourceVersion,
  readResourceVersion,
} from '@toolman/shared'
import {
  readSharedResourceSaveMeta,
  readSharedResourceVersion,
} from './pm-resource-catalog'
import { readPracticeSaveMeta, readPracticeVersion } from './pm-resource-practice-catalog'
import type { PmProject } from '@toolman/shared'

export function useProjectResourceTableMenu(args: {
  isPractice: boolean
  isAllScope: boolean
  practiceScopeId: string
  workspaceId: string
  editingProject: PmProject | null
  versionSwitchEntries: ResourceVersionSwitchEntry[]
  handleSave: () => void
  setPendingSaveAsNewVersion: (v: boolean) => void
  handlePrint: () => void
  setProjectInfoOpen: (v: boolean) => void
  handleUndo: () => void
  handleRedo: () => void
  handleAdd: () => void
  handleInsert: () => void
  handleDelete: () => void
  handleIndent: () => void
  handleOutdent: () => void
  handleMove: (d: -1 | 1) => void
  visibleRows: { id: string }[]
  setCheckedIds: (ids: Set<string>) => void
  setSelectionMode: (v: boolean) => void
  setContextMenu: (v: null) => void
}) {
  const {
    isPractice, isAllScope, practiceScopeId, workspaceId, editingProject, versionSwitchEntries,
    handleSave, setPendingSaveAsNewVersion, handlePrint, setProjectInfoOpen, handleUndo, handleRedo,
    handleAdd, handleInsert, handleDelete, handleIndent, handleOutdent, handleMove,
    visibleRows, setCheckedIds, setSelectionMode, setContextMenu,
  } = args

  const handleMenuAction = useCallback(
    (action: ResourceMenuAction) => {
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
        case 'undo':
          handleUndo()
          break
        case 'redo':
          handleRedo()
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
      handleRedo,
      handleSave,
      handleUndo,
    ],
  )

  const handleFeaturesMenuAction = useCallback(
    (action: FeaturesMenuAction) => {
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
    [handleMenuAction],
  )
  const practiceVersionEntries = useMemo((): FeaturesVersionSwitchEntry[] => {
    return versionSwitchEntries.map((entry) => ({
      version: entry.version,
      name: entry.name,
      hasSnapshot: entry.hasSnapshot,
      isCurrent: entry.isCurrent,
    }))
  }, [versionSwitchEntries])
  const handleSelectAll = useCallback(() => {
    setCheckedIds(new Set(visibleRows.map((row) => row.id)))
    setSelectionMode(true)
  }, [visibleRows])

  const handleClearSelection = useCallback(() => {
    setCheckedIds(new Set())
    setSelectionMode(false)
  }, [])

  const handleEnterSelectionMode = useCallback(() => {
    setSelectionMode(true)
  }, [])

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const getSaveAsNewVersionInfo = useCallback((): { currentVersion: number; nextVersion: number } => {
    if (isPractice) {
      const currentVersion = practiceScopeId ? readPracticeVersion(workspaceId, practiceScopeId) : 0
      const maxVersion = practiceScopeId
        ? readMaxResourceVersion(readPracticeSaveMeta(workspaceId, practiceScopeId))
        : 0
      return { currentVersion, nextVersion: maxVersion + 1 }
    }
    if (isAllScope) {
      return {
        currentVersion: readSharedResourceVersion(workspaceId),
        nextVersion: readMaxResourceVersion(readSharedResourceSaveMeta(workspaceId)) + 1,
      }
    }
    return {
      currentVersion: readResourceVersion(editingProject?.metadata),
      nextVersion: readMaxResourceVersion(editingProject?.metadata) + 1,
    }
  }, [editingProject?.metadata, isAllScope, isPractice, practiceScopeId, workspaceId])

  return {
    handleMenuAction, handleFeaturesMenuAction, practiceVersionEntries,
    handleSelectAll, handleClearSelection, handleEnterSelectionMode, handleCloseContextMenu,
    getSaveAsNewVersionInfo,
  }
}

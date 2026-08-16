import { useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { PmProject } from '@toolman/shared'

import { useI18n } from '../../../../i18n/useI18n'
import { usePmStatusFeedback } from '../../usePmStatusFeedback'
import type { ResourceViewFilter } from './ProjectResourceMenuBar'
import { PM_RESOURCE_APPLICABLE_ALL, type PmResourceRow } from './pm-resource-catalog'
import { loadResourceColumnVisibility, RESOURCE_TOGGLE_COLUMNS } from './pm-resource-column-prefs'
import { readCustomTypeNameCatalog } from './pm-resource-custom-types'
import { ResourceHistoryStack } from './pm-resource-history'
import { clampRenderedMenuToViewport } from './pm-resource-panel-utils'
import { useProjectResourceTableEdit } from './useProjectResourceTableEdit'
import { useProjectResourceTableFilters } from './useProjectResourceTableFilters'
import { useProjectResourceTableHistory } from './useProjectResourceTableHistory'
import { useProjectResourceTableLoad } from './useProjectResourceTableLoad'
import { useProjectResourceTableMenu } from './useProjectResourceTableMenu'
import { useProjectResourceTablePrint } from './useProjectResourceTablePrint'
import { useProjectResourceTableRows } from './useProjectResourceTableRows'
import { useProjectResourceTableSave } from './useProjectResourceTableSave'
import { useProjectResourceTableScroll } from './useProjectResourceTableScroll'
import { useProjectResourceTableVersion } from './useProjectResourceTableVersion'
import { buildProjectResourceTablePanelState } from './useProjectResourceTableState'

export interface UseProjectResourceTablePanelProps {
  workspaceId: string
  projects: PmProject[]
  selectedProjectId: string | null
  onProjectsChange?: () => void | Promise<void>
  variant?: 'catalog' | 'practice'
}

type ResourceContextMenuState = { left: number; top: number; rowId: string }
type ResourceColumnMenuState = { left: number; top: number }

export function useProjectResourceTablePanel({
  workspaceId,
  projects,
  selectedProjectId,
  onProjectsChange,
  variant = 'catalog',
}: UseProjectResourceTablePanelProps) {
  const { t } = useI18n()
  const isPractice = variant === 'practice'
  const isAllScope = !selectedProjectId || !projects.some((project) => project.id === selectedProjectId)
  const editingProject = useMemo(() => {
    if (isAllScope) return null
    return projects.find((project) => project.id === selectedProjectId) ?? null
  }, [isAllScope, projects, selectedProjectId])
  const viewApplicable = isAllScope ? PM_RESOURCE_APPLICABLE_ALL : (editingProject?.id ?? PM_RESOURCE_APPLICABLE_ALL)
  const practiceScopeId = isAllScope ? PM_RESOURCE_APPLICABLE_ALL : (editingProject?.id ?? '')
  const canEdit = isAllScope || editingProject != null
  const scopeKey = isAllScope ? PM_RESOURCE_APPLICABLE_ALL : (editingProject?.id ?? '')

  const [viewFilter, setViewFilter] = useState<ResourceViewFilter>(variant === 'practice' ? 'labor' : 'all')
  const [rows, setRows] = useState<PmResourceRow[]>([])
  const [dirty, setDirty] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [contextMenu, setContextMenu] = useState<ResourceContextMenuState | null>(null)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const [columnMenu, setColumnMenu] = useState<ResourceColumnMenuState | null>(null)
  const [columnVisibility, setColumnVisibility] = useState(() => loadResourceColumnVisibility())
  const [customTypeCatalog, setCustomTypeCatalog] = useState(() => readCustomTypeNameCatalog(workspaceId))
  const [pendingDelete, setPendingDelete] = useState<Set<string> | null>(null)
  const [pendingDeleteCustomTypeName, setPendingDeleteCustomTypeName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [projectInfoOpen, setProjectInfoOpen] = useState(false)
  const [pendingSaveAsNewVersion, setPendingSaveAsNewVersion] = useState(false)
  const [pendingRestoreVersion, setPendingRestoreVersion] = useState<number | null>(null)
  const [statusFeedback, setStatusFeedback] = usePmStatusFeedback()
  const [historyEpoch, setHistoryEpoch] = useState(0)
  const historyStackRef = useRef(new ResourceHistoryStack())
  const historyApplyingRef = useRef(false)
  const panelRootRef = useRef<HTMLDivElement>(null)
  const rowsRef = useRef<PmResourceRow[]>([])
  const cleanFingerprintRef = useRef('')
  rowsRef.current = rows
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const headerPinInnerRef = useRef<HTMLDivElement | null>(null)
  const hTrackRef = useRef<HTMLDivElement | null>(null)

  const scroll = useProjectResourceTableScroll({
    tableScrollRef, headerPinInnerRef, hTrackRef, rowCount: rows.length, selectionMode,
  })
  const load = useProjectResourceTableLoad({
    workspaceId, isPractice, isAllScope, practiceScopeId, scopeKey, editingProject, dirty, setDirty,
    setRows, rowsRef, cleanFingerprintRef, historyStackRef, historyApplyingRef, setHistoryEpoch,
    setSelectedId, setCheckedIds, setSelectionMode, setContextMenu, setProjectInfoOpen,
    setPendingRestoreVersion, setViewFilter, onProjectsChange,
  })
  const filters = useProjectResourceTableFilters({
    workspaceId, isPractice, isAllScope, dirty, rows, rowsRef, selectedId, setSelectedId, setCheckedIds,
    viewFilter, setViewFilter, customTypeCatalog, setCustomTypeCatalog, pendingDeleteCustomTypeName,
    setPendingDeleteCustomTypeName, updateRows: load.updateRows, t,
  })
  const version = useProjectResourceTableVersion({
    workspaceId, isPractice, isAllScope, practiceScopeId, editingProject, dirty, rows,
    pendingRestoreVersion, setPendingRestoreVersion, setSaving, setSelectedId,
    applyCatalogRows: load.applyCatalogRows, onProjectsChange, t,
  })
  const history = useProjectResourceTableHistory({
    canEdit, applyCatalogRows: load.applyCatalogRows, rowsRef, historyStackRef, historyApplyingRef,
    setHistoryEpoch, panelRootRef, projectInfoOpen, pendingDelete, pendingDeleteCustomTypeName,
    pendingRestoreVersion,
  })
  const save = useProjectResourceTableSave({
    workspaceId, isPractice, isAllScope, canEdit, practiceScopeId, scopeKey, viewApplicable,
    editingProject, rows, rowsRef, dirty, applyCatalogRows: load.applyCatalogRows, cleanFingerprintRef,
    onProjectsChange, setSaving, setStatusFeedback, t,
  })
  const { handlePrint } = useProjectResourceTablePrint({ editingProject, t })
  const rowsApi = useProjectResourceTableRows({
    canEdit, addType: filters.addType, addCustomTypeName: filters.addCustomTypeName, viewApplicable,
    selectedId, setSelectedId, checkedIds, setCheckedIds, setSelectionMode, setPendingDelete,
    updateRows: load.updateRows,
  })
  const edit = useProjectResourceTableEdit({
    isPractice, isAllScope, rowsRef, editingProject, baselinePriceIndex: filters.baselinePriceIndex,
    updateRows: load.updateRows, setCheckedIds, setContextMenu, setColumnMenu, setColumnVisibility,
    columnMenu,
  })
  const menu = useProjectResourceTableMenu({
    isPractice, isAllScope, practiceScopeId, workspaceId, editingProject,
    versionSwitchEntries: version.versionSwitchEntries, handleSave: save.handleSave,
    setPendingSaveAsNewVersion, handlePrint, setProjectInfoOpen, handleUndo: history.handleUndo,
    handleRedo: history.handleRedo, handleAdd: rowsApi.handleAdd, handleInsert: rowsApi.handleInsert,
    handleDelete: rowsApi.handleDelete, handleIndent: rowsApi.handleIndent,
    handleOutdent: rowsApi.handleOutdent, handleMove: rowsApi.handleMove,
    visibleRows: filters.visibleRows, setCheckedIds, setSelectionMode, setContextMenu,
  })

  useLayoutEffect(() => {
    if (!contextMenu) return
    const menuEl = contextMenuRef.current
    if (!menuEl) return
    const { left, top } = clampRenderedMenuToViewport(
      { left: contextMenu.left, top: contextMenu.top, width: menuEl.offsetWidth, height: menuEl.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    )
    if (Math.abs(left - contextMenu.left) > 0.5 || Math.abs(top - contextMenu.top) > 0.5) {
      setContextMenu((current) => (current ? { ...current, left, top } : current))
    }
  }, [contextMenu?.rowId, contextMenu?.left, contextMenu?.top])

  return buildProjectResourceTablePanelState({
    t, isPractice, isAllScope, editingProject, canEdit, workspaceId, practiceScopeId, viewFilter,
    rows, dirty, selectedId, setSelectedId, checkedIds, selectionMode, contextMenu, contextMenuRef,
    columnMenu, columnVisibility, pendingDelete, setPendingDelete, pendingDeleteCustomTypeName,
    setPendingDeleteCustomTypeName, saving, projectInfoOpen, setProjectInfoOpen, pendingSaveAsNewVersion,
    setPendingSaveAsNewVersion, pendingRestoreVersion, setPendingRestoreVersion, statusFeedback,
    panelRootRef, tableScrollRef, headerPinInnerRef, hTrackRef, hScrollMetrics: scroll.hScrollMetrics,
    hScrollDragging: scroll.hScrollDragging, syncHScrollMetrics: scroll.syncHScrollMetrics,
    onHTrackPointerDown: scroll.onHTrackPointerDown,
    canUndo: historyEpoch >= 0 && historyStackRef.current.canUndo,
    canRedo: historyEpoch >= 0 && historyStackRef.current.canRedo,
    versionSwitchEntries: version.versionSwitchEntries, practiceVersionEntries: menu.practiceVersionEntries,
    byId: filters.byId, selectedRow: filters.selectedRow, selectedType: filters.selectedType,
    selectedCustomTypeName: filters.selectedCustomTypeName, customTypeNames: filters.customTypeNames,
    visibleRows: filters.visibleRows, handleViewFilterChange: filters.handleViewFilterChange,
    handleRegisterCustomTypeName: filters.handleRegisterCustomTypeName,
    handleRequestDeleteCustomTypeName: filters.handleRequestDeleteCustomTypeName,
    handleConfirmDeleteCustomTypeName: filters.handleConfirmDeleteCustomTypeName,
    handleUndo: history.handleUndo, handleRedo: history.handleRedo, handleSave: save.handleSave,
    handlePrint, handleAdd: rowsApi.handleAdd, handleInsert: rowsApi.handleInsert,
    handleDelete: rowsApi.handleDelete, deleteIds: rowsApi.deleteIds, handleIndent: rowsApi.handleIndent,
    handleOutdent: rowsApi.handleOutdent, handleMove: rowsApi.handleMove,
    handleTypeChange: rowsApi.handleTypeChange, handleConfirmRestoreVersion: version.handleConfirmRestoreVersion,
    handleRestoreVersion: version.handleRestoreVersion, handleMenuAction: menu.handleMenuAction,
    handleFeaturesMenuAction: menu.handleFeaturesMenuAction, practiceQuotaView: filters.practiceQuotaView,
    handleQuotaViewChange: filters.handleQuotaViewChange, practiceColumnLabel: filters.practiceColumnLabel,
    patchRow: edit.patchRow, typeSelectValueForRow: edit.typeSelectValueForRow,
    handleTypeSelectChange: edit.handleTypeSelectChange, handleRowNameChange: edit.handleRowNameChange,
    handleRowSpecChange: edit.handleRowSpecChange, handleRowUnitChange: edit.handleRowUnitChange,
    handleRowPricingUnitTextChange: edit.handleRowPricingUnitTextChange,
    handleRowPricingUnitCommit: edit.handleRowPricingUnitCommit,
    handleRowUnitPriceCommit: edit.handleRowUnitPriceCommit, handleRowNoteChange: edit.handleRowNoteChange,
    handleRowCheckedChange: edit.handleRowCheckedChange, getRowBaselineDisplay: edit.getRowBaselineDisplay,
    handleRowContextMenu: edit.handleRowContextMenu, openColumnVisibilityMenu: edit.openColumnVisibilityMenu,
    toggleColumnVisibility: edit.toggleColumnVisibility, handleSelectAll: menu.handleSelectAll,
    handleClearSelection: menu.handleClearSelection, handleEnterSelectionMode: menu.handleEnterSelectionMode,
    handleCloseContextMenu: menu.handleCloseContextMenu, contextMenuDeleteIds: checkedIds,
    getSaveAsNewVersionInfo: menu.getSaveAsNewVersionInfo, RESOURCE_TOGGLE_COLUMNS,
  })
}

/** Shared bag of state/handlers threaded into the presentational sub-components. */
export type ProjectResourceTablePanelState = ReturnType<typeof useProjectResourceTablePanel>

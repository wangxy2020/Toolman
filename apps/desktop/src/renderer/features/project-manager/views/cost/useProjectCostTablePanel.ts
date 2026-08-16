import { useMemo, useRef, useState } from 'react'

import type { PmProject } from '@toolman/shared'
import { readCostVersion, readMaxCostVersion } from '@toolman/shared'

import { useI18n } from '../../../../i18n/useI18n'
import { usePmStatusFeedback } from '../../usePmStatusFeedback'
import type { CostPracticeQuotaView, FeaturesScheduleView } from '../files/ProjectFeaturesMenuBar'
import type { CostViewFilter } from './ProjectCostMenuBar'
import {
  PM_COST_APPLICABLE_ALL,
  readSharedCostSaveMeta,
  readSharedCostVersion,
  type PmCostRow,
} from './pm-cost-catalog'
import {
  loadCostColumnLabels,
  loadCostColumnVisibility,
  type CostColumnLabels,
  type CostLabelColumn,
} from './pm-cost-column-prefs'
import { resolveCostTableTotalPriceCurrency } from './pm-cost-currency'
import { CostHistoryStack } from './pm-cost-history'
import { isCostSectionSummaryFilter } from './pm-cost-catalog'
import { type CostSummaryRow } from './pm-cost-summary'
import {
  readCostPracticeSaveMeta,
  readCostPracticeVersion,
} from './pm-cost-practice-catalog'
import { type MeteringBaseline, type MeteringRollupMode } from './pm-metering-baselines'
import { useProjectCostTableEdit } from './useProjectCostTableEdit'
import { useProjectCostTableHistory } from './useProjectCostTableHistory'
import { useProjectCostTableImport } from './useProjectCostTableImport'
import { useProjectCostTableLoad } from './useProjectCostTableLoad'
import { useProjectCostTableMenu } from './useProjectCostTableMenu'
import { useProjectCostTableMetering } from './useProjectCostTableMetering'
import { useProjectCostTablePrint } from './useProjectCostTablePrint'
import { useProjectCostTableRows } from './useProjectCostTableRows'
import { useProjectCostTableSave } from './useProjectCostTableSave'
import { useProjectCostTableScroll } from './useProjectCostTableScroll'
import { useProjectCostTableSelection } from './useProjectCostTableSelection'
import { useProjectCostTableStructure } from './useProjectCostTableStructure'
import { useProjectCostTableVersion } from './useProjectCostTableVersion'
import { useProjectCostTableView } from './useProjectCostTableView'
import { buildProjectCostTablePanelState } from './useProjectCostTableState'

export interface ProjectCostTablePanelProps {
  workspaceId: string
  projects: PmProject[]
  selectedProjectId: string | null
  onProjectsChange?: () => void | Promise<void>
  /**
   * `catalog` = 价格表；`practice` = 成本管理-实务（空表起步，独立存储，实务精简菜单）。
   */
  variant?: 'catalog' | 'practice'
  onOpenScheduleView?: (view: FeaturesScheduleView) => void
}

type CostContextMenuState = { left: number; top: number; rowId: string }
type CostColumnMenuState = { left: number; top: number }

export function useProjectCostTablePanel({
  workspaceId,
  projects,
  selectedProjectId,
  onProjectsChange,
  variant = 'catalog',
  onOpenScheduleView: _onOpenScheduleView,
}: ProjectCostTablePanelProps) {
  const { t } = useI18n()
  const isPractice = variant === 'practice'
  const isAllScope = !selectedProjectId || !projects.some((project) => project.id === selectedProjectId)
  const editingProject = useMemo(() => {
    if (isAllScope) return null
    return projects.find((project) => project.id === selectedProjectId) ?? null
  }, [isAllScope, projects, selectedProjectId])
  const totalPriceColumnDefaultLabel = useMemo(() => {
    const currency = resolveCostTableTotalPriceCurrency(editingProject?.metadata, editingProject?.code)
    return t('projectManagerPage.costTable.columns.totalPrice', { currency })
  }, [editingProject?.code, editingProject?.metadata, t])
  const viewApplicable = isAllScope ? PM_COST_APPLICABLE_ALL : (editingProject?.id ?? PM_COST_APPLICABLE_ALL)
  const practiceScopeId = isAllScope ? PM_COST_APPLICABLE_ALL : (editingProject?.id ?? '')
  const canEdit = isAllScope || editingProject != null
  const scopeKey = isAllScope ? PM_COST_APPLICABLE_ALL : (editingProject?.id ?? '')

  const [costQuotaView, setCostQuotaView] = useState<CostPracticeQuotaView>('constructionQuota')
  const [meteringViewActive, setMeteringViewActive] = useState(false)
  const [meteringBaselines, setMeteringBaselines] = useState<MeteringBaseline[]>([])
  const [selectedMeteringBaselineId, setSelectedMeteringBaselineId] = useState<string | null>(null)
  const [meteringCaptureBaselineOpen, setMeteringCaptureBaselineOpen] = useState(false)
  const [meteringEditBaselineOpen, setMeteringEditBaselineOpen] = useState(false)
  const [pendingMeteringDeleteBaseline, setPendingMeteringDeleteBaseline] = useState(false)
  const [meteringRollupMode, setMeteringRollupMode] = useState<MeteringRollupMode>('none')
  const [rows, setRows] = useState<PmCostRow[]>([])
  const [summaryRows, setSummaryRows] = useState<CostSummaryRow[]>([])
  const [dirty, setDirty] = useState(false)
  const [totalFormulaFocusId, setTotalFormulaFocusId] = useState<string | null>(null)
  const totalFormulaFocusIdRef = useRef<string | null>(null)
  const formulaInputRef = useRef<HTMLInputElement | null>(null)
  totalFormulaFocusIdRef.current = totalFormulaFocusId
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [contextMenu, setContextMenu] = useState<CostContextMenuState | null>(null)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const [columnMenu, setColumnMenu] = useState<CostColumnMenuState | null>(null)
  const [columnVisibility, setColumnVisibility] = useState(() => loadCostColumnVisibility())
  const [columnLabels, setColumnLabels] = useState<CostColumnLabels>(() => loadCostColumnLabels())
  const [editingHeaderColumn, setEditingHeaderColumn] = useState<CostLabelColumn | null>(null)
  const [headerDraft, setHeaderDraft] = useState('')
  const headerInputRef = useRef<HTMLInputElement | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Set<string> | null>(null)
  const [pendingRestoreVersion, setPendingRestoreVersion] = useState<number | null>(null)
  const [pendingSaveAsNewVersion, setPendingSaveAsNewVersion] = useState(false)
  const [pendingAddMultiple, setPendingAddMultiple] = useState(false)
  const [pendingImportRows, setPendingImportRows] = useState<{
    rows: PmCostRow[]
    sourceName: string
  } | null>(null)
  const [statusFeedback, setStatusFeedback] = usePmStatusFeedback()
  const [saving, setSaving] = useState(false)
  const [projectInfoOpen, setProjectInfoOpen] = useState(false)
  const [viewFilter, setViewFilter] = useState<CostViewFilter>('all')
  const [sectionFilter, setSectionFilter] = useState<string>('all')
  const [historyEpoch, setHistoryEpoch] = useState(0)
  const historyStackRef = useRef(new CostHistoryStack())
  const historyApplyingRef = useRef(false)
  const panelRootRef = useRef<HTMLDivElement>(null)
  const rowsRef = useRef<PmCostRow[]>([])
  const cleanFingerprintRef = useRef('')
  rowsRef.current = rows
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const headerPinInnerRef = useRef<HTMLDivElement | null>(null)
  const hTrackRef = useRef<HTMLDivElement | null>(null)

  const scroll = useProjectCostTableScroll({
    tableScrollRef, headerPinInnerRef, hTrackRef, rowCount: rows.length, selectionMode,
  })
  const load = useProjectCostTableLoad({
    workspaceId, isPractice, isAllScope, practiceScopeId, scopeKey, editingProject, dirty, setDirty,
    setRows, rowsRef, cleanFingerprintRef, historyStackRef, historyApplyingRef, setHistoryEpoch,
    setSelectedId, setCheckedIds, setSelectionMode, setContextMenu, setColumnMenu, setProjectInfoOpen,
    setViewFilter, setSectionFilter, setSummaryRows, setMeteringViewActive, setMeteringBaselines,
    setSelectedMeteringBaselineId, setMeteringCaptureBaselineOpen, setMeteringEditBaselineOpen,
    setPendingMeteringDeleteBaseline, setMeteringRollupMode, onProjectsChange, t,
  })
  const view = useProjectCostTableView({
    workspaceId, isPractice, isAllScope, dirty, rows, selectedId, setSelectedId, setCheckedIds,
    setSelectionMode, costQuotaView, viewFilter, setViewFilter, sectionFilter, setSectionFilter,
    setMeteringViewActive, summaryRows, editingProject, columnVisibility, tableScrollRef, rowsRef, t,
  })
  const version = useProjectCostTableVersion({
    workspaceId, isPractice, isAllScope, practiceScopeId, editingProject, dirty, rows,
    pendingRestoreVersion, setPendingRestoreVersion, setSaving, setSelectedId,
    applyCatalogRows: load.applyCatalogRows, onProjectsChange, t,
  })
  const history = useProjectCostTableHistory({
    canEdit, applyCatalogRows: load.applyCatalogRows, rowsRef, historyStackRef, historyApplyingRef,
    setHistoryEpoch, panelRootRef, projectInfoOpen, pendingDelete,
  })
  const save = useProjectCostTableSave({
    workspaceId, isPractice, isAllScope, canEdit, practiceScopeId, scopeKey, viewApplicable,
    editingProject, rows, rowsRef, summaryRows, dirty, applyCatalogRows: load.applyCatalogRows,
    cleanFingerprintRef, onProjectsChange, setSaving, setStatusFeedback, t,
  })
  const { handlePrint } = useProjectCostTablePrint({ editingProject, t })
  const rowsApi = useProjectCostTableRows({
    canEdit, isPractice, addType: view.addType, viewFilter, sectionFilter, viewApplicable,
    selectedId, setSelectedId, setDirty, setSummaryRows, updateRows: load.updateRows,
    editingProject, summaryRows, rowsRef, t,
  })
  const structure = useProjectCostTableStructure({
    selectedId, checkedIds, sectionFilter, setSelectedId, setCheckedIds, setSelectionMode,
    setPendingDelete, setDirty, setSummaryRows, updateRows: load.updateRows,
    resolveEditableSummaryRows: rowsApi.resolveEditableSummaryRows, t,
  })
  const imported = useProjectCostTableImport({
    canEdit, viewApplicable, addType: view.addType, rowsRef, updateRows: load.updateRows,
    setSelectedId, setCheckedIds, setPendingImportRows, setStatusFeedback, t,
  })
  const metering = useProjectCostTableMetering({
    workspaceId, isPractice, scopeKey, meteringBaselines, setMeteringBaselines,
    selectedMeteringBaselineId, setSelectedMeteringBaselineId, setMeteringViewActive,
    setMeteringRollupMode, meteringCaptureBaselineOpen, setMeteringCaptureBaselineOpen,
    setMeteringEditBaselineOpen, setPendingMeteringDeleteBaseline, setStatusFeedback, t,
  })
  const edit = useProjectCostTableEdit({
    isPractice, editingProject, baselinePriceIndex: view.baselinePriceIndex,
    updateRows: load.updateRows, setSummaryRows, setDirty, rowsRef, t,
  })
  const selection = useProjectCostTableSelection({
    visibleRows: view.visibleRows, columnLabels, setColumnLabels, setColumnVisibility,
    totalPriceColumnDefaultLabel, contextMenu, setContextMenu, setColumnMenu, columnMenu,
    contextMenuRef, editingHeaderColumn, setEditingHeaderColumn, headerDraft, setHeaderDraft,
    headerInputRef, setCheckedIds, setSelectionMode, totalFormulaFocusIdRef, formulaInputRef,
    setSummaryRows, setDirty, rowsRef, updateRows: load.updateRows,
    resolveEditableSummaryRows: rowsApi.resolveEditableSummaryRows, t,
  })
  const menu = useProjectCostTableMenu({
    isPractice, selectedMeteringBaselineId, versionSwitchEntries: version.versionSwitchEntries,
    handleSave: save.handleSave, setPendingSaveAsNewVersion, handleImport: imported.handleImport,
    handlePrint, setProjectInfoOpen, handleUndo: history.handleUndo, handleRedo: history.handleRedo,
    handleAdd: rowsApi.handleAdd, setPendingAddMultiple, handleInsert: rowsApi.handleInsert,
    handleDelete: structure.handleDelete, handleIndent: structure.handleIndent,
    handleOutdent: structure.handleOutdent, handleMove: structure.handleMove,
    setMeteringViewActive, setMeteringCaptureBaselineOpen, setMeteringEditBaselineOpen,
    setPendingMeteringDeleteBaseline,
  })

  const canUndo = historyEpoch >= 0 && historyStackRef.current.canUndo
  const canRedo = historyEpoch >= 0 && historyStackRef.current.canRedo
  const saveAsNewVersionCurrentVersion = isPractice
    ? practiceScopeId ? readCostPracticeVersion(workspaceId, practiceScopeId) : 0
    : isAllScope ? readSharedCostVersion(workspaceId) : readCostVersion(editingProject?.metadata)
  const saveAsNewVersionNextVersion =
    (isPractice
      ? practiceScopeId ? readMaxCostVersion(readCostPracticeSaveMeta(workspaceId, practiceScopeId)) : 0
      : isAllScope ? readMaxCostVersion(readSharedCostSaveMeta(workspaceId)) : readMaxCostVersion(editingProject?.metadata)) + 1

  return buildProjectCostTablePanelState({
    panelRootRef, tableScrollRef, headerPinInnerRef, hTrackRef, contextMenuRef, formulaInputRef,
    isPractice, isAllScope, editingProject, canEdit, practiceScopeId,
    totalPriceColumnLabel: selection.totalPriceColumnLabel, costColumnLabel: selection.costColumnLabel,
    rows, dirty, byId: view.byId, childrenByParentId: view.childrenByParentId,
    selectedRow: view.selectedRow, sectionalOptions: view.sectionalOptions,
    visibleRows: view.visibleRows, displayEntries: view.displayEntries,
    baselinePriceIndex: view.baselinePriceIndex, selectedId, setSelectedId, checkedIds, setCheckedIds,
    selectionMode, setSelectionMode, contextMenu, setContextMenu, columnMenu, columnVisibility,
    toggleColumnVisibility: selection.toggleColumnVisibility,
    openColumnVisibilityMenu: selection.openColumnVisibilityMenu, editingHeaderColumn, headerDraft,
    setHeaderDraft, headerInputRef, startHeaderEdit: selection.startHeaderEdit,
    commitHeaderEdit: selection.commitHeaderEdit, handleHeaderKeyDown: selection.handleHeaderKeyDown,
    handleRowContextMenu: selection.handleRowContextMenu, handleSelectAll: selection.handleSelectAll,
    handleClearSelection: selection.handleClearSelection, contextMenuDeleteIds: checkedIds,
    costQuotaView, setCostQuotaView, viewFilter, handleViewFilterChange: view.handleViewFilterChange,
    sectionFilter, handleSectionFilterChange: view.handleSectionFilterChange,
    isSummaryView: isCostSectionSummaryFilter(sectionFilter), canUndo, canRedo, saving, statusFeedback,
    versionSwitchEntries: version.versionSwitchEntries, practiceVersionEntries: menu.practiceVersionEntries,
    handleRestoreVersion: version.handleRestoreVersion,
    handleConfirmRestoreVersion: version.handleConfirmRestoreVersion, handleSave: save.handleSave,
    saveAsNewVersionCurrentVersion, saveAsNewVersionNextVersion, handleMenuAction: menu.handleMenuAction,
    handleFeaturesMenuAction: menu.handleFeaturesMenuAction, meteringViewActive, meteringBaselines,
    selectedMeteringBaselineId, setSelectedMeteringBaselineId, meteringRollupMode,
    handleMeteringRollupModeChange: metering.handleMeteringRollupModeChange,
    meteringCaptureBaselineOpen, setMeteringCaptureBaselineOpen, meteringEditBaselineOpen,
    setMeteringEditBaselineOpen, selectedMeteringBaseline: metering.selectedMeteringBaseline,
    nextMeteringCaptureBaselineIndex: metering.nextMeteringCaptureBaselineIndex,
    nextMeteringCaptureAsOfMs: metering.nextMeteringCaptureAsOfMs,
    nextMeteringCaptureBaselineName: metering.nextMeteringCaptureBaselineName,
    editMeteringBaselineNameIndex: metering.editMeteringBaselineNameIndex,
    editMeteringBaselineInitialDateMs: metering.editMeteringBaselineInitialDateMs,
    handleMeteringCaptureBaselineConfirm: metering.handleMeteringCaptureBaselineConfirm,
    handleMeteringEditBaselineConfirm: metering.handleMeteringEditBaselineConfirm,
    pendingMeteringDeleteBaseline, setPendingMeteringDeleteBaseline,
    handleConfirmMeteringDeleteBaseline: metering.handleConfirmMeteringDeleteBaseline,
    patchRow: edit.patchRow, patchSectionMeta: edit.patchSectionMeta, patchSummaryRow: edit.patchSummaryRow,
    handleRowTypeChange: edit.handleRowTypeChange, handleRowNameChange: edit.handleRowNameChange,
    handleRowUnitPriceChange: edit.handleRowUnitPriceChange, handleAdd: rowsApi.handleAdd,
    deleteIds: structure.deleteIds, pendingDelete, setPendingDelete, pendingRestoreVersion,
    setPendingRestoreVersion, pendingSaveAsNewVersion, setPendingSaveAsNewVersion, pendingAddMultiple,
    setPendingAddMultiple, pendingImportRows, setPendingImportRows,
    applyImportedRows: imported.applyImportedRows, projectInfoOpen, setProjectInfoOpen,
    totalFormulaFocusId, setTotalFormulaFocusId,
    appendSectionRefToActiveFormula: selection.appendSectionRefToActiveFormula,
    hScrollMetrics: scroll.hScrollMetrics, hScrollDragging: scroll.hScrollDragging,
    syncHScrollMetrics: scroll.syncHScrollMetrics, onHTrackPointerDown: scroll.onHTrackPointerDown,
  })
}

/** Shared shape passed to the sibling presentational components (Header / Body / Menus / Dialogs). */
export type ProjectCostTablePanelState = ReturnType<typeof useProjectCostTablePanel>

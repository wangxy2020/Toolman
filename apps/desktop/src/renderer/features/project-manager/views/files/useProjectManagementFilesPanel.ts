import { useEffect, useMemo, useRef, useState } from 'react'

import type { PmProject, Workspace } from '@toolman/shared'

import type { SystemPaths } from '../../../chat/useSystemPaths'
import { useI18n } from '../../../../i18n/useI18n'
import { usePmStatusFeedback } from '../../usePmStatusFeedback'
import { loadCostColumnVisibility } from '../cost/pm-cost-column-prefs'
import { loadGanttUiPrefs } from '../schedule/pm-gantt-prefs'
import { isPmFeatureCostPrimaryType, isPmFeatureType, PM_FEATURE_APPLICABLE_ALL, type PmFeatureRow, type PmFeatureType, type PmFeatureViewFilter } from './pm-features-catalog'
import { loadFeaturesColumnVisibility } from './pm-features-column-prefs'
import type { FeaturesScheduleView } from './ProjectFeaturesMenuBar'
import { useProjectManagementFilesCatalog } from './useProjectManagementFilesCatalog'
import { useProjectManagementFilesHydrate } from './useProjectManagementFilesHydrate'
import { useProjectManagementFilesMenu } from './useProjectManagementFilesMenu'
import { useProjectManagementFilesPrint } from './useProjectManagementFilesPrint'
import { useProjectManagementFilesRollups } from './useProjectManagementFilesRollups'
import { useProjectManagementFilesRows } from './useProjectManagementFilesRows'
import { useProjectManagementFilesSave } from './useProjectManagementFilesSave'
import { useProjectManagementFilesScroll } from './useProjectManagementFilesScroll'
import { useProjectManagementFilesSeeds } from './useProjectManagementFilesSeeds'
import { useProjectManagementFilesVersion } from './useProjectManagementFilesVersion'
import { buildProjectManagementFilesPanelState } from './useProjectManagementFilesState'

export interface ProjectManagementFilesPanelProps {
  workspaceId: string
  workspace: Workspace | null
  systemPaths: SystemPaths | null
  projects: PmProject[]
  selectedProjectId: string | null
  onOpenScheduleView?: (view: FeaturesScheduleView) => void
  onProjectsChange?: () => void
  lockedViewFilter?: PmFeatureViewFilter
  embedded?: boolean
  onEmbeddedSelectionChange?: (hasSelection: boolean) => void
}

export type ProjectManagementFilesPanelState = ReturnType<typeof useProjectManagementFilesPanel>

export function useProjectManagementFilesPanel({
  workspaceId,
  projects,
  selectedProjectId,
  onOpenScheduleView,
  onProjectsChange,
  lockedViewFilter,
  embedded = false,
  onEmbeddedSelectionChange,
}: ProjectManagementFilesPanelProps) {
  const { t } = useI18n()
  const [scheduleView, setScheduleView] = useState<FeaturesScheduleView>(() => loadGanttUiPrefs().scheduleView)
  const isAllScope = !selectedProjectId || !projects.some((project) => project.id === selectedProjectId)
  const editingProject = useMemo(() => {
    if (isAllScope) return null
    return projects.find((project) => project.id === selectedProjectId) ?? null
  }, [isAllScope, projects, selectedProjectId])
  const viewApplicable = isAllScope ? PM_FEATURE_APPLICABLE_ALL : (editingProject?.id ?? PM_FEATURE_APPLICABLE_ALL)
  const canEdit = isAllScope || editingProject != null
  const scopeKey = isAllScope ? PM_FEATURE_APPLICABLE_ALL : (editingProject?.id ?? '')
  const showTrailingMenus = lockedViewFilter == null

  const [rows, setRows] = useState<PmFeatureRow[]>([])
  const [dirty, setDirty] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ left: number; top: number } | null>(null)
  const [columnMenu, setColumnMenu] = useState<{ left: number; top: number } | null>(null)
  const [columnVisibility, setColumnVisibility] = useState(() => loadFeaturesColumnVisibility())
  const [meteringColumnVisibility, setMeteringColumnVisibility] = useState(() => loadCostColumnVisibility())
  const [pendingDelete, setPendingDelete] = useState(false)
  const [pendingRestoreVersion, setPendingRestoreVersion] = useState<number | null>(null)
  const [pendingSaveAsNewVersion, setPendingSaveAsNewVersion] = useState(false)
  const [statusFeedback, setStatusFeedback] = usePmStatusFeedback()
  const [saving, setSaving] = useState(false)
  const [projectInfoOpen, setProjectInfoOpen] = useState(false)
  const [, setDraftType] = useState<PmFeatureType>('labor')
  const [viewFilter, setViewFilter] = useState<PmFeatureViewFilter>(() => lockedViewFilter ?? 'scheduleAll')
  const [matrixLayout, setMatrixLayout] = useState<'horizontal' | 'vertical'>('horizontal')
  const rowsRef = useRef<PmFeatureRow[]>([])
  rowsRef.current = rows
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const headerPinInnerRef = useRef<HTMLDivElement | null>(null)
  const hTrackRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (lockedViewFilter == null) return
    setViewFilter(lockedViewFilter)
    if (lockedViewFilter !== 'scheduleAll' && isPmFeatureType(lockedViewFilter)) {
      setDraftType(lockedViewFilter)
    }
  }, [lockedViewFilter])

  useEffect(() => {
    if (!embedded) return
    onEmbeddedSelectionChange?.(selectedId != null || checkedIds.size > 0)
  }, [checkedIds.size, embedded, onEmbeddedSelectionChange, selectedId])

  const seeds = useProjectManagementFilesSeeds({
    workspaceId, projects, isAllScope, editingProject, scopeKey,
  })
  useProjectManagementFilesHydrate({
    workspaceId, isAllScope, dirty, editingProject, scopeKey, ganttSeeds: seeds.ganttSeeds,
    costSeeds: seeds.costSeeds, procurementSeeds: seeds.procurementSeeds, nodeSeeds: seeds.nodeSeeds,
    assignableResourceCatalog: seeds.assignableResourceCatalog, setRows, onProjectsChange,
  })
  const catalog = useProjectManagementFilesCatalog({
    viewApplicable, editingProject, ganttSeeds: seeds.ganttSeeds, costSeeds: seeds.costSeeds,
    procurementSeeds: seeds.procurementSeeds, nodeSeeds: seeds.nodeSeeds,
    assignableResourceCatalog: seeds.assignableResourceCatalog, setRows, setDirty,
  })
  const rollups = useProjectManagementFilesRollups({
    workItems: seeds.workItems, rows, viewFilter, costCatalog: seeds.costCatalog,
    costSeeds: seeds.costSeeds, nodeSeeds: seeds.nodeSeeds, columnVisibility, meteringColumnVisibility,
    lockedViewFilter, embedded, t,
  })
  const version = useProjectManagementFilesVersion({
    workspaceId, isAllScope, editingProject, dirty, rows, pendingRestoreVersion,
    setPendingRestoreVersion, setSaving, setSelectedId, applyCatalogRows: catalog.applyCatalogRows,
    onProjectsChange, t,
  })
  const save = useProjectManagementFilesSave({
    workspaceId, isAllScope, canEdit, scopeKey, editingProject, projects, dirty, rows, rowsRef,
    applyCatalogRows: catalog.applyCatalogRows, onProjectsChange, setSaving, setDirty, setStatusFeedback,
    setSelectedId, setCheckedIds, setSelectionMode, setContextMenu, setColumnMenu, setProjectInfoOpen,
    setPendingRestoreVersion, setMatrixLayout, t,
  })
  const { handlePrint } = useProjectManagementFilesPrint({ editingProject, t })
  const selectedRow = selectedId ? (rollups.byId.get(selectedId) ?? null) : null
  const addType: PmFeatureType =
    viewFilter === 'scheduleAll'
      ? (selectedRow?.type ?? 'labor')
      : viewFilter === 'funds'
        ? selectedRow && isPmFeatureCostPrimaryType(selectedRow.type)
          ? selectedRow.type
          : 'comprehensive'
        : (viewFilter as PmFeatureType)
  const rowsApi = useProjectManagementFilesRows({
    canEdit, addType, viewApplicable, selectedId, setSelectedId, checkedIds, setCheckedIds,
    setSelectionMode, setPendingDelete, updateRows: catalog.updateRows,
    visibleRows: rollups.visibleRows,
  })
  const menu = useProjectManagementFilesMenu({
    lockedViewFilter, setDraftType, setViewFilter, setScheduleView, onOpenScheduleView,
    handleSave: save.handleSave, setPendingSaveAsNewVersion, handlePrint, setProjectInfoOpen,
    handleAdd: rowsApi.handleAdd, handleInsert: rowsApi.handleInsert, handleDelete: rowsApi.handleDelete,
    handleIndent: rowsApi.handleIndent, handleOutdent: rowsApi.handleOutdent, handleMove: rowsApi.handleMove,
    setContextMenu, setColumnMenu, setColumnVisibility, setMeteringColumnVisibility, columnMenu,
  })
  const scroll = useProjectManagementFilesScroll({
    tableScrollRef, headerPinInnerRef, hTrackRef, isMeteringCostView: rollups.isMeteringCostView,
    matrixLayout, meteringColumnVisibility, monthKeyCount: rollups.visibleMonthKeys.length,
    visibleRowCount: rollups.visibleRows.length,
  })
  const pendingDeleteIds =
    checkedIds.size > 0 ? checkedIds : selectedId ? new Set([selectedId]) : new Set<string>()

  return buildProjectManagementFilesPanelState({
    t, workspaceId, isAllScope, editingProject, canEdit, saving, rows, dirty, selectedId, setSelectedId,
    checkedIds, setCheckedIds, selectionMode, setSelectionMode, contextMenu, setContextMenu, columnMenu,
    columnVisibility, meteringColumnVisibility, meteringTotalPriceLabel: rollups.meteringTotalPriceLabel,
    pendingDelete, setPendingDelete, pendingRestoreVersion, setPendingRestoreVersion,
    pendingSaveAsNewVersion, setPendingSaveAsNewVersion, statusFeedback, projectInfoOpen, setProjectInfoOpen,
    matrixLayout, setMatrixLayout, byId: rollups.byId, isFundsView: rollups.isFundsView,
    isProcurementView: rollups.isProcurementView, isNodeView: rollups.isNodeView,
    isResourceStatView: rollups.isResourceStatView, visibleRows: rollups.visibleRows, selectedRow,
    selectedType: viewFilter, quantityFromGanttHint: rollups.quantityFromGanttHint,
    monthFromGanttHint: rollups.monthFromGanttHint, unitColumnLabel: rollups.unitColumnLabel,
    fundsEngineeringQuantityLabel: rollups.fundsEngineeringQuantityLabel,
    featureColumnLabel: rollups.featureColumnLabel, showQuantityColumn: rollups.showQuantityColumn,
    showPricingUnitColumn: rollups.showPricingUnitColumn, showUnitPriceColumn: rollups.showUnitPriceColumn,
    showTotalPriceColumn: rollups.showTotalPriceColumn, showMeteringMethodColumn: rollups.showMeteringMethodColumn,
    showPricingQuantityColumn: rollups.showPricingQuantityColumn,
    showPurchaseCycleColumn: rollups.showPurchaseCycleColumn,
    showTransportCycleColumn: rollups.showTransportCycleColumn, showUnitColumn: rollups.showUnitColumn,
    showFundsEngineeringQuantityColumn: rollups.showFundsEngineeringQuantityColumn,
    showTypeColumn: rollups.showTypeColumn, showNameColumn: rollups.showNameColumn,
    showDurationColumn: rollups.showDurationColumn, showStartColumn: rollups.showStartColumn,
    showFinishColumn: rollups.showFinishColumn, showPlannedPercentColumn: rollups.showPlannedPercentColumn,
    showRemarkColumn: rollups.showRemarkColumn, showTrailingMenus, lockedViewFilter, embedded,
    isMeteringCostView: rollups.isMeteringCostView, rollups: rollups.rollups, nodeRollups: rollups.nodeRollups,
    fundsDisplayEntries: rollups.fundsDisplayEntries, fundsTotals: rollups.fundsTotals,
    resourceStatTotals: rollups.resourceStatTotals, yearBands: rollups.yearBands,
    visibleYearBands: rollups.visibleYearBands, visibleMonthKeys: rollups.visibleMonthKeys,
    headerRowSpan: rollups.headerRowSpan, tableScrollRef, headerPinInnerRef, hTrackRef,
    hScrollMetrics: scroll.hScrollMetrics, hScrollDragging: scroll.hScrollDragging,
    syncHScrollMetrics: scroll.syncHScrollMetrics, onHTrackPointerDown: scroll.onHTrackPointerDown,
    versionSwitchEntries: version.versionSwitchEntries, handleRestoreVersion: version.handleRestoreVersion,
    handleConfirmRestoreVersion: version.handleConfirmRestoreVersion,
    handleScheduleViewChange: menu.handleScheduleViewChange, scheduleView,
    handleMenuAction: menu.handleMenuAction, flushAutoSave: save.flushAutoSave, patchRow: rowsApi.patchRow,
    handleRowContextMenu: menu.handleRowContextMenu, handleTableContextMenu: menu.handleTableContextMenu,
    openColumnVisibilityMenu: menu.openColumnVisibilityMenu, toggleColumnVisibility: menu.toggleColumnVisibility,
    toggleMeteringColumnVisibility: menu.toggleMeteringColumnVisibility, handleSelectAll: rowsApi.handleSelectAll,
    handleClearSelection: rowsApi.handleClearSelection, deleteIds: rowsApi.deleteIds, pendingDeleteIds,
    handleSave: save.handleSave,
  })
}

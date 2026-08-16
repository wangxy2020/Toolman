import type { Dispatch, SetStateAction } from 'react'

import type { useProjectScheduleGanttAssignments } from './useProjectScheduleGanttAssignments'
import type { useProjectScheduleGanttBaseline } from './useProjectScheduleGanttBaseline'
import type { useProjectScheduleGanttChrome } from './useProjectScheduleGanttChrome'
import type { useProjectScheduleGanttData } from './useProjectScheduleGanttData'
import type { useProjectScheduleGanttHistory } from './useProjectScheduleGanttHistory'
import type { useProjectScheduleGanttMenu } from './useProjectScheduleGanttMenu'
import type { useProjectScheduleGanttSave } from './useProjectScheduleGanttSave'
import type { useProjectScheduleGanttSelection } from './useProjectScheduleGanttSelection'
import type { useProjectScheduleGanttTasks } from './useProjectScheduleGanttTasks'
import type { useProjectScheduleGanttTree } from './useProjectScheduleGanttTree'
import type { useProjectScheduleGanttView } from './useProjectScheduleGanttView'

export function buildScheduleGanttPanelState(args: {
  workspaceId: string
  selectedProjectId: string | null
  onProjectsChange?: () => void | Promise<void>
  chrome: ReturnType<typeof useProjectScheduleGanttChrome>
  data: ReturnType<typeof useProjectScheduleGanttData>
  selection: ReturnType<typeof useProjectScheduleGanttSelection>
  history: ReturnType<typeof useProjectScheduleGanttHistory>
  tree: ReturnType<typeof useProjectScheduleGanttTree>
  assign: ReturnType<typeof useProjectScheduleGanttAssignments>
  view: ReturnType<typeof useProjectScheduleGanttView>
  save: ReturnType<typeof useProjectScheduleGanttSave>
  baselineUi: ReturnType<typeof useProjectScheduleGanttBaseline>
  menu: ReturnType<typeof useProjectScheduleGanttMenu>
  tasks: ReturnType<typeof useProjectScheduleGanttTasks>
  handleCommitCell: (itemId: string, field: string, rawValue: string) => Promise<void>
  pendingSaveAsNewVersion: boolean
  setPendingSaveAsNewVersion: Dispatch<SetStateAction<boolean>>
  pendingRestoreBaselineId: string | null
  setPendingRestoreBaselineId: Dispatch<SetStateAction<string | null>>
}) {
  const {
    workspaceId, selectedProjectId, onProjectsChange, chrome, data, selection, history, tree,
    assign, view, save, baselineUi, menu, tasks, handleCommitCell, pendingSaveAsNewVersion,
    setPendingSaveAsNewVersion, pendingRestoreBaselineId, setPendingRestoreBaselineId,
  } = args
  return {
    t: chrome.t,
    workspaceId,
    selectedProjectId,
    onProjectsChange,
    items: data.items,
    relations: data.relations,
    error: data.error,
    showLoadingPlaceholder: data.showLoadingPlaceholder,
    uiPrefs: chrome.uiPrefs,
    selectedProject: data.selectedProject,
    resourceCatalog: data.resourceCatalog,
    costCatalog: data.costCatalog,
    resourceColumnCatalog: data.resourceColumnCatalog,
    selectedId: selection.selectedId,
    setSelectedId: selection.setSelectedId,
    checkedIds: selection.checkedIds,
    panelRootRef: chrome.panelRootRef,
    gridScrollRef: chrome.gridScrollRef,
    chartScrollRef: chrome.chartScrollRef,
    chartHeaderScrollRef: chrome.chartHeaderScrollRef,
    chartPaneRef: chrome.chartPaneRef,
    builtinLabels: chrome.builtinLabels,
    treeRows: tree.treeRows,
    indexById: tree.indexById,
    criticalIds: tree.criticalIds,
    gridPrefs: view.gridPrefs,
    timeline: tree.timeline,
    dayHeaders: view.dayHeaders,
    headerHeight: tree.headerHeight,
    showYearRow: view.showYearRow,
    showMonthRow: view.showMonthRow,
    showWeekRow: view.showWeekRow,
    showDayRow: view.showDayRow,
    chartHeight: view.chartHeight,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    selectedTaskType: view.selectedTaskType,
    taskColors: view.taskColors,
    barStyleClass: view.barStyleClass,
    printTitle: view.printTitle,
    rootSelected: view.rootSelected,
    workItemCount: view.workItemCount,
    scheduleVersion: view.scheduleVersion,
    statusMessage: view.statusMessage,
    statusMetaParts: view.statusMetaParts,
    isListView: view.isListView,
    isResourceView: view.isResourceView,
    isCostView: view.isCostView,
    isProgressCheckView: view.isProgressCheckView,
    isChartView: view.isChartView,
    isFullWidthListLayout: view.isFullWidthListLayout,
    versionSwitchEntries: tree.versionSwitchEntries,
    userBaselines: tree.userBaselines,
    selectedBaselineId: data.selectedBaselineId,
    baselineCompareMode: data.baselineCompareMode,
    baseline: tree.baseline,
    baselineByItemId: tree.baselineByItemId,
    showGanttBaselineGhosts: tree.showGanttBaselineGhosts,
    showBaselineVariance: tree.showBaselineVariance,
    progressPercentById: tree.progressPercentById,
    progressLine: tree.progressLine,
    progressLineStatusDateLabel: tree.progressLineStatusDateLabel,
    shouldPercentAsOfMs: view.shouldPercentAsOfMs,
    gridBaselinePlanByItemId: view.gridBaselinePlanByItemId,
    printBaselineByItemId: view.printBaselineByItemId,
    getGanttRowContext: view.getGanttRowContext,
    projectInfoOpen: chrome.projectInfoOpen,
    setProjectInfoOpen: chrome.setProjectInfoOpen,
    pendingDeleteSelected: selection.pendingDeleteSelected,
    setPendingDeleteSelected: selection.setPendingDeleteSelected,
    pendingSaveAsNewVersion,
    setPendingSaveAsNewVersion,
    pendingRestoreBaselineId,
    setPendingRestoreBaselineId,
    pendingRestoreBaseline: save.pendingRestoreBaseline,
    pendingRestoreDisplayName: save.pendingRestoreDisplayName,
    captureBaselineOpen: baselineUi.captureBaselineOpen,
    setCaptureBaselineOpen: baselineUi.setCaptureBaselineOpen,
    editBaselineOpen: baselineUi.editBaselineOpen,
    setEditBaselineOpen: baselineUi.setEditBaselineOpen,
    editBaselineNameIndex: tree.editBaselineNameIndex,
    editBaselineInitialDateMs: tree.editBaselineInitialDateMs,
    nextCaptureAsOfMs: tree.nextCaptureAsOfMs,
    nextCaptureBaselineIndex: tree.nextCaptureBaselineIndex,
    nextCaptureBaselineName: tree.nextCaptureBaselineName,
    handleScheduleViewChange: menu.handleScheduleViewChange,
    handleSelectBaseline: menu.handleSelectBaseline,
    handleBaselineCompareModeChange: menu.handleBaselineCompareModeChange,
    handleResourceTypeFilterChange: menu.handleResourceTypeFilterChange,
    handleCostTypeFilterChange: menu.handleCostTypeFilterChange,
    handleMenuAction: menu.handleMenuAction,
    handleGridPrefsChange: menu.handleGridPrefsChange,
    handleCommitCell,
    handleToggleCollapse: selection.handleToggleCollapse,
    handleGridWheelScroll: chrome.handleGridWheelScroll,
    syncScroll: chrome.syncScroll,
    syncChartHorizontal: chrome.syncChartHorizontal,
    handleAssignResource: assign.handleAssignResource,
    handleReplaceResourceAssignments: assign.handleReplaceResourceAssignments,
    handleAssignCost: assign.handleAssignCost,
    handleReplaceCostAssignments: assign.handleReplaceCostAssignments,
    handleToggleChecked: selection.handleToggleChecked,
    handleSelectAllRows: tasks.handleSelectAllRows,
    handleClearRowSelection: selection.handleClearRowSelection,
    requestDeleteSelectedRows: tasks.requestDeleteSelectedRows,
    handleDeleteSelectedRows: tasks.handleDeleteSelectedRows,
    handleScheduleSave: save.handleScheduleSave,
    handleConfirmRestoreBaseline: save.handleConfirmRestoreBaseline,
    handleCaptureBaselineConfirm: baselineUi.handleCaptureBaselineConfirm,
    handleEditBaselineConfirm: baselineUi.handleEditBaselineConfirm,
  }
}

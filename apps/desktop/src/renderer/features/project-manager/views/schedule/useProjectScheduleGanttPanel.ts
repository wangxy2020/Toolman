import { useCallback, useState } from 'react'

import type { PmProject } from '@toolman/shared'

import { usePmStatusFeedback } from '../../usePmStatusFeedback'
import { useProjectScheduleGanttAssignments } from './useProjectScheduleGanttAssignments'
import { useProjectScheduleGanttBaseline } from './useProjectScheduleGanttBaseline'
import { useProjectScheduleGanttChrome } from './useProjectScheduleGanttChrome'
import { useProjectScheduleGanttCommit } from './useProjectScheduleGanttCommit'
import { useProjectScheduleGanttData } from './useProjectScheduleGanttData'
import { useProjectScheduleGanttHistory } from './useProjectScheduleGanttHistory'
import { useProjectScheduleGanttHydrate } from './useProjectScheduleGanttHydrate'
import { useProjectScheduleGanttMenu } from './useProjectScheduleGanttMenu'
import { useProjectScheduleGanttPrint } from './useProjectScheduleGanttPrint'
import { useProjectScheduleGanttSave } from './useProjectScheduleGanttSave'
import { useProjectScheduleGanttSelection } from './useProjectScheduleGanttSelection'
import { useProjectScheduleGanttTasks } from './useProjectScheduleGanttTasks'
import { useProjectScheduleGanttTree } from './useProjectScheduleGanttTree'
import { useProjectScheduleGanttView } from './useProjectScheduleGanttView'
import { buildScheduleGanttPanelState } from './useProjectScheduleGanttState'
import type { GanttUiPrefs } from './pm-gantt-prefs'

export interface UseProjectScheduleGanttPanelProps {
  workspaceId: string
  projects: PmProject[]
  selectedProjectId: string | null
  /** Bump to force reload after external plan apply. */
  dataRevision?: number
  onProjectsChange?: () => void | Promise<void>
}

export function useProjectScheduleGanttPanel({
  workspaceId,
  projects,
  selectedProjectId,
  dataRevision = 0,
  onProjectsChange,
}: UseProjectScheduleGanttPanelProps) {
  const [statusFeedback, setStatusFeedback] = usePmStatusFeedback()
  const [pendingSaveAsNewVersion, setPendingSaveAsNewVersion] = useState(false)
  const [pendingRestoreBaselineId, setPendingRestoreBaselineId] = useState<string | null>(null)

  const chrome = useProjectScheduleGanttChrome({
    selectedProjectId,
    projectCount: projects.length,
  })
  const data = useProjectScheduleGanttData({
          workspaceId,
    projects,
    selectedProjectId,
    dataRevision,
  })
  const selection = useProjectScheduleGanttSelection(selectedProjectId)
  const history = useProjectScheduleGanttHistory({
          workspaceId,
          selectedProjectId,
    dataRevision,
    items: data.items,
    relations: data.relations,
    itemsRef: data.itemsRef,
    relationsRef: data.relationsRef,
    loadProjectData: data.loadProjectData,
    panelRootRef: chrome.panelRootRef,
    projectInfoOpen: chrome.projectInfoOpen,
    pendingDeleteSelected: selection.pendingDeleteSelected,
    pendingRestoreBaselineId,
  })
  const tree = useProjectScheduleGanttTree({
    items: data.items,
    relations: data.relations,
    baselines: data.baselines,
    selectedProject: data.selectedProject,
    selectedBaselineId: data.selectedBaselineId,
    baselineCompareMode: data.baselineCompareMode,
    collapsedIds: selection.collapsedIds,
    freezeStoredSchedule: history.freezeStoredSchedule,
    chartPaneWidth: chrome.chartPaneWidth,
    uiPrefs: chrome.uiPrefs,
    t: chrome.t,
  })
  useProjectScheduleGanttHydrate({
    selectedProjectId,
    items: data.items,
    resourceCatalog: data.resourceCatalog,
    costCatalog: data.costCatalog,
    loadProjectData: data.loadProjectData,
  })
  const assign = useProjectScheduleGanttAssignments({
    selectedProjectId,
    items: data.items,
    setItems: data.setItems,
    uiPrefs: chrome.uiPrefs,
    setUiPrefs: chrome.setUiPrefs,
    loadProjectData: data.loadProjectData,
    captureHistoryBeforeChange: history.captureHistoryBeforeChange,
  })
  const handlePrefsChange = useCallback(
    (next: GanttUiPrefs) => {
      chrome.handlePrefsChange(next)
      assign.setResourceSlotFloor(next.resourceView.slotCount)
      assign.setCostSlotFloor(next.costView.slotCount)
    },
    [assign.setCostSlotFloor, assign.setResourceSlotFloor, chrome.handlePrefsChange],
  )
  const selectedItem =
    tree.treeRows.find((row) => row.item.id === selection.selectedId)?.item ?? null
  const { handleCommitCell } = useProjectScheduleGanttCommit({
            workspaceId,
    selectedProjectId,
    items: data.items,
    setItems: data.setItems,
    itemsRef: data.itemsRef,
    relations: data.relations,
    setBaselines: data.setBaselines,
    displayById: tree.displayById,
    idByIndex: tree.idByIndex,
    baselineByItemId: tree.baselineByItemId,
    showBaselineVariance: tree.showBaselineVariance,
    selectedBaselineId: data.selectedBaselineId,
    captureHistoryBeforeChange: history.captureHistoryBeforeChange,
    setFreezeStoredSchedule: history.setFreezeStoredSchedule,
    loadProjectData: data.loadProjectData,
    persistAutoSchedule: history.persistAutoSchedule,
  })
  const tasks = useProjectScheduleGanttTasks({
      workspaceId,
    selectedProjectId,
    items: data.items,
    relations: data.relations,
    forest: tree.forest,
    rowNumberById: tree.rowNumberById,
    treeRows: tree.treeRows,
    selectedItem,
    selectedId: selection.selectedId,
    setSelectedId: selection.setSelectedId,
    checkedIds: selection.checkedIds,
    setCheckedIds: selection.setCheckedIds,
    setPendingDeleteSelected: selection.setPendingDeleteSelected,
    captureHistoryBeforeChange: history.captureHistoryBeforeChange,
    loadProjectData: data.loadProjectData,
    lastScheduleFingerprintRef: history.lastScheduleFingerprintRef,
    t: chrome.t,
  })
  const { handlePrint } = useProjectScheduleGanttPrint({
    selectedProject: data.selectedProject,
    t: chrome.t,
  })
  const save = useProjectScheduleGanttSave({
    workspaceId,
      selectedProjectId,
    selectedProject: data.selectedProject,
    items: data.items,
    baselines: data.baselines,
    freezeStoredSchedule: history.freezeStoredSchedule,
    persistAutoSchedule: history.persistAutoSchedule,
    loadProjectData: data.loadProjectData,
    onProjectsChange,
    setFreezeStoredSchedule: history.setFreezeStoredSchedule,
    suppressAutoScheduleRef: history.suppressAutoScheduleRef,
    lastScheduleFingerprintRef: history.lastScheduleFingerprintRef,
    setSelectedBaselineId: data.setSelectedBaselineId,
      setStatusFeedback,
    t: chrome.t,
    pendingRestoreBaselineId,
    setPendingRestoreBaselineId,
  })
  const baselineUi = useProjectScheduleGanttBaseline({
      workspaceId,
    selectedProjectId,
    itemsRef: data.itemsRef,
    baselines: data.baselines,
    selectedBaselineId: data.selectedBaselineId,
    setSelectedBaselineId: data.setSelectedBaselineId,
    setBaselineCompareMode: data.setBaselineCompareMode,
    loadProjectData: data.loadProjectData,
    loading: data.loading,
    uiPrefs: chrome.uiPrefs,
    t: chrome.t,
  })
  const menu = useProjectScheduleGanttMenu({
              workspaceId,
    selectedProjectId,
    selectedBaselineId: data.selectedBaselineId,
    baselineCompareMode: data.baselineCompareMode,
    setSelectedBaselineId: data.setSelectedBaselineId,
    setBaselineCompareMode: data.setBaselineCompareMode,
    uiPrefs: chrome.uiPrefs,
    handlePrefsChange,
    handleScheduleSave: save.handleScheduleSave,
    setPendingSaveAsNewVersion,
    handlePrint,
    setProjectInfoOpen: chrome.setProjectInfoOpen,
    handleUndo: history.handleUndo,
    handleRedo: history.handleRedo,
    handleCreateTask: tasks.handleCreateTask,
    handleInsertTask: tasks.handleInsertTask,
    handleDeleteTask: tasks.handleDeleteTask,
    handleIndent: tasks.handleIndent,
    handleOutdent: tasks.handleOutdent,
    handleSetTaskType: tasks.handleSetTaskType,
    handleMove: tasks.handleMove,
    setCaptureBaselineOpen: baselineUi.setCaptureBaselineOpen,
    setEditBaselineOpen: baselineUi.setEditBaselineOpen,
    loadProjectData: data.loadProjectData,
    t: chrome.t,
  })
  const view = useProjectScheduleGanttView({
              workspaceId,
    selectedProjectId,
    selectedProject: data.selectedProject,
    items: data.items,
    uiPrefs: chrome.uiPrefs,
    t: chrome.t,
    selectedId: selection.selectedId,
    checkedIds: selection.checkedIds,
    treeRows: tree.treeRows,
    criticalIds: tree.criticalIds,
    timeline: tree.timeline,
    maxResourceAssignmentSlots: assign.maxResourceAssignmentSlots,
    maxCostAssignmentSlots: assign.maxCostAssignmentSlots,
    resourceSlotFloor: assign.resourceSlotFloor,
    costSlotFloor: assign.costSlotFloor,
    baseline: tree.baseline,
    baselineByItemId: tree.baselineByItemId,
    showBaselineVariance: tree.showBaselineVariance,
    showGanttBaselineGhosts: tree.showGanttBaselineGhosts,
    progressPercentById: tree.progressPercentById,
    statusFeedback,
  })

  return buildScheduleGanttPanelState({
    workspaceId,
    selectedProjectId,
    onProjectsChange,
    chrome,
    data,
    selection,
    history,
    tree,
    assign,
    view,
    save,
    baselineUi,
    menu,
    tasks,
    handleCommitCell,
    pendingSaveAsNewVersion,
    setPendingSaveAsNewVersion,
    pendingRestoreBaselineId,
    setPendingRestoreBaselineId,
  })

}

/** Shared bag of state/handlers threaded into the presentational sub-components. */
export type ScheduleGanttPanelState = ReturnType<typeof useProjectScheduleGanttPanel>

import type { GanttMenuAction } from './ProjectGanttMenuBar'
import type { GanttAssignTypeFilter, GanttScheduleView, GanttUiPrefs } from './pm-gantt-prefs'
import { withGanttDefaultPredecessorsColumn } from './pm-gantt-prefs'
import { useCallback } from 'react'
import { useI18n } from '../../../../i18n/useI18n'
import { pmApi } from '../../pm-api'
import { pmScheduleApi } from './pm-schedule-api'
import type { BaselineCompareMode } from './pm-gantt-baseline-compare'

export function useProjectScheduleGanttMenu(args: {
  workspaceId: string
  selectedProjectId: string | null
  selectedBaselineId: string | null
  baselineCompareMode: BaselineCompareMode
  setSelectedBaselineId: (id: string | null) => void
  setBaselineCompareMode: (mode: BaselineCompareMode) => void
  uiPrefs: GanttUiPrefs
  handlePrefsChange: (next: GanttUiPrefs) => void
  handleScheduleSave: () => Promise<void>
  setPendingSaveAsNewVersion: (v: boolean) => void
  handlePrint: () => void
  setProjectInfoOpen: (v: boolean) => void
  handleUndo: () => Promise<void>
  handleRedo: () => Promise<void>
  handleCreateTask: (afterId: string | null) => Promise<void>
  handleInsertTask: () => Promise<void>
  handleDeleteTask: () => Promise<void>
  handleIndent: () => Promise<void>
  handleOutdent: () => Promise<void>
  handleSetTaskType: (type: 'task' | 'milestone') => Promise<void>
  handleMove: (direction: -1 | 1) => Promise<void>
  setCaptureBaselineOpen: (v: boolean) => void
  setEditBaselineOpen: (v: boolean) => void
  loadProjectData: (projectId: string | null) => Promise<unknown>
  t: ReturnType<typeof useI18n>['t']
}) {
  const {
    workspaceId, selectedProjectId, selectedBaselineId, baselineCompareMode,
    setSelectedBaselineId, setBaselineCompareMode, uiPrefs, handlePrefsChange,
    handleScheduleSave, setPendingSaveAsNewVersion, handlePrint, setProjectInfoOpen,
    handleUndo, handleRedo, handleCreateTask, handleInsertTask, handleDeleteTask,
    handleIndent, handleOutdent, handleSetTaskType, handleMove, setCaptureBaselineOpen,
    setEditBaselineOpen, loadProjectData, t,
  } = args

  const handleScheduleViewChange = useCallback(
    (scheduleView: GanttScheduleView) => {
      let next: GanttUiPrefs = { ...uiPrefs, scheduleView }
      // Gantt chart view defaults to showing 前置任务 when entering that view.
      if (scheduleView === 'gantt') {
        next = withGanttDefaultPredecessorsColumn(next)
      }
      handlePrefsChange(next)
    },
    [handlePrefsChange, uiPrefs],
  )

  const handleSelectBaseline = useCallback(
    (id: string | null) => {
      setSelectedBaselineId(id)
      if (id == null) setBaselineCompareMode('none')
      else if (baselineCompareMode === 'none') setBaselineCompareMode('gantt')
    },
    [baselineCompareMode],
  )

  const handleBaselineCompareModeChange = useCallback((mode: BaselineCompareMode) => {
    setBaselineCompareMode(mode)
    if (mode === 'none') setSelectedBaselineId(null)
  }, [])

  const handleResourceTypeFilterChange = useCallback(
    (filter: GanttAssignTypeFilter) => {
      handlePrefsChange({
        ...uiPrefs,
        scheduleView: 'resource',
        resourceView: { ...uiPrefs.resourceView, typeFilter: filter },
      })
    },
    [handlePrefsChange, uiPrefs],
  )

  const handleCostTypeFilterChange = useCallback(
    (filter: GanttAssignTypeFilter) => {
      handlePrefsChange({
        ...uiPrefs,
        scheduleView: 'cost',
        costView: { ...uiPrefs.costView, typeFilter: filter },
      })
    },
    [handlePrefsChange, uiPrefs],
  )

  const isProgressCheckView = uiPrefs.scheduleView === 'progressCheck'

  const handleGridPrefsChange = useCallback(
    (next: GanttUiPrefs) => {
      if (isProgressCheckView) {
        handlePrefsChange({ ...next, columnOrder: uiPrefs.columnOrder })
        return
      }
      handlePrefsChange(next)
    },
    [handlePrefsChange, isProgressCheckView, uiPrefs.columnOrder],
  )
  const handleMenuAction = (action: GanttMenuAction) => {
    void (async () => {
      const structureLocked = uiPrefs.scheduleView === 'resource'
      const structureActions = new Set<GanttMenuAction>([
        'newTask',
        'insertTask',
        'deleteTask',
        'indent',
        'outdent',
        'setTask',
        'setMilestone',
        'moveUp',
        'moveDown',
        'captureBaseline',
        'editBaseline',
        'deleteBaseline',
      ])
      if (structureLocked && structureActions.has(action)) return

      switch (action) {
        case 'save':
          await handleScheduleSave()
          break
        case 'saveAsNewVersion':
          setPendingSaveAsNewVersion(true)
          break
        case 'print':
          handlePrint()
          break
        case 'projectInfo':
          if (selectedProjectId) setProjectInfoOpen(true)
          break
        case 'link':
          break
        case 'undo':
          await handleUndo()
          break
        case 'redo':
          await handleRedo()
          break
        case 'newTask':
          await handleCreateTask(null)
          break
        case 'insertTask':
          await handleInsertTask()
          break
        case 'deleteTask':
          await handleDeleteTask()
          break
        case 'indent':
          await handleIndent()
          break
        case 'outdent':
          await handleOutdent()
          break
        case 'setTask':
          await handleSetTaskType('task')
          break
        case 'setMilestone':
          await handleSetTaskType('milestone')
          break
        case 'moveUp':
          await handleMove(-1)
          break
        case 'moveDown':
          await handleMove(1)
          break
        case 'captureBaseline':
          if (!selectedProjectId) break
          setCaptureBaselineOpen(true)
          break
        case 'editBaseline':
          if (!selectedBaselineId || !selectedProjectId) break
          setEditBaselineOpen(true)
          break
        case 'deleteBaseline':
          if (!selectedBaselineId || !selectedProjectId) break
          try {
            await pmScheduleApi.deleteBaseline(selectedBaselineId)
            setSelectedBaselineId(null)
            setBaselineCompareMode('none')
            await loadProjectData(selectedProjectId)
          } catch (err) {
            window.alert(err instanceof Error ? err.message : String(err))
          }
          break
        case 'openResource':
          handlePrefsChange({ ...uiPrefs, scheduleView: 'resource' })
          break
        case 'openCost':
          handlePrefsChange({ ...uiPrefs, scheduleView: 'cost' })
          break
        case 'autoAssignResource': {
          if (!selectedProjectId) break
          try {
            const result = await pmApi.smartAssignWorkItems({
              workspaceId,
              projectId: selectedProjectId,
              kind: 'resource',
            })
            await loadProjectData(selectedProjectId)
            window.alert(
              t('projectManagerPage.agent.smartAssignResourceDone', {
                count: result.updatedCount,
              }),
            )
          } catch (err) {
            window.alert(err instanceof Error ? err.message : String(err))
          }
          break
        }
        case 'autoAssignCost': {
          if (!selectedProjectId) break
          try {
            const result = await pmApi.smartAssignWorkItems({
              workspaceId,
              projectId: selectedProjectId,
              kind: 'cost',
            })
            await loadProjectData(selectedProjectId)
            window.alert(
              t('projectManagerPage.agent.smartAssignCostDone', {
                count: result.updatedCount,
              }),
            )
          } catch (err) {
            window.alert(err instanceof Error ? err.message : String(err))
          }
          break
        }
        case 'openAnalysis':
          window.alert(t('projectManagerPage.schedule.analysisComingSoon'))
          break
      }
    })()
  }

  return {
    handleScheduleViewChange,
    handleSelectBaseline,
    handleBaselineCompareModeChange,
    handleResourceTypeFilterChange,
    handleCostTypeFilterChange,
    isProgressCheckView,
    handleGridPrefsChange,
    handleMenuAction,
  }
}

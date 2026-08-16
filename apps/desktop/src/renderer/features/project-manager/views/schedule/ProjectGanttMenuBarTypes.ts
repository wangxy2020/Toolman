import type { ReactNode } from 'react'

import type { BaselineCompareMode } from './pm-gantt-baseline-compare'
import type { GanttAssignTypeFilter, GanttScheduleView } from './pm-gantt-prefs'

export type GanttMenuAction =
  | 'save'
  | 'saveAsNewVersion'
  | 'print'
  | 'projectInfo'
  | 'link'
  | 'undo'
  | 'redo'
  | 'newTask'
  | 'insertTask'
  | 'deleteTask'
  | 'indent'
  | 'outdent'
  | 'setTask'
  | 'setMilestone'
  | 'moveUp'
  | 'moveDown'
  | 'captureBaseline'
  | 'editBaseline'
  | 'deleteBaseline'
  | 'openResource'
  | 'openCost'
  | 'autoAssignResource'
  | 'autoAssignCost'
  | 'openAnalysis'

export type GanttLeafTaskType = 'task' | 'milestone'

export type GanttVersionSwitchEntry = {
  version: number
  name: string
  baselineId: string | null
  isCurrent: boolean
}

export type GanttMenuItem = {
  key: GanttMenuAction
  title: string
  label: ReactNode
  disabled?: boolean
  dividerAfter?: boolean
  icon?: boolean
}

export interface ProjectGanttMenuBarProps {
  disabled?: boolean
  hasSelection: boolean
  hasProject?: boolean
  canUndo?: boolean
  canRedo?: boolean
  canSetTaskType: boolean
  selectedTaskType: GanttLeafTaskType
  scheduleView: GanttScheduleView
  onScheduleViewChange: (view: GanttScheduleView) => void
  resourceTypeFilter?: GanttAssignTypeFilter
  costTypeFilter?: GanttAssignTypeFilter
  onResourceTypeFilterChange?: (filter: GanttAssignTypeFilter) => void
  onCostTypeFilterChange?: (filter: GanttAssignTypeFilter) => void
  baselines: Array<{
    id: string
    name: string
    createdAt: number
    capturedAt: number
    asOfDate?: number
  }>
  selectedBaselineId: string | null
  onSelectBaseline: (id: string | null) => void
  baselineCompareMode: BaselineCompareMode
  onBaselineCompareModeChange: (mode: BaselineCompareMode) => void
  versionSwitchEntries: GanttVersionSwitchEntry[]
  onRestoreBaseline: (id: string) => void
  onAction: (action: GanttMenuAction) => void
}

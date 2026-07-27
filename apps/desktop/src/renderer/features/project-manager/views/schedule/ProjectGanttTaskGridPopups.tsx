import type { FC } from 'react'

import { ProjectGanttColumnMenuPopup } from './ProjectGanttColumnMenuPopup'
import { ProjectGanttCostAssignPopup } from './ProjectGanttCostAssignPopup'
import { ProjectGanttCostNamePickerPopup } from './ProjectGanttCostNamePickerPopup'
import { ProjectGanttResourceAssignPopup } from './ProjectGanttResourceAssignPopup'
import { ProjectGanttResourceCellPickerPopup } from './ProjectGanttResourceCellPickerPopup'
import { ProjectGanttRowMenuPopup } from './ProjectGanttRowMenuPopup'
import type { Props } from './pm-gantt-task-grid-utils'
import type { GanttTaskGridState } from './useProjectGanttTaskGrid'

export interface ProjectGanttTaskGridPopupsProps {
  gridProps: Props
  state: GanttTaskGridState
}

/**
 * Thin composer: portal-rendered popups split into focused siblings — column menu, row menu,
 * resource/cost assign popups, and cascade pickers (resource cell / cost name).
 */
export const ProjectGanttTaskGridPopups: FC<ProjectGanttTaskGridPopupsProps> = ({
  gridProps,
  state,
}) => {
  return (
    <>
      <ProjectGanttColumnMenuPopup gridProps={gridProps} state={state} />
      <ProjectGanttRowMenuPopup gridProps={gridProps} state={state} />
      <ProjectGanttResourceAssignPopup gridProps={gridProps} state={state} />
      <ProjectGanttCostAssignPopup gridProps={gridProps} state={state} />
      <ProjectGanttResourceCellPickerPopup gridProps={gridProps} state={state} />
      <ProjectGanttCostNamePickerPopup gridProps={gridProps} state={state} />
    </>
  )
}

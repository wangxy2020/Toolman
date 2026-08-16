import type { GanttTreeRow } from './pm-gantt-tree'
import type { Props } from './pm-gantt-task-grid-utils'
import type { GanttTaskGridState } from './useProjectGanttTaskGrid'

export type BodyCellRenderArgs = {
  row: GanttTreeRow
  field: string
  gridProps: Props
  state: GanttTaskGridState
}

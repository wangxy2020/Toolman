import type { FC } from 'react'

import { handlePmTableCellNavKeyDown } from '../../pm-table-cell-nav'
import type { Props } from './pm-gantt-task-grid-utils'
import type { GanttTaskGridState } from './useProjectGanttTaskGrid'
import { ProjectGanttTaskGridBodyRow } from './ProjectGanttTaskGridBodyRow'

export interface ProjectGanttTaskGridBodyProps {
  gridProps: Props
  state: GanttTaskGridState
}

/** Scrollable rows: builtin / resource / cost cell rendering, plus row-level context menu. */
export const ProjectGanttTaskGridBody: FC<ProjectGanttTaskGridBodyProps> = ({
  gridProps,
  state,
}) => {
  const { rows, gridScrollRef, onScroll } = gridProps
  const { handleWheel } = state

  return (
    <div
      ref={gridScrollRef}
      className="tm-pm-gantt-grid-body"
      onScroll={onScroll}
      onWheel={handleWheel}
      onKeyDown={(event) => {
        handlePmTableCellNavKeyDown(event)
      }}
    >
      {rows.map((row) => (
        <ProjectGanttTaskGridBodyRow
          key={row.item.id}
          row={row}
          gridProps={gridProps}
          state={state}
        />
      ))}
    </div>
  )
}

import type { FC } from 'react'

import { ProjectGanttTaskGridBody } from './ProjectGanttTaskGridBody'
import { ProjectGanttTaskGridHeader } from './ProjectGanttTaskGridHeader'
import { ProjectGanttTaskGridPopups } from './ProjectGanttTaskGridPopups'
import type { Props } from './pm-gantt-task-grid-utils'
import { useProjectGanttTaskGrid } from './useProjectGanttTaskGrid'

export type {
  GanttColumnKey,
  GanttEditableField,
  GanttColumnLabels,
} from './pm-gantt-task-grid-utils'

/**
 * Thin orchestrator: owns no rendering logic of its own — all state/handlers live in
 * `useProjectGanttTaskGrid`, all presentational JSX lives in the sibling `ProjectGanttTaskGrid*`
 * components (Header / Body / Popups).
 */
export const ProjectGanttTaskGrid: FC<Props> = (props) => {
  const { listView = false } = props
  const state = useProjectGanttTaskGrid(props)
  const { hScrollMetrics, hScrollDragging, hScrollRef, hTrackRef, headerPinInnerRef, syncHScrollMetrics, onHTrackPointerDown } =
    state

  return (
    <div
      className={[
        'tm-pm-gantt-grid-pane',
        hScrollMetrics.overflowing ? 'tm-pm-gantt-grid-pane--h-overflow' : '',
        hScrollDragging ? 'tm-pm-gantt-grid-pane--h-dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}>
      {/*
        Full-list: headers pinned above V scroll; H position synced via transform.
        Native H stays hidden (custom track only).
      */}
      {listView ? (
        <div className="tm-pm-gantt-grid-header-pin">
          <div ref={headerPinInnerRef} className="tm-pm-gantt-grid-header-pin-inner">
            <ProjectGanttTaskGridHeader gridProps={props} state={state} />
          </div>
        </div>
      ) : null}
      <div className="tm-pm-gantt-grid-vscroll">
        <div
          ref={hScrollRef}
          className="tm-pm-gantt-grid-hscroll"
          onScroll={() => syncHScrollMetrics()}>
          <div className="tm-pm-gantt-grid-inner">
            {listView ? null : <ProjectGanttTaskGridHeader gridProps={props} state={state} />}
            <ProjectGanttTaskGridBody gridProps={props} state={state} />
          </div>
        </div>
      </div>

      {hScrollMetrics.overflowing ? (
        <div
          ref={hTrackRef}
          className="tm-pm-gantt-grid-custom-hscroll"
          role="scrollbar"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(hScrollMetrics.thumbOffset * 100)}
          onPointerDown={onHTrackPointerDown}>
          <div
            className="tm-pm-gantt-grid-custom-hscroll-thumb"
            style={{
              width: `${hScrollMetrics.thumbSize * 100}%`,
              left: `${hScrollMetrics.thumbOffset * 100}%`,
            }}
          />
        </div>
      ) : null}

      <ProjectGanttTaskGridPopups gridProps={props} state={state} />
    </div>
  )
}

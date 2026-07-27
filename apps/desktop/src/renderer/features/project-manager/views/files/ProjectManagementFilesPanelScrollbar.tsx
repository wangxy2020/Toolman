import type { FC } from 'react'

import type { ProjectManagementFilesPanelState } from './useProjectManagementFilesPanel'

export interface ProjectManagementFilesPanelScrollbarProps {
  state: ProjectManagementFilesPanelState
}

/** Custom horizontal scrollbar track/thumb (native H bar stays hidden on the table scroller). */
export const ProjectManagementFilesPanelScrollbar: FC<ProjectManagementFilesPanelScrollbarProps> = ({
  state,
}) => {
  const { hScrollMetrics, hTrackRef, tableScrollRef, onHTrackPointerDown } = state

  if (!hScrollMetrics.overflowing) return null

  return (
    <div
      ref={hTrackRef}
      className="tm-pm-gantt-grid-custom-hscroll"
      onPointerDown={onHTrackPointerDown}
      role="scrollbar"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(
        (hScrollMetrics.thumbOffset /
          Math.max(1, (tableScrollRef.current?.clientWidth ?? 1) - hScrollMetrics.thumbSize)) *
          100,
      )}
    >
      <div
        className="tm-pm-gantt-grid-custom-hscroll-thumb"
        style={{
          width: `${hScrollMetrics.thumbSize}px`,
          left: `${hScrollMetrics.thumbOffset}px`,
        }}
      />
    </div>
  )
}

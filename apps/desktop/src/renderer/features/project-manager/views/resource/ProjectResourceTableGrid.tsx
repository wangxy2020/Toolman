import type { FC } from 'react'

import { handlePmTableCellNavKeyDown } from '../../pm-table-cell-nav'
import { ProjectResourceTableColgroup } from './ProjectResourceTableColgroup'
import { ProjectResourceTableHeader } from './ProjectResourceTableHeader'
import { ProjectResourceTableRow } from './ProjectResourceTableRow'
import type { ProjectResourceTablePanelState } from './useProjectResourceTablePanel'

export interface ProjectResourceTableGridProps {
  state: ProjectResourceTablePanelState
}

/** The resource table itself: pinned header, scrollable body rows, and the custom H scrollbar. */
export const ProjectResourceTableGrid: FC<ProjectResourceTableGridProps> = ({ state }) => {
  const {
    t,
    canEdit,
    visibleRows,
    tableScrollRef,
    hTrackRef,
    hScrollMetrics,
    hScrollDragging,
    syncHScrollMetrics,
    onHTrackPointerDown,
  } = state

  if (!canEdit) {
    return (
      <div className="tm-pm-empty">{t('projectManagerPage.resourceTable.needProject')}</div>
    )
  }

  return (
    <div
      className={[
        'tm-pm-resource-table-scroll-wrap',
        hScrollMetrics.overflowing ? 'tm-pm-resource-table-scroll-wrap--h-overflow' : '',
        hScrollDragging ? 'tm-pm-resource-table-scroll-wrap--h-dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <ProjectResourceTableHeader state={state} />
      <div
        ref={tableScrollRef}
        className="tm-pm-resource-table-scroll"
        onScroll={() => syncHScrollMetrics()}
        onWheel={(event) => {
          // overflow-x is hidden (no native H bar), so route trackpad deltaX manually.
          if (event.deltaX !== 0 && tableScrollRef.current) {
            tableScrollRef.current.scrollLeft += event.deltaX
          }
        }}
      >
        <div className="tm-pm-resource-table-scroll-inner">
          <table
            className="tm-pm-resource-table"
            onKeyDown={(event) => {
              handlePmTableCellNavKeyDown(event)
            }}
          >
            <ProjectResourceTableColgroup state={state} />
            <tbody>
              {visibleRows.map((row, index) => (
                <ProjectResourceTableRow key={row.id} state={state} row={row} index={index} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {hScrollMetrics.overflowing ? (
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
              Math.max(
                1,
                (tableScrollRef.current?.clientWidth ?? 1) - hScrollMetrics.thumbSize,
              )) *
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
      ) : null}
    </div>
  )
}

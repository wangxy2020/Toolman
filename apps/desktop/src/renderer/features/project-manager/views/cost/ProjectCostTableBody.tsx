import { useLayoutEffect, type FC } from 'react'

import { handlePmTableCellNavKeyDown } from '../../pm-table-cell-nav'
import { ProjectCostTableColGroup } from './ProjectCostTableColGroup'
import { ProjectCostTableBodyRows } from './ProjectCostTableBodyRows'
import type { ProjectCostTablePanelState } from './useProjectCostTablePanel'

export interface ProjectCostTableBodyProps {
  state: ProjectCostTablePanelState
}

/** Scrollable table body: 汇总/分部 summary rows plus editable cost rows. */
export const ProjectCostTableBody: FC<ProjectCostTableBodyProps> = ({ state }) => {
  const { tableScrollRef, columnVisibility, syncHScrollMetrics, autoColWidths } = state

  useLayoutEffect(() => {
    syncHScrollMetrics()
  }, [autoColWidths, syncHScrollMetrics])

  return (
    <div
      ref={tableScrollRef}
      className="tm-pm-resource-table-scroll"
      onScroll={() => syncHScrollMetrics()}
      onWheel={(event) => {
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
          <ProjectCostTableColGroup
            columnVisibility={columnVisibility}
            showMeteringColumns={state.showMeteringColumns}
            showIpcStatementColumns={state.showIpcStatementColumns}
            ipcColumns={state.ipcColumns}
            autoColWidths={state.autoColWidths}
          />
          <ProjectCostTableBodyRows state={state} />
        </table>
      </div>
    </div>
  )
}

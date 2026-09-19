import type { FC } from 'react'

import { ProjectCostTableSummaryRow } from './ProjectCostTableSummaryRow'
import { ProjectCostTableDataRow } from './ProjectCostTableDataRow'
import { countCostTableColumns } from './pm-cost-table-window'
import { useCostTableWindow } from './useCostTableWindow'
import type { ProjectCostTablePanelState } from './useProjectCostTablePanel'

type Props = {
  state: ProjectCostTablePanelState
}

export const ProjectCostTableBodyRows: FC<Props> = ({ state }) => {
  const {
    displayEntries,
    tableScrollRef,
    columnVisibility,
    rowHeights,
    showMeteringColumns,
    showIpcStatementColumns,
    ipcColumns,
  } = state
  const windowRange = useCostTableWindow(
    tableScrollRef,
    displayEntries.length,
    true,
    rowHeights,
  )
  const colCount = countCostTableColumns(columnVisibility, {
    showMeteringColumns,
    ipcColumnCount: showIpcStatementColumns ? ipcColumns.length : undefined,
  })
  const entries = displayEntries.slice(windowRange.start, windowRange.end)

  return (
    <tbody>
      {windowRange.topPad > 0 ? (
        <tr className="tm-pm-cost-table-virtual-pad" aria-hidden>
          <td colSpan={colCount} style={{ height: windowRange.topPad }} />
        </tr>
      ) : null}
      {entries.map((entry, offset) => {
        const entryIndex = windowRange.start + offset
        if (entry.kind === 'summary' || entry.kind === 'section') {
          return (
            <ProjectCostTableSummaryRow
              key={
                entry.kind === 'summary'
                  ? `summary:${entry.row.id}`
                  : `section:${entry.summary.subproject || '__empty__'}\u001f${entry.summary.key || '__empty__'}:${entryIndex}`
              }
              entry={entry}
              entryIndex={entryIndex}
              state={state}
            />
          )
        }

        if (entry.kind !== 'row') return null

        return <ProjectCostTableDataRow key={entry.row.id} entry={entry} state={state} />
      })}
      {windowRange.bottomPad > 0 ? (
        <tr className="tm-pm-cost-table-virtual-pad" aria-hidden>
          <td colSpan={colCount} style={{ height: windowRange.bottomPad }} />
        </tr>
      ) : null}
    </tbody>
  )
}

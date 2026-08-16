import type { FC } from 'react'

import { ProjectCostTableSummaryRow } from './ProjectCostTableSummaryRow'
import { ProjectCostTableDataRow } from './ProjectCostTableDataRow'
import type { ProjectCostTablePanelState } from './useProjectCostTablePanel'

type Props = {
  state: ProjectCostTablePanelState
}

export const ProjectCostTableBodyRows: FC<Props> = ({ state }) => {
  const { displayEntries } = state

  return (
    <tbody>
      {displayEntries.map((entry, entryIndex) => {
        if (entry.kind === 'summary' || entry.kind === 'section') {
          return (
            <ProjectCostTableSummaryRow
              key={
                entry.kind === 'summary'
                  ? `summary:${entry.row.id}`
                  : `section:${entryIndex}:${entry.summary.key || '__empty__'}`
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
    </tbody>
  )
}

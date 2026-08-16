import type { FC } from 'react'
import { featureRowDepth } from './pm-features-catalog'
import type { FundsDisplayEntry } from './pm-feature-gantt-rollup'
import type { MatrixView } from './ProjectManagementFilesPanelMatrixView'
import { ProjectManagementFilesPanelMatrixRowLead } from './ProjectManagementFilesPanelMatrixRowLead'
import { ProjectManagementFilesPanelMatrixRowMid } from './ProjectManagementFilesPanelMatrixRowMid'
import { ProjectManagementFilesPanelMatrixRowTail } from './ProjectManagementFilesPanelMatrixRowTail'

export const ProjectManagementFilesPanelMatrixRow: FC<{
  view: MatrixView
  entry: Extract<FundsDisplayEntry, { kind: 'row' }>
  rowNumber: number
}> = ({ view, entry, rowNumber }) => {
  const { byId, selectedId, checkedIds, rollups, setSelectedId, handleRowContextMenu } = view
  const row = entry.row
  const depth = featureRowDepth(row, byId)
  const isSelected = selectedId === row.id
  const isChecked = checkedIds.has(row.id)
  const rollup = rollups.get(row.id)
  return (
    <tr
      key={row.id}
      className={[
        isSelected ? 'tm-pm-resource-table-row--selected' : '',
        isChecked ? 'tm-pm-resource-table-row--checked' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => setSelectedId(row.id)}
      onContextMenu={(event) => handleRowContextMenu(event, row.id)}
    >
      <ProjectManagementFilesPanelMatrixRowLead
        view={view}
        row={row}
        depth={depth}
        isChecked={isChecked}
        rowNumber={rowNumber}
      />
      <ProjectManagementFilesPanelMatrixRowMid view={view} row={row} rollup={rollup} />
      <ProjectManagementFilesPanelMatrixRowTail view={view} row={row} rollup={rollup} />
    </tr>
  )
}

import type { FC } from 'react'

import type { CostColumnVisibility } from './pm-cost-column-prefs'
import { ProjectCostTableIpcColGroup } from './ProjectCostTableIpcCells'
import { ProjectCostTableMeteringColGroup } from './ProjectCostTableMeteringCells'
import type { CostIpcColumn } from './pm-cost-ipc-cols'
import {
  costTableAutoColStyle,
  type CostTableAutoColWidths,
} from './pm-cost-table-auto-cols'

export interface ProjectCostTableColGroupProps {
  columnVisibility: CostColumnVisibility
  autoColWidths?: CostTableAutoColWidths
  showMeteringColumns?: boolean
  showIpcStatementColumns?: boolean
  ipcColumns?: readonly CostIpcColumn[]
}

/** Shared `<colgroup>` for the pinned header table and the scrollable body table (must stay in sync). */
export const ProjectCostTableColGroup: FC<ProjectCostTableColGroupProps> = ({
  columnVisibility,
  autoColWidths,
  showMeteringColumns = false,
  showIpcStatementColumns = false,
  ipcColumns = [],
}) => {
  return (
    <colgroup>
      <col className="tm-pm-resource-table-col-index" />
      {columnVisibility.type ? <col className="tm-pm-resource-table-col-type" /> : null}
      {columnVisibility.subproject ? (
        <col
          className="tm-pm-resource-table-col-subproject"
          style={costTableAutoColStyle(autoColWidths?.subproject)}
        />
      ) : null}
      {columnVisibility.sectionalWork ? (
        <col
          className="tm-pm-resource-table-col-sectional"
          style={costTableAutoColStyle(autoColWidths?.sectionalWork)}
        />
      ) : null}
      {columnVisibility.code ? (
        <col
          className="tm-pm-resource-table-col-code"
          style={costTableAutoColStyle(autoColWidths?.code)}
        />
      ) : null}
      {columnVisibility.name ? (
        <col
          className="tm-pm-resource-table-col-name"
          style={costTableAutoColStyle(autoColWidths?.name)}
        />
      ) : null}
      {columnVisibility.featureDescription ? (
        <col
          className="tm-pm-resource-table-col-feature"
          style={costTableAutoColStyle(autoColWidths?.featureDescription)}
        />
      ) : null}
      {columnVisibility.unit ? (
        <col
          className="tm-pm-resource-table-col-unit"
          style={costTableAutoColStyle(autoColWidths?.unit)}
        />
      ) : null}
      {columnVisibility.quantity ? (
        <col
          className="tm-pm-resource-table-col-spec"
          style={costTableAutoColStyle(autoColWidths?.quantity)}
        />
      ) : null}
      {columnVisibility.unitPrice ? (
        <col
          className="tm-pm-resource-table-col-price"
          style={costTableAutoColStyle(autoColWidths?.unitPrice)}
        />
      ) : null}
      {columnVisibility.totalPrice ? (
        <col
          className="tm-pm-resource-table-col-price tm-pm-resource-table-col-total-price"
          style={costTableAutoColStyle(autoColWidths?.totalPrice)}
        />
      ) : null}
      {showMeteringColumns ? <ProjectCostTableMeteringColGroup /> : null}
      {showIpcStatementColumns ? <ProjectCostTableIpcColGroup ipcColumns={ipcColumns} /> : null}
      {columnVisibility.baseline ? <col className="tm-pm-resource-table-col-baseline" /> : null}
      {columnVisibility.note ? <col className="tm-pm-resource-table-col-note" /> : null}
      <col className="tm-pm-resource-table-col-spacer" />
    </colgroup>
  )
}

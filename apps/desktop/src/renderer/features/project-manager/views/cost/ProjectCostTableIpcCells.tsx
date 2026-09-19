import type { FC } from 'react'

import type { PmCostRow } from './pm-cost-catalog'
import {
  computeCostIpcStatement,
  type CostIpcColumn,
  type CostIpcStatement,
} from './pm-cost-ipc-cols'
import {
  formatCostMeteringAmount,
  formatCostMeteringPercent,
} from './pm-cost-metering-cols'

const IPC_COL_CLASS = 'tm-pm-resource-table-col-metering tm-pm-resource-table-col-metering-amount tm-pm-resource-table-col-ipc'
const IPC_TOTAL_CLASS = 'tm-pm-resource-table-col-metering tm-pm-resource-table-col-metering-amount'

export const ProjectCostTableIpcColGroup: FC<{
  ipcColumns: readonly CostIpcColumn[]
}> = ({ ipcColumns }) => (
  <>
    {ipcColumns.map((column) => (
      <col key={column.id} className={IPC_COL_CLASS} />
    ))}
    <col className={IPC_TOTAL_CLASS} />
    <col className={IPC_TOTAL_CLASS} />
  </>
)

export const ProjectCostTableIpcHeaderCells: FC<{
  ipcColumns: readonly CostIpcColumn[]
  cumulativeAmountLabel: string
  cumulativePercentLabel: string
}> = ({ ipcColumns, cumulativeAmountLabel, cumulativePercentLabel }) => (
  <>
    {ipcColumns.map((column) => (
      <th key={column.id} className={IPC_COL_CLASS}>
        {column.label}
      </th>
    ))}
    <th className={IPC_TOTAL_CLASS}>{cumulativeAmountLabel}</th>
    <th className={IPC_TOTAL_CLASS}>{cumulativePercentLabel}</th>
  </>
)

function IpcStatementCells({
  statement,
  ipcColumns,
}: {
  statement: CostIpcStatement
  ipcColumns: readonly CostIpcColumn[]
}) {
  return (
    <>
      {ipcColumns.map((column, index) => (
        <td
          key={column.id}
          className={`tm-pm-resource-table-cell--center ${IPC_COL_CLASS}`}
        >
          <span className="tm-pm-resource-table-baseline-text">
            {formatCostMeteringAmount(statement.amounts[index] ?? null)}
          </span>
        </td>
      ))}
      <td className={`tm-pm-resource-table-cell--center ${IPC_TOTAL_CLASS}`}>
        <span className="tm-pm-resource-table-baseline-text">
          {formatCostMeteringAmount(statement.cumulativeAmount)}
        </span>
      </td>
      <td className={`tm-pm-resource-table-cell--center ${IPC_TOTAL_CLASS}`}>
        <span className="tm-pm-resource-table-baseline-text">
          {formatCostMeteringPercent(statement.cumulativePercent)}
        </span>
      </td>
    </>
  )
}

export const ProjectCostTableIpcDataCells: FC<{
  row: PmCostRow
  ipcColumns: readonly CostIpcColumn[]
  contractAmount: number | null
}> = ({ row, ipcColumns, contractAmount }) => (
  <IpcStatementCells
    ipcColumns={ipcColumns}
    statement={computeCostIpcStatement(row, ipcColumns, contractAmount)}
  />
)

export const ProjectCostTableIpcSummaryCells: FC<{
  ipcColumns: readonly CostIpcColumn[]
  statement: CostIpcStatement
}> = ({ ipcColumns, statement }) => (
  <IpcStatementCells ipcColumns={ipcColumns} statement={statement} />
)

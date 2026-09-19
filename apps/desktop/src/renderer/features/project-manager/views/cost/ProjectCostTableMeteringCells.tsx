import type { FC, KeyboardEvent as ReactKeyboardEvent, Ref } from 'react'

import { PmDecimalTableInput } from '../../PmDecimalTableInput'
import type { CostLabelColumn } from './pm-cost-column-prefs'
import type { PmCostRow } from './pm-cost-catalog'
import {
  COST_METERING_COLUMNS,
  computeCostMeteringProgress,
  costMeteringColClass,
  formatCostMeteringAmount,
  formatCostMeteringPercent,
  formatCostMeteringQuantity,
} from './pm-cost-metering-cols'

export const ProjectCostTableMeteringColGroup: FC = () => (
  <>
    {COST_METERING_COLUMNS.map((column) => (
      <col key={column} className={costMeteringColClass(column)} />
    ))}
  </>
)

export const ProjectCostTableMeteringHeaderCells: FC<{
  costColumnLabel: (column: CostLabelColumn) => string
  editingHeaderColumn: CostLabelColumn | null
  headerDraft: string
  headerInputRef: Ref<HTMLInputElement>
  onStartEdit: (column: CostLabelColumn) => void
  onDraftChange: (value: string) => void
  onCommit: () => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void
}> = ({
  costColumnLabel,
  editingHeaderColumn,
  headerDraft,
  headerInputRef,
  onStartEdit,
  onDraftChange,
  onCommit,
  onKeyDown,
}) => (
  <>
    {COST_METERING_COLUMNS.map((column) => {
      const editing = editingHeaderColumn === column
      return (
        <th
          key={column}
          className={costMeteringColClass(column)}
          onDoubleClick={() => onStartEdit(column)}
        >
          {editing ? (
            <input
              ref={headerInputRef}
              className="tm-pm-table-header-input"
              value={headerDraft}
              onChange={(event) => onDraftChange(event.target.value)}
              onBlur={onCommit}
              onKeyDown={onKeyDown}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
            />
          ) : (
            costColumnLabel(column)
          )}
        </th>
      )
    })}
  </>
)

export const ProjectCostTableMeteringSummaryCells: FC = () => (
  <>
    {COST_METERING_COLUMNS.map((column) => (
      <td key={column} className={costMeteringColClass(column)} />
    ))}
  </>
)

export const ProjectCostTableMeteringDataCells: FC<{
  row: PmCostRow
  onPeriodQuantityChange: (value: number | null) => void
}> = ({ row, onPeriodQuantityChange }) => {
  const progress = computeCostMeteringProgress(row)
  return (
    <>
      <td className={`tm-pm-resource-table-cell--center ${costMeteringColClass('periodQuantity')}`}>
        <PmDecimalTableInput
          className="tm-pm-resource-table-input tm-pm-resource-table-input--number"
          value={progress.periodQuantity}
          onCommit={onPeriodQuantityChange}
          onClick={(event) => event.stopPropagation()}
        />
      </td>
      <td className={`tm-pm-resource-table-cell--center ${costMeteringColClass('priorQuantity')}`}>
        <span className="tm-pm-resource-table-baseline-text">
          {formatCostMeteringQuantity(progress.priorQuantity)}
        </span>
      </td>
      <td className={`tm-pm-resource-table-cell--center ${costMeteringColClass('cumulativeQuantity')}`}>
        <span className="tm-pm-resource-table-baseline-text">
          {formatCostMeteringQuantity(progress.cumulativeQuantity)}
        </span>
      </td>
      <td className={`tm-pm-resource-table-cell--center ${costMeteringColClass('periodAmount')}`}>
        <span className="tm-pm-resource-table-baseline-text">
          {formatCostMeteringAmount(progress.periodAmount)}
        </span>
      </td>
      <td className={`tm-pm-resource-table-cell--center ${costMeteringColClass('cumulativeAmount')}`}>
        <span className="tm-pm-resource-table-baseline-text">
          {formatCostMeteringAmount(progress.cumulativeAmount)}
        </span>
      </td>
      <td className={`tm-pm-resource-table-cell--center ${costMeteringColClass('cumulativePercent')}`}>
        <span className="tm-pm-resource-table-baseline-text">
          {formatCostMeteringPercent(progress.cumulativePercent)}
        </span>
      </td>
    </>
  )
}

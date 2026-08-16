import type { FC } from 'react'
import { formatRollupMonthQuantity, parseMonthKey } from './pm-feature-gantt-rollup'
import { flattenYearBandMonthRows } from './pm-files-panel-matrix-utils'
import type { MatrixView } from './ProjectManagementFilesPanelMatrixView'

export const ProjectManagementFilesPanelMatrixVertical: FC<{ view: MatrixView }> = ({ view }) => {
  const {
    t,
    visibleRows,
    monthFromGanttHint,
    rollups,
    yearBands,
    handleTableContextMenu,
  } = view
  return (
            <table
              className="tm-pm-resource-table tm-pm-features-table--vertical"
              onContextMenu={handleTableContextMenu}
            >
              <colgroup>
                <col className="tm-pm-resource-table-col-index" />
                <col className="tm-pm-features-table-col-date" />
                <col className="tm-pm-features-table-col-month" />
                {visibleRows.map((row) => (
                  <col key={row.id} className="tm-pm-features-table-col-resource" />
                ))}
                <col className="tm-pm-resource-table-col-spacer" />
              </colgroup>
              <tbody>
                {yearBands.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3 + visibleRows.length + 1}
                      className="tm-pm-resource-table-cell--center"
                    >
                      —
                    </td>
                  </tr>
                ) : (
                  flattenYearBandMonthRows(yearBands).map((item) => {
                    const parsed = parseMonthKey(item.monthKey)
                    return (
                      <tr key={item.monthKey}>
                        <td className="tm-pm-resource-table-index">
                          <span className="tm-pm-resource-table-index-text">{item.rowNumber}</span>
                        </td>
                        {item.monthIndexInBand === 0 ? (
                          <td
                            className="tm-pm-resource-table-cell--center tm-pm-features-table-year"
                            rowSpan={item.yearRowSpan}
                          >
                            {t('projectManagerPage.files.table.columns.monthYear', {
                              year: String(item.year),
                            })}
                          </td>
                        ) : null}
                        <td className="tm-pm-resource-table-cell--center tm-pm-features-table-month">
                          {parsed
                            ? t('projectManagerPage.files.table.columns.monthPart', {
                                month: String(parsed.monthIndex + 1),
                              })
                            : item.monthKey}
                        </td>
                        {visibleRows.map((row) => {
                          const rollup = rollups.get(row.id)
                          return (
                            <td
                              key={row.id}
                              className="tm-pm-resource-table-cell--center tm-pm-features-table-month"
                            >
                              <span
                                className="tm-pm-features-table-rollup"
                                title={monthFromGanttHint}
                              >
                                {formatRollupMonthQuantity(rollup?.monthly[item.monthKey])}
                              </span>
                            </td>
                          )
                        })}
                        <td className="tm-pm-resource-table-col-spacer" aria-hidden />
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
  )
}

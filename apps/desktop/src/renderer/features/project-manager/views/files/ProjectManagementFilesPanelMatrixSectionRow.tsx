import type { FC } from 'react'
import { formatWorkItemDate } from '../schedule/pm-gantt-utils'
import { formatRollupMonthQuantity, formatRollupQuantity } from './pm-feature-gantt-rollup'
import { formatCostTotalPrice } from '../cost/pm-cost-catalog'
import type { FundsDisplayEntry } from './pm-feature-gantt-rollup'
import type { MatrixView } from './ProjectManagementFilesPanelMatrixView'

export const ProjectManagementFilesPanelMatrixSectionRow: FC<{
  view: MatrixView
  entry: Extract<FundsDisplayEntry, { kind: 'section' }>
}> = ({ view, entry }) => {
  const {
    t,
    isMeteringCostView,
    showTypeColumn,
    showNameColumn,
    showUnitColumn,
    showFundsEngineeringQuantityColumn,
    showUnitPriceColumn,
    showTotalPriceColumn,
    showStartColumn,
    showFinishColumn,
    showRemarkColumn,
    quantityFromGanttHint,
    monthFromGanttHint,
    visibleMonthKeys,
    mCol,
  } = view
  const sectionRollup = entry.rollup
  return (
                        <tr key={entry.id} className="tm-pm-features-table-funds-section">
                          <td className="tm-pm-resource-table-index">
                            <span className="tm-pm-resource-table-index-text" />
                          </td>
                          {(isMeteringCostView ? mCol.type : showTypeColumn) ? (
                            <td className="tm-pm-resource-table-cell--center">
                              <span className="tm-pm-features-table-funds-section-label">
                                {t(`projectManagerPage.costTable.types.${entry.type}`)}
                              </span>
                            </td>
                          ) : null}
                          {(isMeteringCostView ? mCol.name : showNameColumn) ? (
                            <td className="tm-pm-resource-table-col-name">
                              <span className="tm-pm-features-table-funds-section-label">
                                {entry.label}
                              </span>
                            </td>
                          ) : null}
                          {(isMeteringCostView ? mCol.unit : showUnitColumn) ? (
                            <td className="tm-pm-resource-table-cell--center">
                              <span className="tm-pm-features-table-rollup">—</span>
                            </td>
                          ) : null}
                          {showFundsEngineeringQuantityColumn ? (
                            <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-price">
                              <span
                                className="tm-pm-features-table-rollup tm-pm-features-table-funds-section-total"
                                title={quantityFromGanttHint}
                              >
                                {formatRollupQuantity(sectionRollup.quantity || null)}
                              </span>
                            </td>
                          ) : null}
                          {showUnitPriceColumn ? (
                            <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-price" />
                          ) : null}
                          {showTotalPriceColumn ? (
                            <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-price">
                              <span className="tm-pm-features-table-rollup tm-pm-features-table-funds-section-total">
                                {formatCostTotalPrice(
                                  Number.isFinite(sectionRollup.pricingQuantity)
                                    ? sectionRollup.pricingQuantity
                                    : null,
                                )}
                              </span>
                            </td>
                          ) : null}
                          {showStartColumn ? (
                            <td className="tm-pm-resource-table-cell--center">
                              <span className="tm-pm-features-table-rollup">
                                {formatWorkItemDate(sectionRollup.startDate ?? undefined)}
                              </span>
                            </td>
                          ) : null}
                          {showFinishColumn ? (
                            <td className="tm-pm-resource-table-cell--center">
                              <span className="tm-pm-features-table-rollup">
                                {formatWorkItemDate(sectionRollup.finishDate ?? undefined)}
                              </span>
                            </td>
                          ) : null}
                          {visibleMonthKeys.map((monthKey) => (
                            <td
                              key={monthKey}
                              className="tm-pm-resource-table-cell--center tm-pm-features-table-month"
                            >
                              <span
                                className="tm-pm-features-table-rollup tm-pm-features-table-funds-section-total"
                                title={monthFromGanttHint}
                              >
                                {formatRollupMonthQuantity(sectionRollup.monthly[monthKey])}
                              </span>
                            </td>
                          ))}
                          {(isMeteringCostView ? mCol.note : showRemarkColumn) ? (
                            <td className="tm-pm-features-table-col-remark" />
                          ) : null}
                          <td className="tm-pm-resource-table-col-spacer" aria-hidden />
                        </tr>
  )
}

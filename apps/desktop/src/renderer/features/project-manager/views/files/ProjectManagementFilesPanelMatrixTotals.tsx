import type { FC } from 'react'
import { formatWorkItemDate } from '../schedule/pm-gantt-utils'
import { formatRollupMonthQuantity, formatRollupQuantity } from './pm-feature-gantt-rollup'
import { formatCostTotalPrice } from '../cost/pm-cost-catalog'
import type { MatrixView } from './ProjectManagementFilesPanelMatrixView'

export const ProjectManagementFilesPanelMatrixTotals: FC<{ view: MatrixView }> = ({ view }) => {
  const {
    t,
    columnVisibility,
    isFundsView,
    isMeteringCostView,
    isResourceStatView,
    visibleRows,
    quantityFromGanttHint,
    monthFromGanttHint,
    showTypeColumn,
    showNameColumn,
    showUnitColumn,
    showFundsEngineeringQuantityColumn,
    showUnitPriceColumn,
    showTotalPriceColumn,
    showStartColumn,
    showFinishColumn,
    showRemarkColumn,
    showMeteringMethodColumn,
    showQuantityColumn,
    showPricingUnitColumn,
    showPricingQuantityColumn,
    fundsTotals,
    resourceStatTotals,
    visibleMonthKeys,
    mCol,
  } = view
  return (
    <>
                {isFundsView && fundsTotals && visibleRows.length > 0 ? (
                  <tr className="tm-pm-features-table-funds-total">
                    <td className="tm-pm-resource-table-index">
                      <span className="tm-pm-resource-table-index-text" />
                    </td>
                    {(isMeteringCostView ? mCol.type : showTypeColumn) ? (
                      <td className="tm-pm-resource-table-cell--center">
                        {columnVisibility.name ? null : (
                          <span className="tm-pm-features-table-funds-total-label">
                            {t('projectManagerPage.files.table.fundsTotal')}
                          </span>
                        )}
                      </td>
                    ) : null}
                    {(isMeteringCostView ? mCol.name : showNameColumn) ? (
                      <td className="tm-pm-resource-table-col-name">
                        <span className="tm-pm-features-table-funds-total-label">
                          {t('projectManagerPage.files.table.fundsTotal')}
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
                          className="tm-pm-features-table-rollup tm-pm-features-table-funds-total-value"
                          title={quantityFromGanttHint}
                        >
                          {formatRollupQuantity(fundsTotals.amount || null)}
                        </span>
                      </td>
                    ) : null}
                    {showUnitPriceColumn ? (
                      <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-price" />
                    ) : null}
                    {showTotalPriceColumn ? (
                      <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-price">
                        <span className="tm-pm-features-table-rollup tm-pm-features-table-funds-total-value">
                          {formatCostTotalPrice(fundsTotals.totalPrice)}
                        </span>
                      </td>
                    ) : null}
                    {showStartColumn ? (
                      <td className="tm-pm-resource-table-cell--center">
                        <span className="tm-pm-features-table-rollup">
                          {formatWorkItemDate(fundsTotals.startDate ?? undefined)}
                        </span>
                      </td>
                    ) : null}
                    {showFinishColumn ? (
                      <td className="tm-pm-resource-table-cell--center">
                        <span className="tm-pm-features-table-rollup">
                          {formatWorkItemDate(fundsTotals.finishDate ?? undefined)}
                        </span>
                      </td>
                    ) : null}
                    {visibleMonthKeys.map((monthKey) => (
                      <td
                        key={monthKey}
                        className="tm-pm-resource-table-cell--center tm-pm-features-table-month"
                      >
                        <span
                          className="tm-pm-features-table-rollup tm-pm-features-table-funds-total-value"
                          title={monthFromGanttHint}
                        >
                          {formatRollupMonthQuantity(fundsTotals.monthly[monthKey])}
                        </span>
                      </td>
                    ))}
                    {(isMeteringCostView ? mCol.note : showRemarkColumn) ? (
                      <td className="tm-pm-features-table-col-remark" />
                    ) : null}
                    <td className="tm-pm-resource-table-col-spacer" aria-hidden />
                  </tr>
                ) : null}
                {isResourceStatView && resourceStatTotals && visibleRows.length > 0 ? (
                  <tr className="tm-pm-features-table-funds-total">
                    <td className="tm-pm-resource-table-index">
                      <span className="tm-pm-resource-table-index-text" />
                    </td>
                    {columnVisibility.type ? (
                      <td className="tm-pm-resource-table-cell--center">
                        {columnVisibility.name ? null : (
                          <span className="tm-pm-features-table-funds-total-label">
                            {t('projectManagerPage.files.table.resourceStatTotal')}
                          </span>
                        )}
                      </td>
                    ) : null}
                    {columnVisibility.name ? (
                      <td className="tm-pm-resource-table-col-name">
                        <span className="tm-pm-features-table-funds-total-label">
                          {t('projectManagerPage.files.table.resourceStatTotal')}
                        </span>
                      </td>
                    ) : null}
                    {columnVisibility.unit ? (
                      <td className="tm-pm-resource-table-cell--center" />
                    ) : null}
                    {showMeteringMethodColumn ? (
                      <td className="tm-pm-features-table-col-metering-method" />
                    ) : null}
                    {showQuantityColumn ? (
                      <td className="tm-pm-resource-table-cell--center">
                        <span className="tm-pm-features-table-rollup tm-pm-features-table-funds-total-value">
                          {formatRollupQuantity(resourceStatTotals.quantity)}
                        </span>
                      </td>
                    ) : null}
                    {showPricingUnitColumn ? (
                      <td className="tm-pm-resource-table-cell--center" />
                    ) : null}
                    {showPricingQuantityColumn ? (
                      <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-price">
                        <span className="tm-pm-features-table-rollup tm-pm-features-table-funds-total-value">
                          {formatRollupQuantity(resourceStatTotals.pricingQuantity)}
                        </span>
                      </td>
                    ) : null}
                    {showUnitPriceColumn ? (
                      <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-price" />
                    ) : null}
                    {showTotalPriceColumn ? (
                      <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-price">
                        <span className="tm-pm-features-table-rollup tm-pm-features-table-funds-total-value">
                          {formatCostTotalPrice(resourceStatTotals.totalPrice)}
                        </span>
                      </td>
                    ) : null}
                    {showStartColumn ? <td className="tm-pm-features-table-col-date" /> : null}
                    {showFinishColumn ? <td className="tm-pm-features-table-col-date" /> : null}
                    {visibleMonthKeys.map((monthKey) => (
                      <td
                        key={`total-${monthKey}`}
                        className="tm-pm-resource-table-cell--center tm-pm-features-table-month"
                      />
                    ))}
                    {columnVisibility.remark ? (
                      <td className="tm-pm-features-table-col-remark" />
                    ) : null}
                    <td className="tm-pm-resource-table-col-spacer" aria-hidden />
                  </tr>
                ) : null}
    </>
  )
}

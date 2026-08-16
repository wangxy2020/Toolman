import type { FC } from 'react'
import { formatWorkItemDate } from '../schedule/pm-gantt-utils'
import {
  formatRollupMonthQuantity,
  formatRollupQuantity,
  resourcePricingQuantityKind,
} from './pm-feature-gantt-rollup'
import { formatCostTotalPrice } from '../cost/pm-cost-catalog'
import { PmDecimalTableInput } from '../../PmDecimalTableInput'
import type { PmFeatureRow } from './pm-features-catalog'
import type { FeatureGanttRollup } from './pm-feature-gantt-type-map'
import type { MatrixView } from './ProjectManagementFilesPanelMatrixView'

export const ProjectManagementFilesPanelMatrixRowTail: FC<{
  view: MatrixView
  row: PmFeatureRow
  rollup: FeatureGanttRollup | undefined
}> = ({ view, row, rollup }) => {
  const {
    t,
    isFundsView,
    isMeteringCostView,
    isResourceStatView,
    isNodeView,
    monthFromGanttHint,
    showPricingUnitColumn,
    showPricingQuantityColumn,
    showUnitPriceColumn,
    showTotalPriceColumn,
    showStartColumn,
    showFinishColumn,
    showPlannedPercentColumn,
    showRemarkColumn,
    visibleMonthKeys,
    nodeRollups,
    mCol,
    patchRow,
  } = view
  return (
    <>
                        {showPricingUnitColumn ? (
                          <td className="tm-pm-resource-table-cell--center">
                            {isResourceStatView ? (
                              <span className="tm-pm-features-table-rollup">
                                {row.pricingUnit.trim() || '—'}
                              </span>
                            ) : (
                              <input
                                className="tm-pm-resource-table-input tm-pm-resource-table-input--center"
                                value={row.pricingUnit}
                                onChange={(event) =>
                                  patchRow(row.id, { pricingUnit: event.target.value })
                                }
                                onClick={(event) => event.stopPropagation()}
                              />
                            )}
                          </td>
                        ) : null}
                        {showPricingQuantityColumn ? (
                          <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-price">
                            {(() => {
                              const kind = resourcePricingQuantityKind(row.type)
                              return (
                                <span
                                  className="tm-pm-features-table-rollup"
                                  title={
                                    kind
                                      ? t(
                                          `projectManagerPage.files.table.pricingQuantityHint.${kind}`,
                                        )
                                      : undefined
                                  }
                                >
                                  {formatRollupQuantity(rollup?.pricingQuantity)}
                                </span>
                              )
                            })()}
                          </td>
                        ) : null}
                        {isMeteringCostView && mCol.unitPrice ? (
                          <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-price">
                            <PmDecimalTableInput
                              className="tm-pm-resource-table-input tm-pm-resource-table-input--number"
                              value={row.unitPrice}
                              onCommit={(unitPrice) => patchRow(row.id, { unitPrice })}
                              onClick={(event) => event.stopPropagation()}
                            />
                          </td>
                        ) : showUnitPriceColumn ? (
                          <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-price">
                            <span className="tm-pm-features-table-rollup">
                              {formatCostTotalPrice(row.unitPrice)}
                            </span>
                          </td>
                        ) : null}
                        {isMeteringCostView && mCol.totalPrice ? (
                          <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-price">
                            <span className="tm-pm-resource-table-baseline-text">
                              {formatCostTotalPrice(
                                row.quantity != null && row.unitPrice != null
                                  ? row.quantity * row.unitPrice
                                  : null,
                              )}
                            </span>
                          </td>
                        ) : showTotalPriceColumn ? (
                          <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-price">
                            <span className="tm-pm-features-table-rollup">
                              {formatCostTotalPrice(
                                isFundsView
                                  ? rollup?.quantity != null &&
                                    Number.isFinite(rollup.quantity) &&
                                    row.unitPrice != null
                                    ? rollup.quantity * row.unitPrice
                                    : null
                                  : rollup?.pricingQuantity != null &&
                                      Number.isFinite(rollup.pricingQuantity) &&
                                      row.unitPrice != null
                                    ? rollup.pricingQuantity * row.unitPrice
                                    : null,
                              )}
                            </span>
                          </td>
                        ) : null}
                        {isMeteringCostView && mCol.baseline ? (
                          <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-baseline">
                            <span className="tm-pm-resource-table-baseline-text">—</span>
                          </td>
                        ) : null}
                        {showStartColumn ? (
                          <td className="tm-pm-resource-table-cell--center">
                            <span className="tm-pm-features-table-rollup">
                              {formatWorkItemDate(
                                (isNodeView
                                  ? nodeRollups.get(row.id)?.startDate
                                  : rollup?.startDate) ?? undefined,
                              )}
                            </span>
                          </td>
                        ) : null}
                        {showFinishColumn ? (
                          <td className="tm-pm-resource-table-cell--center">
                            <span className="tm-pm-features-table-rollup">
                              {formatWorkItemDate(
                                (isNodeView
                                  ? nodeRollups.get(row.id)?.finishDate
                                  : rollup?.finishDate) ?? undefined,
                              )}
                            </span>
                          </td>
                        ) : null}
                        {showPlannedPercentColumn ? (
                          <td className="tm-pm-resource-table-cell--center tm-pm-features-table-col-planned-percent">
                            <span
                              className="tm-pm-features-table-rollup"
                              title={t(
                                'projectManagerPage.files.table.columns.plannedPercentHint',
                              )}
                            >
                              {(() => {
                                const percent = nodeRollups.get(row.id)?.plannedPercent
                                if (percent == null || !Number.isFinite(percent)) return '—'
                                return `${percent}%`
                              })()}
                            </span>
                          </td>
                        ) : null}
                        {visibleMonthKeys.map((monthKey) => (
                          <td
                            key={monthKey}
                            className="tm-pm-resource-table-cell--center tm-pm-features-table-month"
                          >
                            <span className="tm-pm-features-table-rollup" title={monthFromGanttHint}>
                              {formatRollupMonthQuantity(rollup?.monthly[monthKey])}
                            </span>
                          </td>
                        ))}
                        {(isMeteringCostView ? mCol.note : showRemarkColumn) ? (
                          <td
                            className={
                              isMeteringCostView
                                ? 'tm-pm-resource-table-col-note'
                                : 'tm-pm-features-table-col-remark'
                            }
                          >
                            <input
                              className="tm-pm-resource-table-input"
                              value={row.remark}
                              placeholder={
                                isMeteringCostView
                                  ? t('projectManagerPage.costTable.columns.note')
                                  : t('projectManagerPage.files.table.remarkPlaceholder')
                              }
                              onChange={(event) => patchRow(row.id, { remark: event.target.value })}
                              onClick={(event) => event.stopPropagation()}
                            />
                          </td>
                        ) : null}
    </>
  )
}

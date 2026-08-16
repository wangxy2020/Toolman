import type { FC } from 'react'
import {
  formatRollupQuantity,
  resourceQuantityMeteringKind,
} from './pm-feature-gantt-rollup'
import { PmDecimalTableInput } from '../../PmDecimalTableInput'
import type { PmFeatureRow } from './pm-features-catalog'
import type { FeatureGanttRollup } from './pm-feature-gantt-type-map'
import type { MatrixView } from './ProjectManagementFilesPanelMatrixView'

export const ProjectManagementFilesPanelMatrixRowMid: FC<{
  view: MatrixView
  row: PmFeatureRow
  rollup: FeatureGanttRollup | undefined
}> = ({ view, row, rollup }) => {
  const {
    t,
    isFundsView,
    isProcurementView,
    isMeteringCostView,
    quantityFromGanttHint,
    showQuantityColumn,
    showMeteringMethodColumn,
    showPurchaseCycleColumn,
    showTransportCycleColumn,
    showUnitColumn,
    showFundsEngineeringQuantityColumn,
    showDurationColumn,
    nodeRollups,
    mCol,
    patchRow,
  } = view
  return (
    <>
                        {showDurationColumn ? (
                          <td className="tm-pm-resource-table-cell--center">
                            <span className="tm-pm-features-table-rollup">
                              {(() => {
                                const days = nodeRollups.get(row.id)?.durationDays
                                if (days == null || !Number.isFinite(days)) return '—'
                                return `${days}${t('projectManagerPage.schedule.dayUnit')}`
                              })()}
                            </span>
                          </td>
                        ) : null}
                        {isMeteringCostView && mCol.featureDescription ? (
                          <td className="tm-pm-resource-table-col-feature">
                            <textarea
                              className="tm-pm-resource-table-input tm-pm-resource-table-input--feature"
                              value={row.featureDescription}
                              placeholder={t(
                                'projectManagerPage.costTable.featureDescriptionPlaceholder',
                              )}
                              rows={1}
                              onChange={(event) =>
                                patchRow(row.id, { featureDescription: event.target.value })
                              }
                              onClick={(event) => event.stopPropagation()}
                            />
                          </td>
                        ) : null}
                        {(isMeteringCostView ? mCol.unit : showUnitColumn) ? (
                          <td className="tm-pm-resource-table-cell--center">
                            {isFundsView ? (
                              <span className="tm-pm-features-table-rollup">
                                {row.unit.trim() || '—'}
                              </span>
                            ) : (
                              <input
                                className="tm-pm-resource-table-input tm-pm-resource-table-input--center"
                                value={row.unit}
                                onChange={(event) => {
                                  const unit = event.target.value
                                  if (!isProcurementView) {
                                    patchRow(row.id, { unit })
                                    return
                                  }
                                  const pricingInSync =
                                    row.pricingUnit.trim() === '' || row.pricingUnit === row.unit
                                  patchRow(row.id, {
                                    unit,
                                    ...(pricingInSync ? { pricingUnit: unit } : {}),
                                  })
                                }}
                                onClick={(event) => event.stopPropagation()}
                              />
                            )}
                          </td>
                        ) : null}
                        {showFundsEngineeringQuantityColumn ? (
                          <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-price">
                            <span
                              className="tm-pm-features-table-rollup"
                              title={quantityFromGanttHint}
                            >
                              {formatRollupQuantity(rollup?.quantity)}
                            </span>
                          </td>
                        ) : null}
                        {showMeteringMethodColumn ? (
                          <td className="tm-pm-resource-table-cell--center tm-pm-features-table-col-metering-method">
                            {(() => {
                              const kind = resourceQuantityMeteringKind(row.type)
                              if (!kind) {
                                return <span className="tm-pm-features-table-rollup">—</span>
                              }
                              return (
                                <span
                                  className="tm-pm-features-table-rollup"
                                  title={t(
                                    `projectManagerPage.files.table.meteringMethod.${kind}Hint`,
                                  )}
                                >
                                  {t(`projectManagerPage.files.table.meteringMethod.${kind}`)}
                                </span>
                              )
                            })()}
                          </td>
                        ) : null}
                        {showPurchaseCycleColumn ? (
                          <td className="tm-pm-resource-table-cell--center">
                            <input
                              className="tm-pm-resource-table-input tm-pm-resource-table-input--center"
                              value={row.purchaseCycle == null ? '' : String(row.purchaseCycle)}
                              placeholder={t('projectManagerPage.files.table.cycleDaysPlaceholder')}
                              inputMode="decimal"
                              onChange={(event) => {
                                const raw = event.target.value.trim()
                                if (!raw) {
                                  patchRow(row.id, { purchaseCycle: null })
                                  return
                                }
                                const next = Number(raw)
                                if (Number.isFinite(next)) {
                                  patchRow(row.id, { purchaseCycle: next })
                                }
                              }}
                              onClick={(event) => event.stopPropagation()}
                            />
                          </td>
                        ) : null}
                        {showTransportCycleColumn ? (
                          <td className="tm-pm-resource-table-cell--center">
                            <input
                              className="tm-pm-resource-table-input tm-pm-resource-table-input--center"
                              value={row.transportCycle == null ? '' : String(row.transportCycle)}
                              placeholder={t('projectManagerPage.files.table.cycleDaysPlaceholder')}
                              inputMode="decimal"
                              onChange={(event) => {
                                const raw = event.target.value.trim()
                                if (!raw) {
                                  patchRow(row.id, { transportCycle: null })
                                  return
                                }
                                const next = Number(raw)
                                if (Number.isFinite(next)) {
                                  patchRow(row.id, { transportCycle: next })
                                }
                              }}
                              onClick={(event) => event.stopPropagation()}
                            />
                          </td>
                        ) : null}
                        {(isMeteringCostView ? mCol.quantity : showQuantityColumn) ? (
                          <td className="tm-pm-resource-table-cell--center">
                            {isMeteringCostView ? (
                              <PmDecimalTableInput
                                className="tm-pm-resource-table-input tm-pm-resource-table-input--number"
                                value={row.quantity}
                                onCommit={(quantity) => patchRow(row.id, { quantity })}
                                onClick={(event) => event.stopPropagation()}
                              />
                            ) : (
                              <span
                                className="tm-pm-features-table-rollup"
                                title={quantityFromGanttHint}
                              >
                                {formatRollupQuantity(rollup?.quantity)}
                              </span>
                            )}
                          </td>
                        ) : null}
    </>
  )
}

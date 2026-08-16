import type { FC } from 'react'
import type { MatrixView } from './ProjectManagementFilesPanelMatrixView'

export const ProjectManagementFilesPanelMatrixColgroup: FC<{ view: MatrixView }> = ({ view }) => {
  const {
    isMeteringCostView,
    showQuantityColumn,
    showPricingUnitColumn,
    showUnitPriceColumn,
    showTotalPriceColumn,
    showMeteringMethodColumn,
    showPricingQuantityColumn,
    showPurchaseCycleColumn,
    showTransportCycleColumn,
    showTypeColumn,
    showNameColumn,
    showUnitColumn,
    showFundsEngineeringQuantityColumn,
    showDurationColumn,
    showRemarkColumn,
    showStartColumn,
    showFinishColumn,
    showPlannedPercentColumn,
    visibleMonthKeys,
    mCol,
  } = view

  return (
              <colgroup>
                  <col className="tm-pm-resource-table-col-index" />
                  {(isMeteringCostView ? mCol.type : showTypeColumn) ? (
                    <col className="tm-pm-resource-table-col-type" />
                  ) : null}
                  {isMeteringCostView && mCol.sectionalWork ? (
                    <col className="tm-pm-resource-table-col-sectional" />
                  ) : null}
                  {isMeteringCostView && mCol.code ? (
                    <col className="tm-pm-resource-table-col-code" />
                  ) : null}
                  {(isMeteringCostView ? mCol.name : showNameColumn) ? (
                    <col className="tm-pm-resource-table-col-name" />
                  ) : null}
                  {showDurationColumn ? (
                    <col className="tm-pm-features-table-col-cycle" />
                  ) : null}
                  {isMeteringCostView && mCol.featureDescription ? (
                    <col className="tm-pm-resource-table-col-feature" />
                  ) : null}
                  {(isMeteringCostView ? mCol.unit : showUnitColumn) ? (
                    <col className="tm-pm-resource-table-col-unit" />
                  ) : null}
                  {showFundsEngineeringQuantityColumn ? (
                    <col className="tm-pm-resource-table-col-price" />
                  ) : null}
                  {showMeteringMethodColumn ? (
                    <col className="tm-pm-features-table-col-metering-method" />
                  ) : null}
                  {showPurchaseCycleColumn ? <col className="tm-pm-features-table-col-cycle" /> : null}
                  {showTransportCycleColumn ? (
                    <col className="tm-pm-features-table-col-cycle" />
                  ) : null}
                  {(isMeteringCostView ? mCol.quantity : showQuantityColumn) ? (
                    <col
                      className={
                        isMeteringCostView
                          ? 'tm-pm-resource-table-col-spec'
                          : 'tm-pm-resource-table-col-price'
                      }
                    />
                  ) : null}
                  {showPricingUnitColumn ? <col className="tm-pm-resource-table-col-unit" /> : null}
                  {showPricingQuantityColumn ? (
                    <col className="tm-pm-resource-table-col-price" />
                  ) : null}
                  {(showUnitPriceColumn || (isMeteringCostView && mCol.unitPrice)) ? (
                    <col className="tm-pm-resource-table-col-price" />
                  ) : null}
                  {(showTotalPriceColumn || (isMeteringCostView && mCol.totalPrice)) ? (
                    <col className="tm-pm-resource-table-col-price" />
                  ) : null}
                  {isMeteringCostView && mCol.baseline ? (
                    <col className="tm-pm-resource-table-col-baseline" />
                  ) : null}
                  {!isMeteringCostView && showStartColumn ? (
                    <col className="tm-pm-features-table-col-date" />
                  ) : null}
                  {!isMeteringCostView && showFinishColumn ? (
                    <col className="tm-pm-features-table-col-date" />
                  ) : null}
                  {showPlannedPercentColumn ? (
                    <col className="tm-pm-features-table-col-planned-percent" />
                  ) : null}
                  {!isMeteringCostView
                    ? visibleMonthKeys.map((monthKey) => (
                        <col key={monthKey} className="tm-pm-features-table-col-month" />
                      ))
                    : null}
                  {(isMeteringCostView ? mCol.note : showRemarkColumn) ? (
                    <col
                      className={
                        isMeteringCostView
                          ? 'tm-pm-resource-table-col-note'
                          : 'tm-pm-features-table-col-remark'
                      }
                    />
                  ) : null}
                  <col className="tm-pm-resource-table-col-spacer" />
              </colgroup>
  )
}

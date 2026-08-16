import type { FC } from 'react'
import { parseMonthKey } from './pm-feature-gantt-rollup'
import { formatMonthHeadTitle } from './pm-files-panel-matrix-utils'
import type { MatrixView } from './ProjectManagementFilesPanelMatrixView'

export const ProjectManagementFilesPanelMatrixHead: FC<{ view: MatrixView }> = ({ view }) => {
  const {
    t,
    selectionMode,
    checkedIds,
    isMeteringCostView,
    visibleRows,
    monthFromGanttHint,
    unitColumnLabel,
    fundsEngineeringQuantityLabel,
    featureColumnLabel,
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
    visibleYearBands,
    visibleMonthKeys,
    headerRowSpan,
    openColumnVisibilityMenu,
    handleSelectAll,
    handleClearSelection,
    mCol,
  } = view

  return (
                <thead onContextMenu={openColumnVisibilityMenu}>
                  <tr
                    className={
                      isMeteringCostView
                        ? undefined
                        : 'tm-pm-features-table-head-row tm-pm-features-table-head-row--year'
                    }
                  >
                    <th
                      rowSpan={isMeteringCostView ? undefined : headerRowSpan}
                      className="tm-pm-resource-table-col-index"
                    >
                      {selectionMode ? (
                        <label
                          className="tm-kb-file-card-select"
                          title={t('projectManagerPage.files.table.selection.selectAll')}
                        >
                          <input
                            type="checkbox"
                            className="tm-kb-file-card-select-input"
                            checked={
                              visibleRows.length > 0 &&
                              visibleRows.every((row) => checkedIds.has(row.id))
                            }
                            onChange={(event) => {
                              if (event.target.checked) handleSelectAll()
                              else handleClearSelection()
                            }}
                            aria-label={t('projectManagerPage.files.table.selection.selectAll')}
                          />
                          <span
                            className={[
                              'tm-kb-file-card-select-box',
                              visibleRows.length > 0 &&
                              visibleRows.every((row) => checkedIds.has(row.id))
                                ? 'tm-kb-file-card-select-box--checked'
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            aria-hidden="true"
                          />
                        </label>
                      ) : (
                        featureColumnLabel('index')
                      )}
                    </th>
                    {(isMeteringCostView ? mCol.type : showTypeColumn) ? (
                      <th
                        rowSpan={isMeteringCostView ? undefined : headerRowSpan}
                        className="tm-pm-resource-table-col-type"
                      >
                        {featureColumnLabel('type')}
                      </th>
                    ) : null}
                    {isMeteringCostView && mCol.sectionalWork ? (
                      <th className="tm-pm-resource-table-col-sectional">
                        {featureColumnLabel('sectionalWork')}
                      </th>
                    ) : null}
                    {isMeteringCostView && mCol.code ? (
                      <th className="tm-pm-resource-table-col-code">
                        {featureColumnLabel('code')}
                      </th>
                    ) : null}
                    {(isMeteringCostView ? mCol.name : showNameColumn) ? (
                      <th
                        rowSpan={isMeteringCostView ? undefined : headerRowSpan}
                        className="tm-pm-resource-table-col-name"
                      >
                        {featureColumnLabel('name')}
                      </th>
                    ) : null}
                    {showDurationColumn ? (
                      <th rowSpan={headerRowSpan} className="tm-pm-features-table-col-cycle">
                        {t('projectManagerPage.files.table.columns.duration')}
                      </th>
                    ) : null}
                    {isMeteringCostView && mCol.featureDescription ? (
                      <th className="tm-pm-resource-table-col-feature">
                        {featureColumnLabel('featureDescription')}
                      </th>
                    ) : null}
                    {(isMeteringCostView ? mCol.unit : showUnitColumn) ? (
                      <th
                        rowSpan={isMeteringCostView ? undefined : headerRowSpan}
                        className="tm-pm-resource-table-col-unit"
                      >
                        {unitColumnLabel}
                      </th>
                    ) : null}
                    {showFundsEngineeringQuantityColumn ? (
                      <th rowSpan={headerRowSpan} className="tm-pm-resource-table-col-price">
                        {fundsEngineeringQuantityLabel}
                      </th>
                    ) : null}
                    {showMeteringMethodColumn ? (
                      <th rowSpan={headerRowSpan} className="tm-pm-features-table-col-metering-method">
                        {t('projectManagerPage.files.table.columns.meteringMethod')}
                      </th>
                    ) : null}
                    {showPurchaseCycleColumn ? (
                      <th rowSpan={headerRowSpan} className="tm-pm-features-table-col-cycle">
                        {t('projectManagerPage.files.table.columns.purchaseCycle')}
                      </th>
                    ) : null}
                    {showTransportCycleColumn ? (
                      <th rowSpan={headerRowSpan} className="tm-pm-features-table-col-cycle">
                        {t('projectManagerPage.files.table.columns.transportCycle')}
                      </th>
                    ) : null}
                    {(isMeteringCostView ? mCol.quantity : showQuantityColumn) ? (
                      <th
                        rowSpan={isMeteringCostView ? undefined : headerRowSpan}
                        className={
                          isMeteringCostView
                            ? 'tm-pm-resource-table-col-spec'
                            : 'tm-pm-resource-table-col-price'
                        }
                      >
                        {featureColumnLabel('quantity')}
                      </th>
                    ) : null}
                    {showPricingUnitColumn ? (
                      <th rowSpan={headerRowSpan} className="tm-pm-resource-table-col-unit">
                        {t('projectManagerPage.files.table.columns.pricingUnit')}
                      </th>
                    ) : null}
                    {showPricingQuantityColumn ? (
                      <th rowSpan={headerRowSpan} className="tm-pm-resource-table-col-price">
                        {t('projectManagerPage.files.table.columns.pricingQuantity')}
                      </th>
                    ) : null}
                    {(showUnitPriceColumn || (isMeteringCostView && mCol.unitPrice)) ? (
                      <th
                        rowSpan={isMeteringCostView ? undefined : headerRowSpan}
                        className="tm-pm-resource-table-col-price"
                      >
                        {featureColumnLabel('unitPrice')}
                      </th>
                    ) : null}
                    {(showTotalPriceColumn || (isMeteringCostView && mCol.totalPrice)) ? (
                      <th
                        rowSpan={isMeteringCostView ? undefined : headerRowSpan}
                        className="tm-pm-resource-table-col-price"
                      >
                        {featureColumnLabel('totalPrice')}
                      </th>
                    ) : null}
                    {isMeteringCostView && mCol.baseline ? (
                      <th className="tm-pm-resource-table-col-baseline">
                        {t('projectManagerPage.costTable.columns.baseline')}
                      </th>
                    ) : null}
                    {!isMeteringCostView && showStartColumn ? (
                      <th rowSpan={headerRowSpan} className="tm-pm-features-table-col-date">
                        {featureColumnLabel('start')}
                      </th>
                    ) : null}
                    {!isMeteringCostView && showFinishColumn ? (
                      <th rowSpan={headerRowSpan} className="tm-pm-features-table-col-date">
                        {featureColumnLabel('finish')}
                      </th>
                    ) : null}
                    {showPlannedPercentColumn ? (
                      <th
                        rowSpan={headerRowSpan}
                        className="tm-pm-features-table-col-planned-percent"
                        title={t('projectManagerPage.files.table.columns.plannedPercentHint')}
                      >
                        {t('projectManagerPage.files.table.columns.plannedPercent')}
                      </th>
                    ) : null}
                    {!isMeteringCostView
                      ? visibleYearBands.map((band) => (
                          <th
                            key={`year-${band.year}`}
                            className="tm-pm-features-table-col-year"
                            colSpan={band.monthKeys.length}
                            title={monthFromGanttHint}
                          >
                            {t('projectManagerPage.files.table.columns.monthYear', {
                              year: String(band.year),
                            })}
                          </th>
                        ))
                      : null}
                    {(isMeteringCostView ? mCol.note : showRemarkColumn) ? (
                      <th
                        rowSpan={isMeteringCostView ? undefined : headerRowSpan}
                        className={
                          isMeteringCostView
                            ? 'tm-pm-resource-table-col-note'
                            : 'tm-pm-features-table-col-remark'
                        }
                      >
                        {featureColumnLabel('remark')}
                      </th>
                    ) : null}
                    <th
                      rowSpan={isMeteringCostView ? undefined : headerRowSpan}
                      className="tm-pm-resource-table-col-spacer"
                      aria-hidden
                    />
                  </tr>
                  {!isMeteringCostView && visibleMonthKeys.length > 0 ? (
                    <tr className="tm-pm-features-table-head-row tm-pm-features-table-head-row--month">
                      {visibleMonthKeys.map((monthKey) => {
                        const parsed = parseMonthKey(monthKey)
                        return (
                          <th
                            key={monthKey}
                            className="tm-pm-features-table-col-month"
                            title={formatMonthHeadTitle(parsed, monthFromGanttHint)}
                          >
                            {parsed
                              ? t('projectManagerPage.files.table.columns.monthPart', {
                                  month: String(parsed.monthIndex + 1),
                                })
                              : monthKey}
                          </th>
                        )
                      })}
                    </tr>
                  ) : null}
                </thead>
  )
}

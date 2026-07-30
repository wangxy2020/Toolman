import type { FC } from 'react'

import { formatWorkItemDate } from '../schedule/pm-gantt-utils'
import {
  formatRollupMonthQuantity,
  formatRollupQuantity,
  parseMonthKey,
  resourcePricingQuantityKind,
  resourceQuantityMeteringKind,
} from './pm-feature-gantt-rollup'
import {
  featureRowDepth,
  isLiveNodeFeatureRow,
  isPmFeatureCostPrimaryType,
  PM_FEATURE_TYPES,
  type PmFeatureType,
} from './pm-features-catalog'
import { formatCostTotalPrice, PM_COST_PRIMARY_TYPES } from '../cost/pm-cost-catalog'
import { DEFAULT_COST_COLUMN_VISIBILITY } from '../cost/pm-cost-column-prefs'
import { PmDecimalTableInput } from '../../PmDecimalTableInput'
import type { ProjectManagementFilesPanelState } from './useProjectManagementFilesPanel'

export interface ProjectManagementFilesPanelMatrixProps {
  state: ProjectManagementFilesPanelState
}

/**
 * The pinned header + scrollable body matrix tables (horizontal resources-as-rows layout,
 * or vertical months-as-rows layout). Both tables must stay column-aligned, so they're
 * rendered together rather than split further.
 */
export const ProjectManagementFilesPanelMatrix: FC<ProjectManagementFilesPanelMatrixProps> = ({
  state,
}) => {
  const {
    t,
    columnVisibility,
    meteringColumnVisibility,
    selectionMode,
    checkedIds,
    setCheckedIds,
    matrixLayout,
    byId,
    isFundsView,
    isProcurementView,
    lockedViewFilter,
    isMeteringCostView,
    visibleRows,
    quantityFromGanttHint,
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
    isNodeView,
    showTypeColumn,
    showNameColumn,
    showUnitColumn,
    showFundsEngineeringQuantityColumn,
    showDurationColumn,
    showRemarkColumn,
    showStartColumn,
    showFinishColumn,
    showPlannedPercentColumn,
    isResourceStatView,
    rollups,
    nodeRollups,
    fundsDisplayEntries,
    fundsTotals,
    resourceStatTotals,
    yearBands,
    visibleYearBands,
    visibleMonthKeys,
    headerRowSpan,
    tableScrollRef,
    headerPinInnerRef,
    syncHScrollMetrics,
    handleTableContextMenu,
    openColumnVisibilityMenu,
    handleSelectAll,
    handleClearSelection,
    patchRow,
    handleRowContextMenu,
    setSelectedId,
    selectedId,
  } = state

  const layout = isMeteringCostView ? 'horizontal' : matrixLayout
  const mCol = meteringColumnVisibility ?? DEFAULT_COST_COLUMN_VISIBILITY

  return (
    <>
      <div className="tm-pm-resource-table-header-pin">
        <div ref={headerPinInnerRef} className="tm-pm-resource-table-header-pin-inner">
          <div
            className="tm-pm-resource-table-scroll-inner"
            onContextMenu={handleTableContextMenu}
          >
            {layout === 'vertical' ? (
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
                <thead onContextMenu={openColumnVisibilityMenu}>
                  <tr>
                    <th className="tm-pm-resource-table-col-index">
                      {t('projectManagerPage.files.table.columns.index')}
                    </th>
                    <th className="tm-pm-features-table-col-date">
                      {t('projectManagerPage.files.table.columns.yearColumn')}
                    </th>
                    <th className="tm-pm-features-table-col-month">
                      {t('projectManagerPage.files.table.columns.monthColumn')}
                    </th>
                    {visibleRows.map((row) => (
                      <th
                        key={row.id}
                        className="tm-pm-features-table-col-resource"
                        title={row.name.trim() || undefined}
                      >
                        <span className="tm-pm-features-table-resource-label">
                          {row.name.trim() || '—'}
                        </span>
                      </th>
                    ))}
                    <th className="tm-pm-resource-table-col-spacer" aria-hidden />
                  </tr>
                </thead>
              </table>
            ) : (
              <table className="tm-pm-resource-table">
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
                            title={
                              parsed
                                ? `${parsed.year}-${String(parsed.monthIndex + 1).padStart(2, '0')} · ${monthFromGanttHint}`
                                : monthFromGanttHint
                            }
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
              </table>
            )}
          </div>
        </div>
      </div>
      <div
        ref={tableScrollRef}
        className="tm-pm-resource-table-scroll"
        onScroll={() => syncHScrollMetrics()}
        onWheel={(event) => {
          // overflow-x is hidden (no native H bar), so route trackpad deltaX manually.
          if (event.deltaX !== 0 && tableScrollRef.current) {
            tableScrollRef.current.scrollLeft += event.deltaX
          }
        }}
      >
        <div className="tm-pm-resource-table-scroll-inner" onContextMenu={handleTableContextMenu}>
          {layout === 'vertical' ? (
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
                {(() => {
                  if (yearBands.length === 0) {
                    return (
                      <tr>
                        <td
                          colSpan={3 + visibleRows.length + 1}
                          className="tm-pm-resource-table-cell--center"
                        >
                          —
                        </td>
                      </tr>
                    )
                  }
                  let rowNumber = 0
                  return yearBands.flatMap((band) =>
                    band.monthKeys.map((monthKey, monthIndex) => {
                      rowNumber += 1
                      const parsed = parseMonthKey(monthKey)
                      const currentNo = rowNumber
                      return (
                        <tr key={monthKey}>
                          <td className="tm-pm-resource-table-index">
                            <span className="tm-pm-resource-table-index-text">{currentNo}</span>
                          </td>
                          {monthIndex === 0 ? (
                            <td
                              className="tm-pm-resource-table-cell--center tm-pm-features-table-year"
                              rowSpan={band.monthKeys.length}
                            >
                              {t('projectManagerPage.files.table.columns.monthYear', {
                                year: String(band.year),
                              })}
                            </td>
                          ) : null}
                          <td className="tm-pm-resource-table-cell--center tm-pm-features-table-month">
                            {parsed
                              ? t('projectManagerPage.files.table.columns.monthPart', {
                                  month: String(parsed.monthIndex + 1),
                                })
                              : monthKey}
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
                                  {formatRollupMonthQuantity(rollup?.monthly[monthKey])}
                                </span>
                              </td>
                            )
                          })}
                          <td className="tm-pm-resource-table-col-spacer" aria-hidden />
                        </tr>
                      )
                    }),
                  )
                })()}
              </tbody>
            </table>
          ) : (
            <table className="tm-pm-resource-table">
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
                {showStartColumn ? <col className="tm-pm-features-table-col-date" /> : null}
                {showFinishColumn ? <col className="tm-pm-features-table-col-date" /> : null}
                {showPlannedPercentColumn ? (
                  <col className="tm-pm-features-table-col-planned-percent" />
                ) : null}
                {visibleMonthKeys.map((monthKey) => (
                  <col key={monthKey} className="tm-pm-features-table-col-month" />
                ))}
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
              <tbody>
                {(() => {
                  const displayEntries =
                    isFundsView && fundsDisplayEntries
                      ? fundsDisplayEntries
                      : visibleRows.map((row) => ({ kind: 'row' as const, row }))
                  let detailIndex = 0
                  const entryRows = displayEntries.map((entry) => {
                    if (entry.kind === 'section') {
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

                    const row = entry.row
                    detailIndex += 1
                    const depth = featureRowDepth(row, byId)
                    const isSelected = selectedId === row.id
                    const isChecked = checkedIds.has(row.id)
                    const rollup = rollups.get(row.id)
                    const rowNumber = detailIndex
                    return (
                      <tr
                        key={row.id}
                        className={[
                          isSelected ? 'tm-pm-resource-table-row--selected' : '',
                          isChecked ? 'tm-pm-resource-table-row--checked' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => setSelectedId(row.id)}
                        onContextMenu={(event) => handleRowContextMenu(event, row.id)}
                      >
                        <td className="tm-pm-resource-table-index">
                          {selectionMode ? (
                            <label
                              className="tm-kb-file-card-select"
                              title={`${t('projectManagerPage.files.table.selection.checkboxColumn')} ${rowNumber}`}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                className="tm-kb-file-card-select-input"
                                checked={isChecked}
                                aria-label={`${t('projectManagerPage.files.table.selection.checkboxColumn')} ${rowNumber}`}
                                onChange={(event) => {
                                  setCheckedIds((prev) => {
                                    const next = new Set(prev)
                                    if (event.target.checked) next.add(row.id)
                                    else next.delete(row.id)
                                    return next
                                  })
                                }}
                                onClick={(event) => event.stopPropagation()}
                              />
                              <span
                                className={[
                                  'tm-kb-file-card-select-box',
                                  isChecked ? 'tm-kb-file-card-select-box--checked' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                aria-hidden="true"
                              />
                            </label>
                          ) : (
                            <span className="tm-pm-resource-table-index-text">{rowNumber}</span>
                          )}
                        </td>
                        {(isMeteringCostView ? mCol.type : showTypeColumn) ? (
                          <td>
                            {isNodeView || isLiveNodeFeatureRow(row) ? (
                              <span className="tm-pm-features-table-rollup">
                                {t('projectManagerPage.files.table.nodeMilestoneType')}
                              </span>
                            ) : (
                              <select
                                className="tm-pm-resource-table-input tm-pm-resource-table-input--center"
                                value={row.type}
                                onChange={(event) =>
                                  patchRow(row.id, {
                                    type: event.target.value as PmFeatureType,
                                  })
                                }
                                onClick={(event) => event.stopPropagation()}
                              >
                                {isFundsView ? (
                                  <>
                                    {PM_COST_PRIMARY_TYPES.map((type) => (
                                      <option key={type} value={type}>
                                        {t(`projectManagerPage.costTable.types.${type}`)}
                                      </option>
                                    ))}
                                    <option
                                      value="__pm_cost_resource_group__"
                                      disabled
                                      title={t(
                                        'projectManagerPage.costTable.views.resourceCostsReserved',
                                      )}
                                    >
                                      {t('projectManagerPage.costTable.views.resourceCosts')}
                                    </option>
                                  </>
                                ) : lockedViewFilter != null &&
                                  lockedViewFilter !== 'scheduleAll' ? (
                                  <option value={lockedViewFilter}>
                                    {t(`projectManagerPage.files.menu.${lockedViewFilter}`)}
                                  </option>
                                ) : (
                                  PM_FEATURE_TYPES.filter(
                                    (type) => !isPmFeatureCostPrimaryType(type),
                                  ).map((type) => (
                                    <option key={type} value={type}>
                                      {t(`projectManagerPage.files.menu.${type}`)}
                                    </option>
                                  ))
                                )}
                              </select>
                            )}
                          </td>
                        ) : null}
                        {isMeteringCostView && mCol.sectionalWork ? (
                          <td className="tm-pm-resource-table-col-sectional">
                            <input
                              className="tm-pm-resource-table-input"
                              value={row.sectionalWork}
                              placeholder={t(
                                'projectManagerPage.costTable.columns.sectionalWork',
                              )}
                              onChange={(event) =>
                                patchRow(row.id, { sectionalWork: event.target.value })
                              }
                              onClick={(event) => event.stopPropagation()}
                            />
                          </td>
                        ) : null}
                        {isMeteringCostView && mCol.code ? (
                          <td className="tm-pm-resource-table-col-code">
                            <input
                              className="tm-pm-resource-table-input"
                              value={row.code}
                              placeholder={t('projectManagerPage.costTable.columns.code')}
                              onChange={(event) =>
                                patchRow(row.id, { code: event.target.value })
                              }
                              onClick={(event) => event.stopPropagation()}
                            />
                          </td>
                        ) : null}
                        {(isMeteringCostView ? mCol.name : showNameColumn) ? (
                          <td className="tm-pm-resource-table-col-name">
                            {isNodeView ? (
                              <span
                                className="tm-pm-features-table-name-text tm-pm-features-table-name-input"
                                style={{ paddingLeft: `${8 + depth * 16}px` }}
                                title={row.name.trim() || undefined}
                              >
                                {row.name.trim() || '—'}
                              </span>
                            ) : (
                              <input
                                className="tm-pm-resource-table-input tm-pm-features-table-name-input"
                                style={{ paddingLeft: `${8 + depth * 16}px` }}
                                value={row.name}
                                title={row.name.trim() || undefined}
                                placeholder={
                                  isMeteringCostView
                                    ? t('projectManagerPage.costTable.namePlaceholder')
                                    : t('projectManagerPage.files.table.namePlaceholder')
                                }
                                onChange={(event) => patchRow(row.id, { name: event.target.value })}
                                onClick={(event) => event.stopPropagation()}
                              />
                            )}
                          </td>
                        ) : null}
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
                        <td className="tm-pm-resource-table-col-spacer" aria-hidden />
                      </tr>
                    )
                  })
                  // Empty metering: keep a zero-height scaffold row so the trailing spacer
                  // column participates in table layout (same as 价格表 rows always do).
                  if (isMeteringCostView && displayEntries.length === 0) {
                    return (
                      <tr
                        key="__metering-col-scaffold"
                        className="tm-pm-resource-table-row--col-scaffold"
                        aria-hidden
                      >
                        <td className="tm-pm-resource-table-index" />
                        {mCol.type ? <td className="tm-pm-resource-table-col-type" /> : null}
                        {mCol.sectionalWork ? (
                          <td className="tm-pm-resource-table-col-sectional" />
                        ) : null}
                        {mCol.code ? <td className="tm-pm-resource-table-col-code" /> : null}
                        {mCol.name ? <td className="tm-pm-resource-table-col-name" /> : null}
                        {mCol.featureDescription ? (
                          <td className="tm-pm-resource-table-col-feature" />
                        ) : null}
                        {mCol.unit ? <td className="tm-pm-resource-table-col-unit" /> : null}
                        {mCol.quantity ? <td className="tm-pm-resource-table-col-spec" /> : null}
                        {mCol.unitPrice ? <td className="tm-pm-resource-table-col-price" /> : null}
                        {mCol.totalPrice ? <td className="tm-pm-resource-table-col-price" /> : null}
                        {mCol.baseline ? (
                          <td className="tm-pm-resource-table-col-baseline" />
                        ) : null}
                        {mCol.note ? <td className="tm-pm-resource-table-col-note" /> : null}
                        <td className="tm-pm-resource-table-col-spacer" />
                      </tr>
                    )
                  }
                  return entryRows
                })()}
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
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

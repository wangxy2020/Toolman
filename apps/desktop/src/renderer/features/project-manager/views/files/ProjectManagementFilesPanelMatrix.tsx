import type { FC } from 'react'

import { formatWorkItemDate } from '../schedule/pm-gantt-utils'
import {
  formatRollupMonthQuantity,
  formatRollupQuantity,
  parseMonthKey,
  rollupHorizontalAmount,
} from './pm-feature-gantt-rollup'
import {
  featureRowDepth,
  isPmFeatureCostPrimaryType,
  PM_FEATURE_TYPES,
  type PmFeatureType,
} from './pm-features-catalog'
import { formatCostTotalPrice, PM_COST_PRIMARY_TYPES } from '../cost/pm-cost-catalog'
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
    selectionMode,
    checkedIds,
    setCheckedIds,
    matrixLayout,
    byId,
    isFundsView,
    isProcurementView,
    visibleRows,
    quantityFromGanttHint,
    monthFromGanttHint,
    unitColumnLabel,
    showQuantityColumn,
    showPricingUnitColumn,
    showPurchaseCycleColumn,
    showTransportCycleColumn,
    rollups,
    fundsDisplayEntries,
    fundsTotals,
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

  return (
    <>
      <div className="tm-pm-resource-table-header-pin">
        <div ref={headerPinInnerRef} className="tm-pm-resource-table-header-pin-inner">
          <div
            className="tm-pm-resource-table-scroll-inner"
            onContextMenu={handleTableContextMenu}
          >
            {matrixLayout === 'vertical' ? (
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
                  {columnVisibility.type ? <col className="tm-pm-resource-table-col-type" /> : null}
                  {columnVisibility.name ? <col className="tm-pm-resource-table-col-name" /> : null}
                  {columnVisibility.unit ? <col className="tm-pm-resource-table-col-unit" /> : null}
                  {showPricingUnitColumn ? <col className="tm-pm-resource-table-col-unit" /> : null}
                  {showPurchaseCycleColumn ? <col className="tm-pm-features-table-col-cycle" /> : null}
                  {showTransportCycleColumn ? (
                    <col className="tm-pm-features-table-col-cycle" />
                  ) : null}
                  {showQuantityColumn ? <col className="tm-pm-resource-table-col-price" /> : null}
                  {columnVisibility.start ? <col className="tm-pm-features-table-col-date" /> : null}
                  {columnVisibility.finish ? <col className="tm-pm-features-table-col-date" /> : null}
                  {visibleMonthKeys.map((monthKey) => (
                    <col key={monthKey} className="tm-pm-features-table-col-month" />
                  ))}
                  {columnVisibility.remark ? (
                    <col className="tm-pm-features-table-col-remark" />
                  ) : null}
                  <col className="tm-pm-resource-table-col-spacer" />
                </colgroup>
                <thead onContextMenu={openColumnVisibilityMenu}>
                  <tr className="tm-pm-features-table-head-row tm-pm-features-table-head-row--year">
                    <th rowSpan={headerRowSpan} className="tm-pm-resource-table-col-index">
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
                        t('projectManagerPage.files.table.columns.index')
                      )}
                    </th>
                    {columnVisibility.type ? (
                      <th rowSpan={headerRowSpan} className="tm-pm-resource-table-col-type">
                        {t('projectManagerPage.files.table.columns.type')}
                      </th>
                    ) : null}
                    {columnVisibility.name ? (
                      <th rowSpan={headerRowSpan} className="tm-pm-resource-table-col-name">
                        {t('projectManagerPage.files.table.columns.name')}
                      </th>
                    ) : null}
                    {columnVisibility.unit ? (
                      <th rowSpan={headerRowSpan} className="tm-pm-resource-table-col-unit">
                        {unitColumnLabel}
                      </th>
                    ) : null}
                    {showPricingUnitColumn ? (
                      <th rowSpan={headerRowSpan} className="tm-pm-resource-table-col-unit">
                        {t('projectManagerPage.files.table.columns.pricingUnit')}
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
                    {showQuantityColumn ? (
                      <th rowSpan={headerRowSpan} className="tm-pm-resource-table-col-price">
                        {t('projectManagerPage.files.table.columns.quantity')}
                      </th>
                    ) : null}
                    {columnVisibility.start ? (
                      <th rowSpan={headerRowSpan} className="tm-pm-features-table-col-date">
                        {t('projectManagerPage.files.table.columns.start')}
                      </th>
                    ) : null}
                    {columnVisibility.finish ? (
                      <th rowSpan={headerRowSpan} className="tm-pm-features-table-col-date">
                        {t('projectManagerPage.files.table.columns.finish')}
                      </th>
                    ) : null}
                    {visibleYearBands.map((band) => (
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
                    ))}
                    {columnVisibility.remark ? (
                      <th rowSpan={headerRowSpan} className="tm-pm-features-table-col-remark">
                        {t('projectManagerPage.files.table.columns.remark')}
                      </th>
                    ) : null}
                    <th
                      rowSpan={headerRowSpan}
                      className="tm-pm-resource-table-col-spacer"
                      aria-hidden
                    />
                  </tr>
                  {visibleMonthKeys.length > 0 ? (
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
          {matrixLayout === 'vertical' ? (
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
                {columnVisibility.type ? <col className="tm-pm-resource-table-col-type" /> : null}
                {columnVisibility.name ? <col className="tm-pm-resource-table-col-name" /> : null}
                {columnVisibility.unit ? <col className="tm-pm-resource-table-col-unit" /> : null}
                {showPricingUnitColumn ? <col className="tm-pm-resource-table-col-unit" /> : null}
                {showPurchaseCycleColumn ? <col className="tm-pm-features-table-col-cycle" /> : null}
                {showTransportCycleColumn ? (
                  <col className="tm-pm-features-table-col-cycle" />
                ) : null}
                {showQuantityColumn ? <col className="tm-pm-resource-table-col-price" /> : null}
                {columnVisibility.start ? <col className="tm-pm-features-table-col-date" /> : null}
                {columnVisibility.finish ? <col className="tm-pm-features-table-col-date" /> : null}
                {visibleMonthKeys.map((monthKey) => (
                  <col key={monthKey} className="tm-pm-features-table-col-month" />
                ))}
                {columnVisibility.remark ? (
                  <col className="tm-pm-features-table-col-remark" />
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
                  return displayEntries.map((entry) => {
                    if (entry.kind === 'section') {
                      const sectionRollup = entry.rollup
                      return (
                        <tr key={entry.id} className="tm-pm-features-table-funds-section">
                          <td className="tm-pm-resource-table-index">
                            <span className="tm-pm-resource-table-index-text" />
                          </td>
                          {columnVisibility.type ? (
                            <td className="tm-pm-resource-table-cell--center">
                              <span className="tm-pm-features-table-funds-section-label">
                                {t(`projectManagerPage.costTable.types.${entry.type}`)}
                              </span>
                            </td>
                          ) : null}
                          {columnVisibility.name ? (
                            <td className="tm-pm-resource-table-col-name">
                              <span className="tm-pm-features-table-funds-section-label">
                                {entry.label}
                              </span>
                            </td>
                          ) : null}
                          {columnVisibility.unit ? (
                            <td className="tm-pm-resource-table-cell--center">
                              <span
                                className="tm-pm-features-table-rollup tm-pm-features-table-funds-section-total"
                                title={quantityFromGanttHint}
                              >
                                {formatCostTotalPrice(rollupHorizontalAmount(sectionRollup) || null)}
                              </span>
                            </td>
                          ) : null}
                          {columnVisibility.start ? (
                            <td className="tm-pm-resource-table-cell--center">
                              <span className="tm-pm-features-table-rollup">
                                {formatWorkItemDate(sectionRollup.startDate ?? undefined)}
                              </span>
                            </td>
                          ) : null}
                          {columnVisibility.finish ? (
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
                          {columnVisibility.remark ? (
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
                        {columnVisibility.type ? (
                          <td>
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
                          </td>
                        ) : null}
                        {columnVisibility.name ? (
                          <td className="tm-pm-resource-table-col-name">
                            <input
                              className="tm-pm-resource-table-input tm-pm-features-table-name-input"
                              style={{ paddingLeft: `${8 + depth * 16}px` }}
                              value={row.name}
                              title={row.name.trim() || undefined}
                              placeholder={t('projectManagerPage.files.table.namePlaceholder')}
                              onChange={(event) => patchRow(row.id, { name: event.target.value })}
                              onClick={(event) => event.stopPropagation()}
                            />
                          </td>
                        ) : null}
                        {columnVisibility.unit ? (
                          <td className="tm-pm-resource-table-cell--center">
                            {isFundsView ? (
                              <span
                                className="tm-pm-features-table-rollup"
                                title={quantityFromGanttHint}
                              >
                                {formatCostTotalPrice(rollupHorizontalAmount(rollup) || null)}
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
                        {showPricingUnitColumn ? (
                          <td className="tm-pm-resource-table-cell--center">
                            <input
                              className="tm-pm-resource-table-input tm-pm-resource-table-input--center"
                              value={row.pricingUnit}
                              onChange={(event) =>
                                patchRow(row.id, { pricingUnit: event.target.value })
                              }
                              onClick={(event) => event.stopPropagation()}
                            />
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
                        {showQuantityColumn ? (
                          <td className="tm-pm-resource-table-cell--center">
                            <span className="tm-pm-features-table-rollup" title={quantityFromGanttHint}>
                              {formatRollupQuantity(rollup?.quantity)}
                            </span>
                          </td>
                        ) : null}
                        {columnVisibility.start ? (
                          <td className="tm-pm-resource-table-cell--center">
                            <span className="tm-pm-features-table-rollup">
                              {formatWorkItemDate(rollup?.startDate ?? undefined)}
                            </span>
                          </td>
                        ) : null}
                        {columnVisibility.finish ? (
                          <td className="tm-pm-resource-table-cell--center">
                            <span className="tm-pm-features-table-rollup">
                              {formatWorkItemDate(rollup?.finishDate ?? undefined)}
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
                        {columnVisibility.remark ? (
                          <td className="tm-pm-features-table-col-remark">
                            <input
                              className="tm-pm-resource-table-input"
                              value={row.remark}
                              placeholder={t('projectManagerPage.files.table.remarkPlaceholder')}
                              onChange={(event) => patchRow(row.id, { remark: event.target.value })}
                              onClick={(event) => event.stopPropagation()}
                            />
                          </td>
                        ) : null}
                        <td className="tm-pm-resource-table-col-spacer" aria-hidden />
                      </tr>
                    )
                  })
                })()}
                {isFundsView && fundsTotals && visibleRows.length > 0 ? (
                  <tr className="tm-pm-features-table-funds-total">
                    <td className="tm-pm-resource-table-index">
                      <span className="tm-pm-resource-table-index-text" />
                    </td>
                    {columnVisibility.type ? (
                      <td className="tm-pm-resource-table-cell--center">
                        {columnVisibility.name ? null : (
                          <span className="tm-pm-features-table-funds-total-label">
                            {t('projectManagerPage.files.table.fundsTotal')}
                          </span>
                        )}
                      </td>
                    ) : null}
                    {columnVisibility.name ? (
                      <td className="tm-pm-resource-table-col-name">
                        <span className="tm-pm-features-table-funds-total-label">
                          {t('projectManagerPage.files.table.fundsTotal')}
                        </span>
                      </td>
                    ) : null}
                    {columnVisibility.unit ? (
                      <td className="tm-pm-resource-table-cell--center">
                        <span
                          className="tm-pm-features-table-rollup tm-pm-features-table-funds-total-value"
                          title={quantityFromGanttHint}
                        >
                          {formatCostTotalPrice(fundsTotals.amount || null)}
                        </span>
                      </td>
                    ) : null}
                    {columnVisibility.start ? (
                      <td className="tm-pm-resource-table-cell--center">
                        <span className="tm-pm-features-table-rollup">
                          {formatWorkItemDate(fundsTotals.startDate ?? undefined)}
                        </span>
                      </td>
                    ) : null}
                    {columnVisibility.finish ? (
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

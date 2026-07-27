import type { FC } from 'react'

import { PmDecimalTableInput } from '../../PmDecimalTableInput'
import { handlePmTableCellNavKeyDown } from '../../pm-table-cell-nav'
import {
  encodeCustomTypeSelectValue,
  PM_RESOURCE_BUILTIN_PRIMARY_TYPES,
  resourceRowDepth,
} from './pm-resource-catalog'
import type { ProjectResourceTablePanelState } from './useProjectResourceTablePanel'

export interface ProjectResourceTableGridProps {
  state: ProjectResourceTablePanelState
}

/** The resource table itself: pinned header, scrollable body rows, and the custom H scrollbar. */
export const ProjectResourceTableGrid: FC<ProjectResourceTableGridProps> = ({ state }) => {
  const {
    t,
    isPractice,
    canEdit,
    columnVisibility,
    selectionMode,
    visibleRows,
    checkedIds,
    handleSelectAll,
    handleClearSelection,
    practiceColumnLabel,
    openColumnVisibilityMenu,
    tableScrollRef,
    headerPinInnerRef,
    hTrackRef,
    hScrollMetrics,
    hScrollDragging,
    syncHScrollMetrics,
    onHTrackPointerDown,
    byId,
    selectedId,
    setSelectedId,
    handleRowContextMenu,
    typeSelectValueForRow,
    handleTypeSelectChange,
    customTypeNames,
    handleRowSpecChange,
    handleRowNameChange,
    handleRowUnitChange,
    handleRowPricingUnitTextChange,
    handleRowPricingUnitCommit,
    handleRowUnitPriceCommit,
    getRowBaselineDisplay,
    handleRowNoteChange,
    handleRowCheckedChange,
  } = state

  if (!canEdit) {
    return (
      <div className="tm-pm-empty">{t('projectManagerPage.resourceTable.needProject')}</div>
    )
  }

  return (
    <div
      className={[
        'tm-pm-resource-table-scroll-wrap',
        hScrollMetrics.overflowing ? 'tm-pm-resource-table-scroll-wrap--h-overflow' : '',
        hScrollDragging ? 'tm-pm-resource-table-scroll-wrap--h-dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="tm-pm-resource-table-header-pin">
        <div ref={headerPinInnerRef} className="tm-pm-resource-table-header-pin-inner">
          <div className="tm-pm-resource-table-scroll-inner">
            <table className="tm-pm-resource-table">
              <colgroup>
                <col className="tm-pm-resource-table-col-index" />
                {columnVisibility.type ? <col className="tm-pm-resource-table-col-type" /> : null}
                {isPractice ? (
                  <>
                    {columnVisibility.spec ? <col className="tm-pm-resource-table-col-spec" /> : null}
                    {columnVisibility.name ? <col className="tm-pm-resource-table-col-name" /> : null}
                  </>
                ) : (
                  <>
                    {columnVisibility.name ? <col className="tm-pm-resource-table-col-name" /> : null}
                    {columnVisibility.spec ? <col className="tm-pm-resource-table-col-spec" /> : null}
                  </>
                )}
                {columnVisibility.unit ? <col className="tm-pm-resource-table-col-unit" /> : null}
                {columnVisibility.pricingUnit ? (
                  <col className="tm-pm-resource-table-col-pricing-unit" />
                ) : null}
                {columnVisibility.unitPrice ? <col className="tm-pm-resource-table-col-price" /> : null}
                {columnVisibility.baseline ? (
                  <col className="tm-pm-resource-table-col-baseline" />
                ) : null}
                {columnVisibility.note ? <col className="tm-pm-resource-table-col-note" /> : null}
                <col className="tm-pm-resource-table-col-spacer" />
              </colgroup>
              <thead onContextMenu={openColumnVisibilityMenu}>
                <tr>
                  <th className="tm-pm-resource-table-col-index">
                    {selectionMode ? (
                      <label
                        className="tm-kb-file-card-select"
                        title={t('projectManagerPage.resourceTable.selection.selectAll')}>
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
                          aria-label={t('projectManagerPage.resourceTable.selection.selectAll')}
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
                      practiceColumnLabel('index')
                    )}
                  </th>
                  {columnVisibility.type ? (
                    <th className="tm-pm-resource-table-col-type">
                      {practiceColumnLabel('type')}
                    </th>
                  ) : null}
                  {isPractice ? (
                    <>
                      {columnVisibility.spec ? (
                        <th className="tm-pm-resource-table-col-spec">
                          {practiceColumnLabel('spec')}
                        </th>
                      ) : null}
                      {columnVisibility.name ? (
                        <th className="tm-pm-resource-table-col-name">
                          {practiceColumnLabel('name')}
                        </th>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {columnVisibility.name ? (
                        <th className="tm-pm-resource-table-col-name">
                          {practiceColumnLabel('name')}
                        </th>
                      ) : null}
                      {columnVisibility.spec ? (
                        <th className="tm-pm-resource-table-col-spec">
                          {practiceColumnLabel('spec')}
                        </th>
                      ) : null}
                    </>
                  )}
                  {columnVisibility.unit ? (
                    <th className="tm-pm-resource-table-col-unit">
                      {practiceColumnLabel('unit')}
                    </th>
                  ) : null}
                  {columnVisibility.pricingUnit ? (
                    <th className="tm-pm-resource-table-col-pricing-unit">
                      {practiceColumnLabel('pricingUnit')}
                    </th>
                  ) : null}
                  {columnVisibility.unitPrice ? (
                    <th className="tm-pm-resource-table-col-price">
                      {practiceColumnLabel('unitPrice')}
                    </th>
                  ) : null}
                  {columnVisibility.baseline ? (
                    <th className="tm-pm-resource-table-col-baseline">
                      {practiceColumnLabel('baseline')}
                    </th>
                  ) : null}
                  {columnVisibility.note ? (
                    <th className="tm-pm-resource-table-col-note">
                      {practiceColumnLabel('note')}
                    </th>
                  ) : null}
                  <th className="tm-pm-resource-table-col-spacer" aria-hidden />
                </tr>
              </thead>
            </table>
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
        <div className="tm-pm-resource-table-scroll-inner">
      <table
        className="tm-pm-resource-table"
        onKeyDown={(event) => {
          handlePmTableCellNavKeyDown(event)
        }}
      >
        <colgroup>
          <col className="tm-pm-resource-table-col-index" />
          {columnVisibility.type ? <col className="tm-pm-resource-table-col-type" /> : null}
          {isPractice ? (
            <>
              {columnVisibility.spec ? <col className="tm-pm-resource-table-col-spec" /> : null}
              {columnVisibility.name ? <col className="tm-pm-resource-table-col-name" /> : null}
            </>
          ) : (
            <>
              {columnVisibility.name ? <col className="tm-pm-resource-table-col-name" /> : null}
              {columnVisibility.spec ? <col className="tm-pm-resource-table-col-spec" /> : null}
            </>
          )}
          {columnVisibility.unit ? <col className="tm-pm-resource-table-col-unit" /> : null}
          {columnVisibility.pricingUnit ? (
            <col className="tm-pm-resource-table-col-pricing-unit" />
          ) : null}
          {columnVisibility.unitPrice ? <col className="tm-pm-resource-table-col-price" /> : null}
          {columnVisibility.baseline ? (
            <col className="tm-pm-resource-table-col-baseline" />
          ) : null}
          {columnVisibility.note ? <col className="tm-pm-resource-table-col-note" /> : null}
          <col className="tm-pm-resource-table-col-spacer" />
        </colgroup>
        <tbody>
          {visibleRows.map((row, index) => {
            const depth = resourceRowDepth(row, byId)
            const isSelected = selectedId === row.id
            const isChecked = checkedIds.has(row.id)
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
                onContextMenu={(event) => handleRowContextMenu(event, row.id)}>
                <td className="tm-pm-resource-table-index">
                  {selectionMode ? (
                    <label
                      className="tm-kb-file-card-select"
                      title={`${t('projectManagerPage.resourceTable.selection.checkboxColumn')} ${index + 1}`}
                      onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="tm-kb-file-card-select-input"
                        checked={isChecked}
                        aria-label={`${t('projectManagerPage.resourceTable.selection.checkboxColumn')} ${index + 1}`}
                        onChange={(event) => handleRowCheckedChange(row.id, event.target.checked)}
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
                    <span className="tm-pm-resource-table-index-text">{index + 1}</span>
                  )}
                </td>
                {columnVisibility.type ? (
                  <td className="tm-pm-resource-table-col-type">
                    <select
                      className="tm-pm-resource-table-input tm-pm-resource-table-input--center"
                      value={typeSelectValueForRow(row)}
                      onChange={(event) =>
                        handleTypeSelectChange(row.id, event.target.value)
                      }
                      onClick={(event) => event.stopPropagation()}
                    >
                      {isPractice
                        ? (['labor', 'material', 'equipment'] as const).map((type) => (
                            <option key={type} value={type}>
                              {t(`projectManagerPage.resourcePractice.views.${type}`)}
                            </option>
                          ))
                        : (
                          <>
                            {PM_RESOURCE_BUILTIN_PRIMARY_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {t(`projectManagerPage.resourceTable.types.${type}`)}
                              </option>
                            ))}
                            <option value="custom">
                              {t('projectManagerPage.resourceTable.types.custom')}
                            </option>
                            {customTypeNames.map((name) => (
                              <option key={`type:${name}`} value={encodeCustomTypeSelectValue(name)}>
                                {name}
                              </option>
                            ))}
                            <option
                              value="__pm_resource_cost_group__"
                              disabled
                              title={t(
                                'projectManagerPage.resourceTable.views.costResourcesReserved',
                              )}
                            >
                              {t('projectManagerPage.resourceTable.views.costResources')}
                            </option>
                          </>
                        )}
                    </select>
                  </td>
                ) : null}
                {isPractice ? (
                  <>
                    {columnVisibility.spec ? (
                      <td>
                        <input
                          className="tm-pm-resource-table-input"
                          value={row.spec}
                          placeholder={t('projectManagerPage.resourcePractice.specPlaceholder')}
                          onChange={(event) => handleRowSpecChange(row.id, event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </td>
                    ) : null}
                    {columnVisibility.name ? (
                      <td>
                        <input
                          className="tm-pm-resource-table-input"
                          style={{ paddingLeft: `${8 + depth * 16}px` }}
                          value={row.name}
                          placeholder={t('projectManagerPage.resourcePractice.namePlaceholder')}
                          onChange={(event) => handleRowNameChange(row, event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </td>
                    ) : null}
                  </>
                ) : (
                  <>
                    {columnVisibility.name ? (
                      <td>
                        <input
                          className="tm-pm-resource-table-input"
                          style={{ paddingLeft: `${8 + depth * 16}px` }}
                          value={row.name}
                          placeholder={t('projectManagerPage.resourceTable.namePlaceholder')}
                          onChange={(event) => handleRowNameChange(row, event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </td>
                    ) : null}
                    {columnVisibility.spec ? (
                      <td>
                        <input
                          className="tm-pm-resource-table-input"
                          value={row.spec}
                          placeholder={t('projectManagerPage.resourceTable.specPlaceholder')}
                          onChange={(event) => handleRowSpecChange(row.id, event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </td>
                    ) : null}
                  </>
                )}
                {columnVisibility.unit ? (
                  <td className="tm-pm-resource-table-cell--center">
                    <input
                      className="tm-pm-resource-table-input tm-pm-resource-table-input--center"
                      value={row.unit}
                      onChange={(event) => handleRowUnitChange(row, event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </td>
                ) : null}
                {columnVisibility.pricingUnit ? (
                  <td className="tm-pm-resource-table-cell--center">
                    {isPractice ? (
                      <PmDecimalTableInput
                        className="tm-pm-resource-table-input tm-pm-resource-table-input--number"
                        value={
                          row.pricingUnit.trim() === '' ||
                          !Number.isFinite(Number(row.pricingUnit))
                            ? null
                            : Number(row.pricingUnit)
                        }
                        onCommit={(next) => handleRowPricingUnitCommit(row.id, next)}
                        onClick={(event) => event.stopPropagation()}
                      />
                    ) : (
                      <input
                        className="tm-pm-resource-table-input tm-pm-resource-table-input--center"
                        value={row.pricingUnit}
                        onChange={(event) =>
                          handleRowPricingUnitTextChange(row.id, event.target.value)
                        }
                        onClick={(event) => event.stopPropagation()}
                      />
                    )}
                  </td>
                ) : null}
                {columnVisibility.unitPrice ? (
                  <td className="tm-pm-resource-table-cell--center">
                    <PmDecimalTableInput
                      className="tm-pm-resource-table-input tm-pm-resource-table-input--number"
                      value={row.unitPrice}
                      onCommit={(unitPrice) => handleRowUnitPriceCommit(row, unitPrice)}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </td>
                ) : null}
                {columnVisibility.baseline ? (
                  <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-baseline">
                    {(() => {
                      const { label, off, ratio } = getRowBaselineDisplay(row)
                      return (
                        <span
                          className={[
                            'tm-pm-resource-table-baseline-text',
                            off ? 'tm-pm-resource-table-baseline-text--off' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          title={
                            ratio == null
                              ? undefined
                              : t('projectManagerPage.resourceTable.baselineHint', {
                                  ratio: label,
                                })
                          }>
                          {label}
                        </span>
                      )
                    })()}
                  </td>
                ) : null}
                {columnVisibility.note ? (
                  <td>
                    <input
                      className="tm-pm-resource-table-input"
                      value={row.note}
                      placeholder={t('projectManagerPage.resourceTable.notePlaceholder')}
                      onChange={(event) => handleRowNoteChange(row.id, event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </td>
                ) : null}
                <td className="tm-pm-resource-table-col-spacer" aria-hidden />
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
      </div>
      {hScrollMetrics.overflowing ? (
        <div
          ref={hTrackRef}
          className="tm-pm-gantt-grid-custom-hscroll"
          onPointerDown={onHTrackPointerDown}
          role="scrollbar"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(
            (hScrollMetrics.thumbOffset /
              Math.max(
                1,
                (tableScrollRef.current?.clientWidth ?? 1) - hScrollMetrics.thumbSize,
              )) *
              100,
          )}
        >
          <div
            className="tm-pm-gantt-grid-custom-hscroll-thumb"
            style={{
              width: `${hScrollMetrics.thumbSize}px`,
              left: `${hScrollMetrics.thumbOffset}px`,
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

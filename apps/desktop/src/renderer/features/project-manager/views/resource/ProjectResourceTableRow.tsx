import type { FC } from 'react'

import { PmDecimalTableInput } from '../../PmDecimalTableInput'
import {
  encodeCustomTypeSelectValue,
  PM_RESOURCE_BUILTIN_PRIMARY_TYPES,
  resourceRowDepth,
} from './pm-resource-catalog'
import type { ProjectResourceTablePanelState } from './useProjectResourceTablePanel'

export const ProjectResourceTableRow: FC<{
  state: ProjectResourceTablePanelState
  row: ProjectResourceTablePanelState['visibleRows'][number]
  index: number
}> = ({ state, row, index }) => {
  const {
    t,
    isPractice,
    columnVisibility,
    selectionMode,
    checkedIds,
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
}

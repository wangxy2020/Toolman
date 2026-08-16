import type { FC } from 'react'

import { useI18n } from '../../../../i18n/useI18n'
import { PmDecimalTableInput } from '../../PmDecimalTableInput'
import {
  PM_COST_PRACTICE_QUOTA_TYPES,
  PM_COST_PRIMARY_TYPES,
  computeCostBaselineRatio,
  computeCostRowTotalPrice,
  formatCostBaselineRatio,
  formatCostTotalPrice,
  isCostBaselineRatioOff,
  isPmCostPracticeQuotaType,
  lookupBaselineUnitPrice,
  costRowDepth,
  type PmCostType,
} from './pm-cost-catalog'
import { syncFeatureDescriptionHeight } from './pm-cost-panel-utils'
import type { ProjectCostTablePanelState } from './useProjectCostTablePanel'

type DisplayRowEntry = Extract<
  ProjectCostTablePanelState['displayEntries'][number],
  { kind: 'row' }
>

type Props = {
  entry: DisplayRowEntry
  state: ProjectCostTablePanelState
}

export const ProjectCostTableDataRow: FC<Props> = ({ entry, state }) => {
  const { t } = useI18n()
  const {
    columnVisibility,
    rows,
    byId,
    childrenByParentId,
    baselinePriceIndex,
    isPractice,
    isAllScope,
    selectedId,
    setSelectedId,
    checkedIds,
    setCheckedIds,
    selectionMode,
    handleRowContextMenu,
    costQuotaView,
    handleRowTypeChange,
    handleRowNameChange,
    handleRowUnitPriceChange,
    patchRow,
  } = state

  const { row, index } = entry
  const depth = costRowDepth(row, byId)
  const isSelected = selectedId === row.id
  const isChecked = checkedIds.has(row.id)
  const totalPrice = computeCostRowTotalPrice(row, rows, childrenByParentId)

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
                        title={`${t('projectManagerPage.costTable.selection.checkboxColumn')} ${index + 1}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="tm-kb-file-card-select-input"
                          checked={isChecked}
                          aria-label={`${t('projectManagerPage.costTable.selection.checkboxColumn')} ${index + 1}`}
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
                      <span className="tm-pm-resource-table-index-text">{index + 1}</span>
                    )}
                  </td>
                  {columnVisibility.type ? (
                    <td>
                      <select
                        className="tm-pm-resource-table-input tm-pm-resource-table-input--center"
                        value={
                          isPractice
                            ? isPmCostPracticeQuotaType(row.type)
                              ? row.type
                              : costQuotaView
                            : row.type
                        }
                        onChange={(event) => {
                          const type = event.target.value as PmCostType
                          handleRowTypeChange(row, type)
                        }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {isPractice
                          ? PM_COST_PRACTICE_QUOTA_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {t(`projectManagerPage.costPractice.views.${type}`)}
                              </option>
                            ))
                          : (
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
                          )}
                      </select>
                    </td>
                  ) : null}
                  {columnVisibility.sectionalWork ? (
                    <td className="tm-pm-resource-table-col-sectional">
                      <input
                        className="tm-pm-resource-table-input"
                        value={row.sectionalWork ?? ''}
                        placeholder={t('projectManagerPage.costTable.sectionalWorkPlaceholder')}
                        onChange={(event) =>
                          patchRow(row.id, { sectionalWork: event.target.value })
                        }
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>
                  ) : null}
                  {columnVisibility.code ? (
                    <td className="tm-pm-resource-table-col-code">
                      <input
                        className="tm-pm-resource-table-input tm-pm-resource-table-input--center"
                        value={row.code ?? ''}
                        placeholder={t('projectManagerPage.costTable.codePlaceholder')}
                        onChange={(event) => patchRow(row.id, { code: event.target.value })}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>
                  ) : null}
                  {columnVisibility.name ? (
                    <td>
                      <input
                        className="tm-pm-resource-table-input"
                        style={{ paddingLeft: `${8 + depth * 16}px` }}
                        value={row.name ?? ''}
                        placeholder={t('projectManagerPage.costTable.namePlaceholder')}
                        onChange={(event) => {
                          handleRowNameChange(row, event.target.value)
                        }}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>
                  ) : null}
                  {columnVisibility.featureDescription ? (
                    <td className="tm-pm-resource-table-col-feature">
                      <textarea
                        className="tm-pm-resource-table-input tm-pm-resource-table-input--feature"
                        rows={1}
                        value={row.featureDescription ?? ''}
                        title={row.featureDescription?.trim() ? row.featureDescription : undefined}
                        placeholder={t(
                          'projectManagerPage.costTable.featureDescriptionPlaceholder',
                        )}
                        onChange={(event) => {
                          syncFeatureDescriptionHeight(event.currentTarget)
                          patchRow(row.id, {
                            featureDescription: event.target.value,
                          })
                        }}
                        onInput={(event) => syncFeatureDescriptionHeight(event.currentTarget)}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>
                  ) : null}
                  {columnVisibility.unit ? (
                    <td className="tm-pm-resource-table-cell--center">
                      <input
                        className="tm-pm-resource-table-input tm-pm-resource-table-input--center"
                        value={row.unit}
                        onChange={(event) => patchRow(row.id, { unit: event.target.value })}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>
                  ) : null}
                  {columnVisibility.quantity ? (
                    <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-spec">
                      <PmDecimalTableInput
                        className="tm-pm-resource-table-input tm-pm-resource-table-input--number"
                        value={row.quantity}
                        onCommit={(quantity) => patchRow(row.id, { quantity })}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>
                  ) : null}
                  {columnVisibility.unitPrice ? (
                    <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-price">
                      <PmDecimalTableInput
                        className="tm-pm-resource-table-input tm-pm-resource-table-input--number"
                        value={row.unitPrice}
                        onCommit={(unitPrice) => {
                          handleRowUnitPriceChange(row, unitPrice)
                        }}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>
                  ) : null}
                  {columnVisibility.totalPrice ? (
                    <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-price">
                      <span className="tm-pm-resource-table-baseline-text">
                        {formatCostTotalPrice(totalPrice)}
                      </span>
                    </td>
                  ) : null}
                  {columnVisibility.baseline ? (
                    <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-baseline">
                      {(() => {
                        const ratio = isAllScope
                          ? 1
                          : computeCostBaselineRatio(
                              row.unitPrice,
                              baselinePriceIndex
                                ? lookupBaselineUnitPrice(row, baselinePriceIndex)
                                : null,
                            )
                        const label = ratio == null ? '—' : formatCostBaselineRatio(ratio)
                        const off = !isAllScope && isCostBaselineRatioOff(ratio)
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
                                : t('projectManagerPage.costTable.baselineHint', {
                                    ratio: label,
                                  })
                            }
                          >
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
                        value={row.note ?? ''}
                        placeholder={t('projectManagerPage.costTable.notePlaceholder')}
                        onChange={(event) => patchRow(row.id, { note: event.target.value })}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>
                  ) : null}
                  <td className="tm-pm-resource-table-col-spacer" aria-hidden />
                </tr>
  )
}

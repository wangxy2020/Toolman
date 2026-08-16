import type { FC } from 'react'
import {
  isLiveNodeFeatureRow,
  isPmFeatureCostPrimaryType,
  PM_FEATURE_TYPES,
  type PmFeatureType,
} from './pm-features-catalog'
import { PM_COST_PRIMARY_TYPES } from '../cost/pm-cost-catalog'
import type { PmFeatureRow } from './pm-features-catalog'
import type { MatrixView } from './ProjectManagementFilesPanelMatrixView'

export const ProjectManagementFilesPanelMatrixRowLead: FC<{
  view: MatrixView
  row: PmFeatureRow
  depth: number
  isChecked: boolean
  rowNumber: number
}> = ({ view, row, depth, isChecked, rowNumber }) => {
  const {
    t,
    selectionMode,
    setCheckedIds,
    isFundsView,
    lockedViewFilter,
    isMeteringCostView,
    isNodeView,
    showTypeColumn,
    showNameColumn,
    mCol,
    patchRow,
  } = view
  return (
    <>
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
    </>
  )
}

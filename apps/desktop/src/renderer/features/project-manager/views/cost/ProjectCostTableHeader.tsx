import type { FC } from 'react'

import { useI18n } from '../../../../i18n/useI18n'
import { ProjectCostTableColGroup } from './ProjectCostTableColGroup'
import type { ProjectCostTablePanelState } from './useProjectCostTablePanel'

export interface ProjectCostTableHeaderProps {
  state: ProjectCostTablePanelState
}

/** Header row pinned above the vertical scroll; horizontal position synced via transform. */
export const ProjectCostTableHeader: FC<ProjectCostTableHeaderProps> = ({ state }) => {
  const { t } = useI18n()
  const {
    headerPinInnerRef,
    columnVisibility,
    selectionMode,
    visibleRows,
    checkedIds,
    handleSelectAll,
    handleClearSelection,
    totalPriceColumnLabel,
    openColumnVisibilityMenu,
  } = state

  const allChecked =
    visibleRows.length > 0 && visibleRows.every((row) => checkedIds.has(row.id))

  return (
    <div className="tm-pm-resource-table-header-pin">
      <div ref={headerPinInnerRef} className="tm-pm-resource-table-header-pin-inner">
        <div className="tm-pm-resource-table-scroll-inner">
          <table className="tm-pm-resource-table">
            <ProjectCostTableColGroup columnVisibility={columnVisibility} />
            <thead onContextMenu={openColumnVisibilityMenu}>
              <tr>
                <th className="tm-pm-resource-table-col-index">
                  {selectionMode ? (
                    <label
                      className="tm-kb-file-card-select"
                      title={t('projectManagerPage.costTable.selection.selectAll')}
                    >
                      <input
                        type="checkbox"
                        className="tm-kb-file-card-select-input"
                        checked={allChecked}
                        onChange={(event) => {
                          if (event.target.checked) handleSelectAll()
                          else handleClearSelection()
                        }}
                        aria-label={t('projectManagerPage.costTable.selection.selectAll')}
                      />
                      <span
                        className={[
                          'tm-kb-file-card-select-box',
                          allChecked ? 'tm-kb-file-card-select-box--checked' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        aria-hidden="true"
                      />
                    </label>
                  ) : (
                    t('projectManagerPage.costTable.columns.index')
                  )}
                </th>
                {columnVisibility.type ? (
                  <th className="tm-pm-resource-table-col-type">
                    {t('projectManagerPage.costTable.columns.type')}
                  </th>
                ) : null}
                {columnVisibility.sectionalWork ? (
                  <th className="tm-pm-resource-table-col-sectional">
                    {t('projectManagerPage.costTable.columns.sectionalWork')}
                  </th>
                ) : null}
                {columnVisibility.code ? (
                  <th className="tm-pm-resource-table-col-code">
                    {t('projectManagerPage.costTable.columns.code')}
                  </th>
                ) : null}
                {columnVisibility.name ? (
                  <th className="tm-pm-resource-table-col-name">
                    {t('projectManagerPage.costTable.columns.name')}
                  </th>
                ) : null}
                {columnVisibility.featureDescription ? (
                  <th className="tm-pm-resource-table-col-feature">
                    {t('projectManagerPage.costTable.columns.featureDescription')}
                  </th>
                ) : null}
                {columnVisibility.unit ? (
                  <th className="tm-pm-resource-table-col-unit">
                    {t('projectManagerPage.costTable.columns.unit')}
                  </th>
                ) : null}
                {columnVisibility.quantity ? (
                  <th className="tm-pm-resource-table-col-spec">
                    {t('projectManagerPage.costTable.columns.quantity')}
                  </th>
                ) : null}
                {columnVisibility.unitPrice ? (
                  <th className="tm-pm-resource-table-col-price">
                    {t('projectManagerPage.costTable.columns.unitPrice')}
                  </th>
                ) : null}
                {columnVisibility.totalPrice ? (
                  <th className="tm-pm-resource-table-col-price">{totalPriceColumnLabel}</th>
                ) : null}
                {columnVisibility.baseline ? (
                  <th className="tm-pm-resource-table-col-baseline">
                    {t('projectManagerPage.costTable.columns.baseline')}
                  </th>
                ) : null}
                {columnVisibility.note ? (
                  <th className="tm-pm-resource-table-col-note">
                    {t('projectManagerPage.costTable.columns.note')}
                  </th>
                ) : null}
                <th className="tm-pm-resource-table-col-spacer" aria-hidden />
              </tr>
            </thead>
          </table>
        </div>
      </div>
    </div>
  )
}

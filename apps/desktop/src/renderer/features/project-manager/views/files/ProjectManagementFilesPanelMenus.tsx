import type { FC } from 'react'
import { createPortal } from 'react-dom'

import {
  FEATURES_TOGGLE_COLUMNS,
  isFeaturesNodeColumn,
  isFeaturesNodeDefaultColumn,
  isFeaturesProcurementColumn,
  isFeaturesPricingUnitColumn,
  isFeaturesResourceStatColumn,
} from './pm-features-column-prefs'
import { COST_TOGGLE_COLUMNS } from '../cost/pm-cost-column-prefs'
import type { ProjectManagementFilesPanelState } from './useProjectManagementFilesPanel'

export interface ProjectManagementFilesPanelMenusProps {
  state: ProjectManagementFilesPanelState
}

/** Portal-rendered row/table context menu and the column-visibility menu. */
export const ProjectManagementFilesPanelMenus: FC<ProjectManagementFilesPanelMenusProps> = ({
  state,
}) => {
  const {
    t,
    contextMenu,
    setContextMenu,
    setSelectionMode,
    handleSelectAll,
    checkedIds,
    setPendingDelete,
    matrixLayout,
    setMatrixLayout,
    handleClearSelection,
    columnMenu,
    isFundsView,
    isProcurementView,
    isResourceStatView,
    isNodeView,
    columnVisibility,
    meteringColumnVisibility,
    toggleColumnVisibility,
    toggleMeteringColumnVisibility,
    unitColumnLabel,
    featureColumnLabel,
    meteringTotalPriceLabel,
  } = state

  const isMeteringCostView = state.isMeteringCostView

  return (
    <>
      {contextMenu
        ? createPortal(
            <>
              <button
                type="button"
                className="tm-group-context-menu-backdrop"
                aria-label={t('projectManagerPage.files.table.selection.cancel')}
                onClick={() => setContextMenu(null)}
              />
              <div
                className="tm-group-context-menu"
                style={{ left: contextMenu.left, top: contextMenu.top }}
                role="menu"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="tm-group-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setSelectionMode(true)
                    setContextMenu(null)
                  }}
                >
                  {t('projectManagerPage.files.table.selection.enterSelection')}
                </button>
                <button
                  type="button"
                  className="tm-group-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    handleSelectAll()
                    setContextMenu(null)
                  }}
                >
                  {t('projectManagerPage.files.table.selection.selectAll')}
                </button>
                <button
                  type="button"
                  className={[
                    'tm-group-context-menu-item',
                    'tm-group-context-menu-item--danger',
                    checkedIds.size === 0 ? 'tm-group-context-menu-item--disabled' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="menuitem"
                  disabled={checkedIds.size === 0}
                  onClick={() => {
                    if (checkedIds.size === 0) return
                    setContextMenu(null)
                    setPendingDelete(true)
                  }}
                >
                  {t('projectManagerPage.files.table.selection.deleteSelected')}
                  {checkedIds.size > 0 ? ` (${checkedIds.size})` : ''}
                </button>
                {!isMeteringCostView ? (
                  <button
                    type="button"
                    className="tm-group-context-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setMatrixLayout((current) =>
                        current === 'horizontal' ? 'vertical' : 'horizontal',
                      )
                      setContextMenu(null)
                    }}
                  >
                    {matrixLayout === 'horizontal'
                      ? t('projectManagerPage.files.table.selection.layoutVertical')
                      : t('projectManagerPage.files.table.selection.layoutHorizontal')}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="tm-group-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    handleClearSelection()
                    setContextMenu(null)
                  }}
                >
                  {t('projectManagerPage.files.table.selection.cancel')}
                </button>
              </div>
            </>,
            document.body,
          )
        : null}

      {columnMenu
        ? createPortal(
            <div
              className="tm-pm-gantt-col-menu"
              style={{ left: columnMenu.left, top: columnMenu.top, right: 'auto' }}
              onMouseDown={(event) => event.stopPropagation()}
              role="menu"
            >
              <div className="tm-pm-gantt-col-menu-title">
                {isMeteringCostView
                  ? t('projectManagerPage.costTable.columnVisibility')
                  : t('projectManagerPage.files.table.columnVisibility')}
              </div>
              {isMeteringCostView
                ? COST_TOGGLE_COLUMNS.map((column) => (
                    <label key={column} className="tm-pm-gantt-col-menu-item">
                      <input
                        type="checkbox"
                        checked={meteringColumnVisibility[column]}
                        disabled={column === 'name'}
                        onChange={() => toggleMeteringColumnVisibility(column)}
                      />
                      <span>
                        {column === 'totalPrice'
                          ? meteringTotalPriceLabel
                          : t(`projectManagerPage.costTable.columns.${column}`)}
                      </span>
                    </label>
                  ))
                : FEATURES_TOGGLE_COLUMNS.filter((column) => {
                    if (isNodeView) {
                      if (isFeaturesNodeDefaultColumn(column)) return true
                      if (column === 'start' || column === 'remark') return true
                      return false
                    }
                    if (isFundsView && column === 'quantity') return false
                    if (isFundsView && isFeaturesResourceStatColumn(column)) {
                      return column === 'unitPrice' || column === 'totalPrice'
                    }
                    if (isFeaturesProcurementColumn(column) && !isProcurementView) return false
                    if (isFeaturesResourceStatColumn(column) && !isResourceStatView) return false
                    if (
                      isFeaturesPricingUnitColumn(column) &&
                      !isProcurementView &&
                      !isResourceStatView
                    ) {
                      return false
                    }
                    if (isFeaturesNodeColumn(column)) return false
                    return true
                  }).map((column) => (
                    <label key={column} className="tm-pm-gantt-col-menu-item">
                      <input
                        type="checkbox"
                        checked={columnVisibility[column]}
                        disabled={column === 'name'}
                        onChange={() => toggleColumnVisibility(column)}
                      />
                      <span>
                        {column === 'unit'
                          ? unitColumnLabel
                          : column === 'type' ||
                              column === 'name' ||
                              column === 'quantity' ||
                              column === 'remark' ||
                              column === 'unitPrice' ||
                              column === 'totalPrice'
                            ? featureColumnLabel(column)
                            : t(`projectManagerPage.files.table.columns.${column}`)}
                      </span>
                    </label>
                  ))}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

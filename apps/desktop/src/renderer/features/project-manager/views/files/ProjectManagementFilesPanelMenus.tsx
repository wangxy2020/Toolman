import type { FC } from 'react'
import { createPortal } from 'react-dom'

import { FEATURES_TOGGLE_COLUMNS, isFeaturesProcurementColumn } from './pm-features-column-prefs'
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
    columnVisibility,
    toggleColumnVisibility,
    unitColumnLabel,
  } = state

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
                {t('projectManagerPage.files.table.columnVisibility')}
              </div>
              {FEATURES_TOGGLE_COLUMNS.filter(
                (column) =>
                  !(isFundsView && column === 'quantity') &&
                  (isProcurementView || !isFeaturesProcurementColumn(column)),
              ).map((column) => (
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

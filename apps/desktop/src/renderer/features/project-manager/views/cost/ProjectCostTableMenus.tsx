import type { FC } from 'react'
import { createPortal } from 'react-dom'

import { useI18n } from '../../../../i18n/useI18n'
import { COST_TOGGLE_COLUMNS } from './pm-cost-column-prefs'
import type { ProjectCostTablePanelState } from './useProjectCostTablePanel'

export interface ProjectCostTableMenusProps {
  state: ProjectCostTablePanelState
}

/** Portal-rendered popups: row selection context menu + column visibility menu. */
export const ProjectCostTableMenus: FC<ProjectCostTableMenusProps> = ({ state }) => {
  const { t } = useI18n()
  const {
    contextMenu,
    setContextMenu,
    contextMenuRef,
    setSelectionMode,
    handleSelectAll,
    handleClearSelection,
    contextMenuDeleteIds,
    setPendingDelete,
    columnMenu,
    columnVisibility,
    toggleColumnVisibility,
    costColumnLabel,
  } = state

  return (
    <>
      {contextMenu
        ? createPortal(
            <>
              <button
                type="button"
                className="tm-group-context-menu-backdrop"
                aria-label={t('projectManagerPage.costTable.selection.cancel')}
                onClick={() => setContextMenu(null)}
              />
              <div
                ref={contextMenuRef}
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
                  {t('projectManagerPage.costTable.selection.enterSelection')}
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
                  {t('projectManagerPage.costTable.selection.selectAll')}
                </button>
                <button
                  type="button"
                  className={[
                    'tm-group-context-menu-item',
                    'tm-group-context-menu-item--danger',
                    contextMenuDeleteIds.size === 0 ? 'tm-group-context-menu-item--disabled' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="menuitem"
                  disabled={contextMenuDeleteIds.size === 0}
                  onClick={() => {
                    if (contextMenuDeleteIds.size === 0) return
                    setPendingDelete(new Set(contextMenuDeleteIds))
                    setContextMenu(null)
                  }}
                >
                  {t('projectManagerPage.costTable.selection.deleteSelected')}
                  {contextMenuDeleteIds.size > 0 ? ` (${contextMenuDeleteIds.size})` : ''}
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
                  {t('projectManagerPage.costTable.selection.cancel')}
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
                {t('projectManagerPage.costTable.columnVisibility')}
              </div>
              {COST_TOGGLE_COLUMNS.map((column) => (
                <label key={column} className="tm-pm-gantt-col-menu-item">
                  <input
                    type="checkbox"
                    checked={columnVisibility[column]}
                    disabled={column === 'name'}
                    onChange={() => toggleColumnVisibility(column)}
                  />
                  <span>{costColumnLabel(column)}</span>
                </label>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

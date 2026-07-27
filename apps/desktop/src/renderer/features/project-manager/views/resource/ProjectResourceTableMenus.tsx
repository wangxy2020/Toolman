import type { FC } from 'react'
import { createPortal } from 'react-dom'

import { RESOURCE_TOGGLE_COLUMNS, type ResourceToggleColumn } from './pm-resource-column-prefs'
import type { ProjectResourceTablePanelState } from './useProjectResourceTablePanel'

export interface ProjectResourceTableMenusProps {
  state: ProjectResourceTablePanelState
}

/** Portal-rendered popups: row selection context menu and the column-visibility menu. */
export const ProjectResourceTableMenus: FC<ProjectResourceTableMenusProps> = ({ state }) => {
  const {
    t,
    contextMenu,
    contextMenuRef,
    handleCloseContextMenu,
    handleEnterSelectionMode,
    handleSelectAll,
    contextMenuDeleteIds,
    setPendingDelete,
    handleClearSelection,
    columnMenu,
    columnVisibility,
    toggleColumnVisibility,
    practiceColumnLabel,
  } = state

  return (
    <>
      {contextMenu
        ? createPortal(
            <>
              <button
                type="button"
                className="tm-group-context-menu-backdrop"
                aria-label={t('projectManagerPage.resourceTable.selection.cancel')}
                onClick={() => handleCloseContextMenu()}
              />
              <div
                ref={contextMenuRef}
                className="tm-group-context-menu"
                style={{ left: contextMenu.left, top: contextMenu.top }}
                role="menu"
                onMouseDown={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  className="tm-group-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    handleEnterSelectionMode()
                    handleCloseContextMenu()
                  }}>
                  {t('projectManagerPage.resourceTable.selection.enterSelection')}
                </button>
                <button
                  type="button"
                  className="tm-group-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    handleSelectAll()
                    handleCloseContextMenu()
                  }}>
                  {t('projectManagerPage.resourceTable.selection.selectAll')}
                </button>
                <button
                  type="button"
                  className={[
                    'tm-group-context-menu-item',
                    'tm-group-context-menu-item--danger',
                    contextMenuDeleteIds.size === 0
                      ? 'tm-group-context-menu-item--disabled'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="menuitem"
                  disabled={contextMenuDeleteIds.size === 0}
                  onClick={() => {
                    if (contextMenuDeleteIds.size === 0) return
                    setPendingDelete(new Set(contextMenuDeleteIds))
                    handleCloseContextMenu()
                  }}>
                  {t('projectManagerPage.resourceTable.selection.deleteSelected')}
                  {contextMenuDeleteIds.size > 0 ? ` (${contextMenuDeleteIds.size})` : ''}
                </button>
                <button
                  type="button"
                  className="tm-group-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    handleClearSelection()
                    handleCloseContextMenu()
                  }}>
                  {t('projectManagerPage.resourceTable.selection.cancel')}
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
                {t('projectManagerPage.resourceTable.columnVisibility')}
              </div>
              {RESOURCE_TOGGLE_COLUMNS.map((column: ResourceToggleColumn) => (
                <label key={column} className="tm-pm-gantt-col-menu-item">
                  <input
                    type="checkbox"
                    checked={columnVisibility[column]}
                    disabled={column === 'name'}
                    onChange={() => toggleColumnVisibility(column)}
                  />
                  <span>{practiceColumnLabel(column)}</span>
                </label>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

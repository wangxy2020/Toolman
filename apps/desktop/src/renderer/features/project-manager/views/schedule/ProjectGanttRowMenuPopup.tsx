import type { FC } from 'react'
import { createPortal } from 'react-dom'

import type { Props } from './pm-gantt-task-grid-utils'
import type { GanttTaskGridState } from './useProjectGanttTaskGrid'

export interface ProjectGanttRowMenuPopupProps {
  gridProps: Props
  state: GanttTaskGridState
}

/** Row-level context menu: enter selection, select all, delete selected, cancel. */
export const ProjectGanttRowMenuPopup: FC<ProjectGanttRowMenuPopupProps> = ({
  gridProps,
  state,
}) => {
  const { checkedIds, onSelectAllRows, onClearRowSelection, onDeleteSelectedRows } = gridProps
  const { t, rowContextMenu, setRowContextMenu, setSelectionMode } = state

  if (!rowContextMenu) return null

  return createPortal(
    <>
      <button
        type="button"
        className="tm-group-context-menu-backdrop"
        aria-label={t('projectManagerPage.schedule.selection.cancel')}
        onClick={() => setRowContextMenu(null)}
      />
      <div
        className="tm-group-context-menu"
        style={{ left: rowContextMenu.left, top: rowContextMenu.top }}
        role="menu"
        onMouseDown={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="tm-group-context-menu-item"
          role="menuitem"
          onClick={() => {
            setSelectionMode(true)
            setRowContextMenu(null)
          }}>
          {t('projectManagerPage.schedule.selection.enterSelection')}
        </button>
        <button
          type="button"
          className="tm-group-context-menu-item"
          role="menuitem"
          onClick={() => {
            onSelectAllRows()
            setSelectionMode(true)
            setRowContextMenu(null)
          }}>
          {t('projectManagerPage.schedule.selection.selectAll')}
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
            setRowContextMenu(null)
            onDeleteSelectedRows()
          }}>
          {t('projectManagerPage.schedule.selection.deleteSelected')}
          {checkedIds.size > 0 ? ` (${checkedIds.size})` : ''}
        </button>
        <button
          type="button"
          className="tm-group-context-menu-item"
          role="menuitem"
          onClick={() => {
            onClearRowSelection()
            setSelectionMode(false)
            setRowContextMenu(null)
          }}>
          {t('projectManagerPage.schedule.selection.cancel')}
        </button>
      </div>
    </>,
    document.body,
  )
}

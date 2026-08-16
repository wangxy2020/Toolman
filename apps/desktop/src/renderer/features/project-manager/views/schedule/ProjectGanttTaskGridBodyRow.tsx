import type { FC } from 'react'
import { isPmEditableEventTarget } from '../../pm-editable-dom'
import {
  countCostAssignmentsForTypeFilter,
  readTaskCostAssignments,
} from './pm-gantt-cost-assignment'
import {
  countResourceAssignmentsForTypeFilter,
  readTaskResourceAssignments,
} from './pm-gantt-resource-assignment'
import type { GanttTreeRow } from './pm-gantt-tree'
import {
  RESOURCE_ASSIGN_POPUP_ROW_PX,
  RESOURCE_ASSIGN_POPUP_VISIBLE_ROWS,
  type Props,
} from './pm-gantt-task-grid-utils'
import { GANTT_ROW_HEIGHT, isGanttProjectRootId } from './pm-gantt-utils'
import type { GanttTaskGridState } from './useProjectGanttTaskGrid'
import { renderGanttIndexNameCell } from './ProjectGanttTaskGridBodyIndexName'
import { renderGanttResourceCell } from './ProjectGanttTaskGridBodyResourceCell'
import { renderGanttCostQtyCell } from './ProjectGanttTaskGridBodyCostQtyCell'
import { renderGanttCostNameAmountCell } from './ProjectGanttTaskGridBodyCostCell'
import { renderGanttBuiltinCell } from './ProjectGanttTaskGridBodyBuiltinCell'

function renderBodyCell(row: GanttTreeRow, field: string, gridProps: Props, state: GanttTaskGridState) {
  const args = { row, field, gridProps, state }
  if (field === 'index' || field === 'name' || field === 'spacer') {
    return renderGanttIndexNameCell(args)
  }
  const resource = renderGanttResourceCell(args)
  if (resource) return resource
  const costQty = renderGanttCostQtyCell(args)
  if (costQty) return costQty
  const costName = renderGanttCostNameAmountCell(args)
  if (costName) return costName
  return renderGanttBuiltinCell(args)
}

export const ProjectGanttTaskGridBodyRow: FC<{
  row: GanttTreeRow
  gridProps: Props
  state: GanttTaskGridState
}> = ({ row, gridProps, state }) => {
  const {
    selectedId,
    checkedIds,
    prefs,
    resourceViewMode = false,
    costViewMode = false,
    onSelect,
  } = gridProps
  const {
    setContextMenu,
    setRowContextMenu,
    setResourceAssignPopup,
    setResourceAssignSelectedSlot,
    setResourceAssignDraftTypes,
    setCostAssignPopup,
    setCostAssignSelectedSlot,
    setCostAssignDraftTypes,
    gridTemplate,
  } = state
  const active = row.item.id === selectedId
  const checked = checkedIds.has(row.item.id)
  const isProjectRoot = isGanttProjectRootId(row.item.id)
  return (
          <div
            key={row.item.id}
            role="row"
            tabIndex={0}
            className={[
              'tm-pm-gantt-grid-row',
              active ? 'tm-pm-gantt-grid-row--active' : '',
              checked ? 'tm-pm-gantt-grid-row--checked' : '',
              isProjectRoot ? 'tm-pm-gantt-grid-row--project-root' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ height: GANTT_ROW_HEIGHT, gridTemplateColumns: gridTemplate }}
            onClick={() => onSelect(row.item.id)}
            onContextMenu={(event) => {
              if (isPmEditableEventTarget(event.target)) return
              if (isProjectRoot) {
                event.preventDefault()
                return
              }
              event.preventDefault()
              event.stopPropagation()
              setContextMenu(null)

              if (resourceViewMode) {
                onSelect(row.item.id)
                const menuWidth = 480
                const chromeHeight = 120
                const estimatedHeight =
                  chromeHeight +
                  RESOURCE_ASSIGN_POPUP_VISIBLE_ROWS * RESOURCE_ASSIGN_POPUP_ROW_PX
                const margin = 8
                const left = Math.min(
                  event.clientX,
                  Math.max(margin, window.innerWidth - menuWidth - margin),
                )
                const spaceBelow = window.innerHeight - event.clientY - margin
                const spaceAbove = event.clientY - margin
                const openAbove =
                  estimatedHeight > spaceBelow && spaceAbove > spaceBelow
                const top = openAbove
                  ? Math.max(margin, event.clientY - estimatedHeight)
                  : Math.min(
                      event.clientY,
                      Math.max(margin, window.innerHeight - estimatedHeight - margin),
                    )
                const resourceTypeFilter = prefs.resourceView.typeFilter ?? 'all'
                const existingCount = countResourceAssignmentsForTypeFilter(
                  readTaskResourceAssignments(row.item.metadata),
                  resourceTypeFilter === 'all' ? 'all' : resourceTypeFilter,
                )
                setRowContextMenu(null)
                setCostAssignPopup(null)
                setCostAssignSelectedSlot(null)
                setCostAssignDraftTypes({})
                setResourceAssignDraftTypes({})
                setResourceAssignSelectedSlot(null)
                setResourceAssignPopup({
                  top,
                  left,
                  anchorY: event.clientY,
                  itemId: row.item.id,
                  rowCount: Math.max(RESOURCE_ASSIGN_POPUP_VISIBLE_ROWS, existingCount),
                })
                return
              }

              if (costViewMode) {
                onSelect(row.item.id)
                const menuWidth = 480
                const chromeHeight = 120
                const estimatedHeight =
                  chromeHeight +
                  RESOURCE_ASSIGN_POPUP_VISIBLE_ROWS * RESOURCE_ASSIGN_POPUP_ROW_PX
                const margin = 8
                const left = Math.min(
                  event.clientX,
                  Math.max(margin, window.innerWidth - menuWidth - margin),
                )
                const spaceBelow = window.innerHeight - event.clientY - margin
                const spaceAbove = event.clientY - margin
                const openAbove =
                  estimatedHeight > spaceBelow && spaceAbove > spaceBelow
                const top = openAbove
                  ? Math.max(margin, event.clientY - estimatedHeight)
                  : Math.min(
                      event.clientY,
                      Math.max(margin, window.innerHeight - estimatedHeight - margin),
                    )
                const costTypeFilter = prefs.costView.typeFilter ?? 'all'
                const existingCount = countCostAssignmentsForTypeFilter(
                  readTaskCostAssignments(row.item.metadata),
                  costTypeFilter === 'all' ? 'all' : costTypeFilter,
                )
                setRowContextMenu(null)
                setResourceAssignPopup(null)
                setResourceAssignSelectedSlot(null)
                setResourceAssignDraftTypes({})
                setCostAssignDraftTypes({})
                setCostAssignSelectedSlot(null)
                setCostAssignPopup({
                  top,
                  left,
                  anchorY: event.clientY,
                  itemId: row.item.id,
                  rowCount: Math.max(RESOURCE_ASSIGN_POPUP_VISIBLE_ROWS, existingCount),
                })
                return
              }

              // Task list / Gantt / progress check: menu only, no row selection.
              const menuWidth = 160
              const left = Math.min(
                event.clientX,
                Math.max(8, window.innerWidth - menuWidth - 8),
              )
              const top = Math.min(
                event.clientY,
                Math.max(8, window.innerHeight - 160),
              )
              setResourceAssignPopup(null)
              setResourceAssignSelectedSlot(null)
              setResourceAssignDraftTypes({})
              setCostAssignPopup(null)
              setCostAssignSelectedSlot(null)
              setCostAssignDraftTypes({})
              setRowContextMenu({ top, left, itemId: row.item.id })
            }}>
            {prefs.columnOrder.map((columnId) => renderBodyCell(row, columnId, gridProps, state))}
          </div>
  )
}

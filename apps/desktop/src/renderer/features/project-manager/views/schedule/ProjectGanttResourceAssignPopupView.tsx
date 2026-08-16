import type { FC } from 'react'
import { createPortal } from 'react-dom'

import { handlePmTableCellNavKeyDown } from '../../pm-table-cell-nav'
import {
  moveTaskResourceAssignment,
  readTaskResourceAssignments,
} from './pm-gantt-resource-assignment'
import { RESOURCE_ASSIGN_POPUP_VISIBLE_ROWS, type Props } from './pm-gantt-task-grid-utils'
import { ProjectGanttResourceAssignPopupFooter } from './ProjectGanttResourceAssignPopupFooter'
import { ProjectGanttResourceAssignPopupRows } from './ProjectGanttResourceAssignPopupRows'
import type { GanttTaskGridState } from './useProjectGanttTaskGrid'

export interface ProjectGanttResourceAssignPopupProps {
  gridProps: Props
  state: GanttTaskGridState
}

/** Resource-allocation view: popup table for one task's resource-slot assignments. */
export const ProjectGanttResourceAssignPopup: FC<ProjectGanttResourceAssignPopupProps> = ({
  gridProps,
  state,
}) => {
  const { rows, prefs, resourceCatalog = [], onAssignResource, onReplaceResourceAssignments } =
    gridProps
  const {
    t,
    resourceAssignPopup,
    setResourceAssignPopup,
    resourceAssignSelectedSlot,
    setResourceAssignSelectedSlot,
    resourceAssignPopupRef,
    columnCatalog,
    resourceAssignDraftTypes,
    setResourceAssignDraftTypes,
    writeOrderedResourceSlot,
    resolveAssignmentCustomTypeName,
  } = state

  if (!resourceAssignPopup) return null

  const popupRow = rows.find((entry) => entry.item.id === resourceAssignPopup.itemId)
  const popupItem = popupRow?.item
  const catalog = columnCatalog.length > 0 ? columnCatalog : resourceCatalog
  const canEdit = Boolean(popupItem && (onAssignResource || onReplaceResourceAssignments))
  const slotAssignments = popupItem ? readTaskResourceAssignments(popupItem.metadata) : []
  const slots = Array.from({ length: resourceAssignPopup.rowCount }, (_, slot) => slot)
  const selectedSlot = resourceAssignSelectedSlot
  const canMoveSelected =
    canEdit &&
    selectedSlot != null &&
    selectedSlot >= 0 &&
    selectedSlot < slotAssignments.length
  const canDeleteSelected =
    canEdit &&
    selectedSlot != null &&
    selectedSlot >= 0 &&
    selectedSlot < resourceAssignPopup.rowCount
  const moveSelected = (direction: -1 | 1) => {
    if (!popupItem || selectedSlot == null) return
    const target = selectedSlot + direction
    if (target < 0 || target >= slotAssignments.length) return
    const next = moveTaskResourceAssignment(slotAssignments, selectedSlot, target)
    void onReplaceResourceAssignments?.(popupItem.id, next)
    setResourceAssignSelectedSlot(target)
  }
  const deleteSelected = () => {
    if (!popupItem || selectedSlot == null) return
    const slot = selectedSlot
    let nextAssignments = slotAssignments
    if (slot < slotAssignments.length) {
      nextAssignments = slotAssignments.filter((_, index) => index !== slot)
      if (onReplaceResourceAssignments) {
        void onReplaceResourceAssignments(popupItem.id, nextAssignments)
      }
    }
    setResourceAssignPopup((current) => {
      if (!current) return current
      return {
        ...current,
        rowCount: Math.max(
          RESOURCE_ASSIGN_POPUP_VISIBLE_ROWS,
          nextAssignments.length,
          current.rowCount - 1,
        ),
      }
    })
    setResourceAssignSelectedSlot((prev) => {
      if (prev == null) return prev
      if (prev < slot) return prev
      if (prev > slot) return prev - 1
      if (nextAssignments.length === 0) return null
      return Math.min(slot, nextAssignments.length - 1)
    })
  }

  return createPortal(
    <>
      <button
        type="button"
        className="tm-group-context-menu-backdrop"
        aria-label={t('projectManagerPage.schedule.selection.cancel')}
        onClick={() => {
          setResourceAssignPopup(null)
          setResourceAssignSelectedSlot(null)
          setResourceAssignDraftTypes({})
        }}
      />
      <div
        ref={resourceAssignPopupRef}
        className="tm-pm-gantt-resource-assign-popup"
        style={{ left: resourceAssignPopup.left, top: resourceAssignPopup.top }}
        role="dialog"
        aria-label={t('projectManagerPage.schedule.resourceAssign.popupTitle')}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="tm-pm-gantt-resource-assign-popup-header">
          <div className="tm-pm-gantt-resource-assign-popup-title">
            {t('projectManagerPage.schedule.resourceAssign.popupTitle')}
          </div>
          {popupItem?.title ? (
            <div
              className="tm-pm-gantt-resource-assign-popup-subtitle"
              title={popupItem.title}
            >
              {popupItem.title}
            </div>
          ) : null}
        </header>
        <div className="tm-pm-gantt-resource-assign-popup-scroll">
          <table
            className="tm-pm-gantt-resource-assign-popup-table"
            onKeyDown={(event) => {
              handlePmTableCellNavKeyDown(event)
            }}
          >
            <thead>
              <tr>
                <th className="tm-pm-gantt-resource-assign-popup-col--index">
                  {t('projectManagerPage.schedule.columns.index')}
                </th>
                <th>{t('projectManagerPage.schedule.columns.resourceType')}</th>
                <th>{t('projectManagerPage.schedule.columns.resourceName')}</th>
                <th>{t('projectManagerPage.schedule.columns.resourceQty')}</th>
                <th>{t('projectManagerPage.schedule.columns.resourceNote')}</th>
              </tr>
            </thead>
            <tbody>
              <ProjectGanttResourceAssignPopupRows
                t={t}
                itemId={resourceAssignPopup.itemId}
                popupItemId={popupItem?.id}
                slots={slots}
                slotAssignments={slotAssignments}
                catalog={catalog}
                resourceTypeFilter={prefs.resourceView.typeFilter ?? 'all'}
                canEdit={canEdit}
                selectedSlot={selectedSlot}
                setResourceAssignSelectedSlot={setResourceAssignSelectedSlot}
                resourceAssignDraftTypes={resourceAssignDraftTypes}
                setResourceAssignDraftTypes={setResourceAssignDraftTypes}
                writeOrderedResourceSlot={writeOrderedResourceSlot}
                resolveAssignmentCustomTypeName={resolveAssignmentCustomTypeName}
              />
            </tbody>
          </table>
        </div>
        <ProjectGanttResourceAssignPopupFooter
          t={t}
          canEdit={canEdit}
          canMoveSelected={canMoveSelected}
          canDeleteSelected={canDeleteSelected}
          selectedSlot={selectedSlot}
          slotAssignmentCount={slotAssignments.length}
          moveSelected={moveSelected}
          deleteSelected={deleteSelected}
          setResourceAssignPopup={setResourceAssignPopup}
        />
      </div>
    </>,
    document.body,
  )
}

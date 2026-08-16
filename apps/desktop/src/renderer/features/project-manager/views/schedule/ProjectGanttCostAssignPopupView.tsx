import type { FC } from 'react'
import { createPortal } from 'react-dom'

import { handlePmTableCellNavKeyDown } from '../../pm-table-cell-nav'
import {
  moveTaskCostAssignment,
  readTaskCostAssignments,
  resolveCostAssignmentAgainstCatalog,
  EMPTY_TASK_COST_ASSIGNMENT,
} from './pm-gantt-cost-assignment'
import { RESOURCE_ASSIGN_POPUP_VISIBLE_ROWS, type Props } from './pm-gantt-task-grid-utils'
import { ProjectGanttCostAssignPopupFooter } from './ProjectGanttCostAssignPopupFooter'
import { ProjectGanttCostAssignPopupRows } from './ProjectGanttCostAssignPopupRows'
import type { GanttTaskGridState } from './useProjectGanttTaskGrid'

export interface ProjectGanttCostAssignPopupProps {
  gridProps: Props
  state: GanttTaskGridState
}

/** Cost-allocation view: popup table for one task's cost-slot assignments. */
export const ProjectGanttCostAssignPopup: FC<ProjectGanttCostAssignPopupProps> = ({
  gridProps,
  state,
}) => {
  const { rows, prefs, costCatalog = [], onAssignCost, onReplaceCostAssignments } = gridProps
  const {
    t,
    costAssignPopup,
    setCostAssignPopup,
    costAssignSelectedSlot,
    setCostAssignSelectedSlot,
    costAssignPopupRef,
    costAssignDraftTypes,
    setCostAssignDraftTypes,
    costNamePicker,
    writeOrderedCostSlot,
    openCostNamePicker,
  } = state

  if (!costAssignPopup) return null

  const popupRow = rows.find((entry) => entry.item.id === costAssignPopup.itemId)
  const popupItem = popupRow?.item
  const canEdit = Boolean(popupItem && (onAssignCost || onReplaceCostAssignments))
  const slotAssignments = popupItem
    ? readTaskCostAssignments(popupItem.metadata).map((entry) =>
        resolveCostAssignmentAgainstCatalog(entry, costCatalog),
      )
    : []
  const slots = Array.from({ length: costAssignPopup.rowCount }, (_, slot) => slot)
  const selectedSlot = costAssignSelectedSlot
  const canMoveSelected =
    canEdit &&
    selectedSlot != null &&
    selectedSlot >= 0 &&
    selectedSlot < slotAssignments.length
  const canDeleteSelected =
    canEdit &&
    selectedSlot != null &&
    selectedSlot >= 0 &&
    selectedSlot < costAssignPopup.rowCount
  const moveSelected = (direction: -1 | 1) => {
    if (!popupItem || selectedSlot == null) return
    const target = selectedSlot + direction
    if (target < 0 || target >= slotAssignments.length) return
    const next = moveTaskCostAssignment(slotAssignments, selectedSlot, target)
    void onReplaceCostAssignments?.(popupItem.id, next)
    setCostAssignSelectedSlot(target)
  }
  const deleteSelected = () => {
    if (!popupItem || selectedSlot == null) return
    const slot = selectedSlot
    let nextAssignments = slotAssignments
    if (slot < slotAssignments.length) {
      nextAssignments = slotAssignments.filter((_, index) => index !== slot)
      if (onReplaceCostAssignments) {
        void onReplaceCostAssignments(popupItem.id, nextAssignments)
      } else if (onAssignCost) {
        void onAssignCost(popupItem.id, { ...EMPTY_TASK_COST_ASSIGNMENT }, slot)
      }
    }
    setCostAssignPopup((current) => {
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
    setCostAssignSelectedSlot((prev) => {
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
          setCostAssignPopup(null)
          setCostAssignSelectedSlot(null)
          setCostAssignDraftTypes({})
        }}
      />
      <div
        ref={costAssignPopupRef}
        className="tm-pm-gantt-resource-assign-popup tm-pm-gantt-resource-assign-popup--cost"
        style={{ left: costAssignPopup.left, top: costAssignPopup.top }}
        role="dialog"
        aria-label={t('projectManagerPage.schedule.costAssign.popupTitle')}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="tm-pm-gantt-resource-assign-popup-header">
          <div className="tm-pm-gantt-resource-assign-popup-title">
            {t('projectManagerPage.schedule.costAssign.popupTitle')}
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
                <th>{t('projectManagerPage.costTable.columns.type')}</th>
                <th>{t('projectManagerPage.costTable.columns.name')}</th>
                <th title={t('projectManagerPage.schedule.columns.costPercentHint')}>
                  {t('projectManagerPage.schedule.columns.costPercent')}
                </th>
                <th>{t('projectManagerPage.schedule.columns.costEngineeringQuantity')}</th>
              </tr>
            </thead>
            <tbody>
              <ProjectGanttCostAssignPopupRows
                t={t}
                itemId={costAssignPopup.itemId}
                popupItemId={popupItem?.id}
                slots={slots}
                slotAssignments={slotAssignments}
                costCatalog={costCatalog}
                costTypeFilter={prefs.costView.typeFilter ?? 'all'}
                canEdit={canEdit}
                selectedSlot={selectedSlot}
                setCostAssignSelectedSlot={setCostAssignSelectedSlot}
                costAssignDraftTypes={costAssignDraftTypes}
                setCostAssignDraftTypes={setCostAssignDraftTypes}
                costNamePicker={costNamePicker}
                openCostNamePicker={openCostNamePicker}
                writeOrderedCostSlot={writeOrderedCostSlot}
              />
            </tbody>
          </table>
        </div>
        <ProjectGanttCostAssignPopupFooter
          t={t}
          canEdit={canEdit}
          canMoveSelected={canMoveSelected}
          canDeleteSelected={canDeleteSelected}
          selectedSlot={selectedSlot}
          slotAssignmentCount={slotAssignments.length}
          moveSelected={moveSelected}
          deleteSelected={deleteSelected}
          setCostAssignPopup={setCostAssignPopup}
        />
      </div>
    </>,
    document.body,
  )
}

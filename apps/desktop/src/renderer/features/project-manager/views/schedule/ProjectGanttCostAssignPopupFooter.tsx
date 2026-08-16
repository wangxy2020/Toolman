import type { Dispatch, FC, SetStateAction } from 'react'

import { IconChevronDown, IconChevronUp } from '../../../../components/icons'
import type { CostAssignPopupState } from './pm-gantt-task-grid-utils'
import type { GanttTaskGridState } from './useProjectGanttTaskGrid'

export type ProjectGanttCostAssignPopupFooterProps = {
  t: GanttTaskGridState['t']
  canEdit: boolean
  canMoveSelected: boolean
  canDeleteSelected: boolean
  selectedSlot: number | null
  slotAssignmentCount: number
  moveSelected: (direction: -1 | 1) => void
  deleteSelected: () => void
  setCostAssignPopup: Dispatch<SetStateAction<CostAssignPopupState | null>>
}

/** Move / delete / add-row actions for the cost-assignment popup. */
export const ProjectGanttCostAssignPopupFooter: FC<ProjectGanttCostAssignPopupFooterProps> = ({
  t,
  canEdit,
  canMoveSelected,
  canDeleteSelected,
  selectedSlot,
  slotAssignmentCount,
  moveSelected,
  deleteSelected,
  setCostAssignPopup,
}) => {
  if (!canEdit) return null

  return (
    <div className="tm-pm-gantt-resource-assign-popup-footer">
      <div className="tm-pm-gantt-resource-assign-popup-move">
        <button
          type="button"
          className="tm-pm-gantt-resource-assign-popup-move-btn"
          aria-label={t('projectManagerPage.schedule.costAssign.moveUp')}
          title={t('projectManagerPage.schedule.costAssign.moveUp')}
          disabled={!canMoveSelected || selectedSlot == null || selectedSlot <= 0}
          onClick={() => moveSelected(-1)}
        >
          <IconChevronUp size={16} />
        </button>
        <button
          type="button"
          className="tm-pm-gantt-resource-assign-popup-move-btn"
          aria-label={t('projectManagerPage.schedule.costAssign.moveDown')}
          title={t('projectManagerPage.schedule.costAssign.moveDown')}
          disabled={
            !canMoveSelected ||
            selectedSlot == null ||
            selectedSlot >= slotAssignmentCount - 1
          }
          onClick={() => moveSelected(1)}
        >
          <IconChevronDown size={16} />
        </button>
      </div>
      <div className="tm-pm-gantt-resource-assign-popup-actions">
        <button
          type="button"
          className="tm-pm-gantt-resource-assign-popup-add"
          disabled={!canDeleteSelected}
          onClick={() => deleteSelected()}
        >
          <span aria-hidden>−</span>
          {t('projectManagerPage.schedule.costAssign.deleteRow')}
        </button>
        <button
          type="button"
          className="tm-pm-gantt-resource-assign-popup-add"
          onClick={() => {
            setCostAssignPopup((current) =>
              current
                ? {
                    ...current,
                    rowCount: current.rowCount + 1,
                  }
                : current,
            )
          }}
        >
          <span aria-hidden>+</span>
          {t('projectManagerPage.schedule.costAssign.addRow')}
        </button>
      </div>
    </div>
  )
}

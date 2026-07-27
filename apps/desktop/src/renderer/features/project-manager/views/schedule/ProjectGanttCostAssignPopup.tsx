import type { FC } from 'react'
import { createPortal } from 'react-dom'

import { IconChevronDown, IconChevronUp } from '../../../../components/icons'
import { handlePmTableCellNavKeyDown } from '../../pm-table-cell-nav'
import { isPmCostType, PM_COST_PRIMARY_TYPES, type PmCostType } from '../cost/pm-cost-catalog'
import {
  catalogCostAmountLimit,
  computeCostAssignmentMoney,
  costCatalogRowsForType,
  DEFAULT_COST_ASSIGNMENT_PERCENT,
  EMPTY_TASK_COST_ASSIGNMENT,
  findCatalogRowForCostAssignment,
  isEmptyCostAssignment,
  moveTaskCostAssignment,
  readCostAssignmentAtFilteredSlot,
  readTaskCostAssignments,
  resolveCostAssignmentAgainstCatalog,
  resolveCostAssignmentPercent,
} from './pm-gantt-cost-assignment'
import { RESOURCE_ASSIGN_POPUP_VISIBLE_ROWS, type Props } from './pm-gantt-task-grid-utils'
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
        {(() => {
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
          return (
            <>
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
                      <th>{t('projectManagerPage.schedule.columns.costPercent')}</th>
                      <th>{t('projectManagerPage.schedule.columns.costAmountUnit')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slots.map((slot) => {
                      const costTypeFilter = prefs.costView.typeFilter ?? 'all'
                      const costFilter = costTypeFilter === 'all' ? 'all' : costTypeFilter
                      const assignment = resolveCostAssignmentAgainstCatalog(
                        readCostAssignmentAtFilteredSlot(slotAssignments, slot, costFilter),
                        costCatalog,
                      )
                      const selectedId = assignment.costId ?? ''
                      const type: PmCostType =
                        (assignment.type && isPmCostType(assignment.type)
                          ? assignment.type
                          : null) ??
                        costAssignDraftTypes[slot] ??
                        'comprehensive'
                      const selectedInOptions = costCatalogRowsForType(costCatalog, type).some(
                        (entry) => entry.id === selectedId,
                      )
                      const percentDisabled =
                        !canEdit || (!selectedId && !assignment.name.trim())
                      const rowSelected = selectedSlot === slot
                      const rowHasAssignment = !isEmptyCostAssignment(assignment)
                      const catalogRow = findCatalogRowForCostAssignment(assignment, costCatalog)
                      const catalogAmount = catalogRow
                        ? catalogCostAmountLimit(catalogRow, costCatalog)
                        : null
                      const percentValue = resolveCostAssignmentPercent(
                        assignment,
                        catalogAmount,
                      )
                      const displayAmount =
                        assignment.percent != null
                          ? (computeCostAssignmentMoney(catalogAmount, assignment.percent) ??
                            assignment.amount)
                          : (assignment.amount ??
                            computeCostAssignmentMoney(catalogAmount, percentValue))
                      const unitLabel = catalogRow?.unit?.trim() || ''
                      const nameTriggerLabel =
                        assignment.name.trim() ||
                        (selectedId && !selectedInOptions
                          ? selectedId
                          : t('projectManagerPage.schedule.costAssign.selectName'))
                      const namePickerOpen =
                        costNamePicker?.itemId === costAssignPopup.itemId &&
                        costNamePicker.slot === slot &&
                        costNamePicker.source === 'popup'
                      const commitPercent = (rawValue: string) => {
                        if (!popupItem || !canEdit) return
                        if (!selectedId && !assignment.name.trim()) return
                        const raw = rawValue.trim()
                        const nextPercent =
                          raw === '' ? DEFAULT_COST_ASSIGNMENT_PERCENT : Number(raw)
                        if (!Number.isFinite(nextPercent)) return
                        const nextAmount = computeCostAssignmentMoney(
                          catalogAmount,
                          nextPercent,
                        )
                        const currentPercent = resolveCostAssignmentPercent(
                          assignment,
                          catalogAmount,
                        )
                        if (
                          nextPercent === currentPercent &&
                          (nextAmount === assignment.amount ||
                            (nextAmount == null && assignment.amount == null))
                        ) {
                          return
                        }
                        writeOrderedCostSlot(popupItem.id, slotAssignments, slot, {
                          percent: nextPercent,
                          amount: nextAmount,
                        })
                      }
                      return (
                        <tr
                          key={`${costAssignPopup.itemId}:${slot}`}
                          className={
                            rowSelected
                              ? 'tm-pm-gantt-resource-assign-popup-row--selected'
                              : undefined
                          }
                          onClick={() => {
                            if (!rowHasAssignment) {
                              setCostAssignSelectedSlot(null)
                              return
                            }
                            setCostAssignSelectedSlot(slot)
                          }}
                        >
                          <td className="tm-pm-gantt-resource-assign-popup-col--index">
                            {slot + 1}
                          </td>
                          <td>
                            <select
                              className="tm-pm-gantt-resource-assign-popup-select"
                              value={type}
                              disabled={!canEdit}
                              aria-label={t('projectManagerPage.costTable.columns.type')}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => {
                                if (!popupItem || !canEdit) return
                                const nextType = event.target.value as PmCostType
                                if (!isPmCostType(nextType)) return
                                if (selectedId) {
                                  writeOrderedCostSlot(
                                    popupItem.id,
                                    slotAssignments,
                                    slot,
                                    { ...EMPTY_TASK_COST_ASSIGNMENT },
                                  )
                                  setCostAssignDraftTypes((current) => ({
                                    ...current,
                                    [slot]: nextType,
                                  }))
                                  return
                                }
                                setCostAssignDraftTypes((current) => ({
                                  ...current,
                                  [slot]: nextType,
                                }))
                              }}
                            >
                              {PM_COST_PRIMARY_TYPES.map((entry) => (
                                <option key={entry} value={entry}>
                                  {t(`projectManagerPage.costTable.types.${entry}`)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <button
                              type="button"
                              className={[
                                'tm-pm-gantt-resource-assign-popup-select',
                                'tm-pm-gantt-resource-cell-trigger',
                                'tm-pm-gantt-cost-name-trigger',
                                !selectedId && !assignment.name.trim()
                                  ? 'tm-pm-gantt-cell-select--empty'
                                  : '',
                                namePickerOpen ? 'tm-pm-gantt-resource-cell-trigger--open' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              disabled={!canEdit || !popupItem}
                              aria-label={t('projectManagerPage.costTable.columns.name')}
                              title={nameTriggerLabel}
                              onClick={(event) => {
                                if (!popupItem || !canEdit) return
                                openCostNamePicker(event, {
                                  itemId: popupItem.id,
                                  slot,
                                  source: 'popup',
                                  typeFilter: type,
                                })
                              }}
                            >
                              <span className="tm-pm-gantt-resource-cell-trigger-label">
                                {nameTriggerLabel}
                              </span>
                              <IconChevronDown
                                size={12}
                                className="tm-pm-gantt-resource-cell-trigger-chevron"
                              />
                            </button>
                          </td>
                          <td>
                            <input
                              key={`${costAssignPopup.itemId}:${slot}:percent:${selectedId}:${percentValue}`}
                              className="tm-pm-gantt-resource-assign-popup-qty"
                              type="text"
                              inputMode="decimal"
                              defaultValue={
                                selectedId || assignment.name.trim() ? String(percentValue) : ''
                              }
                              placeholder=""
                              disabled={percentDisabled}
                              aria-label={t('projectManagerPage.schedule.columns.costPercent')}
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => {
                                if (event.key !== 'Enter' || !popupItem || !canEdit) {
                                  return
                                }
                                event.preventDefault()
                                commitPercent(event.currentTarget.value)
                                event.currentTarget.blur()
                              }}
                              onBlur={(event) => {
                                commitPercent(event.currentTarget.value)
                              }}
                            />
                          </td>
                          <td>
                            <div
                              className={[
                                'tm-pm-gantt-resource-assign-popup-amount-unit',
                                percentDisabled
                                  ? 'tm-pm-gantt-resource-assign-popup-amount-unit--disabled'
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              aria-label={t('projectManagerPage.schedule.columns.costAmountUnit')}
                              title={
                                displayAmount != null
                                  ? unitLabel
                                    ? `${displayAmount} ${unitLabel}`
                                    : String(displayAmount)
                                  : undefined
                              }
                            >
                              <span className="tm-pm-gantt-resource-assign-popup-amount-value">
                                {displayAmount != null ? displayAmount : '—'}
                              </span>
                              {unitLabel ? (
                                <span className="tm-pm-gantt-resource-assign-popup-amount-unit-label">
                                  {unitLabel}
                                </span>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {canEdit ? (
                <div className="tm-pm-gantt-resource-assign-popup-footer">
                  <div className="tm-pm-gantt-resource-assign-popup-move">
                    <button
                      type="button"
                      className="tm-pm-gantt-resource-assign-popup-move-btn"
                      aria-label={t('projectManagerPage.schedule.costAssign.moveUp')}
                      title={t('projectManagerPage.schedule.costAssign.moveUp')}
                      disabled={
                        !canMoveSelected || selectedSlot == null || selectedSlot <= 0
                      }
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
                        selectedSlot >= slotAssignments.length - 1
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
              ) : null}
            </>
          )
        })()}
      </div>
    </>,
    document.body,
  )
}

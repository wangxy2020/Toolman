import type { Dispatch, FC, SetStateAction } from 'react'

import { IconChevronDown } from '../../../../components/icons'
import {
  isPmCostType,
  PM_COST_PRIMARY_TYPES,
  type PmCostRow,
  type PmCostType,
} from '../cost/pm-cost-catalog'
import {
  catalogCostAmountLimit,
  catalogCostQuantity,
  computeCostAssignmentMoney,
  computeCostAssignmentQuantity,
  costCatalogRowsForType,
  findCatalogRowForCostAssignment,
  formatCostPercentRatio,
  isEmptyCostAssignment,
  parseCostPercentRatioInput,
  readCostAssignmentAtFilteredSlot,
  resolveCostAssignmentAgainstCatalog,
  resolveCostAssignmentPercent,
  EMPTY_TASK_COST_ASSIGNMENT,
  type TaskCostAssignment,
} from './pm-gantt-cost-assignment'
import type { GanttAssignTypeFilter } from './pm-gantt-prefs-assign'
import type { GanttTaskGridState } from './useProjectGanttTaskGrid'

export type ProjectGanttCostAssignPopupRowsProps = {
  t: GanttTaskGridState['t']
  itemId: string
  popupItemId: string | undefined
  slots: number[]
  slotAssignments: TaskCostAssignment[]
  costCatalog: readonly PmCostRow[]
  costTypeFilter: GanttAssignTypeFilter
  canEdit: boolean
  selectedSlot: number | null
  setCostAssignSelectedSlot: Dispatch<SetStateAction<number | null>>
  costAssignDraftTypes: Record<number, PmCostType>
  setCostAssignDraftTypes: Dispatch<SetStateAction<Record<number, PmCostType>>>
  costNamePicker: GanttTaskGridState['costNamePicker']
  openCostNamePicker: GanttTaskGridState['openCostNamePicker']
  writeOrderedCostSlot: GanttTaskGridState['writeOrderedCostSlot']
}

/** Table body rows for the cost-assignment popup. */
export const ProjectGanttCostAssignPopupRows: FC<ProjectGanttCostAssignPopupRowsProps> = ({
  t,
  itemId,
  popupItemId,
  slots,
  slotAssignments,
  costCatalog,
  costTypeFilter,
  canEdit,
  selectedSlot,
  setCostAssignSelectedSlot,
  costAssignDraftTypes,
  setCostAssignDraftTypes,
  costNamePicker,
  openCostNamePicker,
  writeOrderedCostSlot,
}) => (
  <>
    {slots.map((slot) => {
      const costFilter: 'all' | PmCostType =
        costTypeFilter === 'all' || !isPmCostType(costTypeFilter) ? 'all' : costTypeFilter
      const assignment = resolveCostAssignmentAgainstCatalog(
        readCostAssignmentAtFilteredSlot(slotAssignments, slot, costFilter),
        costCatalog,
      )
      const selectedId = assignment.costId ?? ''
      const type: PmCostType =
        (assignment.type && isPmCostType(assignment.type) ? assignment.type : null) ??
        costAssignDraftTypes[slot] ??
        'comprehensive'
      const selectedInOptions = costCatalogRowsForType(costCatalog, type).some(
        (entry) => entry.id === selectedId,
      )
      const percentDisabled = !canEdit || (!selectedId && !assignment.name.trim())
      const rowSelected = selectedSlot === slot
      const rowHasAssignment = !isEmptyCostAssignment(assignment)
      const catalogRow = findCatalogRowForCostAssignment(assignment, costCatalog)
      const catalogAmount = catalogRow ? catalogCostAmountLimit(catalogRow, costCatalog) : null
      const catalogQuantity = catalogCostQuantity(catalogRow)
      const percentValue = resolveCostAssignmentPercent(
        assignment,
        catalogAmount,
        catalogQuantity,
      )
      const displayQuantity = computeCostAssignmentQuantity(catalogQuantity, percentValue)
      const unitLabel = catalogRow?.unit?.trim() || ''
      const nameTriggerLabel =
        assignment.name.trim() ||
        (selectedId && !selectedInOptions
          ? selectedId
          : t('projectManagerPage.schedule.costAssign.selectName'))
      const namePickerOpen =
        costNamePicker?.itemId === itemId &&
        costNamePicker.slot === slot &&
        costNamePicker.source === 'popup'
      const commitPercent = (rawValue: string) => {
        if (!popupItemId || !canEdit) return
        if (!selectedId && !assignment.name.trim()) return
        const nextPercent = parseCostPercentRatioInput(rawValue)
        const nextAmount = computeCostAssignmentMoney(catalogAmount, nextPercent)
        const currentPercent = resolveCostAssignmentPercent(
          assignment,
          catalogAmount,
          catalogQuantity,
        )
        if (
          nextPercent === currentPercent &&
          (nextAmount === assignment.amount ||
            (nextAmount == null && assignment.amount == null))
        ) {
          return
        }
        writeOrderedCostSlot(popupItemId, slotAssignments, slot, {
          percent: nextPercent,
          amount: nextAmount,
        })
      }
      return (
        <tr
          key={`${itemId}:${slot}`}
          className={
            rowSelected ? 'tm-pm-gantt-resource-assign-popup-row--selected' : undefined
          }
          onClick={() => {
            if (!rowHasAssignment) {
              setCostAssignSelectedSlot(null)
              return
            }
            setCostAssignSelectedSlot(slot)
          }}
        >
          <td className="tm-pm-gantt-resource-assign-popup-col--index">{slot + 1}</td>
          <td>
            <select
              className="tm-pm-gantt-resource-assign-popup-select"
              value={type}
              disabled={!canEdit}
              aria-label={t('projectManagerPage.costTable.columns.type')}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                if (!popupItemId || !canEdit) return
                const nextType = event.target.value as PmCostType
                if (!isPmCostType(nextType)) return
                if (selectedId) {
                  writeOrderedCostSlot(popupItemId, slotAssignments, slot, {
                    ...EMPTY_TASK_COST_ASSIGNMENT,
                  })
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
                !selectedId && !assignment.name.trim() ? 'tm-pm-gantt-cell-select--empty' : '',
                namePickerOpen ? 'tm-pm-gantt-resource-cell-trigger--open' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={!canEdit || !popupItemId}
              aria-label={t('projectManagerPage.costTable.columns.name')}
              title={nameTriggerLabel}
              onClick={(event) => {
                if (!popupItemId || !canEdit) return
                openCostNamePicker(event, {
                  itemId: popupItemId,
                  slot,
                  source: 'popup',
                  typeFilter: type,
                })
              }}
            >
              <span className="tm-pm-gantt-resource-cell-trigger-label">{nameTriggerLabel}</span>
              <IconChevronDown size={12} className="tm-pm-gantt-resource-cell-trigger-chevron" />
            </button>
          </td>
          <td>
            <input
              key={`${itemId}:${slot}:percent:${selectedId}:${percentValue}`}
              className="tm-pm-gantt-resource-assign-popup-qty"
              type="text"
              inputMode="decimal"
              defaultValue={
                selectedId || assignment.name.trim() ? formatCostPercentRatio(percentValue) : ''
              }
              placeholder=""
              disabled={percentDisabled}
              aria-label={t('projectManagerPage.schedule.columns.costPercent')}
              title={t('projectManagerPage.schedule.columns.costPercentHint')}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || !popupItemId || !canEdit) return
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
              aria-label={t('projectManagerPage.schedule.columns.costEngineeringQuantity')}
              title={
                displayQuantity != null
                  ? unitLabel
                    ? `${displayQuantity} ${unitLabel}`
                    : String(displayQuantity)
                  : undefined
              }
            >
              <span className="tm-pm-gantt-resource-assign-popup-amount-value">
                {displayQuantity != null ? displayQuantity : '—'}
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
  </>
)

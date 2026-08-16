import type { Dispatch, FC, SetStateAction } from 'react'

import {
  isPmResourceType,
  PM_RESOURCE_PRIMARY_TYPES,
  type PmResourceRow,
  type PmResourceType,
} from '../resource/pm-resource-catalog'
import {
  catalogRowsForType,
  EMPTY_TASK_RESOURCE_ASSIGNMENT,
  isEmptyAssignment,
  readResourceAssignmentAtFilteredSlot,
  resolveAssignmentAgainstCatalog,
  type TaskResourceAssignment,
} from './pm-gantt-resource-assignment'
import type { GanttAssignTypeFilter } from './pm-gantt-prefs-assign'
import type { GanttTaskGridState } from './useProjectGanttTaskGrid'

export type ProjectGanttResourceAssignPopupRowsProps = {
  t: GanttTaskGridState['t']
  itemId: string
  popupItemId: string | undefined
  slots: number[]
  slotAssignments: TaskResourceAssignment[]
  catalog: readonly PmResourceRow[]
  resourceTypeFilter: GanttAssignTypeFilter
  canEdit: boolean
  selectedSlot: number | null
  setResourceAssignSelectedSlot: Dispatch<SetStateAction<number | null>>
  resourceAssignDraftTypes: Record<number, PmResourceType>
  setResourceAssignDraftTypes: Dispatch<SetStateAction<Record<number, PmResourceType>>>
  writeOrderedResourceSlot: GanttTaskGridState['writeOrderedResourceSlot']
  resolveAssignmentCustomTypeName: GanttTaskGridState['resolveAssignmentCustomTypeName']
}

/** Table body rows for the resource-assignment popup. */
export const ProjectGanttResourceAssignPopupRows: FC<
  ProjectGanttResourceAssignPopupRowsProps
> = ({
  t,
  itemId,
  popupItemId,
  slots,
  slotAssignments,
  catalog,
  resourceTypeFilter,
  canEdit,
  selectedSlot,
  setResourceAssignSelectedSlot,
  resourceAssignDraftTypes,
  setResourceAssignDraftTypes,
  writeOrderedResourceSlot,
  resolveAssignmentCustomTypeName,
}) => (
  <>
    {slots.map((slot) => {
      const resourceFilter: 'all' | PmResourceType =
        resourceTypeFilter === 'all' || !isPmResourceType(resourceTypeFilter)
          ? 'all'
          : resourceTypeFilter
      const assignment = resolveAssignmentAgainstCatalog(
        readResourceAssignmentAtFilteredSlot(slotAssignments, slot, resourceFilter),
        catalog,
      )
      const selectedId = assignment.resourceId ?? ''
      const type: PmResourceType =
        (assignment.type && isPmResourceType(assignment.type) ? assignment.type : null) ??
        resourceAssignDraftTypes[slot] ??
        'labor'
      const nameOptions = catalogRowsForType(catalog, type)
      const selectedInOptions = nameOptions.some((entry) => entry.id === selectedId)
      const qtyDisabled = !canEdit || !selectedId
      const rowSelected = selectedSlot === slot
      const rowHasAssignment = !isEmptyAssignment(assignment)
      return (
        <tr
          key={`${itemId}:${slot}`}
          className={
            rowSelected ? 'tm-pm-gantt-resource-assign-popup-row--selected' : undefined
          }
          onClick={() => {
            if (!rowHasAssignment) {
              setResourceAssignSelectedSlot(null)
              return
            }
            setResourceAssignSelectedSlot(slot)
          }}
        >
          <td className="tm-pm-gantt-resource-assign-popup-col--index">{slot + 1}</td>
          <td>
            <select
              className="tm-pm-gantt-resource-assign-popup-select"
              value={type}
              disabled={!canEdit}
              aria-label={t('projectManagerPage.schedule.columns.resourceType')}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                if (!popupItemId || !canEdit) return
                const nextType = event.target.value as PmResourceType
                if (!isPmResourceType(nextType)) return
                if (selectedId) {
                  writeOrderedResourceSlot(popupItemId, slotAssignments, slot, {
                    ...EMPTY_TASK_RESOURCE_ASSIGNMENT,
                  })
                  setResourceAssignDraftTypes((current) => ({
                    ...current,
                    [slot]: nextType,
                  }))
                  return
                }
                setResourceAssignDraftTypes((current) => ({
                  ...current,
                  [slot]: nextType,
                }))
              }}
            >
              {PM_RESOURCE_PRIMARY_TYPES.map((entry) => (
                <option key={entry} value={entry}>
                  {entry === 'custom' && type === 'custom'
                    ? resolveAssignmentCustomTypeName({
                        resourceId: selectedId,
                        name: assignment.name,
                        type: 'custom',
                      }) || t('projectManagerPage.resourceTable.types.custom')
                    : t(`projectManagerPage.resourceTable.types.${entry}`)}
                </option>
              ))}
              <option
                value="__pm_resource_cost_group__"
                disabled
                title={t('projectManagerPage.resourceTable.views.costResourcesReserved')}
              >
                {t('projectManagerPage.resourceTable.views.costResources')}
              </option>
            </select>
          </td>
          <td>
            <select
              className="tm-pm-gantt-resource-assign-popup-select"
              value={selectedId}
              disabled={!canEdit}
              aria-label={t('projectManagerPage.schedule.columns.resourceName')}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                if (!popupItemId || !canEdit) return
                const nextId = event.target.value
                if (!nextId) {
                  writeOrderedResourceSlot(popupItemId, slotAssignments, slot, {
                    ...EMPTY_TASK_RESOURCE_ASSIGNMENT,
                  })
                  return
                }
                const row = nameOptions.find((entry) => entry.id === nextId)
                if (!row) return
                writeOrderedResourceSlot(popupItemId, slotAssignments, slot, {
                  resourceId: row.id,
                  type: row.type,
                  name: row.name,
                  quantity: assignment.quantity,
                })
                setResourceAssignDraftTypes((current) => {
                  const next = { ...current }
                  delete next[slot]
                  return next
                })
              }}
            >
              <option value="">
                {t('projectManagerPage.schedule.resourceAssign.selectName')}
              </option>
              {selectedId && !selectedInOptions ? (
                <option value={selectedId}>{assignment.name.trim() || selectedId}</option>
              ) : null}
              {nameOptions.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </td>
          <td>
            <input
              key={`${itemId}:${slot}:qty:${selectedId}:${assignment.quantity ?? ''}`}
              className="tm-pm-gantt-resource-assign-popup-qty"
              type="text"
              inputMode="decimal"
              defaultValue={assignment.quantity ?? ''}
              placeholder=""
              disabled={qtyDisabled}
              aria-label={t('projectManagerPage.schedule.columns.resourceQty')}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || !popupItemId || !canEdit) return
                event.preventDefault()
                const raw = event.currentTarget.value.trim()
                const next = raw === '' ? null : Number(raw)
                if (next != null && !Number.isFinite(next)) return
                if (next === assignment.quantity) {
                  event.currentTarget.blur()
                  return
                }
                writeOrderedResourceSlot(popupItemId, slotAssignments, slot, {
                  quantity: next,
                })
                event.currentTarget.blur()
              }}
              onBlur={(event) => {
                if (!popupItemId || !canEdit || !selectedId) return
                const raw = event.currentTarget.value.trim()
                const next = raw === '' ? null : Number(raw)
                if (next != null && !Number.isFinite(next)) return
                if (next === assignment.quantity) return
                writeOrderedResourceSlot(popupItemId, slotAssignments, slot, {
                  quantity: next,
                })
              }}
            />
          </td>
          <td>
            {canEdit && popupItemId ? (
              <input
                className="tm-pm-gantt-resource-assign-popup-note"
                defaultValue={assignment.note}
                placeholder={t('projectManagerPage.schedule.resourceAssign.notePlaceholder')}
                aria-label={t('projectManagerPage.schedule.columns.resourceNote')}
                disabled={!selectedId}
                onBlur={(event) => {
                  const nextNote = event.target.value
                  if (nextNote === assignment.note) return
                  writeOrderedResourceSlot(popupItemId, slotAssignments, slot, {
                    note: nextNote,
                  })
                }}
                onClick={(event) => event.stopPropagation()}
              />
            ) : (
              assignment.note.trim() || '—'
            )}
          </td>
        </tr>
      )
    })}
  </>
)

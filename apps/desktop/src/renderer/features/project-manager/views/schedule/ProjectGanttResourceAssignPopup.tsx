import type { FC } from 'react'
import { createPortal } from 'react-dom'

import { IconChevronDown, IconChevronUp } from '../../../../components/icons'
import { handlePmTableCellNavKeyDown } from '../../pm-table-cell-nav'
import { isPmResourceType, PM_RESOURCE_PRIMARY_TYPES, type PmResourceType } from '../resource/pm-resource-catalog'
import {
  catalogRowsForType,
  EMPTY_TASK_RESOURCE_ASSIGNMENT,
  isEmptyAssignment,
  moveTaskResourceAssignment,
  readResourceAssignmentAtFilteredSlot,
  readTaskResourceAssignments,
  resolveAssignmentAgainstCatalog,
} from './pm-gantt-resource-assignment'
import { RESOURCE_ASSIGN_POPUP_VISIBLE_ROWS, type Props } from './pm-gantt-task-grid-utils'
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
        onMouseDown={(event) => event.stopPropagation()}>
        {(() => {
          const popupRow = rows.find((entry) => entry.item.id === resourceAssignPopup.itemId)
          const popupItem = popupRow?.item
          const catalog = columnCatalog.length > 0 ? columnCatalog : resourceCatalog
          const canEdit = Boolean(popupItem && (onAssignResource || onReplaceResourceAssignments))
          const slotAssignments = popupItem
            ? readTaskResourceAssignments(popupItem.metadata)
            : []
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
          return (
            <>
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
                    {slots.map((slot) => {
                      const resourceTypeFilter = prefs.resourceView.typeFilter ?? 'all'
                      const resourceFilter =
                        resourceTypeFilter === 'all' ? 'all' : resourceTypeFilter
                      const assignment = resolveAssignmentAgainstCatalog(
                        readResourceAssignmentAtFilteredSlot(
                          slotAssignments,
                          slot,
                          resourceFilter,
                        ),
                        catalog,
                      )
                      const selectedId = assignment.resourceId ?? ''
                      const type: PmResourceType =
                        (assignment.type && isPmResourceType(assignment.type)
                          ? assignment.type
                          : null) ??
                        resourceAssignDraftTypes[slot] ??
                        'labor'
                      const nameOptions = catalogRowsForType(catalog, type)
                      const selectedInOptions = nameOptions.some(
                        (entry) => entry.id === selectedId,
                      )
                      const qtyDisabled = !canEdit || !selectedId
                      const rowSelected = selectedSlot === slot
                      const rowHasAssignment = !isEmptyAssignment(assignment)
                      return (
                        <tr
                          key={`${resourceAssignPopup.itemId}:${slot}`}
                          className={
                            rowSelected
                              ? 'tm-pm-gantt-resource-assign-popup-row--selected'
                              : undefined
                          }
                          onClick={() => {
                            if (!rowHasAssignment) {
                              setResourceAssignSelectedSlot(null)
                              return
                            }
                            setResourceAssignSelectedSlot(slot)
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
                              aria-label={t(
                                'projectManagerPage.schedule.columns.resourceType',
                              )}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => {
                                if (!popupItem || !canEdit) return
                                const nextType = event.target.value as PmResourceType
                                if (!isPmResourceType(nextType)) return
                                if (selectedId) {
                                  writeOrderedResourceSlot(
                                    popupItem.id,
                                    slotAssignments,
                                    slot,
                                    { ...EMPTY_TASK_RESOURCE_ASSIGNMENT },
                                  )
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
                                      }) ||
                                      t('projectManagerPage.resourceTable.types.custom')
                                    : t(`projectManagerPage.resourceTable.types.${entry}`)}
                                </option>
                              ))}
                              <option
                                value="__pm_resource_cost_group__"
                                disabled
                                title={t(
                                  'projectManagerPage.resourceTable.views.costResourcesReserved',
                                )}
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
                              aria-label={t(
                                'projectManagerPage.schedule.columns.resourceName',
                              )}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => {
                                if (!popupItem || !canEdit) return
                                const nextId = event.target.value
                                if (!nextId) {
                                  writeOrderedResourceSlot(
                                    popupItem.id,
                                    slotAssignments,
                                    slot,
                                    { ...EMPTY_TASK_RESOURCE_ASSIGNMENT },
                                  )
                                  return
                                }
                                const row = nameOptions.find((entry) => entry.id === nextId)
                                if (!row) return
                                writeOrderedResourceSlot(
                                  popupItem.id,
                                  slotAssignments,
                                  slot,
                                  {
                                    resourceId: row.id,
                                    type: row.type,
                                    name: row.name,
                                    quantity: assignment.quantity,
                                  },
                                )
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
                                <option value={selectedId}>
                                  {assignment.name.trim() || selectedId}
                                </option>
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
                              key={`${resourceAssignPopup.itemId}:${slot}:qty:${selectedId}:${assignment.quantity ?? ''}`}
                              className="tm-pm-gantt-resource-assign-popup-qty"
                              type="text"
                              inputMode="decimal"
                              defaultValue={assignment.quantity ?? ''}
                              placeholder=""
                              disabled={qtyDisabled}
                              aria-label={t(
                                'projectManagerPage.schedule.columns.resourceQty',
                              )}
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => {
                                if (event.key !== 'Enter' || !popupItem || !canEdit) {
                                  return
                                }
                                event.preventDefault()
                                const raw = event.currentTarget.value.trim()
                                const next = raw === '' ? null : Number(raw)
                                if (next != null && !Number.isFinite(next)) return
                                if (next === assignment.quantity) {
                                  event.currentTarget.blur()
                                  return
                                }
                                writeOrderedResourceSlot(
                                  popupItem.id,
                                  slotAssignments,
                                  slot,
                                  { quantity: next },
                                )
                                event.currentTarget.blur()
                              }}
                              onBlur={(event) => {
                                if (!popupItem || !canEdit || !selectedId) return
                                const raw = event.currentTarget.value.trim()
                                const next = raw === '' ? null : Number(raw)
                                if (next != null && !Number.isFinite(next)) return
                                if (next === assignment.quantity) return
                                writeOrderedResourceSlot(
                                  popupItem.id,
                                  slotAssignments,
                                  slot,
                                  { quantity: next },
                                )
                              }}
                            />
                          </td>
                          <td>
                            {canEdit && popupItem ? (
                              <input
                                className="tm-pm-gantt-resource-assign-popup-note"
                                defaultValue={assignment.note}
                                placeholder={t(
                                  'projectManagerPage.schedule.resourceAssign.notePlaceholder',
                                )}
                                aria-label={t(
                                  'projectManagerPage.schedule.columns.resourceNote',
                                )}
                                disabled={!selectedId}
                                onBlur={(event) => {
                                  const nextNote = event.target.value
                                  if (nextNote === assignment.note) return
                                  writeOrderedResourceSlot(
                                    popupItem.id,
                                    slotAssignments,
                                    slot,
                                    { note: nextNote },
                                  )
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
                  </tbody>
                </table>
              </div>
              {canEdit ? (
                <div className="tm-pm-gantt-resource-assign-popup-footer">
                  <div className="tm-pm-gantt-resource-assign-popup-move">
                    <button
                      type="button"
                      className="tm-pm-gantt-resource-assign-popup-move-btn"
                      aria-label={t('projectManagerPage.schedule.resourceAssign.moveUp')}
                      title={t('projectManagerPage.schedule.resourceAssign.moveUp')}
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
                      aria-label={t('projectManagerPage.schedule.resourceAssign.moveDown')}
                      title={t('projectManagerPage.schedule.resourceAssign.moveDown')}
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
                      {t('projectManagerPage.schedule.resourceAssign.deleteRow')}
                    </button>
                    <button
                      type="button"
                      className="tm-pm-gantt-resource-assign-popup-add"
                      onClick={() => {
                        setResourceAssignPopup((current) =>
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
                      {t('projectManagerPage.schedule.resourceAssign.addRow')}
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

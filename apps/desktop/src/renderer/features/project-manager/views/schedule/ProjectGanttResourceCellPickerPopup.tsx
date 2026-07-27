import type { FC } from 'react'
import { createPortal } from 'react-dom'

import { IconCheck, IconChevronDown } from '../../../../components/icons'
import { PM_RESOURCE_PRIMARY_TYPES, type PmResourceRow } from '../resource/pm-resource-catalog'
import {
  catalogRowsForType,
  EMPTY_TASK_RESOURCE_ASSIGNMENT,
  isEmptyAssignment,
  readTaskResourceAssignments,
  resolveAssignmentAgainstCatalog,
} from './pm-gantt-resource-assignment'
import type { Props } from './pm-gantt-task-grid-utils'
import type { GanttTaskGridState } from './useProjectGanttTaskGrid'

export interface ProjectGanttResourceCellPickerPopupProps {
  gridProps: Props
  state: GanttTaskGridState
}

/**
 * Native-like resource cell menu (cascade: type → name). Checks both the active resource
 * type and the assigned resource name with the same style, unlike a native <select>.
 */
export const ProjectGanttResourceCellPickerPopup: FC<ProjectGanttResourceCellPickerPopupProps> = ({
  gridProps,
  state,
}) => {
  const { rows, resourceCatalog = [], onAssignResource, onReplaceResourceAssignments } = gridProps
  const {
    t,
    resourceCellPicker,
    setResourceCellPicker,
    resourceCellPickerMenuRef,
    columnCatalog,
    resolveAssignmentCustomTypeName,
    writeOrderedResourceSlot,
  } = state

  if (!resourceCellPicker) return null

  return createPortal(
    <div
      ref={resourceCellPickerMenuRef}
      className="tm-pm-gantt-resource-select-menu"
      style={{
        top: resourceCellPicker.anchorBottom + 2,
        left: resourceCellPicker.left,
        minWidth: resourceCellPicker.minWidth,
      }}
      role="listbox"
      aria-label={t('projectManagerPage.schedule.columns.resourceName')}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {(() => {
        const menuCatalog = columnCatalog.length > 0 ? columnCatalog : resourceCatalog
        const menuType = resourceCellPicker.type
        const menuOptions = catalogRowsForType(menuCatalog, menuType)
        const menuItem = rows.find((entry) => entry.item.id === resourceCellPicker.itemId)?.item
        // Same fixed slot indexes as the cells (no auto-reorder).
        const menuSlots = menuItem ? readTaskResourceAssignments(menuItem.metadata) : []
        const menuAssignment = resolveAssignmentAgainstCatalog(
          menuSlots[resourceCellPicker.slot] ?? EMPTY_TASK_RESOURCE_ASSIGNMENT,
          menuCatalog,
        )
        const selectedResourceId = menuAssignment.resourceId ?? ''
        const selectedName = menuAssignment.name.trim()
        // Prefer id so duplicate resource names only check the assigned row.
        const isNameChecked = (row: PmResourceRow) =>
          selectedResourceId
            ? row.id === selectedResourceId
            : selectedName !== '' && row.name.trim() === selectedName
        return (
          <>
            <div className="tm-pm-gantt-resource-select-menu-label">
              {t('projectManagerPage.schedule.columns.resourceType')}
            </div>
            {PM_RESOURCE_PRIMARY_TYPES.map((entry) => {
              const label =
                entry === 'custom' && menuType === 'custom'
                  ? resolveAssignmentCustomTypeName({
                      resourceId: menuAssignment.resourceId,
                      name: menuAssignment.name,
                      type: 'custom',
                    }) || t('projectManagerPage.resourceTable.types.custom')
                  : t(`projectManagerPage.resourceTable.types.${entry}`)
              const checked = entry === menuType
              return (
                <button
                  key={entry}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  className={[
                    'tm-pm-gantt-resource-select-menu-item',
                    checked ? 'tm-pm-gantt-resource-select-menu-item--checked' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  title={label}
                  onClick={() => {
                    if (checked) return
                    setResourceCellPicker((current) =>
                      current ? { ...current, type: entry } : current,
                    )
                  }}
                >
                  <span className="tm-pm-gantt-resource-select-menu-check" aria-hidden>
                    {checked ? <IconCheck size={14} /> : null}
                  </span>
                  <span className="tm-pm-gantt-resource-select-menu-text">{label}</span>
                </button>
              )
            })}
            <button
              type="button"
              disabled
              aria-disabled="true"
              title={t('projectManagerPage.resourceTable.views.costResourcesReserved')}
              className={[
                'tm-pm-gantt-resource-select-menu-item',
                'tm-pm-gantt-resource-select-menu-item--group',
                'tm-pm-gantt-resource-select-menu-item--disabled',
              ].join(' ')}
            >
              <span className="tm-pm-gantt-resource-select-menu-check" aria-hidden />
              <span className="tm-pm-gantt-resource-select-menu-text">
                {t('projectManagerPage.resourceTable.views.costResources')}
              </span>
              <IconChevronDown size={14} className="tm-pm-gantt-resource-select-menu-chevron" />
            </button>
            <div className="tm-pm-gantt-resource-select-menu-sep" role="separator" />
            <div className="tm-pm-gantt-resource-select-menu-label">
              {t('projectManagerPage.schedule.columns.resourceName')}
            </div>
            {!isEmptyAssignment(menuAssignment) ? (
              <button
                type="button"
                role="option"
                className="tm-pm-gantt-resource-select-menu-item"
                onClick={() => {
                  if (!onAssignResource && !onReplaceResourceAssignments) return
                  writeOrderedResourceSlot(
                    resourceCellPicker.itemId,
                    menuSlots,
                    resourceCellPicker.slot,
                    { ...EMPTY_TASK_RESOURCE_ASSIGNMENT },
                  )
                  setResourceCellPicker(null)
                }}
              >
                <span className="tm-pm-gantt-resource-select-menu-check" aria-hidden />
                <span className="tm-pm-gantt-resource-select-menu-text">
                  {t('projectManagerPage.schedule.resourceAssign.none')}
                </span>
              </button>
            ) : null}
            {menuOptions.length === 0 ? (
              <div className="tm-pm-gantt-resource-select-menu-empty">—</div>
            ) : (
              menuOptions.map((row) => {
                const checked = isNameChecked(row)
                return (
                  <button
                    key={row.id}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    className={[
                      'tm-pm-gantt-resource-select-menu-item',
                      checked ? 'tm-pm-gantt-resource-select-menu-item--checked' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => {
                      if (!onAssignResource && !onReplaceResourceAssignments) return
                      if (checked) {
                        writeOrderedResourceSlot(
                          resourceCellPicker.itemId,
                          menuSlots,
                          resourceCellPicker.slot,
                          { ...EMPTY_TASK_RESOURCE_ASSIGNMENT },
                        )
                        setResourceCellPicker(null)
                        return
                      }
                      writeOrderedResourceSlot(
                        resourceCellPicker.itemId,
                        menuSlots,
                        resourceCellPicker.slot,
                        {
                          resourceId: row.id,
                          type: row.type,
                          name: row.name,
                          quantity: menuAssignment.quantity ?? null,
                        },
                      )
                      setResourceCellPicker(null)
                    }}
                  >
                    <span className="tm-pm-gantt-resource-select-menu-check" aria-hidden>
                      {checked ? <IconCheck size={14} /> : null}
                    </span>
                    <span className="tm-pm-gantt-resource-select-menu-text">{row.name}</span>
                  </button>
                )
              })
            )}
          </>
        )
      })()}
    </div>,
    document.body,
  )
}

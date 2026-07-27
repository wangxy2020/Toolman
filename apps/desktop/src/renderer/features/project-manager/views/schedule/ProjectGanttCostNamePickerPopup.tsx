import type { FC } from 'react'
import { createPortal } from 'react-dom'

import { IconCheck, IconChevronRight } from '../../../../components/icons'
import type { PmCostRow } from '../cost/pm-cost-catalog'
import {
  buildCostAllocatedAmountById,
  catalogCostAmountLimit,
  computeCostAssignmentMoney,
  DEFAULT_COST_ASSIGNMENT_PERCENT,
  EMPTY_TASK_COST_ASSIGNMENT,
  groupCostCatalogBySectionalWork,
  isCostQuantityFullyAllocated,
  isEmptyCostAssignment,
  readCostAssignmentAtFilteredSlot,
  readTaskCostAssignments,
  resolveCostAssignmentAgainstCatalog,
} from './pm-gantt-cost-assignment'
import type { Props } from './pm-gantt-task-grid-utils'
import type { GanttTaskGridState } from './useProjectGanttTaskGrid'

export interface ProjectGanttCostNamePickerPopupProps {
  gridProps: Props
  state: GanttTaskGridState
}

/**
 * Cost name cascade picker: L1 分部工程 → L2 工作名称.
 * Used by cost-view cells and the cost-assign popup name column.
 */
export const ProjectGanttCostNamePickerPopup: FC<ProjectGanttCostNamePickerPopupProps> = ({
  gridProps,
  state,
}) => {
  const { rows, prefs, costCatalog = [], onAssignCost, onReplaceCostAssignments } = gridProps
  const {
    t,
    costNamePicker,
    setCostNamePicker,
    costNamePickerMenuRef,
    setCostAssignDraftTypes,
    writeOrderedCostSlot,
  } = state

  if (!costNamePicker) return null

  return createPortal(
    <div
      ref={costNamePickerMenuRef}
      className="tm-pm-gantt-resource-select-menu tm-pm-gantt-resource-select-menu--cost-cascade"
      style={{
        top: costNamePicker.anchorBottom + 2,
        left: costNamePicker.left,
        minWidth: costNamePicker.minWidth,
      }}
      role="menu"
      aria-label={t('projectManagerPage.schedule.costAssign.selectSectionalWork')}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {(() => {
        const menuItem = rows.find((entry) => entry.item.id === costNamePicker.itemId)?.item
        const menuSlots = menuItem
          ? readTaskCostAssignments(menuItem.metadata).map((entry) =>
              resolveCostAssignmentAgainstCatalog(entry, costCatalog),
            )
          : []
        const costTypeFilter = prefs.costView.typeFilter ?? 'all'
        const costFilter = costTypeFilter === 'all' ? 'all' : costTypeFilter
        const menuAssignment = resolveCostAssignmentAgainstCatalog(
          readCostAssignmentAtFilteredSlot(menuSlots, costNamePicker.slot, costFilter),
          costCatalog,
        )
        const selectedCostId = menuAssignment.costId ?? ''
        const selectedName = menuAssignment.name.trim()
        const sections = groupCostCatalogBySectionalWork(costCatalog, costNamePicker.typeFilter)
        const allocatedById = buildCostAllocatedAmountById(
          rows.map((entry) => entry.item),
          costCatalog,
        )
        // Prefer id so duplicate price-item names only check the assigned row.
        const isNameChecked = (row: PmCostRow) =>
          selectedCostId
            ? row.id === selectedCostId
            : selectedName !== '' && row.name.trim() === selectedName
        const sectionLabel = (key: string) =>
          key ? key : t('projectManagerPage.schedule.costAssign.sectionalWorkEmpty')
        const commitName = (row: PmCostRow) => {
          if (!onAssignCost && !onReplaceCostAssignments) return
          const checked = isNameChecked(row)
          if (checked) {
            writeOrderedCostSlot(costNamePicker.itemId, menuSlots, costNamePicker.slot, {
              ...EMPTY_TASK_COST_ASSIGNMENT,
            })
            if (costNamePicker.source === 'popup') {
              setCostAssignDraftTypes((current) => {
                const next = { ...current }
                delete next[costNamePicker.slot]
                return next
              })
            }
            setCostNamePicker(null)
            return
          }
          if (isCostQuantityFullyAllocated(row, allocatedById, costCatalog)) {
            return
          }
          const percent = DEFAULT_COST_ASSIGNMENT_PERCENT
          const catalogAmount = catalogCostAmountLimit(row, costCatalog)
          writeOrderedCostSlot(costNamePicker.itemId, menuSlots, costNamePicker.slot, {
            costId: row.id,
            type: row.type,
            name: row.name,
            percent,
            amount: computeCostAssignmentMoney(catalogAmount, percent),
          })
          if (costNamePicker.source === 'popup') {
            setCostAssignDraftTypes((current) => {
              const next = { ...current }
              delete next[costNamePicker.slot]
              return next
            })
          }
          setCostNamePicker(null)
        }
        return (
          <>
            <div className="tm-pm-gantt-resource-select-menu-label">
              {t('projectManagerPage.costTable.columns.sectionalWork')}
            </div>
            {!isEmptyCostAssignment(menuAssignment) ? (
              <button
                type="button"
                role="menuitem"
                className="tm-pm-gantt-resource-select-menu-item"
                onClick={() => {
                  if (!onAssignCost && !onReplaceCostAssignments) return
                  writeOrderedCostSlot(costNamePicker.itemId, menuSlots, costNamePicker.slot, {
                    ...EMPTY_TASK_COST_ASSIGNMENT,
                  })
                  if (costNamePicker.source === 'popup') {
                    setCostAssignDraftTypes((current) => {
                      const next = { ...current }
                      delete next[costNamePicker.slot]
                      return next
                    })
                  }
                  setCostNamePicker(null)
                }}
              >
                <span className="tm-pm-gantt-resource-select-menu-check" aria-hidden />
                <span className="tm-pm-gantt-resource-select-menu-text">
                  {t('projectManagerPage.schedule.resourceAssign.none')}
                </span>
              </button>
            ) : null}
            {sections.length === 0 ? (
              <div className="tm-pm-gantt-resource-select-menu-empty">—</div>
            ) : (
              sections.map((section) => {
                const open = costNamePicker.openSectionKey === section.key
                const sectionChecked = section.rows.some(isNameChecked)
                return (
                  <div
                    key={section.key || '__empty__'}
                    className="tm-pm-gantt-resource-select-menu-item--section"
                    onMouseEnter={() => {
                      setCostNamePicker((current) =>
                        current ? { ...current, openSectionKey: section.key } : current,
                      )
                    }}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      aria-haspopup="menu"
                      aria-expanded={open}
                      className={[
                        'tm-pm-gantt-resource-select-menu-item',
                        'tm-pm-gantt-resource-select-menu-item--group',
                        sectionChecked ? 'tm-pm-gantt-resource-select-menu-item--checked' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      title={sectionLabel(section.key)}
                      onClick={() => {
                        setCostNamePicker((current) =>
                          current
                            ? {
                                ...current,
                                openSectionKey:
                                  current.openSectionKey === section.key ? null : section.key,
                              }
                            : current,
                        )
                      }}
                    >
                      <span className="tm-pm-gantt-resource-select-menu-check" aria-hidden>
                        {sectionChecked ? <IconCheck size={14} /> : null}
                      </span>
                      <span className="tm-pm-gantt-resource-select-menu-text">
                        {sectionLabel(section.key)}
                      </span>
                      <IconChevronRight
                        size={14}
                        className="tm-pm-gantt-resource-select-menu-chevron"
                      />
                    </button>
                    {open ? (
                      <div
                        className="tm-pm-gantt-resource-select-submenu"
                        role="menu"
                        aria-label={t('projectManagerPage.schedule.costAssign.selectName')}
                      >
                        <div className="tm-pm-gantt-resource-select-menu-label">
                          {t('projectManagerPage.costTable.columns.name')}
                        </div>
                        {section.rows.map((row) => {
                          const checked = isNameChecked(row)
                          const exhausted = isCostQuantityFullyAllocated(
                            row,
                            allocatedById,
                            costCatalog,
                          )
                          const disabled = exhausted && !checked
                          return (
                            <button
                              key={row.id}
                              type="button"
                              role="menuitem"
                              aria-selected={checked}
                              aria-disabled={disabled}
                              disabled={disabled}
                              className={[
                                'tm-pm-gantt-resource-select-menu-item',
                                checked ? 'tm-pm-gantt-resource-select-menu-item--checked' : '',
                                disabled ? 'tm-pm-gantt-resource-select-menu-item--disabled' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              title={
                                disabled
                                  ? t(
                                      'projectManagerPage.schedule.costAssign.quantityFullyAllocated',
                                      { name: row.name },
                                    )
                                  : row.name
                              }
                              onClick={() => {
                                if (disabled) return
                                commitName(row)
                              }}
                            >
                              <span className="tm-pm-gantt-resource-select-menu-check" aria-hidden>
                                {checked ? <IconCheck size={14} /> : null}
                              </span>
                              <span className="tm-pm-gantt-resource-select-menu-text">
                                {row.name}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
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

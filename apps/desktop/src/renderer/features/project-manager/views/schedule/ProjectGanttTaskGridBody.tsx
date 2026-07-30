import type { FC } from 'react'

import { IconChevronDown, IconChevronRight } from '../../../../components/icons'
import { isPmEditableEventTarget } from '../../pm-editable-dom'
import { handlePmTableCellNavKeyDown } from '../../pm-table-cell-nav'
import {
  catalogCostAmountLimit,
  catalogCostQuantity,
  computeCostAssignmentMoney,
  computeCostAssignmentQuantity,
  countCostAssignmentsForTypeFilter,
  findCatalogRowForCostAssignment,
  formatCostAssignmentsInput,
  parseCostAssignmentsInput,
  parseCostColumnId,
  readCostAssignmentAtFilteredSlot,
  readTaskCostAssignments,
  resolveCostAssignmentAgainstCatalog,
  resolveCostAssignmentPercent,
  resolveCostPercentFromQuantity,
} from './pm-gantt-cost-assignment'
import type { GanttResourceColumnType } from './pm-gantt-prefs'
import { SWITCHABLE_RESOURCE_COLUMN_TYPES } from './pm-gantt-prefs'
import {
  countResourceAssignmentsForTypeFilter,
  EMPTY_TASK_RESOURCE_ASSIGNMENT,
  formatResourceAssignmentInput,
  isEmptyAssignment,
  parseResourceAssignmentInput,
  parseResourceColumnId,
  readResourceAssignmentAtFilteredSlot,
  readTaskResourceAssignments,
  resolveAssignmentAgainstCatalog,
} from './pm-gantt-resource-assignment'
import type { GanttTreeRow } from './pm-gantt-tree'
import { resolveGanttTaskKind } from './pm-gantt-tree'
import {
  RESOURCE_ASSIGN_POPUP_ROW_PX,
  RESOURCE_ASSIGN_POPUP_VISIBLE_ROWS,
  resolveCostPercentFromAmount,
  resourceSlotBandClass,
  shortResourceCellLabel,
  type Props,
} from './pm-gantt-task-grid-utils'
import { computeScheduleVarianceDays, GANTT_ROW_HEIGHT, isGanttProjectRootId } from './pm-gantt-utils'
import type { GanttTaskGridState } from './useProjectGanttTaskGrid'

export interface ProjectGanttTaskGridBodyProps {
  gridProps: Props
  state: GanttTaskGridState
}

/** Scrollable rows: builtin / resource / cost cell rendering, plus row-level context menu. */
export const ProjectGanttTaskGridBody: FC<ProjectGanttTaskGridBodyProps> = ({
  gridProps,
  state,
}) => {
  const {
    rows,
    criticalIds,
    prefs,
    selectedId,
    checkedIds,
    resourceViewMode = false,
    costViewMode = false,
    printLayout = false,
    gridScrollRef,
    onScroll,
    onSelect,
    onToggleChecked,
    onToggleCollapse,
    resourceCatalog = [],
    costCatalog = [],
    progressPercentById,
    onAssignResource,
    onReplaceResourceAssignments,
    onAssignCost,
    onReplaceCostAssignments,
    shouldPercentAsOfMs = null,
    baselinePlanByItemId,
  } = gridProps
  const {
    t,
    editing,
    draft,
    setDraft,
    inputRef,
    commitEdit,
    handleKeyDown,
    selectionMode,
    resourceCellPicker,
    setResourceCellPicker,
    costNamePicker,
    setCostNamePicker,
    resourceInputMode,
    columnCatalog,
    columnBindings,
    resolveResourceTypeLabel,
    resolveCostTypeLabel,
    typeLabelOf,
    resolveAssignmentCustomTypeName,
    costTypeLabelOf,
    writeOrderedResourceSlot,
    writeOrderedCostSlot,
    openCostNamePicker,
    startEdit,
    cellValue,
    columnClassSuffix,
    gridTemplate,
    handleWheel,
    setContextMenu,
    setRowContextMenu,
    setResourceAssignPopup,
    setResourceAssignSelectedSlot,
    setResourceAssignDraftTypes,
    setCostAssignPopup,
    setCostAssignSelectedSlot,
    setCostAssignDraftTypes,
  } = state

  const renderBodyCell = (row: GanttTreeRow, field: string) => {
    const { item, depth, hasChildren, expanded } = row
    const isEditing =
      editing?.kind === 'cell' && editing.itemId === item.id && editing.field === field
    const value = cellValue(item, field)
    const onCritical = criticalIds?.has(item.id) ?? false
    const kind = resolveGanttTaskKind(item, hasChildren, onCritical)

    if (field === 'index') {
      const isProjectRoot = isGanttProjectRootId(item.id)
      const checked = checkedIds.has(item.id)
      const checkboxTitle = `${t('projectManagerPage.schedule.selection.checkboxColumn')} ${row.rowNumber}`
      return (
        <span
          key={field}
          className="tm-pm-gantt-col tm-pm-gantt-col--index"
          onClick={(event) => event.stopPropagation()}>
          {printLayout || !selectionMode || isProjectRoot ? (
            row.rowNumber > 0 ? row.rowNumber : ''
          ) : (
            <label className="tm-kb-file-card-select" title={checkboxTitle}>
              <input
                type="checkbox"
                className="tm-kb-file-card-select-input"
                checked={checked}
                aria-label={checkboxTitle}
                onChange={() => onToggleChecked(item.id)}
                onClick={(event) => event.stopPropagation()}
              />
              <span
                className={[
                  'tm-kb-file-card-select-box',
                  checked ? 'tm-kb-file-card-select-box--checked' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-hidden="true"
              />
            </label>
          )}
        </span>
      )
    }

    if (field === 'name') {
      const isProjectRoot = isGanttProjectRootId(item.id)
      return (
        <span
          key={field}
          className="tm-pm-gantt-col tm-pm-gantt-col--name"
          style={{ paddingLeft: `${4 + depth * 14}px` }}
          onDoubleClick={
            isProjectRoot
              ? undefined
              : () => startEdit({ kind: 'cell', itemId: item.id, field }, value)
          }>
          {hasChildren ? (
            <button
              type="button"
              className="tm-pm-gantt-fold-btn"
              aria-label={expanded ? 'Collapse' : 'Expand'}
              onClick={(event) => {
                event.stopPropagation()
                onToggleCollapse(item.id)
              }}>
              {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            </button>
          ) : (
            <span className="tm-pm-gantt-fold-placeholder" />
          )}
          {isEditing ? (
            <input
              ref={inputRef}
              className="tm-pm-gantt-cell-input tm-pm-gantt-cell-input--name"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              onClick={(event) => event.stopPropagation()}
            />
          ) : (
            <span
              className={[
                'tm-pm-gantt-cell-text',
                kind === 'summary' || isProjectRoot ? 'tm-pm-gantt-cell-text--summary' : '',
                onCritical ? 'tm-pm-gantt-cell-text--critical' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              title={item.title}>
              {item.title}
            </span>
          )}
        </span>
      )
    }

    if (field === 'spacer') {
      return <span key={field} className="tm-pm-gantt-col tm-pm-gantt-col--spacer" aria-hidden />
    }

    const resourceCol = parseResourceColumnId(field)
    if (resourceCol) {
      const { slot, field: resourceField } = resourceCol
      const bandClass = resourceSlotBandClass(slot)
      const isProjectRoot = isGanttProjectRootId(item.id)
      /** Summary / milestone / project-root rows cannot hold resource assignments. */
      if (hasChildren || isProjectRoot || item.type === 'milestone') {
        return (
          <span
            key={field}
            className={[
              'tm-pm-gantt-col',
              `tm-pm-gantt-col--${columnClassSuffix(field)}`,
              bandClass,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            -
          </span>
        )
      }
      if (resourceField === 'type' || resourceField === 'name') {
        return (
          <span
            key={field}
            className={[
              'tm-pm-gantt-col',
              `tm-pm-gantt-col--${columnClassSuffix(field)}`,
              bandClass,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            —
          </span>
        )
      }

      const binding = columnBindings[slot]
      const catalogForCell = columnCatalog.length > 0 ? columnCatalog : resourceCatalog
      const slotAssignments = readTaskResourceAssignments(item.metadata)
      const resourceTypeFilter = prefs.resourceView.typeFilter ?? 'all'
      const resourceFilter = resourceTypeFilter === 'all' ? 'all' : resourceTypeFilter
      const assignment = resolveAssignmentAgainstCatalog(
        readResourceAssignmentAtFilteredSlot(slotAssignments, slot, resourceFilter),
        catalogForCell,
      )

      // Input mode: one text field per column — `类型，名称，数量`.
      if (resourceInputMode) {
        const display = formatResourceAssignmentInput(assignment, typeLabelOf, {
          resolveCustomTypeName: resolveAssignmentCustomTypeName,
        })
        const canEditInput = Boolean(onReplaceResourceAssignments || onAssignResource)
        if (!canEditInput) {
          return (
            <span
              key={field}
              className={['tm-pm-gantt-col', 'tm-pm-gantt-col--resourceQty', bandClass]
                .filter(Boolean)
                .join(' ')}
            >
              {display || '—'}
            </span>
          )
        }
        return (
          <span
            key={field}
            className={[
              'tm-pm-gantt-col',
              'tm-pm-gantt-col--resourceQty',
              'tm-pm-gantt-col--resource-cell',
              bandClass,
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={(event) => event.stopPropagation()}
          >
            <input
              key={`${item.id}:slot-input:${slot}:${display}`}
              className={[
                'tm-pm-gantt-cell-input',
                'tm-pm-gantt-cell-input--resource-combo',
                !display ? 'tm-pm-gantt-cell-input--empty' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              defaultValue={display}
              placeholder={t('projectManagerPage.schedule.resourceAssign.inputPlaceholder')}
              aria-label={t('projectManagerPage.schedule.columns.resourceGroup')}
              title={display || t('projectManagerPage.schedule.resourceAssign.inputPlaceholder')}
              onBlur={(event) => {
                const raw = event.target.value.trim()
                if (!raw) {
                  if (isEmptyAssignment(assignment)) return
                  const next = slotAssignments.filter((_, index) => index !== slot)
                  if (onReplaceResourceAssignments) {
                    void onReplaceResourceAssignments(item.id, next)
                  } else {
                    writeOrderedResourceSlot(item.id, slotAssignments, slot, {
                      ...EMPTY_TASK_RESOURCE_ASSIGNMENT,
                    })
                  }
                  return
                }
                const parsed = parseResourceAssignmentInput(
                  raw,
                  catalogForCell,
                  resolveResourceTypeLabel,
                )
                const resolved = resolveAssignmentAgainstCatalog(parsed, catalogForCell)
                const same =
                  resolved.resourceId === assignment.resourceId &&
                  resolved.type === assignment.type &&
                  resolved.name === assignment.name &&
                  resolved.quantity === assignment.quantity
                if (same) return
                writeOrderedResourceSlot(item.id, slotAssignments, slot, {
                  resourceId: resolved.resourceId,
                  type: resolved.type,
                  name: resolved.name,
                  quantity: resolved.quantity,
                  note: assignment.note,
                })
              }}
              onClick={(event) => event.stopPropagation()}
            />
          </span>
        )
      }

      // Normal mode: type/name picker + quantity.
      // Prefer the assignment's own type so empty fallbacks don't use a mismatched column binding.
      const assignmentType: GanttResourceColumnType =
        (assignment.type &&
        SWITCHABLE_RESOURCE_COLUMN_TYPES.includes(assignment.type as GanttResourceColumnType)
          ? (assignment.type as GanttResourceColumnType)
          : null) ??
        binding?.type ??
        'labor'
      const menuOpen =
        resourceCellPicker?.itemId === item.id && resourceCellPicker.slot === slot
      const type = menuOpen && resourceCellPicker ? resourceCellPicker.type : assignmentType
      const typeLabel = t(`projectManagerPage.resourceTable.types.${type}`)
      const selectedId = assignment.resourceId ?? ''
      const canEdit = Boolean(onAssignResource || onReplaceResourceAssignments)
      const assignmentName = assignment.name.trim()
      const fullTriggerLabel = assignmentName
        ? assignmentName
        : selectedId
          ? selectedId
          : typeLabel
      const triggerLabel = shortResourceCellLabel(fullTriggerLabel)

      const commitQuantity = (rawValue: string) => {
        if (!canEdit || (!selectedId && !assignmentName)) return
        const raw = rawValue.trim()
        const next = raw === '' ? null : Number(raw)
        if (next != null && !Number.isFinite(next)) return
        if (next === assignment.quantity) return
        writeOrderedResourceSlot(item.id, slotAssignments, slot, { quantity: next })
      }

      return (
        <span
          key={field}
          className={[
            'tm-pm-gantt-col',
            'tm-pm-gantt-col--resourceQty',
            'tm-pm-gantt-col--resource-cell',
            bandClass,
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className={[
              'tm-pm-gantt-cell-select',
              'tm-pm-gantt-resource-header-select',
              'tm-pm-gantt-resource-cell-trigger',
              !selectedId && !assignmentName ? 'tm-pm-gantt-cell-select--empty' : '',
              menuOpen ? 'tm-pm-gantt-resource-cell-trigger--open' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={typeLabel}
            title={fullTriggerLabel}
            aria-expanded={menuOpen}
            aria-haspopup="listbox"
            disabled={!canEdit}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              if (!canEdit) return
              if (menuOpen) {
                setResourceCellPicker(null)
                return
              }
              const rect = event.currentTarget.getBoundingClientRect()
              setCostNamePicker(null)
              setResourceCellPicker({
                itemId: item.id,
                slot,
                type: assignmentType,
                anchorTop: rect.top,
                anchorBottom: rect.bottom,
                left: rect.left,
                minWidth: Math.max(rect.width, 168),
              })
            }}
          >
            <span className="tm-pm-gantt-resource-cell-trigger-label">{triggerLabel}</span>
            <IconChevronDown size={12} className="tm-pm-gantt-resource-cell-trigger-chevron" />
          </button>
          <input
            key={`${item.id}:${slot}:${selectedId}:${assignmentName}:${assignment.quantity ?? ''}`}
            className={[
              'tm-pm-gantt-cell-input',
              'tm-pm-gantt-cell-input--number',
              'tm-pm-gantt-resource-cell-qty',
              assignment.quantity == null ? 'tm-pm-gantt-cell-input--empty' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            type="text"
            inputMode="decimal"
            defaultValue={assignment.quantity ?? ''}
            aria-label={t('projectManagerPage.schedule.columns.resourceQty')}
            placeholder=""
            disabled={!canEdit || (!selectedId && !assignmentName)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              commitQuantity(event.currentTarget.value)
              event.currentTarget.blur()
            }}
            onBlur={(event) => {
              commitQuantity(event.currentTarget.value)
            }}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          />
        </span>
      )
    }

    const costCol = parseCostColumnId(field)
    if (costCol) {
      const { slot, field: costField } = costCol
      const bandClass = resourceSlotBandClass(slot)
      const isProjectRoot = isGanttProjectRootId(item.id)
      if (hasChildren || isProjectRoot || item.type === 'milestone') {
        return (
          <span
            key={field}
            className={[
              'tm-pm-gantt-col',
              `tm-pm-gantt-col--${columnClassSuffix(field)}`,
              bandClass,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            -
          </span>
        )
      }
      const costTypeFilter = prefs.costView.typeFilter ?? 'all'
      const costFilter = costTypeFilter === 'all' ? 'all' : costTypeFilter
      const assignment = resolveCostAssignmentAgainstCatalog(
        readCostAssignmentAtFilteredSlot(
          readTaskCostAssignments(item.metadata),
          slot,
          costFilter,
        ),
        costCatalog,
      )

      if (costField === 'input') {
        const list = readTaskCostAssignments(item.metadata).map((entry) =>
          resolveCostAssignmentAgainstCatalog(entry, costCatalog),
        )
        const display = formatCostAssignmentsInput(list, costTypeLabelOf)
        if (!onReplaceCostAssignments) {
          return (
            <span
              key={field}
              className={['tm-pm-gantt-col', 'tm-pm-gantt-col--costInput', bandClass]
                .filter(Boolean)
                .join(' ')}
            >
              {display || '—'}
            </span>
          )
        }
        return (
          <span
            key={field}
            className={['tm-pm-gantt-col', 'tm-pm-gantt-col--costInput', bandClass]
              .filter(Boolean)
              .join(' ')}
            onClick={(event) => event.stopPropagation()}
          >
            <input
              key={`${item.id}:cost-input:${display}`}
              className={[
                'tm-pm-gantt-cell-input',
                'tm-pm-gantt-cell-input--resource-combo',
                !display ? 'tm-pm-gantt-cell-input--empty' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              defaultValue={display}
              placeholder={t('projectManagerPage.schedule.costAssign.inputPlaceholder')}
              aria-label={t('projectManagerPage.schedule.columns.costGroup')}
              onBlur={(event) => {
                const next = parseCostAssignmentsInput(
                  event.target.value,
                  costCatalog,
                  resolveCostTypeLabel,
                )
                const same =
                  next.length === list.length &&
                  next.every((entry, index) => {
                    const prev = list[index]!
                    return (
                      entry.costId === prev.costId &&
                      entry.type === prev.type &&
                      entry.name === prev.name &&
                      entry.amount === prev.amount
                    )
                  })
                if (same) return
                void onReplaceCostAssignments(item.id, next)
              }}
              onClick={(event) => event.stopPropagation()}
            />
          </span>
        )
      }

      const canEditCost = Boolean(onAssignCost || onReplaceCostAssignments)

      if (costField === 'qty') {
        const slotAssignments = readTaskCostAssignments(item.metadata).map((entry) =>
          resolveCostAssignmentAgainstCatalog(entry, costCatalog),
        )
        const costTypeFilter = prefs.costView.typeFilter ?? 'all'
        const costFilter = costTypeFilter === 'all' ? 'all' : costTypeFilter
        const qtyAssignment = resolveCostAssignmentAgainstCatalog(
          readCostAssignmentAtFilteredSlot(slotAssignments, slot, costFilter),
          costCatalog,
        )
        const catalogRow = findCatalogRowForCostAssignment(qtyAssignment, costCatalog)
        const catalogAmount = catalogRow
          ? catalogCostAmountLimit(catalogRow, costCatalog)
          : null
        const catalogQuantity = catalogCostQuantity(catalogRow)
        const percentValue = resolveCostAssignmentPercent(
          qtyAssignment,
          catalogAmount,
          catalogQuantity,
        )
        const displayQuantity = computeCostAssignmentQuantity(catalogQuantity, percentValue)
        if (!canEditCost) {
          const label = qtyAssignment.name.trim() || qtyAssignment.costId || ''
          const display =
            label && displayQuantity != null
              ? `${label} · ${displayQuantity}`
              : label || (displayQuantity != null ? String(displayQuantity) : '')
          return (
            <span
              key={field}
              className={[
                'tm-pm-gantt-col',
                'tm-pm-gantt-col--costQty',
                'tm-pm-gantt-col--resource-cell',
                bandClass,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {display || '—'}
            </span>
          )
        }
        const selectedId = qtyAssignment.costId ?? ''
        const namedRows = costCatalog.filter((row) => row.name.trim().length > 0)
        const selectedInCatalog = Boolean(
          selectedId && namedRows.some((row) => row.id === selectedId),
        )
        const orphanName =
          !selectedInCatalog && qtyAssignment.name.trim() ? qtyAssignment.name.trim() : ''
        const triggerLabel =
          qtyAssignment.name.trim() ||
          orphanName ||
          t('projectManagerPage.schedule.costAssign.selectName')
        const pickerOpen =
          costNamePicker?.itemId === item.id &&
          costNamePicker.slot === slot &&
          costNamePicker.source === 'cell-qty'
        const commitQuantity = (rawValue: string) => {
          if (!selectedId && !qtyAssignment.name.trim()) return
          const raw = rawValue.trim()
          const nextQty = raw === '' ? null : Number(raw)
          if (nextQty != null && !Number.isFinite(nextQty)) return
          if (nextQty === displayQuantity) return
          const percent = resolveCostPercentFromQuantity(
            nextQty,
            catalogQuantity,
            qtyAssignment.percent,
          )
          const nextAmount = computeCostAssignmentMoney(catalogAmount, percent)
          writeOrderedCostSlot(item.id, slotAssignments, slot, {
            amount: nextAmount,
            percent,
          })
        }
        return (
          <span
            key={field}
            className={[
              'tm-pm-gantt-col',
              'tm-pm-gantt-col--costQty',
              'tm-pm-gantt-col--resource-cell',
              bandClass,
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={[
                'tm-pm-gantt-cell-select',
                'tm-pm-gantt-resource-header-select',
                'tm-pm-gantt-resource-cell-trigger',
                'tm-pm-gantt-cost-name-trigger',
                !selectedId && !orphanName ? 'tm-pm-gantt-cell-select--empty' : '',
                pickerOpen ? 'tm-pm-gantt-resource-cell-trigger--open' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={t('projectManagerPage.schedule.columns.costName')}
              title={triggerLabel}
              onClick={(event) =>
                openCostNamePicker(event, {
                  itemId: item.id,
                  slot,
                  source: 'cell-qty',
                  typeFilter: null,
                })
              }
            >
              <span className="tm-pm-gantt-resource-cell-trigger-label">{triggerLabel}</span>
              <IconChevronDown size={12} className="tm-pm-gantt-resource-cell-trigger-chevron" />
            </button>
            <input
              key={`${item.id}:${slot}:qty:${selectedId}:${displayQuantity ?? ''}:${percentValue}`}
              className={[
                'tm-pm-gantt-cell-input',
                'tm-pm-gantt-cell-input--number',
                'tm-pm-gantt-resource-cell-qty',
                displayQuantity == null ? 'tm-pm-gantt-cell-input--empty' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              type="text"
              inputMode="decimal"
              defaultValue={displayQuantity ?? ''}
              aria-label={t('projectManagerPage.schedule.columns.costEngineeringQuantity')}
              placeholder=""
              disabled={!selectedId && !qtyAssignment.name.trim()}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                commitQuantity(event.currentTarget.value)
                event.currentTarget.blur()
              }}
              onBlur={(event) => {
                commitQuantity(event.target.value)
              }}
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
            />
          </span>
        )
      }

      if (!canEditCost) {
        const display =
          costField === 'name'
            ? assignment.name
            : assignment.amount != null
              ? String(assignment.amount)
              : ''
        return (
          <span
            key={field}
            className={[
              'tm-pm-gantt-col',
              `tm-pm-gantt-col--${columnClassSuffix(field)}`,
              bandClass,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {display || '—'}
          </span>
        )
      }

      if (costField === 'name') {
        const selectedId = assignment.costId ?? ''
        const namedRows = costCatalog.filter((row) => row.name.trim().length > 0)
        const selectedInCatalog = Boolean(
          selectedId && namedRows.some((row) => row.id === selectedId),
        )
        const orphanName =
          !selectedInCatalog && assignment.name.trim() ? assignment.name.trim() : ''
        const triggerLabel =
          assignment.name.trim() ||
          orphanName ||
          t('projectManagerPage.schedule.costAssign.selectName')
        const pickerOpen =
          costNamePicker?.itemId === item.id &&
          costNamePicker.slot === slot &&
          costNamePicker.source === 'cell-name'
        return (
          <span
            key={field}
            className={['tm-pm-gantt-col', 'tm-pm-gantt-col--costName', bandClass]
              .filter(Boolean)
              .join(' ')}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={[
                'tm-pm-gantt-cell-select',
                'tm-pm-gantt-resource-cell-trigger',
                'tm-pm-gantt-cost-name-trigger',
                !selectedId && !orphanName ? 'tm-pm-gantt-cell-select--empty' : '',
                pickerOpen ? 'tm-pm-gantt-resource-cell-trigger--open' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={t('projectManagerPage.schedule.columns.costName')}
              title={triggerLabel}
              onClick={(event) =>
                openCostNamePicker(event, {
                  itemId: item.id,
                  slot,
                  source: 'cell-name',
                  typeFilter: null,
                })
              }
            >
              <span className="tm-pm-gantt-resource-cell-trigger-label">{triggerLabel}</span>
              <IconChevronDown size={12} className="tm-pm-gantt-resource-cell-trigger-chevron" />
            </button>
          </span>
        )
      }

      const amountSlotAssignments = readTaskCostAssignments(item.metadata).map((entry) =>
        resolveCostAssignmentAgainstCatalog(entry, costCatalog),
      )
      return (
        <span
          key={field}
          className={['tm-pm-gantt-col', 'tm-pm-gantt-col--costAmount', bandClass]
            .filter(Boolean)
            .join(' ')}
          onClick={(event) => event.stopPropagation()}
        >
          <input
            key={`${item.id}:${slot}:amount:${assignment.amount ?? ''}`}
            className="tm-pm-gantt-cell-input tm-pm-gantt-cell-input--number"
            type="number"
            min={0}
            step="any"
            defaultValue={assignment.amount ?? ''}
            aria-label={t('projectManagerPage.schedule.columns.costAmount')}
            placeholder={assignment.name.trim() || assignment.costId ? '0' : ''}
            onBlur={(event) => {
              const raw = event.target.value.trim()
              const next = raw === '' ? null : Number(raw)
              if (next != null && !Number.isFinite(next)) return
              if (next === assignment.amount) return
              const catalogRow = findCatalogRowForCostAssignment(assignment, costCatalog)
              const catalogAmount = catalogRow
                ? catalogCostAmountLimit(catalogRow, costCatalog)
                : null
              const catalogQuantity = catalogCostQuantity(catalogRow)
              const percent = resolveCostPercentFromAmount(
                next,
                catalogAmount,
                assignment.percent,
                catalogQuantity,
              )
              writeOrderedCostSlot(item.id, amountSlotAssignments, slot, {
                amount: next,
                percent,
              })
            }}
            onClick={(event) => event.stopPropagation()}
          />
        </span>
      )
    }

    const isProjectRoot = isGanttProjectRootId(item.id)
    const varianceTone =
      field === 'variance'
        ? (() => {
            const plan = baselinePlanByItemId?.get(item.id)
            const rolledProgress = progressPercentById?.get(item.id)
            const result = computeScheduleVarianceDays(
              rolledProgress == null ? item : { ...item, progressPercent: rolledProgress },
              {
                planStartMs: plan?.startDate,
                planFinishMs: plan?.dueDate,
                shouldPercentAsOfMs,
              },
            )
            if (!result || result.days === 0) return ''
            return result.days > 0 ? 'tm-pm-gantt-col--variance-ahead' : 'tm-pm-gantt-col--variance-behind'
          })()
        : ''
    return (
      <span
        key={field}
        className={[
          'tm-pm-gantt-col',
          `tm-pm-gantt-col--${columnClassSuffix(field)}`,
          varianceTone,
        ]
          .filter(Boolean)
          .join(' ')}
        onDoubleClick={(event) => {
          if (isProjectRoot) return
          if (field === 'variance') return
          if (field === 'percentComplete' && hasChildren) return
          // 应完成% is derived from the selected baseline as-of date while comparing.
          if (field === 'shouldPercentComplete' && shouldPercentAsOfMs != null) return
          event.stopPropagation()
          startEdit({ kind: 'cell', itemId: item.id, field }, value)
        }}>
        {isEditing ? (
          <input
            ref={inputRef}
            className="tm-pm-gantt-cell-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          value || '—'
        )}
      </span>
    )
  }

  return (
    <div
      ref={gridScrollRef}
      className="tm-pm-gantt-grid-body"
      onScroll={onScroll}
      onWheel={handleWheel}
      onKeyDown={(event) => {
        handlePmTableCellNavKeyDown(event)
      }}
    >
      {rows.map((row) => {
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
            {prefs.columnOrder.map((columnId) => renderBodyCell(row, columnId))}
          </div>
        )
      })}
    </div>
  )
}

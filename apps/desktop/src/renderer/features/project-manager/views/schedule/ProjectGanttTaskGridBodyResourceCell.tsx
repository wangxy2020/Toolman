import { IconChevronDown } from '../../../../components/icons'
import {
  EMPTY_TASK_RESOURCE_ASSIGNMENT,
  formatResourceAssignmentInput,
  isEmptyAssignment,
  parseResourceAssignmentInput,
  parseResourceColumnId,
  readResourceAssignmentAtFilteredSlot,
  readTaskResourceAssignments,
  resolveAssignmentAgainstCatalog,
} from './pm-gantt-resource-assignment'
import type { GanttResourceColumnType } from './pm-gantt-prefs'
import { SWITCHABLE_RESOURCE_COLUMN_TYPES } from './pm-gantt-prefs'
import { isGanttProjectRootId } from './pm-gantt-utils'
import { resourceSlotBandClass, shortResourceCellLabel } from './pm-gantt-task-grid-utils'
import type { BodyCellRenderArgs } from './ProjectGanttTaskGridBodyShared'

export function renderGanttResourceCell({ row, field, gridProps, state }: BodyCellRenderArgs) {
  const resourceCol = parseResourceColumnId(field)
  if (!resourceCol) return null
  const { item, hasChildren } = row
  const {
    prefs,
    resourceCatalog = [],
    onAssignResource,
    onReplaceResourceAssignments,
  } = gridProps
  const {
    t,
    resourceCellPicker,
    setResourceCellPicker,
    setCostNamePicker,
    resourceInputMode,
    columnCatalog,
    columnBindings,
    resolveResourceTypeLabel,
    typeLabelOf,
    resolveAssignmentCustomTypeName,
    writeOrderedResourceSlot,
    columnClassSuffix,
  } = state
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

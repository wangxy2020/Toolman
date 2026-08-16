import { IconChevronDown } from '../../../../components/icons'
import {
  catalogCostAmountLimit,
  catalogCostQuantity,
  computeCostAssignmentMoney,
  computeCostAssignmentQuantity,
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
import { isGanttProjectRootId } from './pm-gantt-utils'
import { resourceSlotBandClass } from './pm-gantt-task-grid-utils'
import type { BodyCellRenderArgs } from './ProjectGanttTaskGridBodyShared'

export function renderGanttCostQtyCell({ row, field, gridProps, state }: BodyCellRenderArgs) {
  const costCol = parseCostColumnId(field)
  if (!costCol) return null
  const { slot, field: costField } = costCol
  if (costField !== 'input' && costField !== 'qty') return null
  const { item, hasChildren } = row
  const {
    prefs,
    costCatalog = [],
    onAssignCost,
    onReplaceCostAssignments,
  } = gridProps
  const {
    t,
    costNamePicker,
    resolveCostTypeLabel,
    costTypeLabelOf,
    writeOrderedCostSlot,
    openCostNamePicker,
    columnClassSuffix,
  } = state
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
}

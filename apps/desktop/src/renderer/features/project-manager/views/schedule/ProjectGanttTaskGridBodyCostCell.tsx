import { IconChevronDown } from '../../../../components/icons'
import {
  catalogCostAmountLimit,
  catalogCostQuantity,
  findCatalogRowForCostAssignment,
  parseCostColumnId,
  readCostAssignmentAtFilteredSlot,
  readTaskCostAssignments,
  resolveCostAssignmentAgainstCatalog,
} from './pm-gantt-cost-assignment'
import { isGanttProjectRootId } from './pm-gantt-utils'
import { resolveCostPercentFromAmount, resourceSlotBandClass } from './pm-gantt-task-grid-utils'
import type { BodyCellRenderArgs } from './ProjectGanttTaskGridBodyShared'

export function renderGanttCostNameAmountCell({ row, field, gridProps, state }: BodyCellRenderArgs) {
  const costCol = parseCostColumnId(field)
  if (!costCol) return null
  const { slot, field: costField } = costCol
  if (costField === 'input' || costField === 'qty') return null
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
  const canEditCost = Boolean(onAssignCost || onReplaceCostAssignments)

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

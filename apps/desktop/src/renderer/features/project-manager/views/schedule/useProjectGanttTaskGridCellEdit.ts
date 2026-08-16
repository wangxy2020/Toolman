import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { PmWorkItem } from '@toolman/shared'
import {
  formatCostAssignmentsInput,
  parseCostColumnId,
  readCostAssignmentAtFilteredSlot,
  readTaskCostAssignments,
  resolveCostAssignmentAgainstCatalog,
} from './pm-gantt-cost-assignment'
import {
  formatResourceAssignmentsInput,
  parseResourceColumnId,
  readResourceAssignmentAtFilteredSlot,
  readTaskResourceAssignments,
  resolveAssignmentAgainstCatalog,
} from './pm-gantt-resource-assignment'
import {
  ACTUAL_FINISH_META_KEY,
  ACTUAL_START_META_KEY,
  customColumnMetaKey,
  isGanttBuiltinColumn,
  isGanttCustomColumnId,
  type GanttUiPrefs,
} from './pm-gantt-prefs'
import {
  formatWorkItemDate,
  formatScheduleVarianceDays,
  computeScheduleVarianceDays,
  shouldCompletePercent,
  workItemDurationDays,
} from './pm-gantt-utils'
import { formatPredecessorsForItem } from './pm-predecessor-utils'
import type { EditTarget, GanttEditableField, Props } from './pm-gantt-task-grid-utils'
import type { PmCostType } from '../cost/pm-cost-catalog'
import type { PmResourceType } from '../resource/pm-resource-catalog'

export function useProjectGanttTaskGridCellEdit(args: {
  prefs: GanttUiPrefs
  relations: Props['relations']
  indexById: Props['indexById']
  resourceViewMode: boolean
  costViewMode: boolean
  resourceCatalog: Props['resourceCatalog']
  costCatalog: Props['costCatalog']
  progressPercentById: Props['progressPercentById']
  baselinePlanByItemId: Props['baselinePlanByItemId']
  shouldPercentAsOfMs: Props['shouldPercentAsOfMs']
  onCommitCell: Props['onCommitCell']
  t: (key: string) => string
  columnCatalog: NonNullable<Props['resourceCatalog']>
  typeLabelOf: (type: PmResourceType) => string
  costTypeLabelOf: (type: PmCostType) => string
  resolveAssignmentCustomTypeName: (assignment: {
    resourceId: string | null
    name: string
    type: PmResourceType | null
  }) => string
  patchPrefs: (patch: Partial<GanttUiPrefs> | ((current: GanttUiPrefs) => GanttUiPrefs)) => void
}) {
  const {
    prefs,
    relations,
    indexById,
    resourceViewMode,
    costViewMode,
    resourceCatalog = [],
    costCatalog = [],
    progressPercentById,
    baselinePlanByItemId,
    shouldPercentAsOfMs = null,
    onCommitCell,
    t,
    columnCatalog,
    typeLabelOf,
    costTypeLabelOf,
    resolveAssignmentCustomTypeName,
    patchPrefs,
  } = args

  const [editing, setEditing] = useState<EditTarget | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const startEdit = (target: EditTarget, value: string) => {
    if (target.kind === 'header' && (target.columnId === 'index' || target.columnId === 'spacer')) {
      return
    }
    if (target.kind === 'header' && (resourceViewMode || costViewMode)) return
    setEditing(target)
    setDraft(value)
  }

  const cancelEdit = () => {
    setEditing(null)
    setDraft('')
  }

  const commitEdit = () => {
    if (!editing) return
    if (editing.kind === 'header') {
      const next = draft.trim()
      if (next) {
        patchPrefs({
          columnLabels: { ...prefs.columnLabels, [editing.columnId]: next },
          customColumns: prefs.customColumns.map((col) =>
            col.id === editing.columnId ? { ...col, label: next } : col,
          ),
        })
      }
    } else {
      void onCommitCell(editing.itemId, editing.field, draft)
    }
    cancelEdit()
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitEdit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelEdit()
    }
  }

  const cellValue = (item: PmWorkItem, field: string): string => {
    if (field === 'spacer') return ''
    const resourceCol = parseResourceColumnId(field)
    if (resourceCol) {
      const catalogForCell = columnCatalog.length > 0 ? columnCatalog : resourceCatalog
      if (resourceCol.field === 'input') {
        const list = readTaskResourceAssignments(item.metadata).map((entry) =>
          resolveAssignmentAgainstCatalog(entry, catalogForCell),
        )
        return formatResourceAssignmentsInput(list, typeLabelOf, {
          resolveCustomTypeName: resolveAssignmentCustomTypeName,
        })
      }
      const slotList = readTaskResourceAssignments(item.metadata)
      const typeFilter = prefs.resourceView.typeFilter ?? 'all'
      const filter = typeFilter === 'all' ? 'all' : typeFilter
      const assignment = resolveAssignmentAgainstCatalog(
        readResourceAssignmentAtFilteredSlot(slotList, resourceCol.slot, filter),
        catalogForCell,
      )
      if (assignment.quantity == null) return ''
      return String(assignment.quantity)
    }
    const costCol = parseCostColumnId(field)
    if (costCol) {
      const typeFilter = prefs.costView.typeFilter ?? 'all'
      const filter = typeFilter === 'all' ? 'all' : typeFilter
      const assignment = resolveCostAssignmentAgainstCatalog(
        readCostAssignmentAtFilteredSlot(
          readTaskCostAssignments(item.metadata),
          costCol.slot,
          filter,
        ),
        costCatalog,
      )
      if (costCol.field === 'name') return assignment.name
      if (costCol.field === 'input') {
        return formatCostAssignmentsInput(
          readTaskCostAssignments(item.metadata).map((entry) =>
            resolveCostAssignmentAgainstCatalog(entry, costCatalog),
          ),
          costTypeLabelOf,
        )
      }
      if (assignment.amount == null) return ''
      return String(assignment.amount)
    }
    if (isGanttCustomColumnId(field) || (!isGanttBuiltinColumn(field) && field !== 'index')) {
      const raw = item.metadata?.[customColumnMetaKey(field)]
      return raw == null ? '' : String(raw)
    }
    switch (field as GanttEditableField) {
      case 'name':
        return item.title
      case 'duration':
        return `${workItemDurationDays(item)}${t('projectManagerPage.schedule.dayUnit')}`
      case 'start':
        return formatWorkItemDate(item.startDate)
      case 'finish':
        return formatWorkItemDate(item.dueDate)
      case 'predecessors':
        return formatPredecessorsForItem(relations, item.id, indexById)
      case 'actualStart': {
        const raw = item.metadata?.[ACTUAL_START_META_KEY]
        const ms = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : null
        return ms != null && Number.isFinite(ms) ? formatWorkItemDate(ms) : ''
      }
      case 'actualFinish': {
        const raw = item.metadata?.[ACTUAL_FINISH_META_KEY]
        const ms = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : null
        return ms != null && Number.isFinite(ms) ? formatWorkItemDate(ms) : ''
      }
      case 'shouldPercentComplete': {
        const plan = baselinePlanByItemId?.get(item.id)
        return `${shouldCompletePercent(
          item,
          plan?.startDate,
          plan?.dueDate,
          shouldPercentAsOfMs,
        )}%`
      }
      case 'percentComplete':
        return `${progressPercentById?.get(item.id) ?? item.progressPercent}%`
      case 'variance': {
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
        if (!result) return '—'
        return formatScheduleVarianceDays(
          result.days,
          t('projectManagerPage.schedule.dayUnit'),
        )
      }
      default:
        return ''
    }
  }

  return { editing, draft, setDraft, inputRef, startEdit, commitEdit, handleKeyDown, cellValue }
}

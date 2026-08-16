import type { PmWorkItem, PmWorkItemRelation } from '@toolman/shared'

import type { PmResourceRow, PmResourceType } from '../resource/pm-resource-catalog'
import { isPmResourceType } from '../resource/pm-resource-catalog'
import {
  ACTUAL_FINISH_META_KEY,
  ACTUAL_START_META_KEY,
  customColumnMetaKey,
  GANTT_COLUMN_WIDTHS,
  isGanttBuiltinColumn,
  isGanttCustomColumnId,
} from './pm-gantt-prefs'
import {
  readTaskResourceAssignments,
  resolveAssignmentAgainstCatalog,
} from './pm-gantt-resource-assignment'
import {
  computeScheduleVarianceDays,
  formatScheduleVarianceDays,
  formatWorkItemDate,
  shouldCompletePercent,
  workItemDurationDays,
} from './pm-gantt-utils'
import { formatPredecessorsForItem } from './pm-predecessor-utils'

export function ganttPrintCellValue(
  item: PmWorkItem,
  field: string,
  relations: PmWorkItemRelation[],
  indexById: Map<string, number>,
  dayUnit: string,
  resourceCatalog: readonly PmResourceRow[],
  typeLabel: (type: PmResourceType) => string,
): string {
  if (field === 'spacer') return ''
  const resourceMatch = /^resource:(\d+):(type|name|qty)$/.exec(field)
  if (resourceMatch) {
    const slot = Number(resourceMatch[1])
    const kind = resourceMatch[2]
    const assignment = resolveAssignmentAgainstCatalog(
      readTaskResourceAssignments(item.metadata)[slot] ?? {
        resourceId: null,
        type: null,
        name: '',
        quantity: null,
        note: '',
      },
      resourceCatalog,
    )
    if (kind === 'type') {
      return assignment.type && isPmResourceType(assignment.type)
        ? typeLabel(assignment.type)
        : ''
    }
    if (kind === 'name') return assignment.name
    return assignment.quantity != null && Number.isFinite(assignment.quantity)
      ? String(assignment.quantity)
      : ''
  }
  if (isGanttCustomColumnId(field) || (!isGanttBuiltinColumn(field) && field !== 'index')) {
    const raw = item.metadata?.[customColumnMetaKey(field)]
    return raw == null ? '' : String(raw)
  }
  switch (field) {
    case 'name':
      return item.title
    case 'duration':
      return `${workItemDurationDays(item)}${dayUnit}`
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
    case 'shouldPercentComplete':
      return `${shouldCompletePercent(item)}%`
    case 'percentComplete':
      return `${item.progressPercent}%`
    case 'variance': {
      const result = computeScheduleVarianceDays(item)
      if (!result) return '—'
      return formatScheduleVarianceDays(result.days, dayUnit)
    }
    default:
      return ''
  }
}

export function ganttPrintColumnWidth(columnId: string): string {
  if (columnId === 'name') return '160px'
  if (columnId === 'index') return '40px'
  const raw = GANTT_COLUMN_WIDTHS[columnId]
  if (!raw) return '72px'
  const px = raw.match(/(\d+)px/)
  return px ? `${px[1]}px` : '72px'
}

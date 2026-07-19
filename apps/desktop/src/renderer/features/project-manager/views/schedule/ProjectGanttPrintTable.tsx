import type { FC } from 'react'

import type { PmWorkItem, PmWorkItemRelation } from '@toolman/shared'

import { useI18n } from '../../../../i18n/useI18n'
import type { GanttTreeRow } from './pm-gantt-tree'
import { resolveGanttTaskKind } from './pm-gantt-tree'
import {
  ACTUAL_FINISH_META_KEY,
  ACTUAL_START_META_KEY,
  customColumnMetaKey,
  GANTT_COLUMN_WIDTHS,
  isGanttBuiltinColumn,
  isGanttCustomColumnId,
  resolveColumnLabel,
  type GanttUiPrefs,
} from './pm-gantt-prefs'
import {
  barPercentsInRange,
  buildScheduleTimeline,
  formatWorkItemDate,
  GANTT_ROW_HEIGHT,
  isGanttProjectRootId,
  shouldCompletePercent,
  workItemDurationDays,
} from './pm-gantt-utils'
import { formatPredecessorsForItem } from './pm-predecessor-utils'
import type { GanttColumnLabels } from './ProjectGanttTaskGrid'

type ScheduleTimeline = ReturnType<typeof buildScheduleTimeline>

type Props = {
  rows: GanttTreeRow[]
  relations: PmWorkItemRelation[]
  indexById: Map<string, number>
  criticalIds: ReadonlySet<string>
  prefs: GanttUiPrefs
  builtinLabels: GanttColumnLabels
  timeline: ScheduleTimeline
  baselineByItemId: Map<string, { startDate?: number; dueDate?: number }>
  showYearRow: boolean
  showMonthRow: boolean
  showWeekRow: boolean
  showDayRow: boolean
  headerHeight: number
}

function cellValue(
  item: PmWorkItem,
  field: string,
  relations: PmWorkItemRelation[],
  indexById: Map<string, number>,
  dayUnit: string,
): string {
  if (field === 'spacer') return ''
  const resourceMatch = /^resource:(\d+):(type|name|qty)$/.exec(field)
  if (resourceMatch) {
    const slot = Number(resourceMatch[1])
    const kind = resourceMatch[2]
    const list = item.metadata?.resourceAssignments
    const legacy = item.metadata?.resourceAssignment
    const raw = Array.isArray(list)
      ? list[slot]
      : slot === 0
        ? legacy
        : null
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return ''
    const row = raw as Record<string, unknown>
    if (kind === 'type') return typeof row.type === 'string' ? row.type : ''
    if (kind === 'name') return typeof row.name === 'string' ? row.name : ''
    return typeof row.quantity === 'number' && Number.isFinite(row.quantity)
      ? String(row.quantity)
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
    default:
      return ''
  }
}

function columnWidth(columnId: string): string {
  if (columnId === 'name') return '160px'
  if (columnId === 'index') return '40px'
  const raw = GANTT_COLUMN_WIDTHS[columnId]
  if (!raw) return '72px'
  // Strip minmax()/fr tracks for table layout.
  const px = raw.match(/(\d+)px/)
  return px ? `${px[1]}px` : '72px'
}

/** Print-only table so Chromium repeats <thead> on every page (no position:fixed). */
const ProjectGanttPrintTable: FC<Props> = ({
  rows,
  relations,
  indexById,
  criticalIds,
  prefs,
  builtinLabels,
  timeline,
  baselineByItemId,
  showYearRow,
  showMonthRow,
  showWeekRow,
  showDayRow,
  headerHeight,
}) => {
  const { t } = useI18n()
  const dayUnit = t('projectManagerPage.schedule.dayUnit')
  const columns = prefs.columnOrder.filter((columnId) => columnId !== 'spacer')

  return (
    <table className="tm-pm-gantt-print-table">
      <colgroup>
        {columns.map((columnId) => (
          <col key={columnId} style={{ width: columnWidth(columnId) }} />
        ))}
        <col className="tm-pm-gantt-print-chart-col" />
      </colgroup>
      <thead>
        <tr>
          {columns.map((columnId) => {
            const label = resolveColumnLabel(columnId, prefs, builtinLabels)
            return (
              <th
                key={columnId}
                className={`tm-pm-gantt-print-th tm-pm-gantt-print-th--${
                  isGanttBuiltinColumn(columnId) ? columnId : 'custom'
                }`}>
                {label.includes('\n')
                  ? label.split('\n').map((line) => <span key={line}>{line}</span>)
                  : label}
              </th>
            )
          })}
          <th className="tm-pm-gantt-print-th tm-pm-gantt-print-th--chart" style={{ height: headerHeight }}>
            <div
              className="tm-pm-gantt-chart-header tm-pm-gantt-chart-header--layered"
              style={{ width: '100%', height: headerHeight }}>
              {showYearRow ? (
                <div className="tm-pm-gantt-scale-row tm-pm-gantt-scale-row--year">
                  {timeline.yearBands.map((band) => (
                    <span
                      key={band.key}
                      className="tm-pm-gantt-scale-band"
                      style={{ left: `${band.leftPercent}%`, width: `${band.widthPercent}%` }}
                      title={band.label}>
                      {band.label}
                    </span>
                  ))}
                </div>
              ) : null}
              {showMonthRow ? (
                <div className="tm-pm-gantt-scale-row tm-pm-gantt-scale-row--month">
                  {timeline.monthBands.map((band) => (
                    <span
                      key={band.key}
                      className="tm-pm-gantt-scale-band"
                      style={{ left: `${band.leftPercent}%`, width: `${band.widthPercent}%` }}
                      title={band.label}>
                      {band.label}
                    </span>
                  ))}
                </div>
              ) : null}
              {showWeekRow ? (
                <div className="tm-pm-gantt-scale-row tm-pm-gantt-scale-row--week">
                  {timeline.weekBands.map((band) => (
                    <span
                      key={band.key}
                      className="tm-pm-gantt-scale-band"
                      style={{ left: `${band.leftPercent}%`, width: `${band.widthPercent}%` }}
                      title={band.label}>
                      {band.label}
                    </span>
                  ))}
                </div>
              ) : null}
              {showDayRow ? (
                <div className="tm-pm-gantt-scale-row tm-pm-gantt-scale-row--day">
                  {timeline.headers.map((header) => (
                    <span
                      key={header.key}
                      className="tm-pm-gantt-day-tick"
                      style={{
                        left: `${header.leftPercent}%`,
                        width: `${header.widthPercent}%`,
                      }}
                    />
                  ))}
                  {timeline.headers.map((header) =>
                    header.labelBottom ? (
                      <span
                        key={`${header.key}-label`}
                        className="tm-pm-gantt-day-label"
                        style={{
                          left: `${header.leftPercent + header.widthPercent / 2}%`,
                        }}>
                        {header.labelBottom}
                      </span>
                    ) : null,
                  )}
                </div>
              ) : null}
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ item, depth, hasChildren, rowNumber }) => {
          const bar = timeline.bars.find((entry) => entry.item.id === item.id)
          const ghost = baselineByItemId.get(item.id)
          const ghostRange =
            ghost?.startDate != null && ghost.dueDate != null
              ? barPercentsInRange(
                  ghost.startDate,
                  ghost.dueDate,
                  timeline.rangeStart,
                  timeline.rangeEnd,
                )
              : null
          const onCritical = criticalIds.has(item.id)
          const kind = resolveGanttTaskKind(item, hasChildren, onCritical)
          const isMilestoneBar = !hasChildren && item.type === 'milestone'
          const isProjectRoot = isGanttProjectRootId(item.id)
          return (
            <tr
              key={item.id}
              className={[
                'tm-pm-gantt-print-tr',
                isProjectRoot ? 'tm-pm-gantt-print-tr--project-root' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ height: GANTT_ROW_HEIGHT }}>
              {columns.map((columnId) => {
                if (columnId === 'index') {
                  return (
                    <td key={columnId} className="tm-pm-gantt-print-td tm-pm-gantt-print-td--index">
                      {rowNumber > 0 ? rowNumber : ''}
                    </td>
                  )
                }
                if (columnId === 'name') {
                  return (
                    <td
                      key={columnId}
                      className={[
                        'tm-pm-gantt-print-td',
                        'tm-pm-gantt-print-td--name',
                        kind === 'summary' || isProjectRoot
                          ? 'tm-pm-gantt-print-td--summary'
                          : '',
                        onCritical ? 'tm-pm-gantt-print-td--critical' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{ paddingLeft: `${4 + depth * 12}px` }}>
                      {item.title}
                    </td>
                  )
                }
                return (
                  <td
                    key={columnId}
                    className={`tm-pm-gantt-print-td tm-pm-gantt-print-td--${
                      isGanttBuiltinColumn(columnId) ? columnId : 'custom'
                    }`}>
                    {cellValue(item, columnId, relations, indexById, dayUnit) || '—'}
                  </td>
                )
              })}
              <td className="tm-pm-gantt-print-td tm-pm-gantt-print-td--chart">
                <div className="tm-pm-gantt-print-chart-cell">
                  {ghostRange ? (
                    <div
                      className={[
                        'tm-pm-gantt-bar',
                        'tm-pm-gantt-bar--baseline',
                        isMilestoneBar ? 'tm-pm-gantt-bar--baseline-milestone' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={
                        isMilestoneBar
                          ? { left: `${ghostRange.leftPercent}%` }
                          : {
                              left: `${ghostRange.leftPercent}%`,
                              width: `${ghostRange.widthPercent}%`,
                            }
                      }
                    />
                  ) : null}
                  {bar ? (
                    <div
                      className={[
                        'tm-pm-gantt-bar',
                        kind === 'summary' ? 'tm-pm-gantt-bar--summary' : '',
                        isMilestoneBar ? 'tm-pm-gantt-bar--milestone' : '',
                        onCritical ? 'tm-pm-gantt-bar--critical' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={
                        isMilestoneBar
                          ? { left: `${bar.leftPercent}%`, width: 12, height: 12 }
                          : { left: `${bar.leftPercent}%`, width: `${bar.widthPercent}%` }
                      }
                    />
                  ) : null}
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default ProjectGanttPrintTable

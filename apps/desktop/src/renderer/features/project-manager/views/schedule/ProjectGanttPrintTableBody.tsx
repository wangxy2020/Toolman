import type { FC } from 'react'

import type { PmWorkItemRelation } from '@toolman/shared'

import type { PmResourceRow, PmResourceType } from '../resource/pm-resource-catalog'
import type { GanttTreeRow } from './pm-gantt-tree'
import { resolveGanttTaskKind } from './pm-gantt-tree'
import { isGanttBuiltinColumn } from './pm-gantt-prefs'
import {
  barPercentsInRange,
  buildScheduleTimeline,
  GANTT_ROW_HEIGHT,
  isGanttProjectRootId,
} from './pm-gantt-utils'
import { ganttPrintCellValue } from './project-gantt-print-table-cells'

type ScheduleTimeline = ReturnType<typeof buildScheduleTimeline>

type Props = {
  rows: GanttTreeRow[]
  columns: string[]
  relations: PmWorkItemRelation[]
  indexById: Map<string, number>
  criticalIds: ReadonlySet<string>
  timeline: ScheduleTimeline
  baselineByItemId: Map<string, { startDate?: number; dueDate?: number }>
  resourceCatalog: readonly PmResourceRow[]
  dayUnit: string
  typeLabel: (type: PmResourceType) => string
}

const ProjectGanttPrintTableBody: FC<Props> = ({
  rows,
  columns,
  relations,
  indexById,
  criticalIds,
  timeline,
  baselineByItemId,
  resourceCatalog,
  dayUnit,
  typeLabel,
}) => (
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
                    kind === 'summary' || isProjectRoot ? 'tm-pm-gantt-print-td--summary' : '',
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
                {ganttPrintCellValue(
                  item,
                  columnId,
                  relations,
                  indexById,
                  dayUnit,
                  resourceCatalog,
                  typeLabel,
                ) || '—'}
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
)

export default ProjectGanttPrintTableBody

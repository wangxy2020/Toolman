import type { FC } from 'react'

import { isGanttBuiltinColumn, resolveColumnLabel, type GanttUiPrefs } from './pm-gantt-prefs'
import { buildScheduleTimeline } from './pm-gantt-utils'
import type { GanttColumnLabels } from './ProjectGanttTaskGrid'

type ScheduleTimeline = ReturnType<typeof buildScheduleTimeline>

type Props = {
  columns: string[]
  prefs: GanttUiPrefs
  builtinLabels: GanttColumnLabels
  timeline: ScheduleTimeline
  showYearRow: boolean
  showMonthRow: boolean
  showWeekRow: boolean
  showDayRow: boolean
  headerHeight: number
}

const ProjectGanttPrintTableHeader: FC<Props> = ({
  columns,
  prefs,
  builtinLabels,
  timeline,
  showYearRow,
  showMonthRow,
  showWeekRow,
  showDayRow,
  headerHeight,
}) => (
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
)

export default ProjectGanttPrintTableHeader

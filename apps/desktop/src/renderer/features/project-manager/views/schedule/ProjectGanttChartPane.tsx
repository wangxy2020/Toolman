import type { FC } from 'react'

import { GANTT_ROW_HEIGHT } from './pm-gantt-utils'
import { resolveVarianceTone } from './pm-schedule-gantt-panel-utils'
import type { ScheduleGanttPanelState } from './useProjectScheduleGanttPanel'

export interface ProjectGanttChartPaneProps {
  state: ScheduleGanttPanelState
}

/** Timeline header (year/month/week/day scale rows) + scrollable bar canvas + progress line overlay. */
export const ProjectGanttChartPane: FC<ProjectGanttChartPaneProps> = ({ state }) => {
  const {
    chartPaneRef,
    chartHeaderScrollRef,
    chartScrollRef,
    headerHeight,
    timeline,
    dayHeaders,
    showYearRow,
    showMonthRow,
    showWeekRow,
    showDayRow,
    chartHeight,
    treeRows,
    getGanttRowContext,
    setSelectedId,
    baselineCompareMode,
    baseline,
    progressLine,
    progressLineStatusDateLabel,
    syncScroll,
    syncChartHorizontal,
  } = state

  return (
    <div className="tm-pm-gantt-chart-pane" ref={chartPaneRef}>
      <div
        ref={chartHeaderScrollRef}
        className="tm-pm-gantt-chart-header-scroll"
        style={{ height: headerHeight }}
        onScroll={syncChartHorizontal('header')}>
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
              {dayHeaders.map((header) => (
                <span
                  key={header.key}
                  className="tm-pm-gantt-day-tick"
                  style={{
                    left: `${header.leftPercent}%`,
                    width: `${header.widthPercent}%`,
                  }}
                />
              ))}
              {dayHeaders.map((header) =>
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
      </div>
      <div
        ref={chartScrollRef}
        className="tm-pm-gantt-chart-body"
        onScroll={(event) => {
          syncScroll('chart')(event)
          syncChartHorizontal('body')(event)
        }}>
        <div className="tm-pm-gantt-chart-canvas" style={{ width: '100%', minHeight: chartHeight }}>
          {treeRows.map((row) => {
            const { item } = row
            const {
              bar,
              ghostRange,
              active,
              onCritical,
              kind,
              isMilestoneBar,
              isProjectRoot,
              actualPct,
              shouldPct,
              varianceTone,
              showVarianceSplit,
              title,
            } = getGanttRowContext(row)
            return (
              <div
                key={item.id}
                className={[
                  'tm-pm-gantt-chart-row',
                  active ? 'tm-pm-gantt-chart-row--active' : '',
                  isProjectRoot ? 'tm-pm-gantt-chart-row--project-root' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ height: GANTT_ROW_HEIGHT }}
                onClick={() => setSelectedId(item.id)}>
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
                      showVarianceSplit ? `tm-pm-gantt-bar--${varianceTone}` : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={
                      isMilestoneBar
                        ? { left: `${bar.leftPercent}%`, width: 12, height: 12 }
                        : { left: `${bar.leftPercent}%`, width: `${bar.widthPercent}%` }
                    }
                    title={title}>
                    {showVarianceSplit ? (
                      <>
                        <div className="tm-pm-gantt-bar-actual" style={{ width: `${actualPct}%` }} />
                        <div className="tm-pm-gantt-bar-should" style={{ left: `${shouldPct}%` }} />
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
          {baselineCompareMode === 'progressLine' && baseline ? (
            <div className="tm-pm-gantt-progress-line-layer" style={{ height: chartHeight }} aria-hidden>
              <div
                className="tm-pm-gantt-progress-line-status"
                style={{ left: `${progressLine.statusLeftPercent}%` }}
                title={progressLineStatusDateLabel}
              />
              {progressLine.stubs.length > 0 ? (
                <>
                  <svg
                    className="tm-pm-gantt-progress-line-svg"
                    width="100%"
                    height={chartHeight}
                    viewBox={`0 0 100 ${chartHeight}`}
                    preserveAspectRatio="none">
                    {progressLine.stubs.map((stub) => {
                      const tone = resolveVarianceTone(stub.variancePct)
                      return (
                        <line
                          key={`stub-${stub.itemId}`}
                          className={[
                            'tm-pm-gantt-progress-line-stub',
                            tone === 'ontrack' ? '' : `tm-pm-gantt-progress-line-stub--${tone}`,
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          x1={progressLine.statusLeftPercent}
                          y1={stub.y}
                          x2={stub.tipLeftPercent}
                          y2={stub.y}
                          vectorEffect="non-scaling-stroke"
                        />
                      )
                    })}
                  </svg>
                  {progressLine.stubs.map((stub) => {
                    const tone = resolveVarianceTone(stub.variancePct)
                    return (
                      <span
                        key={stub.itemId}
                        className={[
                          'tm-pm-gantt-progress-line-dot',
                          tone === 'ontrack' ? '' : `tm-pm-gantt-progress-line-dot--${tone}`,
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={{ left: `${stub.tipLeftPercent}%`, top: stub.y }}
                        title={`${stub.variancePct >= 0 ? '+' : ''}${stub.variancePct.toFixed(0)}%`}
                      />
                    )
                  })}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** Gantt schedule helpers — facade re-exporting public API. */

export {
  GANTT_DAY_WIDTH,
  GANTT_PROJECT_ROOT_ID,
  GANTT_ROW_HEIGHT,
  type GanttDayTickStep,
  type GanttScaleBand,
  type GanttScaleUnit,
  type GanttTimelineHeader,
  type PmScheduleBar,
  type ScheduleVarianceSource,
} from './pm-gantt-utils-types'

export {
  buildGanttProjectRootItem,
  isGanttProjectRootId,
  withGanttProjectRootItems,
} from './pm-gantt-utils-root'

export { daysInMonth } from './pm-gantt-utils-calendar'

export {
  applySparseDayLabels,
  buildAdaptiveTimelineHeaders,
} from './pm-gantt-utils-headers'

export {
  buildMonthBands,
  buildScheduleTimeline,
  buildWeekBands,
  buildYearBands,
  pickGanttScale,
  resolveGanttDayTickStep,
  resolveWorkItemScheduleRange,
} from './pm-gantt-utils-timeline'

export {
  barPercentsInRange,
  computeScheduleVarianceDays,
  finishFromStartDuration,
  formatScheduleVarianceDays,
  formatWorkItemDate,
  parseDateInput,
  parseDurationDaysInput,
  shouldCompletePercent,
  workItemDurationDays,
} from './pm-gantt-utils-dates'

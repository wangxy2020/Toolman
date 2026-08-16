import type { PmWorkItem } from '@toolman/shared'

export const DAY_MS = 24 * 60 * 60 * 1000

export const GANTT_ROW_HEIGHT = 36
/** Default day column width when pane size is unknown. */
export const GANTT_DAY_WIDTH = 28

/** Synthetic first-row summary for the selected project (display-only, not persisted). */
export const GANTT_PROJECT_ROOT_ID = '__pm_gantt_project_root__'

export type PmScheduleBar = {
  item: PmWorkItem
  startMs: number
  endMs: number
  leftPercent: number
  widthPercent: number
}

export type GanttScaleUnit = 'day'

/** Days represented by one bottom-row tick cell. */
export type GanttDayTickStep = 1 | 5 | 7

/** One day (or multi-day) tick (bottom row). */
export type GanttTimelineHeader = {
  key: string
  labelBottom: string
  startMs: number
  endMs: number
  leftPercent: number
  widthPercent: number
}

/** Spanned year/month band (OpenProject / MS Project style). */
export type GanttScaleBand = {
  key: string
  label: string
  startMs: number
  endMs: number
  leftPercent: number
  widthPercent: number
}

export type ScheduleVarianceSource = 'finish' | 'progress'

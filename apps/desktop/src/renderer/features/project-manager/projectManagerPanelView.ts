export type ProjectManagerPanelView =
  | 'stats'
  | 'agent'
  | 'files'
  | 'database'
  | 'settings'
  | 'time_entries'
  | 'gantt'
  | 'calendar'

export const PROGRESS_SCHEDULE_VIEWS = ['gantt', 'calendar'] as const satisfies readonly ProjectManagerPanelView[]

export const TIME_ENTRIES_VIEW = 'time_entries' as const satisfies ProjectManagerPanelView

export function isProgressScheduleView(
  view: ProjectManagerPanelView,
): view is (typeof PROGRESS_SCHEDULE_VIEWS)[number] {
  return (PROGRESS_SCHEDULE_VIEWS as readonly string[]).includes(view)
}

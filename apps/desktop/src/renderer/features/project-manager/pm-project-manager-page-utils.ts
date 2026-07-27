/** Pure helpers for ProjectManagerPage orchestration (panel-view bookkeeping). */

import type { ProjectManagerPanelView } from './projectManagerPanelView'
import type { ProjectSidebarMenuTab } from './projectSidebarMenuConfig'

/** Panel views that show the header project selector (project-scoped views). */
export const HEADER_PROJECT_VIEWS = new Set<ProjectManagerPanelView>([
  'agent',
  'files',
  'database',
  'gantt',
  'calendar',
  'resource_table',
  'cost_table',
])

/** 资源/成本管理下无甘特图入口：跳到各自列表；计划管理仍打开甘特图. */
export function resolveScheduleTargetView(
  activeTab: ProjectSidebarMenuTab,
): ProjectManagerPanelView {
  if (activeTab === 'resource_management') return 'resource_table'
  if (activeTab === 'cost_management') return 'cost_table'
  return 'gantt'
}

/** Add a view to the keep-alive mounted set, preserving identity when already present. */
export function addToMountedViews(
  prev: ReadonlySet<ProjectManagerPanelView>,
  view: ProjectManagerPanelView,
): ReadonlySet<ProjectManagerPanelView> {
  if (prev.has(view)) return prev
  const next = new Set(prev)
  next.add(view)
  return next
}

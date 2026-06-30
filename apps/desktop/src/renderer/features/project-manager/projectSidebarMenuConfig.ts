/** Configurable sidebar tabs (excluding fixed Customize entry). */
export const CONFIGURABLE_SIDEBAR_MENU_KEYS = [
  'all_projects',
  'urgent_tasks',
  'key_projects',
  'progress_management',
  'cost_management',
  'resource_management',
  'security_management',
  'quality_management',
  'archive_management',
] as const

export type ConfigurableSidebarMenuKey = (typeof CONFIGURABLE_SIDEBAR_MENU_KEYS)[number]

export type ProjectSidebarMenuTab = ConfigurableSidebarMenuKey | 'customize_menu'

export const PROJECT_SIDEBAR_CUSTOM_TAB: ProjectSidebarMenuTab = 'customize_menu'

/** Phase 1: only cost/schedule dashboards are implemented; hide other tabs by default. */
export const PLACEHOLDER_SIDEBAR_MENU_KEYS: ConfigurableSidebarMenuKey[] = [
  'all_projects',
  'urgent_tasks',
  'key_projects',
  'resource_management',
  'security_management',
  'quality_management',
  'archive_management',
]

export const SIDEBAR_MENU_I18N_KEY: Record<ConfigurableSidebarMenuKey, string> = {
  all_projects: 'projectManagerPage.sidebar.allProjects',
  urgent_tasks: 'projectManagerPage.sidebar.urgentTasks',
  key_projects: 'projectManagerPage.sidebar.keyProjects',
  progress_management: 'projectManagerPage.sidebar.progressManagement',
  cost_management: 'projectManagerPage.sidebar.costManagement',
  resource_management: 'projectManagerPage.sidebar.resourceManagement',
  security_management: 'projectManagerPage.sidebar.securityManagement',
  quality_management: 'projectManagerPage.sidebar.qualityManagement',
  archive_management: 'projectManagerPage.sidebar.archiveManagement',
}

export const PANEL_SUBTITLE_I18N_KEY: Record<ConfigurableSidebarMenuKey, string> = {
  all_projects: 'projectManagerPage.panel.subtitles.allProjects',
  urgent_tasks: 'projectManagerPage.panel.subtitles.urgentTasks',
  key_projects: 'projectManagerPage.panel.subtitles.keyProjects',
  progress_management: 'projectManagerPage.panel.subtitles.progressManagement',
  cost_management: 'projectManagerPage.panel.subtitles.costManagement',
  resource_management: 'projectManagerPage.panel.subtitles.resourceManagement',
  security_management: 'projectManagerPage.panel.subtitles.securityManagement',
  quality_management: 'projectManagerPage.panel.subtitles.qualityManagement',
  archive_management: 'projectManagerPage.panel.subtitles.archiveManagement',
}

export const isConfigurableSidebarMenuKey = (
  tab: ProjectSidebarMenuTab,
): tab is ConfigurableSidebarMenuKey => tab !== PROJECT_SIDEBAR_CUSTOM_TAB

export const DEFAULT_SIDEBAR_MENU_ORDER: ConfigurableSidebarMenuKey[] = [...CONFIGURABLE_SIDEBAR_MENU_KEYS]

export interface ProjectSidebarMenuPreferences {
  order: ConfigurableSidebarMenuKey[]
  hidden: ConfigurableSidebarMenuKey[]
}

const STORAGE_KEY = 'toolman:project-sidebar-menu-preferences'

const isConfigurableKey = (key: string): key is ConfigurableSidebarMenuKey =>
  (CONFIGURABLE_SIDEBAR_MENU_KEYS as readonly string[]).includes(key)

const normalizeOrder = (order: unknown): ConfigurableSidebarMenuKey[] => {
  if (!Array.isArray(order)) {
    return [...DEFAULT_SIDEBAR_MENU_ORDER]
  }
  const seen = new Set<ConfigurableSidebarMenuKey>()
  const normalized: ConfigurableSidebarMenuKey[] = []
  for (const item of order) {
    if (typeof item === 'string' && isConfigurableKey(item) && !seen.has(item)) {
      seen.add(item)
      normalized.push(item)
    }
  }
  for (const key of DEFAULT_SIDEBAR_MENU_ORDER) {
    if (!seen.has(key)) {
      normalized.push(key)
    }
  }
  return normalized
}

const normalizeHidden = (
  hidden: unknown,
  order: ConfigurableSidebarMenuKey[],
): ConfigurableSidebarMenuKey[] => {
  if (!Array.isArray(hidden)) {
    return []
  }
  const hiddenSet = new Set<ConfigurableSidebarMenuKey>()
  for (const item of hidden) {
    if (typeof item === 'string' && isConfigurableKey(item)) {
      hiddenSet.add(item)
    }
  }
  const visibleCount = order.filter((key) => !hiddenSet.has(key)).length
  if (visibleCount === 0) {
    return []
  }
  return [...hiddenSet]
}

export const getDefaultSidebarMenuPreferences = (): ProjectSidebarMenuPreferences => ({
  order: [...DEFAULT_SIDEBAR_MENU_ORDER],
  hidden: [...PLACEHOLDER_SIDEBAR_MENU_KEYS],
})

export const readProjectSidebarMenuPreferences = (): ProjectSidebarMenuPreferences => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return getDefaultSidebarMenuPreferences()
    }
    const parsed = JSON.parse(raw) as Partial<ProjectSidebarMenuPreferences>
    const order = normalizeOrder(parsed.order)
    const hidden = normalizeHidden(parsed.hidden, order)
    return { order, hidden }
  } catch {
    return getDefaultSidebarMenuPreferences()
  }
}

export const writeProjectSidebarMenuPreferences = (
  preferences: ProjectSidebarMenuPreferences,
): void => {
  try {
    const order = normalizeOrder(preferences.order)
    const hidden = normalizeHidden(preferences.hidden, order)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ order, hidden }))
  } catch {
    // quota / private mode
  }
}

export const getVisibleSidebarMenuKeys = (
  preferences: ProjectSidebarMenuPreferences,
): ConfigurableSidebarMenuKey[] => {
  const order = normalizeOrder(preferences.order)
  const hidden = new Set(normalizeHidden(preferences.hidden, order))
  return order.filter((key) => !hidden.has(key))
}

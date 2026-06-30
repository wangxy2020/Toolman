/** 左侧菜单栏可配置的 Tab（不含固定的「自定义」入口） */
export const CONFIGURABLE_SIDEBAR_MENU_KEYS = [
  'all_projects',
  'urgent_tasks',
  'key_projects',
  'progress_management',
  'cost_management',
  'resource_management',
  'security_management',
  'quality_management',
  'archive_management'
] as const

export type ConfigurableSidebarMenuKey = (typeof CONFIGURABLE_SIDEBAR_MENU_KEYS)[number]

export type ProjectSidebarMenuTab = ConfigurableSidebarMenuKey | 'add_project_set'

export const PROJECT_SIDEBAR_CUSTOM_TAB: ProjectSidebarMenuTab = 'add_project_set'

export const isConfigurableSidebarMenuKey = (tab: ProjectSidebarMenuTab): tab is ConfigurableSidebarMenuKey =>
  tab !== PROJECT_SIDEBAR_CUSTOM_TAB

export const PROJECT_SIDEBAR_MENU_LABELS: Record<ConfigurableSidebarMenuKey, string> = {
  all_projects: '工作台',
  urgent_tasks: '待办',
  key_projects: '综合管理',
  progress_management: '计划管理',
  cost_management: '成本管理',
  resource_management: '资源管理',
  security_management: '安全质量',
  quality_management: '测量试验',
  archive_management: '档案管理'
}

export const DEFAULT_SIDEBAR_MENU_ORDER: ConfigurableSidebarMenuKey[] = [...CONFIGURABLE_SIDEBAR_MENU_KEYS]

export interface ProjectSidebarMenuPreferences {
  order: ConfigurableSidebarMenuKey[]
  hidden: ConfigurableSidebarMenuKey[]
}

const STORAGE_KEY = 'cherry-studio:project-sidebar-menu-preferences'

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

const normalizeHidden = (hidden: unknown, order: ConfigurableSidebarMenuKey[]): ConfigurableSidebarMenuKey[] => {
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
  hidden: []
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

export const writeProjectSidebarMenuPreferences = (preferences: ProjectSidebarMenuPreferences): void => {
  try {
    const order = normalizeOrder(preferences.order)
    const hidden = normalizeHidden(preferences.hidden, order)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ order, hidden }))
  } catch {
    // quota / private mode
  }
}

export const getVisibleSidebarMenuKeys = (preferences: ProjectSidebarMenuPreferences): ConfigurableSidebarMenuKey[] => {
  const order = normalizeOrder(preferences.order)
  const hidden = new Set(normalizeHidden(preferences.hidden, order))
  return order.filter((key) => !hidden.has(key))
}

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  DEFAULT_PROJECT_SIDEBAR_TAB,
  getDefaultProjectSidebarPreferences,
  getVisibleProjectMenuKeys,
  normalizeProjectSidebarPreferences,
  PROJECT_SIDEBAR_CUSTOM_TAB,
  type ProjectSidebarMenuKey,
  type ProjectSidebarPreferences,
  type ProjectSidebarTab,
} from './projectSidebar'

const STORAGE_KEY = 'toolman.mobile.project-sidebar-menu:v1'

function readStoredPreferences(): ProjectSidebarPreferences {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return getDefaultProjectSidebarPreferences()
    return normalizeProjectSidebarPreferences(
      JSON.parse(raw) as Partial<ProjectSidebarPreferences>,
    )
  } catch {
    return getDefaultProjectSidebarPreferences()
  }
}

function writeStoredPreferences(preferences: ProjectSidebarPreferences) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // quota / native without localStorage
  }
}

function withMenuVisible(
  prev: ProjectSidebarPreferences,
  key: ProjectSidebarMenuKey,
  visible: boolean,
): ProjectSidebarPreferences {
  const hidden = new Set(prev.hidden)
  if (visible) hidden.delete(key)
  else hidden.add(key)
  return normalizeProjectSidebarPreferences({
    order: prev.order,
    hidden: [...hidden],
  })
}

function withMovedMenu(
  prev: ProjectSidebarPreferences,
  key: ProjectSidebarMenuKey,
  direction: 'up' | 'down',
): ProjectSidebarPreferences {
  const order = [...prev.order]
  const index = order.indexOf(key)
  if (index < 0) return prev
  const next = direction === 'up' ? index - 1 : index + 1
  if (next < 0 || next >= order.length) return prev
  const swap = order[next]!
  order[next] = key
  order[index] = swap
  return { ...prev, order }
}

export type ProjectUiState = {
  activeTab: ProjectSidebarTab
  setActiveTab: (tab: ProjectSidebarTab) => void
  preferences: ProjectSidebarPreferences
  visibleKeys: ProjectSidebarMenuKey[]
  setMenuVisible: (key: ProjectSidebarMenuKey, visible: boolean) => void
  moveMenu: (key: ProjectSidebarMenuKey, direction: 'up' | 'down') => void
  resetMenus: () => void
}

const ProjectUiContext = createContext<ProjectUiState | null>(null)

export function useProjectUi(): ProjectUiState {
  const ctx = useContext(ProjectUiContext)
  if (!ctx) throw new Error('useProjectUi requires ProjectUiProvider')
  return ctx
}

export function useOptionalProjectUi(): ProjectUiState | null {
  return useContext(ProjectUiContext)
}

export function ProjectUiProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<ProjectSidebarPreferences>(
    getDefaultProjectSidebarPreferences,
  )
  const [activeTab, setActiveTab] = useState<ProjectSidebarTab>(DEFAULT_PROJECT_SIDEBAR_TAB)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setPreferences(readStoredPreferences())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    writeStoredPreferences(preferences)
  }, [hydrated, preferences])

  const visibleKeys = useMemo(() => getVisibleProjectMenuKeys(preferences), [preferences])

  useEffect(() => {
    if (activeTab === PROJECT_SIDEBAR_CUSTOM_TAB) return
    const menuKey: ProjectSidebarMenuKey = activeTab
    if (!visibleKeys.includes(menuKey)) {
      setActiveTab(visibleKeys[0] ?? PROJECT_SIDEBAR_CUSTOM_TAB)
    }
  }, [activeTab, visibleKeys])

  const value = useMemo<ProjectUiState>(
    () => ({
      activeTab,
      setActiveTab,
      preferences,
      visibleKeys,
      setMenuVisible: (key, visible) => {
        setPreferences((prev) => withMenuVisible(prev, key, visible))
      },
      moveMenu: (key, direction) => {
        setPreferences((prev) => withMovedMenu(prev, key, direction))
      },
      resetMenus: () => setPreferences(getDefaultProjectSidebarPreferences()),
    }),
    [activeTab, preferences, visibleKeys],
  )

  return createElement(ProjectUiContext.Provider, { value }, children)
}

export function projectCustomizeVisibleCount(preferences: ProjectSidebarPreferences): number {
  const hidden = new Set(preferences.hidden)
  return preferences.order.filter((key) => !hidden.has(key)).length
}

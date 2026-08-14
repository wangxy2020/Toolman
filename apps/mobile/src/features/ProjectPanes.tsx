import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useMobileApp } from '../state/MobileAppContext'
import { colors } from '../theme'
import {
  DEFAULT_PROJECT_SIDEBAR_TAB,
  getDefaultProjectSidebarPreferences,
  getProjectMenu,
  getVisibleProjectMenuKeys,
  normalizeProjectSidebarPreferences,
  PROJECT_SIDEBAR_CUSTOM_TAB,
  type ProjectSidebarMenuKey,
  type ProjectSidebarPreferences,
  type ProjectSidebarTab,
} from './projectSidebar'
import { buildProjectStats } from './projectStats'
import { ProjectStatsBody } from './ProjectStatsUi'
import { useRegisterModulePanelStatus } from './modulePageStatus'
import {
  SidebarAddButton,
  SidebarItem,
  SidebarList,
  SidebarShell,
} from './sidebarUi'

/** Local sidebar visibility/order; not synced. */
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

type ProjectUiState = {
  activeTab: ProjectSidebarTab
  setActiveTab: (tab: ProjectSidebarTab) => void
  preferences: ProjectSidebarPreferences
  visibleKeys: ProjectSidebarMenuKey[]
  setMenuVisible: (key: ProjectSidebarMenuKey, visible: boolean) => void
  moveMenu: (key: ProjectSidebarMenuKey, direction: 'up' | 'down') => void
  resetMenus: () => void
}

const ProjectUiContext = createContext<ProjectUiState | null>(null)

function useProjectUi(): ProjectUiState {
  const ctx = useContext(ProjectUiContext)
  if (!ctx) throw new Error('useProjectUi requires ProjectUiProvider')
  return ctx
}

export function useOptionalProjectUi(): ProjectUiState | null {
  return useContext(ProjectUiContext)
}

export { getProjectMenu } from './projectSidebar'

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
        setPreferences((prev) => {
          const hidden = new Set(prev.hidden)
          if (visible) hidden.delete(key)
          else hidden.add(key)
          return normalizeProjectSidebarPreferences({
            order: prev.order,
            hidden: [...hidden],
          })
        })
      },
      moveMenu: (key, direction) => {
        setPreferences((prev) => {
          const order = [...prev.order]
          const index = order.indexOf(key)
          if (index < 0) return prev
          const next = direction === 'up' ? index - 1 : index + 1
          if (next < 0 || next >= order.length) return prev
          const swap = order[next]!
          order[next] = key
          order[index] = swap
          return { ...prev, order }
        })
      },
      resetMenus: () => setPreferences(getDefaultProjectSidebarPreferences()),
    }),
    [activeTab, preferences, visibleKeys],
  )

  return <ProjectUiContext.Provider value={value}>{children}</ProjectUiContext.Provider>
}

export function ProjectLeftPane() {
  const { setLeftOpen } = useMobileApp()
  const { activeTab, setActiveTab, preferences, visibleKeys } = useProjectUi()
  const menus = preferences.order
    .filter((key) => visibleKeys.includes(key))
    .map((key) => getProjectMenu(key))

  return (
    <SidebarShell>
      <SidebarAddButton
        label="自定义"
        onPress={() => {
          setActiveTab(PROJECT_SIDEBAR_CUSTOM_TAB)
          setLeftOpen(false)
        }}
      />
      <SidebarList>
        {menus.map((menu) => (
          <SidebarItem
            key={menu.id}
            label={menu.label}
            active={activeTab === menu.id}
            onPress={() => {
              setActiveTab(menu.id)
              setLeftOpen(false)
            }}
          />
        ))}
      </SidebarList>
    </SidebarShell>
  )
}

function ProjectPanelHeader(props: { title: string; subtitle: string }) {
  return (
    <View style={styles.panelHeader}>
      <Text style={styles.panelTitle}>{props.title}</Text>
      <Text style={styles.panelSubtitle}>{props.subtitle}</Text>
    </View>
  )
}

function ProjectDomainPanel({ menuKey }: { menuKey: ProjectSidebarMenuKey }) {
  const menu = getProjectMenu(menuKey)
  const stats = useMemo(() => buildProjectStats(menuKey), [menuKey])
  useRegisterModulePanelStatus('project-page', {
    tone: 'muted',
    message: '就绪',
    meta: `共 ${stats.records.length} 个项目`,
  })
  return (
    <View style={styles.panelRoot}>
      <ProjectPanelHeader title={menu.title} subtitle={menu.subtitle} />
      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={styles.panelScrollContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        // @ts-expect-error react-native-web className
        className="tm-project-page-scroll"
      >
        <ProjectStatsBody stats={stats} />
      </ScrollView>
    </View>
  )
}

function ProjectCustomizePanel() {
  const { preferences, setMenuVisible, moveMenu, resetMenus } = useProjectUi()
  const hidden = new Set(preferences.hidden)
  const visibleCount = preferences.order.filter((key) => !hidden.has(key)).length
  useRegisterModulePanelStatus('project-page', {
    tone: 'muted',
    message: '就绪',
    meta: `${visibleCount}/${preferences.order.length} 项显示`,
  })

  return (
    <View style={styles.panelRoot}>
      <ProjectPanelHeader
        title="自定义"
        subtitle="配置项目管理左侧菜单的显示与顺序"
      />
      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={styles.panelScrollContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        // @ts-expect-error react-native-web className
        className="tm-project-page-scroll"
      >
        <Text style={styles.sectionTitle}>
          菜单项（{visibleCount}/{preferences.order.length} 项显示）
        </Text>
        {preferences.order.map((key, index) => {
          const menu = getProjectMenu(key)
          const visible = !hidden.has(key)
          return (
            <View key={key} style={styles.customizeRow}>
              <Text style={styles.customizeLabel} numberOfLines={1}>
                {menu.label}
              </Text>
              <View style={styles.customizeActions}>
                <Pressable
                  onPress={() => setMenuVisible(key, !visible)}
                  style={[styles.chip, visible ? styles.chipOn : null]}
                >
                  <Text style={[styles.chipText, visible ? styles.chipTextOn : null]}>
                    {visible ? '显示' : '隐藏'}
                  </Text>
                </Pressable>
                <Pressable
                  disabled={index === 0}
                  onPress={() => moveMenu(key, 'up')}
                  style={[styles.chip, index === 0 ? styles.chipDisabled : null]}
                >
                  <Text style={styles.chipText}>上移</Text>
                </Pressable>
                <Pressable
                  disabled={index === preferences.order.length - 1}
                  onPress={() => moveMenu(key, 'down')}
                  style={[
                    styles.chip,
                    index === preferences.order.length - 1 ? styles.chipDisabled : null,
                  ]}
                >
                  <Text style={styles.chipText}>下移</Text>
                </Pressable>
              </View>
            </View>
          )
        })}
        <Pressable onPress={resetMenus} style={styles.resetBtn}>
          <Text style={styles.resetBtnText}>恢复默认</Text>
        </Pressable>
        <Text style={styles.emptyMeta}>
          隐藏后的菜单不会在左侧显示。排序仅影响「自定义」下方的菜单项，设置保存在本机。
        </Text>
      </ScrollView>
    </View>
  )
}

export function ProjectRightPane() {
  const { activeTab } = useProjectUi()
  if (activeTab === PROJECT_SIDEBAR_CUSTOM_TAB) {
    return <ProjectCustomizePanel />
  }
  const menuKey: ProjectSidebarMenuKey = activeTab
  return <ProjectDomainPanel menuKey={menuKey} />
}

const styles = StyleSheet.create({
  panelRoot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  panelHeader: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 10,
    gap: 4,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.15,
    color: colors.text,
  },
  panelSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  panelScroll: {
    flex: 1,
  },
  panelScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 10,
  },
  emptyMeta: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  customizeRow: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  customizeLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  customizeActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.hover,
  },
  chipOn: {
    backgroundColor: colors.accentSoft,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  chipTextOn: {
    color: colors.accent,
    fontWeight: '600',
  },
  resetBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.hover,
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
})

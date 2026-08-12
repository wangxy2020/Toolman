import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { isCommunityModerator } from '../auth/localAuth'
import { useMobileApp } from '../state/MobileAppContext'
import { colors, shellStyles } from '../theme'
import {
  fetchCommunityMessages,
  fetchCommunityNews,
  fetchCommunityResources,
  fetchCommunityTasks,
  probeCommunityHub,
  type CommunityListItem,
} from './communityHubClient'
import {
  COMMUNITY_SIDEBAR_SECTIONS,
  getCommunitySection,
  MODERATION_CATEGORIES,
  MODERATION_SUBTABS,
  USER_CENTER_SECTIONS,
  type CommunitySidebarSection,
  type CommunitySortField,
  type ModerationCategoryId,
  type UserCenterSectionId,
} from './communitySidebar'
import {
  CommunityCategoryChips,
  CommunityEmptyState,
  CommunityListCard,
  CommunityOfflineBanner,
  CommunityPanelHeader,
  CommunityPublishButton,
  CommunityRefreshButton,
  CommunitySecondaryButton,
  CommunitySortToolbar,
  CommunityStatGrid,
  sortCommunityItems,
} from './communityPanelUi'
import {
  SidebarAddButton,
  SidebarItem,
  SidebarList,
  SidebarShell,
} from './sidebarUi'

type CommunityUiState = {
  activeSection: CommunitySidebarSection
  setActiveSection: (section: CommunitySidebarSection) => void
  canAccessManagement: boolean
}

const CommunityUiContext = createContext<CommunityUiState | null>(null)

function useCommunityUi(): CommunityUiState {
  const ctx = useContext(CommunityUiContext)
  if (!ctx) throw new Error('useCommunityUi requires CommunityUiProvider')
  return ctx
}

export function CommunityUiProvider({ children }: { children: ReactNode }) {
  const { auth } = useMobileApp()
  const [activeSection, setActiveSection] = useState<CommunitySidebarSection>('news')
  const canAccessManagement = Boolean(auth) && isCommunityModerator(auth?.communityRole)

  const value = useMemo(() => {
    const section =
      activeSection === 'management' && !canAccessManagement ? 'news' : activeSection
    return {
      activeSection: section,
      canAccessManagement,
      setActiveSection: (next: CommunitySidebarSection) => {
        if (next === 'management' && !canAccessManagement) {
          setActiveSection('news')
          return
        }
        setActiveSection(next)
      },
    }
  }, [activeSection, canAccessManagement])

  return <CommunityUiContext.Provider value={value}>{children}</CommunityUiContext.Provider>
}

export function CommunityLeftPane() {
  const { setLeftOpen } = useMobileApp()
  const { activeSection, setActiveSection, canAccessManagement } = useCommunityUi()
  const sections = COMMUNITY_SIDEBAR_SECTIONS.filter(
    (section) => section.id !== 'management' || canAccessManagement,
  )

  return (
    <SidebarShell>
      <SidebarAddButton
        label="探索社区"
        disabled
        onPress={() => {
          /* Desktop: coming soon */
        }}
      />
      <SidebarList>
        {sections.map((section) => (
          <SidebarItem
            key={section.id}
            label={section.label}
            active={activeSection === section.id}
            onPress={() => {
              setActiveSection(section.id)
              setLeftOpen(false)
            }}
          />
        ))}
      </SidebarList>
    </SidebarShell>
  )
}

function useHubListLoader(
  sectionId: CommunitySidebarSection,
): {
  items: CommunityListItem[]
  loading: boolean
  offline: boolean
  error: string | null
  reload: () => void
} {
  const { auth, modulePrefs } = useMobileApp()
  const hubBaseUrl = modulePrefs.community.hubBaseUrl.trim()
  const section = getCommunitySection(sectionId)
  const [items, setItems] = useState<CommunityListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(!hubBaseUrl)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!hubBaseUrl) {
        setItems([])
        setOffline(true)
        setError(null)
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const online = await probeCommunityHub(hubBaseUrl)
        if (cancelled) return
        setOffline(!online)
        const userId = auth?.identityId ?? null
        let next: CommunityListItem[] = []
        if (section.listKind === 'news') {
          next = await fetchCommunityNews(hubBaseUrl, userId)
        } else if (section.listKind === 'messages') {
          next = await fetchCommunityMessages(hubBaseUrl, userId)
        } else if (section.listKind === 'market' && section.resourceType) {
          next = await fetchCommunityResources(hubBaseUrl, section.resourceType, userId)
        } else if (section.listKind === 'tasks') {
          next = await fetchCommunityTasks(hubBaseUrl, userId)
        }
        if (!cancelled) setItems(next)
      } catch (err) {
        if (!cancelled) {
          setItems([])
          setOffline(true)
          setError(err instanceof Error ? err.message : '加载失败')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [auth?.identityId, hubBaseUrl, section.listKind, section.resourceType, tick])

  return {
    items,
    loading,
    offline,
    error,
    reload: () => setTick((n) => n + 1),
  }
}

function comingSoon(label: string) {
  const message = `${label}将在后续版本开放；完整发布流程请使用桌面端。`
  if (Platform.OS === 'web' && typeof globalThis.alert === 'function') {
    globalThis.alert(message)
    return
  }
  Alert.alert(label, message)
}

function CommunityListSectionPanel({
  sectionId,
}: {
  sectionId: Exclude<CommunitySidebarSection, 'mine' | 'management'>
}) {
  const section = getCommunitySection(sectionId)
  const { modulePrefs } = useMobileApp()
  const { items, loading, offline, error, reload } = useHubListLoader(sectionId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sortField, setSortField] = useState<CommunitySortField>('createdAt')
  const [sortAscending, setSortAscending] = useState(false)

  const sorted = useMemo(
    () => sortCommunityItems(items, sortField, sortAscending),
    [items, sortAscending, sortField],
  )

  const onSortFieldChange = useCallback((field: CommunitySortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortAscending((asc) => !asc)
        return prev
      }
      setSortAscending(field === 'name')
      return field
    })
  }, [])

  const guestBlocked = modulePrefs.community.guestReadOnly
  const publishDisabled = offline || guestBlocked

  return (
    <View style={styles.panelRoot}>
      <CommunityPanelHeader
        title={section.title}
        subtitle={section.subtitle}
        actions={
          <>
            {section.showPublish !== false && section.publishLabel ? (
              <CommunityPublishButton
                label={section.publishLabel}
                disabled={publishDisabled}
                onPress={() => comingSoon(section.publishLabel!)}
              />
            ) : null}
            {section.showRss ? (
              <CommunitySecondaryButton
                label="RSS 源"
                disabled={offline}
                onPress={() => comingSoon('RSS 源')}
              />
            ) : null}
            <CommunityRefreshButton loading={loading} onPress={reload} />
          </>
        }
      />
      <CommunityOfflineBanner
        visible={offline}
        message={
          error
            ? error
            : modulePrefs.community.hubBaseUrl.trim()
              ? undefined
              : '未配置 Hub Base URL。请在设置 → 社区填写地址后刷新。'
        }
      />
      {section.sortable ? (
        <CommunitySortToolbar
          sortField={sortField}
          sortAscending={sortAscending}
          onSortFieldChange={onSortFieldChange}
        />
      ) : null}
      <ScrollView style={styles.panelScroll} contentContainerStyle={styles.panelScrollContent}>
        {loading && sorted.length === 0 ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.loadingText}>加载中…</Text>
          </View>
        ) : sorted.length === 0 ? (
          <CommunityEmptyState hint={section.emptyHint} />
        ) : (
          sorted.map((item) => (
            <CommunityListCard
              key={item.id}
              item={item}
              selected={selectedId === item.id}
              showInstall={section.showInstall}
              onPress={() => setSelectedId(item.id)}
            />
          ))
        )}
      </ScrollView>
    </View>
  )
}

function MinePanel() {
  const section = getCommunitySection('mine')
  const { auth } = useMobileApp()
  const [tab, setTab] = useState<UserCenterSectionId>('publishes')
  const stats = USER_CENTER_SECTIONS.map((item) => ({
    id: item.id,
    label: item.label,
    count: 0,
  }))
  const active = USER_CENTER_SECTIONS.find((item) => item.id === tab)!

  return (
    <View style={styles.panelRoot}>
      <CommunityPanelHeader
        title={section.title}
        subtitle={section.subtitle}
        actions={<CommunityRefreshButton loading={false} onPress={() => undefined} />}
      />
      {auth ? (
        <View style={styles.identityRow}>
          <Text style={styles.identityBadge}>{auth.displayName || '用户'}</Text>
          <Text style={styles.identityBadge}>已登录</Text>
        </View>
      ) : null}
      <CommunityStatGrid items={stats} activeId={tab} onSelect={setTab} />
      <View style={styles.feedMeta}>
        <Text style={styles.feedMetaText}>共 0 条</Text>
        <Text style={styles.feedMetaText}>按最新排序</Text>
      </View>
      <ScrollView style={styles.panelScroll} contentContainerStyle={styles.panelScrollContent}>
        <CommunityEmptyState
          hint={
            auth
              ? `「${active.label}」暂无内容`
              : '请先登录或注册后查看个人发布、安装与收藏'
          }
        />
      </ScrollView>
    </View>
  )
}

function ManagementPanel() {
  const section = getCommunitySection('management')
  const { canAccessManagement } = useCommunityUi()
  const [category, setCategory] = useState<ModerationCategoryId>('resources')
  const subTabs = MODERATION_SUBTABS[category]
  const [subTab, setSubTab] = useState(subTabs[0]!.id)

  useEffect(() => {
    setSubTab(MODERATION_SUBTABS[category][0]!.id)
  }, [category])

  const statItems = subTabs.map((item) => ({
    id: item.id,
    label: item.label,
    count: 0,
  }))
  const activeSub = subTabs.find((item) => item.id === subTab) ?? subTabs[0]!

  if (!canAccessManagement) {
    return (
      <View style={styles.panelRoot}>
        <CommunityPanelHeader title={section.title} subtitle={section.subtitle} />
        <ScrollView contentContainerStyle={styles.panelScrollContent}>
          <CommunityEmptyState hint="需要管理权限" />
        </ScrollView>
      </View>
    )
  }

  return (
    <View style={styles.panelRoot}>
      <CommunityPanelHeader
        title={section.title}
        subtitle={section.subtitle}
        actions={
          <CommunityRefreshButton
            loading={false}
            onPress={() => comingSoon('立即扫描')}
          />
        }
      />
      <View style={styles.identityRow}>
        <Text style={styles.identityBadge}>管理控制台</Text>
      </View>
      <CommunityCategoryChips
        items={MODERATION_CATEGORIES}
        activeId={category}
        onSelect={setCategory}
      />
      <CommunityStatGrid
        items={statItems}
        activeId={subTab}
        onSelect={setSubTab}
      />
      <View style={styles.feedMeta}>
        <Text style={styles.feedMetaText}>共 0 条</Text>
        <Text style={styles.feedMetaText}>最近扫描：—</Text>
      </View>
      <ScrollView style={styles.panelScroll} contentContainerStyle={styles.panelScrollContent}>
        <CommunityEmptyState
          hint={`「${activeSub.label}」暂无条目`}
          meta="完整审核与处置流程与桌面端一致，数据对接后将显示队列。"
        />
      </ScrollView>
    </View>
  )
}

export function CommunityRightPane() {
  const { activeSection } = useCommunityUi()

  switch (activeSection) {
    case 'mine':
      return <MinePanel />
    case 'management':
      return <ManagementPanel />
    case 'news':
    case 'messages':
    case 'knowledge':
    case 'mcp':
    case 'skills':
    case 'workflow':
    case 'tasks':
      return <CommunityListSectionPanel sectionId={activeSection} />
    default:
      return <Text style={shellStyles.emptyHint}>选择社区分区</Text>
  }
}

const styles = StyleSheet.create({
  panelRoot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  panelScroll: {
    flex: 1,
  },
  panelScrollContent: {
    paddingBottom: 28,
    paddingTop: 4,
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  identityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  identityBadge: {
    fontSize: 12,
    color: colors.textSecondary,
    backgroundColor: colors.hover,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  feedMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  feedMetaText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
})

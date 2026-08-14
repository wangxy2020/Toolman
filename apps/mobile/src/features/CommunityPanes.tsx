import {
  createContext,
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
import { resolveCommunityHubBaseUrl, pickReachableCommunityHubBaseUrl } from '../settings/communityHubUrl'
import { listDesktopDevHostnames, shouldProbeLoopbackSyncHub } from '../sync/desktopDevHost'
import {
  fetchCommunityMessages,
  fetchCommunityNews,
  fetchCommunityResources,
  fetchCommunityTasks,
  probeCommunityHub,
  type CommunityListItem,
  type CommunityResourceType,
} from './communityHubClient'
import {
  CommunityMessagePublishModal,
  CommunityNewsSourcesModal,
  CommunityResourcePublishModal,
  CommunityTaskPublishModal,
} from './CommunityPublishModals'
import {
  COMMUNITY_SIDEBAR_SECTIONS,
  getCommunitySection,
  MODERATION_CATEGORIES,
  MODERATION_SUBTABS,
  USER_CENTER_SECTIONS,
  type CommunitySidebarSection,
  type ModerationCategoryId,
  type UserCenterSectionId,
} from './communitySidebar'
import {
  CommunityCategoryChips,
  CommunityEmptyState,
  CommunityListCard,
  CommunityPanelHeader,
  CommunityPublishButton,
  CommunityRefreshButton,
  CommunitySecondaryButton,
  CommunityStatGrid,
  sortCommunityItems,
} from './communityPanelUi'
import {
  SidebarAddButton,
  SidebarItem,
  SidebarList,
  SidebarShell,
} from './sidebarUi'
import { useRegisterModulePanelStatus } from './modulePageStatus'

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
        onPress={() => undefined}
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
  hubBaseUrl: string
  triedHubUrls: string[]
  reload: () => void
} {
  const { auth, modulePrefs } = useMobileApp()
  const configuredHub = modulePrefs.community.hubBaseUrl
  const section = getCommunitySection(sectionId)
  const [items, setItems] = useState<CommunityListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hubBaseUrl, setHubBaseUrl] = useState(() => resolveCommunityHubBaseUrl(configuredHub))
  const [triedHubUrls, setTriedHubUrls] = useState<string[]>([])
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const packagerHostnames = listDesktopDevHostnames()
        const picked = await pickReachableCommunityHubBaseUrl(configuredHub, probeCommunityHub, {
          packagerHostnames,
          includeLoopback: shouldProbeLoopbackSyncHub(packagerHostnames),
        })
        if (cancelled) return
        setHubBaseUrl(picked.url)
        setTriedHubUrls(picked.tried)
        setOffline(!picked.online)
        if (!picked.online) {
          setItems([])
          return
        }
        const userId = auth?.identityId ?? null
        let next: CommunityListItem[] = []
        if (section.listKind === 'news') {
          next = await fetchCommunityNews(picked.url, userId)
        } else if (section.listKind === 'messages') {
          next = await fetchCommunityMessages(picked.url, userId)
        } else if (section.listKind === 'market' && section.resourceType) {
          next = await fetchCommunityResources(picked.url, section.resourceType, userId)
        } else if (section.listKind === 'tasks') {
          next = await fetchCommunityTasks(picked.url, userId)
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
  }, [auth?.identityId, configuredHub, section.listKind, section.resourceType, tick])

  return {
    items,
    loading,
    offline,
    error,
    hubBaseUrl,
    triedHubUrls,
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

function notifyLoginRequired() {
  const message = '请先登录或注册后再发布。'
  if (Platform.OS === 'web' && typeof globalThis.alert === 'function') {
    globalThis.alert(message)
    return
  }
  Alert.alert('需要登录', message)
}

function CommunityListSectionPanel({
  sectionId,
}: {
  sectionId: Exclude<CommunitySidebarSection, 'mine' | 'management'>
}) {
  const section = getCommunitySection(sectionId)
  const { auth, modulePrefs } = useMobileApp()
  const { items, loading, offline, error, reload, hubBaseUrl, triedHubUrls } = useHubListLoader(sectionId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)
  const [rssOpen, setRssOpen] = useState(false)

  const sorted = useMemo(() => sortCommunityItems(items), [items])
  const userId = auth?.identityId ?? null
  const guestBlocked = modulePrefs.community.guestReadOnly && !auth

  const pageStatus = useMemo(() => {
    if (error) return { tone: 'error' as const, message: error }
    if (offline) {
      return {
        tone: 'warning' as const,
        message: '无法连接社区 Hub。请确认桌面端已启动，或在社区设置填写电脑局域网地址。',
        meta: triedHubUrls.join(' · ') || hubBaseUrl,
      }
    }
    if (loading) return { tone: 'info' as const, message: '加载中…' }
    return { tone: 'muted' as const, message: '就绪', meta: `共 ${sorted.length} 条` }
  }, [error, hubBaseUrl, loading, offline, sorted.length, triedHubUrls])

  useRegisterModulePanelStatus('community-page', pageStatus)

  const openPublish = () => {
    if (offline) return
    if (guestBlocked) {
      notifyLoginRequired()
      return
    }
    setPublishOpen(true)
  }

  const openRss = () => {
    if (offline) return
    if (guestBlocked) {
      notifyLoginRequired()
      return
    }
    setRssOpen(true)
  }

  const resourceType = section.resourceType as CommunityResourceType | undefined

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
                disabled={offline}
                onPress={openPublish}
              />
            ) : null}
            {section.showRss ? (
              <CommunitySecondaryButton
                label="RSS 源"
                disabled={offline}
                onPress={openRss}
              />
            ) : null}
            <CommunityRefreshButton loading={loading} onPress={reload} />
          </>
        }
      />
      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={styles.panelScrollContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
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
      {section.listKind === 'messages' ? (
        <CommunityMessagePublishModal
          visible={publishOpen}
          hubBaseUrl={hubBaseUrl}
          userId={userId}
          onClose={() => setPublishOpen(false)}
          onPublished={reload}
        />
      ) : null}
      {section.listKind === 'tasks' ? (
        <CommunityTaskPublishModal
          visible={publishOpen}
          hubBaseUrl={hubBaseUrl}
          userId={userId}
          onClose={() => setPublishOpen(false)}
          onPublished={reload}
        />
      ) : null}
      {section.listKind === 'market' && resourceType ? (
        <CommunityResourcePublishModal
          visible={publishOpen}
          hubBaseUrl={hubBaseUrl}
          userId={userId}
          resourceType={resourceType}
          onClose={() => setPublishOpen(false)}
          onPublished={reload}
        />
      ) : null}
      {section.showRss ? (
        <CommunityNewsSourcesModal
          visible={rssOpen}
          hubBaseUrl={hubBaseUrl}
          userId={userId}
          onClose={() => setRssOpen(false)}
          onPublished={reload}
        />
      ) : null}
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

  useRegisterModulePanelStatus(
    'community-page',
    auth
      ? { tone: 'muted', message: '就绪', meta: `共 0 条` }
      : { tone: 'warning', message: '请先登录或注册后查看个人发布、安装与收藏' },
  )

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
      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={styles.panelScrollContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
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

  useRegisterModulePanelStatus(
    'community-page',
    canAccessManagement
      ? { tone: 'muted', message: '就绪', meta: `共 0 条` }
      : { tone: 'error', message: '需要管理权限' },
  )

  if (!canAccessManagement) {
    return (
      <View style={styles.panelRoot}>
        <CommunityPanelHeader title={section.title} subtitle={section.subtitle} />
        <ScrollView
          contentContainerStyle={styles.panelScrollContent}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        >
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
      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={styles.panelScrollContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
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
    paddingHorizontal: 20,
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
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  feedMetaText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
})

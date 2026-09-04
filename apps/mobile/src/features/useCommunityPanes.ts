import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { isCommunityModerator } from '../auth/localAuth'
import { useMobileApp } from '../state/MobileAppContext'
import { resolveCommunityHubBaseUrl, pickReachableCommunityHubBaseUrl } from '../settings/communityHubUrl'
import { isHostedWebPage, communityHubProbeFlags } from '../sync/desktopDevHost'
import {
  isLocalNetworkPrimed,
  primeLocalNetworkAccess,
  whenLocalNetworkAccessGranted,
} from '../sync/localNetworkFetch'
import {
  fetchCommunityMessages,
  fetchCommunityResources,
  fetchCommunityTasks,
  loadCommunityNewsWithRefresh,
  loadDirectCommunityNews,
  probeCommunityHub,
  type CommunityListItem,
  type CommunityResourceType,
} from './communityHubClient'
import { useCommunityListInteractions } from './useCommunityListInteractions'
import {
  communityListPageStatus,
  communityManagementPageStatus,
  communityMinePageStatus,
  communityModerationStats,
  communityUserCenterStats,
  notifyDesktopHubRequired,
  notifyLoginRequired,
} from './communityPaneUtils'
import { sortCommunityItems } from './communityPanelUi'
import { writeCachedDirectNews, readCachedDirectNews } from './communityNewsDirect'
import {
  getCommunitySection,
  MODERATION_SUBTABS,
  USER_CENTER_SECTIONS,
  type CommunitySidebarSection,
  type ModerationCategoryId,
  type UserCenterSectionId,
} from './communitySidebar'
import { useRegisterModulePanelStatus } from './modulePageStatus'

type CommunityUiState = {
  activeSection: CommunitySidebarSection
  setActiveSection: (section: CommunitySidebarSection) => void
  canAccessManagement: boolean
}

const CommunityUiContext = createContext<CommunityUiState | null>(null)

export function useCommunityUi(): CommunityUiState {
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
        if (isHostedWebPage()) void primeLocalNetworkAccess()
        setActiveSection(next)
      },
    }
  }, [activeSection, canAccessManagement])

  return createElement(CommunityUiContext.Provider, { value }, children)
}

export function useCommunityHubList(sectionId: CommunitySidebarSection): {
  items: CommunityListItem[]
  loading: boolean
  offline: boolean
  error: string | null
  hubBaseUrl: string
  triedHubUrls: string[]
  reload: () => void
  patchItem: (id: string, patch: Partial<CommunityListItem>) => void
} {
  const { auth, modulePrefs } = useMobileApp()
  const configuredHub = modulePrefs.community.hubBaseUrl
  const section = getCommunitySection(sectionId)
  const cachedNews = section.listKind === 'news' ? readCachedDirectNews() : null
  const [items, setItems] = useState<CommunityListItem[]>(() => cachedNews ?? [])
  const [loading, setLoading] = useState(() => !(cachedNews && cachedNews.length > 0))
  const [offline, setOffline] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hubBaseUrl, setHubBaseUrl] = useState(() => resolveCommunityHubBaseUrl(configuredHub))
  const [triedHubUrls, setTriedHubUrls] = useState<string[]>([])
  const [tick, setTick] = useState(0)
  const forceReloadRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    let gen = 0
    const run = async (includeLoopback: boolean) => {
      const my = ++gen
      const force = forceReloadRef.current
      if (force) forceReloadRef.current = false
      const hasNewsOnScreen =
        section.listKind === 'news' && (readCachedDirectNews()?.length ?? 0) > 0
      const showBlockingLoad = !(hasNewsOnScreen && !force)
      if (showBlockingLoad) setLoading(true)
      setError(null)
      try {
        const picked = await pickReachableCommunityHubBaseUrl(configuredHub, probeCommunityHub, {
          ...communityHubProbeFlags(),
          includeLoopback,
        })
        if (cancelled || my !== gen) return
        setHubBaseUrl(picked.url)
        setTriedHubUrls(picked.tried)
        setOffline(!picked.online)
        const userId = auth?.identityId ?? null
        let next: CommunityListItem[] = []
        if (section.listKind === 'news') {
          let feedError: string | null = null
          if (picked.online) {
            const loaded = await loadCommunityNewsWithRefresh(picked.url, userId)
            next = loaded.items
            feedError = loaded.feedErrors[0] ?? null
          }
          if (next.length === 0) {
            next = await loadDirectCommunityNews({ force })
          }
          if (next.length > 0) writeCachedDirectNews(next)
          if (next.length === 0 && feedError) setError(feedError)
        } else if (!picked.online) {
          setItems([])
          return
        } else if (section.listKind === 'messages') {
          next = await fetchCommunityMessages(picked.url, userId)
        } else if (section.listKind === 'market' && section.resourceType) {
          next = await fetchCommunityResources(picked.url, section.resourceType, userId)
        } else if (section.listKind === 'tasks') {
          next = await fetchCommunityTasks(picked.url, userId)
        }
        if (!cancelled && my === gen) setItems(next)
      } catch (err) {
        if (!cancelled && my === gen) {
          if (!(section.listKind === 'news' && (readCachedDirectNews()?.length ?? 0) > 0)) {
            setItems([])
          }
          setOffline(true)
          setError(err instanceof Error ? err.message : '加载失败')
        }
      } finally {
        if (!cancelled && my === gen) setLoading(false)
      }
    }
    // Hosted HTTPS skips loopback until Chrome has granted local-network access
    // (a click primes it). News can still load from cache / public RSS.
    const hosted = isHostedWebPage()
    const includeLoopback = !hosted || isLocalNetworkPrimed()
    void run(includeLoopback)
    const unsub = hosted
      ? whenLocalNetworkAccessGranted(() => {
          void run(true)
        })
      : () => {}
    return () => {
      cancelled = true
      unsub()
    }
  }, [auth?.identityId, configuredHub, section.listKind, section.resourceType, tick])

  const reload = useCallback(() => {
    forceReloadRef.current = true
    setTick((n) => n + 1)
  }, [])
  const patchItem = useCallback((id: string, patch: Partial<CommunityListItem>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const next = { ...item, ...patch }
        // Skip no-op patches so list identity stays stable and avoid UI thrashing.
        const keys = Object.keys(patch) as Array<keyof CommunityListItem>
        if (keys.every((key) => next[key] === item[key])) return item
        return next
      }),
    )
  }, [])

  return {
    items,
    loading,
    offline,
    error,
    hubBaseUrl,
    triedHubUrls,
    reload,
    patchItem,
  }
}

export type CommunityListSectionId = Exclude<CommunitySidebarSection, 'mine' | 'management'>

export function useCommunityListSection(sectionId: CommunityListSectionId) {
  const section = getCommunitySection(sectionId)
  const { auth, modulePrefs } = useMobileApp()
  const { items, loading, offline, error, reload, hubBaseUrl, triedHubUrls, patchItem } =
    useCommunityHubList(sectionId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)
  const [rssOpen, setRssOpen] = useState(false)

  const sorted = useMemo(() => sortCommunityItems(items), [items])
  const userId = auth?.identityId ?? null
  const guestBlocked = modulePrefs.community.guestReadOnly && !auth
  const listKind = section.listKind ?? 'news'

  const interactions = useCommunityListInteractions({
    listKind,
    hubBaseUrl,
    userId,
    guestBlocked,
    patchItem,
  })

  const pageStatus = useMemo(
    () =>
      communityListPageStatus({
        error,
        offline,
        loading,
        itemCount: sorted.length,
        hubBaseUrl,
        triedHubUrls,
        hostedWeb: isHostedWebPage(),
      }),
    [error, hubBaseUrl, loading, offline, sorted.length, triedHubUrls],
  )

  useRegisterModulePanelStatus('community-page', pageStatus)

  const openPublish = () => {
    if (guestBlocked) {
      notifyLoginRequired()
      return
    }
    if (!offline) {
      setPublishOpen(true)
      return
    }
    void (async () => {
      await primeLocalNetworkAccess()
      const picked = await pickReachableCommunityHubBaseUrl(
        modulePrefs.community.hubBaseUrl,
        probeCommunityHub,
        {
          ...communityHubProbeFlags(),
          includeLoopback: true,
        },
      )
      if (!picked.online) {
        notifyDesktopHubRequired(isHostedWebPage())
        return
      }
      reload()
      setPublishOpen(true)
    })()
  }

  const openRss = () => {
    if (!offline) {
      setRssOpen(true)
      return
    }
    void (async () => {
      await primeLocalNetworkAccess()
      const picked = await pickReachableCommunityHubBaseUrl(
        modulePrefs.community.hubBaseUrl,
        probeCommunityHub,
        {
          ...communityHubProbeFlags(),
          includeLoopback: true,
        },
      )
      if (!picked.online) {
        notifyDesktopHubRequired(isHostedWebPage())
        return
      }
      reload()
      setRssOpen(true)
    })()
  }

  const commentItem = interactions.commentItemId
    ? sorted.find((item) => item.id === interactions.commentItemId) ?? null
    : null
  const reportItem = interactions.reportItemId
    ? sorted.find((item) => item.id === interactions.reportItemId) ?? null
    : null

  return {
    section,
    sorted,
    loading,
    offline,
    reload,
    hubBaseUrl,
    userId,
    selectedId,
    setSelectedId,
    publishOpen,
    setPublishOpen,
    rssOpen,
    setRssOpen,
    openPublish,
    openRss,
    resourceType: section.resourceType as CommunityResourceType | undefined,
    interactions,
    commentItem,
    reportItem,
    patchItem,
    listKind,
    guestBlocked,
  }
}

export function useCommunityMinePanel() {
  const section = getCommunitySection('mine')
  const { auth } = useMobileApp()
  const [tab, setTab] = useState<UserCenterSectionId>('publishes')
  const stats = communityUserCenterStats()
  const active = USER_CENTER_SECTIONS.find((item) => item.id === tab)!

  useRegisterModulePanelStatus('community-page', communityMinePageStatus(Boolean(auth)))

  return { section, auth, tab, setTab, stats, active }
}

export function useCommunityManagementPanel() {
  const section = getCommunitySection('management')
  const { canAccessManagement } = useCommunityUi()
  const [category, setCategory] = useState<ModerationCategoryId>('resources')
  const subTabs = MODERATION_SUBTABS[category]
  const [subTab, setSubTab] = useState(subTabs[0]!.id)

  useEffect(() => {
    setSubTab(MODERATION_SUBTABS[category][0]!.id)
  }, [category])

  const statItems = communityModerationStats(category)
  const activeSub = subTabs.find((item) => item.id === subTab) ?? subTabs[0]!

  useRegisterModulePanelStatus(
    'community-page',
    communityManagementPageStatus(canAccessManagement),
  )

  return {
    section,
    canAccessManagement,
    category,
    setCategory,
    subTab,
    setSubTab,
    statItems,
    activeSub,
  }
}

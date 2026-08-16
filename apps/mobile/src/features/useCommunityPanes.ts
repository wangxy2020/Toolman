import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { isCommunityModerator } from '../auth/localAuth'
import { useMobileApp } from '../state/MobileAppContext'
import { resolveCommunityHubBaseUrl, pickReachableCommunityHubBaseUrl } from '../settings/communityHubUrl'
import {
  isHostedWebPage,
  listDesktopDevHostnames,
  shouldProbeLoopbackSyncHub,
} from '../sync/desktopDevHost'
import {
  fetchCommunityMessages,
  fetchCommunityNews,
  fetchCommunityResources,
  fetchCommunityTasks,
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
  notifyLoginRequired,
} from './communityPaneUtils'
import { sortCommunityItems } from './communityPanelUi'
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

  const reload = useCallback(() => setTick((n) => n + 1), [])
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
    if (offline) return
    if (guestBlocked) {
      notifyLoginRequired()
      return
    }
    setPublishOpen(true)
  }

  const openRss = () => {
    if (offline) return
    // Guests may browse RSS sources read-only; add/fetch still require login in the modal.
    setRssOpen(true)
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

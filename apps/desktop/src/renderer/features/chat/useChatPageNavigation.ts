import { useCallback, useEffect, useRef, useState } from 'react'
import type { CommunityUserRole, Workspace } from '@toolman/shared'
import type { AppView } from '../../types/app-view'
import { guardAppView } from '../modules/module-registry'
import type { SettingsSectionId } from '../settings/settings-nav'
import {
  COMMUNITY_SECTION_TO_ACTION,
  DEFAULT_COMMUNITY_SIDEBAR_SECTION,
  type CommunitySidebarSection,
} from '../community/community-sidebar-types'
import { isCommunityModerator } from '../community/community-user-utils'
import { isCommunitySessionActive } from '../user/community-session'
import type { KnowledgeSidebarSection } from '../knowledge/knowledge-sidebar-types'
import type { ProjectSidebarMenuTab } from '../project-manager/projectSidebarMenuConfig'
import type { AppSettings } from '../settings/app-settings'
import { loadDefaultWorkspace } from './chat-page-handlers'
import { appViewFromLocationHash, syncLocationHashForAppView } from '../../navigation/app-view-hash'

type NotesApi = {
  ensureDefaultSelection: () => void
}

type CommunityUserApi = {
  profile?: { role?: CommunityUserRole | null } | null
}

export function useChatPageNavigation(
  appSettings: AppSettings,
  notes: NotesApi,
  communityUser: CommunityUserApi,
  t: (key: string) => string,
) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [activeView, setActiveView] = useState<AppView>('agent')
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId | undefined>()
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [knowledgeSection, setKnowledgeSection] = useState<KnowledgeSidebarSection>('local')
  const [communitySidebarSection, setCommunitySidebarSection] =
    useState<CommunitySidebarSection>(DEFAULT_COMMUNITY_SIDEBAR_SECTION)
  const [communityAction, setCommunityAction] = useState(
    COMMUNITY_SECTION_TO_ACTION[DEFAULT_COMMUNITY_SIDEBAR_SECTION],
  )
  const [projectSidebarTab, setProjectSidebarTab] =
    useState<ProjectSidebarMenuTab>('cost_management')
  const prevActiveViewRef = useRef(activeView)

  useEffect(() => {
    const platform = navigator.platform.toLowerCase()
    if (platform.includes('mac')) {
      document.documentElement.classList.add('platform-darwin')
    } else if (platform.includes('win')) {
      document.documentElement.classList.add('platform-win32')
    } else {
      document.documentElement.classList.add('platform-linux')
    }
  }, [])

  useEffect(() => {
    const viewFromHash = appViewFromLocationHash(window.location.hash)
    if (viewFromHash) {
      const resolved = guardAppView(viewFromHash, appSettings.sidebarVisibleModules)
      setActiveView(resolved)
      if (resolved !== viewFromHash) {
        syncLocationHashForAppView(resolved)
      }
    }

    const onHashChange = () => {
      const view = appViewFromLocationHash(window.location.hash)
      if (!view) return
      const resolved = guardAppView(view, appSettings.sidebarVisibleModules)
      setActiveView(resolved)
      if (resolved !== view) {
        syncLocationHashForAppView(resolved)
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [appSettings.sidebarVisibleModules])

  useEffect(() => {
    setActiveView((prev) => {
      const resolved = guardAppView(prev, appSettings.sidebarVisibleModules)
      if (resolved !== prev) {
        syncLocationHashForAppView(resolved)
      }
      return resolved
    })
  }, [appSettings.sidebarVisibleModules])

  useEffect(() => {
    void (async () => {
      const ws = await loadDefaultWorkspace()
      if (ws) {
        setWorkspaceId(ws.id)
        setWorkspace(ws)
      }
    })()
  }, [])

  useEffect(() => {
    if (communityAction !== 'management') return
    const canAccessManagement =
      isCommunitySessionActive() && isCommunityModerator(communityUser.profile?.role)
    if (!canAccessManagement) {
      setCommunitySidebarSection(DEFAULT_COMMUNITY_SIDEBAR_SECTION)
      setCommunityAction(COMMUNITY_SECTION_TO_ACTION[DEFAULT_COMMUNITY_SIDEBAR_SECTION])
    }
  }, [communityAction, communityUser.profile?.role])

  useEffect(() => {
    if (activeView === 'notes' && prevActiveViewRef.current !== 'notes') {
      notes.ensureDefaultSelection()
    }
    prevActiveViewRef.current = activeView
  }, [activeView, notes.ensureDefaultSelection])

  const handleOpenSettings = useCallback((section?: SettingsSectionId) => {
    setSettingsSection(section)
    setActiveView('settings')
    syncLocationHashForAppView('settings')
  }, [])

  const handleNavigate = useCallback(
    (view: AppView) => {
      const resolved = guardAppView(view, appSettings.sidebarVisibleModules)
      if (resolved === 'agent') setSettingsSection(undefined)
      if (resolved !== 'settings') setSettingsSection(undefined)
      setActiveView(resolved)
      syncLocationHashForAppView(resolved)
    },
    [appSettings.sidebarVisibleModules],
  )

  const handleToggleSidebar = useCallback(() => {
    setSidebarVisible((v) => !v)
  }, [])

  const showContentSidebar = activeView !== 'settings' && sidebarVisible
  const isTopNav = appSettings.navBarPosition === 'top'
  const chromeSearchTitle = t('search.globalTitle')

  return {
    workspaceId,
    setWorkspaceId,
    workspace,
    setWorkspace,
    activeView,
    setActiveView,
    settingsSection,
    setSettingsSection,
    sidebarVisible,
    knowledgeSection,
    setKnowledgeSection,
    communitySidebarSection,
    setCommunitySidebarSection,
    communityAction,
    setCommunityAction,
    projectSidebarTab,
    setProjectSidebarTab,
    showContentSidebar,
    isTopNav,
    chromeSearchTitle,
    handleOpenSettings,
    handleNavigate,
    handleToggleSidebar,
  }
}

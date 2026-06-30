import { useCallback, useEffect, useRef, useState } from 'react'
import type { CommunityUserRole, Workspace } from '@toolman/shared'
import type { AppView } from '../../types/app-view'
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
      setActiveView(viewFromHash)
    }

    const onHashChange = () => {
      const view = appViewFromLocationHash(window.location.hash)
      if (view) setActiveView(view)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

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
  }, [])

  const handleNavigate = useCallback((view: AppView) => {
    if (view === 'agent') setSettingsSection(undefined)
    if (view !== 'settings') setSettingsSection(undefined)
    setActiveView(view)
    syncLocationHashForAppView(view)
  }, [])

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

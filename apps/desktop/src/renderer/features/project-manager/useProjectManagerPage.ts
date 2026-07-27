import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { PmDomain, PmProject } from '@toolman/shared'
import { nextDefaultPmProjectCode, nextDefaultPmProjectName } from '@toolman/shared'

import { useI18n } from '../../i18n/useI18n'
import { getModulePageConfig } from '../modules/module-config'
import type { ProjectManagementAgentPanelProps } from './ProjectManagementAgentPanel'
import { isProjectManagementAgentTab } from './projectManagementAgentLink'
import { pmApi } from './pm-api'
import type { ProjectManagerPanelView } from './projectManagerPanelView'
import {
  isConfigurableSidebarMenuKey,
  PANEL_SUBTITLE_I18N_KEY,
  PROJECT_SIDEBAR_CUSTOM_TAB,
  SIDEBAR_MENU_I18N_KEY,
  type ProjectSidebarMenuTab,
} from './projectSidebarMenuConfig'
import { useProjectSidebarMenuPreferences } from './useProjectSidebarMenuPreferences'
import { clearPmPlanAppliedProject } from './ProjectPlanAgentApplyBar'
import { resolveDefaultProjectId, writeLastSelectedProjectId } from './pm-last-selected-project'
import { loadGanttUiPrefs, saveGanttUiPrefs } from './views/schedule/pm-gantt-prefs'
import {
  isPmDatabaseDomain,
  isPmFilesDomain,
  isPmVerticalStatsDomain,
  resolvePmDatabaseListDomain,
} from './pm-domain-config'
import {
  addToMountedViews,
  HEADER_PROJECT_VIEWS,
  resolveScheduleTargetView,
} from './pm-project-manager-page-utils'

export interface UseProjectManagerPageProps {
  activeTab: ProjectSidebarMenuTab
  agentContext: Omit<
    ProjectManagementAgentPanelProps,
    'activeTab' | 'selectedProjectId'
  > | null
}

export function useProjectManagerPage({ activeTab, agentContext }: UseProjectManagerPageProps) {
  const workspaceId = agentContext?.workspaceId ?? null
  const { t } = useI18n()
  const config = getModulePageConfig('projects', t)

  const { preferences, setMenuVisible, moveMenu, resetToDefaults } =
    useProjectSidebarMenuPreferences()

  const settingsMenuRows = useMemo(
    () =>
      preferences.order.map((key) => ({
        key,
        label: t(SIDEBAR_MENU_I18N_KEY[key]),
      })),
    [preferences.order, t],
  )

  const hiddenMenuKeys = useMemo(() => new Set(preferences.hidden), [preferences.hidden])

  const activeMenuLabel =
    activeTab === PROJECT_SIDEBAR_CUSTOM_TAB
      ? t('projectManagerPage.panel.customizeTitle')
      : isConfigurableSidebarMenuKey(activeTab)
        ? t(SIDEBAR_MENU_I18N_KEY[activeTab])
        : ''

  const panelSubtitle =
    activeTab === PROJECT_SIDEBAR_CUSTOM_TAB
      ? t('projectManagerPage.panel.customizeSubtitle')
      : isConfigurableSidebarMenuKey(activeTab)
        ? t(PANEL_SUBTITLE_I18N_KEY[activeTab])
        : t('projectManagerPage.panel.reservedDefault')

  const showCostDashboard = activeTab === 'cost_management'
  const showProgressDashboard = activeTab === 'progress_management'
  const showWorkbench = activeTab === 'all_projects'
  const showUrgentTasks = activeTab === 'urgent_tasks'
  const showKeyProjects = activeTab === 'key_projects'
  const showArchiveManagement = activeTab === 'archive_management'
  const showVerticalStats =
    isConfigurableSidebarMenuKey(activeTab) && isPmVerticalStatsDomain(activeTab)
  const showSidebarMenuSettings = activeTab === PROJECT_SIDEBAR_CUSTOM_TAB

  const [panelView, setPanelView] = useState<ProjectManagerPanelView>('stats')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mountedViews, setMountedViews] = useState<ReadonlySet<ProjectManagerPanelView>>(
    () => new Set<ProjectManagerPanelView>(['stats']),
  )
  const [projects, setProjects] = useState<PmProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  /** After create dialog: open agent and auto-send plan kickoff. */
  const [createContinueWithAgent, setCreateContinueWithAgent] = useState(false)
  const [createProjectDefaults, setCreateProjectDefaults] = useState<{
    workspaceId: string
    domain: PmDomain
    code: string
    name: string
  } | null>(null)
  const [agentKickoffProject, setAgentKickoffProject] = useState<PmProject | null>(null)
  const [ganttDataRevision, setGanttDataRevision] = useState(0)
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0)
  const preferAllProjectsRef = useRef(activeTab === 'resource_management')
  const previousActiveTabRef = useRef(activeTab)

  // Resource management defaults to「全部项目」; set the ref before reload effects run.
  if (previousActiveTabRef.current !== activeTab) {
    previousActiveTabRef.current = activeTab
    preferAllProjectsRef.current = activeTab === 'resource_management'
  }

  const bumpDashboardRefresh = useCallback(() => {
    setDashboardRefreshKey((value) => value + 1)
  }, [])

  const projectListDomain = useMemo((): PmDomain | undefined => {
    if (!isConfigurableSidebarMenuKey(activeTab)) return undefined
    if (activeTab === 'progress_management') return 'progress_management'
    if (isPmDatabaseDomain(activeTab)) return resolvePmDatabaseListDomain(activeTab)
    return undefined
  }, [activeTab])

  const reloadProjects = useCallback(async (): Promise<PmProject[]> => {
    if (!workspaceId) {
      setProjects([])
      setSelectedProjectId(null)
      return []
    }
    try {
      const result = await pmApi.listProjects(workspaceId, projectListDomain)
      setProjects(result.projects)
      setSelectedProjectId((current) => {
        if (preferAllProjectsRef.current) return null
        if (current && result.projects.some((project) => project.id === current)) {
          return current
        }
        return resolveDefaultProjectId(workspaceId, result.projects)
      })
      return result.projects
    } catch {
      setProjects([])
      setSelectedProjectId(null)
      return []
    }
  }, [projectListDomain, workspaceId])

  const reloadProjectsAndDashboard = useCallback(async () => {
    await reloadProjects()
    bumpDashboardRefresh()
  }, [bumpDashboardRefresh, reloadProjects])

  useEffect(() => {
    void reloadProjects()
  }, [reloadProjects])

  const previousPanelViewRef = useRef(panelView)
  useEffect(() => {
    const previous = previousPanelViewRef.current
    previousPanelViewRef.current = panelView
    if (previous !== panelView && panelView === 'stats') {
      bumpDashboardRefresh()
    }
  }, [bumpDashboardRefresh, panelView])

  useEffect(() => {
    setPanelView('stats')
    setSettingsOpen(false)
    setCreateProjectOpen(false)
    setCreateContinueWithAgent(false)
    setCreateProjectDefaults(null)
    setAgentKickoffProject(null)
    preferAllProjectsRef.current = activeTab === 'resource_management'
    if (activeTab === 'resource_management') {
      setSelectedProjectId(null)
    }
    // Unmount heavy editors on sidebar switch. Catalog leave-save flushes on unmount
    // via usePmCatalogAutoSave — do not keep all tables alive (causes input lag).
    setMountedViews(new Set<ProjectManagerPanelView>(['stats']))
  }, [activeTab])

  const openAgentPanel = useCallback(() => {
    setSettingsOpen(false)
    setPanelView('agent')
    setMountedViews((prev) => addToMountedViews(prev, 'agent'))
  }, [])

  const handlePlanApplied = useCallback(
    (projectId: string) => {
      preferAllProjectsRef.current = false
      setAgentKickoffProject(null)
      setSettingsOpen(false)
      // Agent confirm is an explicit jump to the Gantt chart. Do not restore a
      // previously selected allocation/check subview (for example 成本分配).
      const ganttPrefs = loadGanttUiPrefs()
      if (ganttPrefs.scheduleView !== 'gantt') {
        saveGanttUiPrefs({ ...ganttPrefs, scheduleView: 'gantt' })
      }
      setPanelView('gantt')
      setMountedViews((prev) => addToMountedViews(prev, 'gantt'))
      setGanttDataRevision((value) => value + 1)
      void reloadProjects().then((nextProjects) => {
        if (nextProjects.some((project) => project.id === projectId)) {
          if (workspaceId) writeLastSelectedProjectId(workspaceId, projectId)
          setSelectedProjectId(projectId)
        } else if (workspaceId) {
          clearPmPlanAppliedProject(workspaceId, projectId)
          setSelectedProjectId(resolveDefaultProjectId(workspaceId, nextProjects))
        }
      })
    },
    [reloadProjects, workspaceId],
  )

  const openCreateProjectDialog = useCallback(
    (continueWithAgent: boolean) => {
      if (!workspaceId) return
      const domain =
        (isConfigurableSidebarMenuKey(activeTab)
          ? resolvePmDatabaseListDomain(activeTab)
          : undefined) ?? 'progress_management'
      setCreateProjectDefaults({
        workspaceId,
        domain,
        code: nextDefaultPmProjectCode(projects.map((project) => project.code)),
        name: nextDefaultPmProjectName(projects.map((project) => project.name)),
      })
      setCreateContinueWithAgent(continueWithAgent)
      setCreateProjectOpen(true)
    },
    [activeTab, projects, workspaceId],
  )

  const handleCreateProjectSaved = useCallback(
    (project: PmProject, options?: { manualCreate?: boolean }) => {
      preferAllProjectsRef.current = false
      if (workspaceId) writeLastSelectedProjectId(workspaceId, project.id)
      setSelectedProjectId(project.id)
      void reloadProjectsAndDashboard().then(() => {
        setSelectedProjectId(project.id)
      })
      setGanttDataRevision((value) => value + 1)

      if (
        !options?.manualCreate &&
        createContinueWithAgent &&
        activeTab === 'progress_management'
      ) {
        setAgentKickoffProject(project)
        openAgentPanel()
      }
      setCreateContinueWithAgent(false)
    },
    [
      activeTab,
      createContinueWithAgent,
      openAgentPanel,
      reloadProjectsAndDashboard,
      workspaceId,
    ],
  )

  const handleCreateProject = useCallback(() => {
    if (!workspaceId) return
    // Header +: project info dialog; plan management continues on agent after confirm.
    openCreateProjectDialog(activeTab === 'progress_management')
  }, [activeTab, openCreateProjectDialog, workspaceId])

  const handleCreateProjectDialogClose = useCallback(() => {
    setCreateProjectOpen(false)
    setCreateContinueWithAgent(false)
    setCreateProjectDefaults(null)
  }, [])

  const showHeaderProject = !settingsOpen && HEADER_PROJECT_VIEWS.has(panelView)

  const handleHeaderProjectChange = useCallback(
    (projectId: string | null) => {
      preferAllProjectsRef.current = projectId === null
      if (projectId && workspaceId) {
        writeLastSelectedProjectId(workspaceId, projectId)
      }
      setSelectedProjectId(projectId)
    },
    [workspaceId],
  )

  const handleSelectView = useCallback(
    (view: ProjectManagerPanelView) => {
      if (view === 'settings') {
        setSettingsOpen((open) => !open)
        return
      }
      setSettingsOpen(false)
      // Gantt needs a concrete project: restore last used when none is selected.
      if (
        view === 'gantt' &&
        workspaceId &&
        (!selectedProjectId || !projects.some((project) => project.id === selectedProjectId))
      ) {
        const restored = resolveDefaultProjectId(workspaceId, projects)
        if (restored) {
          preferAllProjectsRef.current = false
          setSelectedProjectId(restored)
        }
      }
      setPanelView(view)
      setMountedViews((prev) => addToMountedViews(prev, view))
    },
    [projects, selectedProjectId, workspaceId],
  )

  const showAgentPanel =
    panelView === 'agent' &&
    isConfigurableSidebarMenuKey(activeTab) &&
    isProjectManagementAgentTab(activeTab) &&
    agentContext != null

  const canShowAgent =
    isConfigurableSidebarMenuKey(activeTab) &&
    isProjectManagementAgentTab(activeTab) &&
    agentContext != null

  const openScheduleFromFeatures = useCallback(
    (_view: 'list' | 'gantt' | 'progressCheck' | 'resource' | 'cost') => {
      setSettingsOpen(false)
      if (
        workspaceId &&
        (!selectedProjectId || !projects.some((project) => project.id === selectedProjectId))
      ) {
        const restored = resolveDefaultProjectId(workspaceId, projects)
        if (restored) {
          preferAllProjectsRef.current = false
          setSelectedProjectId(restored)
        }
      }
      const targetView = resolveScheduleTargetView(activeTab)
      setPanelView(targetView)
      setMountedViews((prev) => addToMountedViews(prev, targetView))
    },
    [activeTab, projects, selectedProjectId, workspaceId],
  )

  const showGanttPanel = panelView === 'gantt' && showProgressDashboard && workspaceId != null
  const showResourceTablePanel =
    panelView === 'resource_table' &&
    activeTab === 'resource_management' &&
    workspaceId != null
  const showCostTablePanel =
    panelView === 'cost_table' &&
    activeTab === 'cost_management' &&
    workspaceId != null
  const showFeaturesPanel =
    panelView === 'files' &&
    workspaceId != null &&
    isConfigurableSidebarMenuKey(activeTab) &&
    isPmFilesDomain(activeTab)

  const toolbarActiveView: ProjectManagerPanelView = settingsOpen ? 'settings' : panelView

  const handleSettingsPanelClose = useCallback(() => {
    setSettingsOpen(false)
  }, [])

  const handleSettingsPanelProjectsChange = useCallback(() => {
    void reloadProjectsAndDashboard().then(() => {
      setGanttDataRevision((value) => value + 1)
    })
  }, [reloadProjectsAndDashboard])

  const handleAgentKickoffConsumed = useCallback(() => {
    setAgentKickoffProject(null)
  }, [])

  const mainClassName = [
    'tm-main',
    'tm-project-manager-page',
    showAgentPanel && agentContext?.messageSettings.useSerifFont ? 'tm-main--serif' : '',
    showAgentPanel ? 'tm-project-manager-page--agent' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return {
    t,
    config,
    workspaceId,

    settingsMenuRows,
    hiddenMenuKeys,
    setMenuVisible,
    moveMenu,
    resetToDefaults,

    activeMenuLabel,
    panelSubtitle,
    showSidebarMenuSettings,

    showCostDashboard,
    showProgressDashboard,
    showWorkbench,
    showUrgentTasks,
    showKeyProjects,
    showArchiveManagement,
    showVerticalStats,

    panelView,
    settingsOpen,
    mountedViews,
    projects,
    selectedProjectId,
    dashboardRefreshKey,
    ganttDataRevision,

    createProjectOpen,
    createProjectDefaults,
    agentKickoffProject,

    mainClassName,
    showHeaderProject,
    showAgentPanel,
    canShowAgent,
    showGanttPanel,
    showResourceTablePanel,
    showCostTablePanel,
    showFeaturesPanel,
    toolbarActiveView,

    reloadProjectsAndDashboard,
    openScheduleFromFeatures,
    handleSelectView,
    handleCreateProject,
    handleHeaderProjectChange,
    handlePlanApplied,
    handleCreateProjectSaved,
    handleCreateProjectDialogClose,
    handleSettingsPanelClose,
    handleSettingsPanelProjectsChange,
    handleAgentKickoffConsumed,
  }
}

import { useMemo } from 'react'

import { useI18n } from '../../i18n/useI18n'
import { getModulePageConfig } from '../modules/module-config'
import type { ProjectManagementAgentPanelProps } from './ProjectManagementAgentPanel'
import { isProjectManagementAgentTab } from './projectManagementAgentLink'
import {
  isConfigurableSidebarMenuKey,
  PANEL_SUBTITLE_I18N_KEY,
  PROJECT_SIDEBAR_CUSTOM_TAB,
  SIDEBAR_MENU_I18N_KEY,
  type ProjectSidebarMenuTab,
} from './projectSidebarMenuConfig'
import { useProjectSidebarMenuPreferences } from './useProjectSidebarMenuPreferences'
import { isPmFilesDomain, isPmVerticalStatsDomain } from './pm-domain-config'
import { HEADER_PROJECT_VIEWS } from './pm-project-manager-page-utils'
import type { ProjectManagerPanelView } from './projectManagerPanelView'
import { useProjectManagerPageHandlers } from './useProjectManagerPageHandlers'
import { useProjectManagerPageProjects } from './useProjectManagerPageProjects'

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

  const projects = useProjectManagerPageProjects({ workspaceId, activeTab })

  const handlers = useProjectManagerPageHandlers({
    workspaceId,
    activeTab,
    projects: projects.projects,
    selectedProjectId: projects.selectedProjectId,
    setSelectedProjectId: projects.setSelectedProjectId,
    preferAllProjectsRef: projects.preferAllProjectsRef,
    reloadProjects: projects.reloadProjects,
    reloadProjectsAndDashboard: projects.reloadProjectsAndDashboard,
    setGanttDataRevision: projects.setGanttDataRevision,
    bumpDashboardRefresh: projects.bumpDashboardRefresh,
  })

  const { panelView, settingsOpen } = handlers

  const showHeaderProject = !settingsOpen && HEADER_PROJECT_VIEWS.has(panelView)

  const showAgentPanel =
    panelView === 'agent' &&
    isConfigurableSidebarMenuKey(activeTab) &&
    isProjectManagementAgentTab(activeTab) &&
    agentContext != null

  const canShowAgent =
    isConfigurableSidebarMenuKey(activeTab) &&
    isProjectManagementAgentTab(activeTab) &&
    agentContext != null

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
    mountedViews: handlers.mountedViews,
    projects: projects.projects,
    selectedProjectId: projects.selectedProjectId,
    dashboardRefreshKey: projects.dashboardRefreshKey,
    ganttDataRevision: projects.ganttDataRevision,

    createProjectOpen: handlers.createProjectOpen,
    createProjectDefaults: handlers.createProjectDefaults,
    agentKickoffProject: handlers.agentKickoffProject,

    mainClassName,
    showHeaderProject,
    showAgentPanel,
    canShowAgent,
    showGanttPanel,
    showResourceTablePanel,
    showCostTablePanel,
    showFeaturesPanel,
    toolbarActiveView,

    reloadProjectsAndDashboard: projects.reloadProjectsAndDashboard,
    openScheduleFromFeatures: handlers.openScheduleFromFeatures,
    handleSelectView: handlers.handleSelectView,
    handleCreateProject: handlers.handleCreateProject,
    handleHeaderProjectChange: handlers.handleHeaderProjectChange,
    handlePlanApplied: handlers.handlePlanApplied,
    handleCreateProjectSaved: handlers.handleCreateProjectSaved,
    handleCreateProjectDialogClose: handlers.handleCreateProjectDialogClose,
    handleSettingsPanelClose: handlers.handleSettingsPanelClose,
    handleSettingsPanelProjectsChange: handlers.handleSettingsPanelProjectsChange,
    handleAgentKickoffConsumed: handlers.handleAgentKickoffConsumed,
  }
}

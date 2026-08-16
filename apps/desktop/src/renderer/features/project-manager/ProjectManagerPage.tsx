import { RotateCcw } from 'lucide-react'
import type { FC } from 'react'

import { CommunityPanelSecondaryButton } from '../community/CommunityPanelHeader'
import { ModulePageStatusBar } from '../../components/ModulePageStatusBar'
import type { ProjectManagementAgentPanelProps } from './ProjectManagementAgentPanel'
import { ProjectManagerPanelShell } from './ProjectManagerPanelShell'
import { PmHeaderProjectSelect } from './PmHeaderProjectSelect'
import ProjectSidebarMenuSettings from './ProjectSidebarMenuSettings'
import { useProjectManagerPage } from './useProjectManagerPage'
import { ProjectManagerPageMain } from './ProjectManagerPageMain'
import {
  buildPmFilesPanel,
  buildPmReservedFallback,
  buildPmSchedulePanels,
  buildPmSettingsPanel,
  buildPmStatsPanel,
  buildPmTimeEntriesPanel,
} from './ProjectManagerPagePanels'

interface Props {
  activeTab: import('./projectSidebarMenuConfig').ProjectSidebarMenuTab
  agentContext: Omit<
    ProjectManagementAgentPanelProps,
    'activeTab' | 'selectedProjectId'
  > | null
}

const ProjectManagerPage: FC<Props> = ({ activeTab, agentContext }) => {
  const page = useProjectManagerPage({ activeTab, agentContext })
  const {
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
    showHeaderProject,
    projects,
    selectedProjectId,
    handleHeaderProjectChange,
  } = page

  if (showSidebarMenuSettings) {
    return (
      <main className="tm-main tm-project-manager-page">
        <header className="tm-chat-header">
          <div className="tm-chat-breadcrumb">
            <span className="tm-model-pill tm-module-pill">{config.title}</span>
            <span className="tm-module-breadcrumb-group">
              <span className="tm-chat-breadcrumb-sep">/</span>
              <span className="tm-model-pill tm-module-pill tm-module-pill--secondary">
                {activeMenuLabel}
              </span>
            </span>
          </div>
        </header>
        <div className="tm-module-content tm-community-module-content">
          <ProjectManagerPanelShell
            title={activeMenuLabel}
            subtitle={panelSubtitle}
            actions={
              <CommunityPanelSecondaryButton
                title={t('projectManagerPage.panel.resetDefaults')}
                ariaLabel={t('projectManagerPage.panel.resetDefaults')}
                onClick={resetToDefaults}>
                <RotateCcw size={16} />
                <span>{t('projectManagerPage.panel.resetDefaults')}</span>
              </CommunityPanelSecondaryButton>
            }>
            <ProjectSidebarMenuSettings
              menuRows={settingsMenuRows}
              hiddenKeys={hiddenMenuKeys}
              onVisibleChange={setMenuVisible}
              onMove={moveMenu}
            />
          </ProjectManagerPanelShell>
        </div>
        <ModulePageStatusBar />
      </main>
    )
  }

  const headerProjectSelect = showHeaderProject ? (
    <PmHeaderProjectSelect
      projects={projects}
      value={selectedProjectId}
      onChange={handleHeaderProjectChange}
      ariaLabel={t('projectManagerPage.database.project')}
    />
  ) : null

  return (
    <ProjectManagerPageMain
      activeTab={activeTab}
      agentContext={agentContext}
      workspaceId={workspaceId}
      configTitle={config.title}
      activeMenuLabel={activeMenuLabel}
      panelSubtitle={panelSubtitle}
      headerProjectSelect={headerProjectSelect}
      mainClassName={page.mainClassName}
      showAgentPanel={page.showAgentPanel}
      canShowAgent={page.canShowAgent}
      showGanttPanel={page.showGanttPanel}
      showResourceTablePanel={page.showResourceTablePanel}
      showCostTablePanel={page.showCostTablePanel}
      showFeaturesPanel={page.showFeaturesPanel}
      showProgressDashboard={page.showProgressDashboard}
      settingsOpen={page.settingsOpen}
      settingsPanel={buildPmSettingsPanel({
        workspaceId,
        activeTab,
        onClose: page.handleSettingsPanelClose,
        onProjectsChange: page.handleSettingsPanelProjectsChange,
      })}
      panelView={page.panelView}
      mountedViews={page.mountedViews}
      projects={projects}
      selectedProjectId={selectedProjectId}
      ganttDataRevision={page.ganttDataRevision}
      createProjectOpen={page.createProjectOpen}
      createProjectDefaults={page.createProjectDefaults}
      agentKickoffProject={page.agentKickoffProject}
      toolbarActiveView={page.toolbarActiveView}
      filesPanel={buildPmFilesPanel({
        t,
        workspaceId,
        activeTab,
        projects,
        selectedProjectId,
        agentContext,
        reloadProjectsAndDashboard: page.reloadProjectsAndDashboard,
        openScheduleFromFeatures: page.openScheduleFromFeatures,
      })}
      databasePanel={
        <div className="tm-kb-file-panel-empty">
          <p>{t('projectManagerPage.panel.reserved.database')}</p>
        </div>
      }
      statsPanel={buildPmStatsPanel({
        t,
        workspaceId,
        activeTab,
        dashboardRefreshKey: page.dashboardRefreshKey,
        showWorkbench: page.showWorkbench,
        showUrgentTasks: page.showUrgentTasks,
        showCostDashboard: page.showCostDashboard,
        showProgressDashboard: page.showProgressDashboard,
        showKeyProjects: page.showKeyProjects,
        showVerticalStats: page.showVerticalStats,
        showArchiveManagement: page.showArchiveManagement,
      })}
      schedulePanels={buildPmSchedulePanels({
        workspaceId,
        showProgressDashboard: page.showProgressDashboard,
        panelView: page.panelView,
        mountedViews: page.mountedViews,
        selectedProjectId,
      })}
      timeEntriesPanel={buildPmTimeEntriesPanel({
        workspaceId,
        activeTab,
        panelView: page.panelView,
        mountedViews: page.mountedViews,
      })}
      reservedFallback={buildPmReservedFallback({ t, panelView: page.panelView })}
      reloadProjectsAndDashboard={page.reloadProjectsAndDashboard}
      handleSelectView={page.handleSelectView}
      handleCreateProject={page.handleCreateProject}
      handlePlanApplied={page.handlePlanApplied}
      handleCreateProjectSaved={page.handleCreateProjectSaved}
      handleCreateProjectDialogClose={page.handleCreateProjectDialogClose}
      handleAgentKickoffConsumed={page.handleAgentKickoffConsumed}
    />
  )
}

export default ProjectManagerPage

import { RotateCcw } from 'lucide-react'
import type { FC, ReactNode } from 'react'
import { memo } from 'react'

import { CommunityPanelSecondaryButton } from '../community/CommunityPanelHeader'
import { ModulePageStatusBar } from '../../components/ModulePageStatusBar'
import ProjectManagementDashboard from './ProjectManagementDashboard'
import {
  ProjectManagementAgentPanel,
  type ProjectManagementAgentPanelProps,
} from './ProjectManagementAgentPanel'
import { ProjectManagerPanelShell } from './ProjectManagerPanelShell'
import { ProjectManagerPanelToolbar } from './ProjectManagerPanelToolbar'
import { PmHeaderProjectSelect } from './PmHeaderProjectSelect'
import { isProgressScheduleView } from './projectManagerPanelView'
import ProjectSidebarMenuSettings from './ProjectSidebarMenuSettings'
import ProjectArchiveStatsPanel from './views/archive/ProjectArchiveStatsPanel'
import ProjectManagementFilesPanel from './views/files/ProjectManagementFilesPanel'
import ProjectKeyProjectsPanel from './views/key-projects/ProjectKeyProjectsPanel'
import ProjectManagementSettingsPanel from './views/settings/ProjectManagementSettingsPanel'
import ProjectScheduleCalendarPanel from './views/schedule/ProjectScheduleCalendarPanel'
import ProjectScheduleGanttPanel from './views/schedule/ProjectScheduleGanttPanel'
import ProjectInfoDialog from './views/schedule/ProjectInfoDialog'
import ProjectKanbanPanel from './views/kanban/ProjectKanbanPanel'
import ProjectVerticalDomainStatsPanel from './views/vertical/ProjectVerticalDomainStatsPanel'
import { isConfigurableSidebarMenuKey } from './projectSidebarMenuConfig'
import { isPmFilesDomain, isPmTimeEntriesDomain, resolvePmDatabaseListDomain } from './pm-domain-config'
import ProjectTimeEntryPanel from './views/time/ProjectTimeEntryPanel'
import ProjectResourceTablePanel from './views/resource/ProjectResourceTablePanel'
import ProjectCostTablePanel from './views/cost/ProjectCostTablePanel'
import { useProjectManagerPage } from './useProjectManagerPage'

interface Props {
  activeTab: import('./projectSidebarMenuConfig').ProjectSidebarMenuTab
  agentContext: Omit<
    ProjectManagementAgentPanelProps,
    'activeTab' | 'selectedProjectId'
  > | null
}

/**
 * Keep visited panels mounted, but freeze inactive ones so parent re-renders
 * (e.g. chat context updates) do not re-render hidden heavy trees.
 */
const KeepAliveSlotBody = memo(
  function KeepAliveSlotBody({
    active,
    children,
  }: {
    active: boolean
    children: ReactNode
  }) {
    return (
      <div className="tm-pm-panel-slot" hidden={!active} aria-hidden={!active}>
        {children}
      </div>
    )
  },
  (prev, next) => {
    if (!prev.active && !next.active) return true
    return false
  },
)

function KeepAliveSlot({
  active,
  mounted,
  children,
}: {
  active: boolean
  mounted: boolean
  children: ReactNode
}) {
  if (!mounted) return null
  return <KeepAliveSlotBody active={active}>{children}</KeepAliveSlotBody>
}

const AgentKeepAliveRoot = memo(
  function AgentKeepAliveRoot({
    active,
    children,
  }: {
    active: boolean
    children: ReactNode
  }) {
    return (
      <div className={active ? 'tm-pm-agent-root' : 'tm-pm-view-hidden'} aria-hidden={!active}>
        {children}
      </div>
    )
  },
  (prev, next) => {
    if (!prev.active && !next.active) return true
    return false
  },
)

const ProjectManagerPage: FC<Props> = ({ activeTab, agentContext }) => {
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
  } = useProjectManagerPage({ activeTab, agentContext })

  const headerProjectSelect = showHeaderProject ? (
    <PmHeaderProjectSelect
      projects={projects}
      value={selectedProjectId}
      onChange={handleHeaderProjectChange}
      ariaLabel={t('projectManagerPage.database.project')}
    />
  ) : null

  const statsPanel = (() => {
    if (showWorkbench) {
      return (
        <ProjectManagementDashboard
          workspaceId={workspaceId ?? undefined}
          variant="progress"
          dedupeByCode
          refreshKey={dashboardRefreshKey}
        />
      )
    }
    if (showUrgentTasks && workspaceId) {
      return <ProjectKanbanPanel workspaceId={workspaceId} />
    }
    if (showCostDashboard) {
      return (
        <ProjectManagementDashboard
          workspaceId={workspaceId ?? undefined}
          variant="cost"
          domain="cost_management"
          refreshKey={dashboardRefreshKey}
        />
      )
    }
    if (showProgressDashboard) {
      return (
        <ProjectManagementDashboard
          workspaceId={workspaceId ?? undefined}
          variant="progress"
          domain="progress_management"
          refreshKey={dashboardRefreshKey}
        />
      )
    }
    if (showKeyProjects) {
      return <ProjectKeyProjectsPanel workspaceId={workspaceId ?? undefined} />
    }
    if (showVerticalStats && workspaceId && isConfigurableSidebarMenuKey(activeTab)) {
      return <ProjectVerticalDomainStatsPanel workspaceId={workspaceId} domain={activeTab} />
    }
    if (showArchiveManagement && workspaceId) {
      return <ProjectArchiveStatsPanel workspaceId={workspaceId} />
    }
    return (
      <div className="tm-kb-file-panel-empty">
        <p>{t('projectManagerPage.panel.selectDashboardHint')}</p>
      </div>
    )
  })()

  const filesPanel =
    workspaceId &&
    isConfigurableSidebarMenuKey(activeTab) &&
    isPmFilesDomain(activeTab) ? (
      activeTab === 'resource_management' ? (
        <ProjectResourceTablePanel
          workspaceId={workspaceId}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onProjectsChange={reloadProjectsAndDashboard}
          variant="practice"
          onOpenScheduleView={openScheduleFromFeatures}
        />
      ) : activeTab === 'cost_management' ? (
        <ProjectCostTablePanel
          workspaceId={workspaceId}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onProjectsChange={reloadProjectsAndDashboard}
          variant="practice"
          onOpenScheduleView={openScheduleFromFeatures}
        />
      ) : (
        <ProjectManagementFilesPanel
          workspaceId={workspaceId}
          workspace={agentContext?.workspace ?? null}
          systemPaths={agentContext?.systemPaths ?? null}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onOpenScheduleView={openScheduleFromFeatures}
          onProjectsChange={reloadProjectsAndDashboard}
        />
      )
    ) : (
      <div className="tm-kb-file-panel-empty">
        <p>{t('projectManagerPage.panel.reserved.files')}</p>
      </div>
    )

  const databasePanel = (
    <div className="tm-kb-file-panel-empty">
      <p>{t('projectManagerPage.panel.reserved.database')}</p>
    </div>
  )

  const settingsPanel =
    workspaceId && isConfigurableSidebarMenuKey(activeTab) ? (
      <ProjectManagementSettingsPanel
        workspaceId={workspaceId}
        domain={activeTab}
        onClose={handleSettingsPanelClose}
        onProjectsChange={handleSettingsPanelProjectsChange}
      />
    ) : null

  const schedulePanels = showProgressDashboard && workspaceId ? (
    <KeepAliveSlot active={panelView === 'calendar'} mounted={mountedViews.has('calendar')}>
      <ProjectScheduleCalendarPanel
        workspaceId={workspaceId}
        selectedProjectId={selectedProjectId}
      />
    </KeepAliveSlot>
  ) : null

  const timeEntriesPanel =
    workspaceId &&
    isConfigurableSidebarMenuKey(activeTab) &&
    isPmTimeEntriesDomain(activeTab) ? (
      <KeepAliveSlot
        active={panelView === 'time_entries'}
        mounted={mountedViews.has('time_entries')}>
        <ProjectTimeEntryPanel
          workspaceId={workspaceId}
          listDomain={
            activeTab === 'all_projects' ? undefined : resolvePmDatabaseListDomain(activeTab)
          }
        />
      </KeepAliveSlot>
    ) : null

  const reservedFallback =
    panelView !== 'stats' &&
    panelView !== 'agent' &&
    panelView !== 'files' &&
    panelView !== 'database' &&
    panelView !== 'gantt' &&
    panelView !== 'calendar' &&
    panelView !== 'time_entries' &&
    panelView !== 'resource_table' &&
    panelView !== 'cost_table' ? (
      <div className="tm-kb-file-panel-empty">
        <p>
          {isProgressScheduleView(panelView)
            ? t('projectManagerPage.panel.selectDashboardHint')
            : t(`projectManagerPage.panel.reserved.${panelView}`)}
        </p>
      </div>
    ) : null

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

  return (
    <main
      className={mainClassName}
      style={showAgentPanel ? agentContext?.messagePanelStyle : undefined}>
      <header className="tm-chat-header">
        <div className="tm-chat-breadcrumb">
          <span className="tm-model-pill tm-module-pill">{config.title}</span>
          <span className="tm-module-breadcrumb-group">
            <span className="tm-chat-breadcrumb-sep">/</span>
            <span className="tm-model-pill tm-module-pill tm-module-pill--secondary">
              {activeMenuLabel}
            </span>
          </span>
          {headerProjectSelect}
        </div>

        <div className="tm-chat-header-end">
          <ProjectManagerPanelToolbar
            activeTab={activeTab}
            activeView={toolbarActiveView}
            onSelectView={handleSelectView}
            onCreateProject={handleCreateProject}
          />
        </div>
      </header>

      {settingsOpen && settingsPanel ? settingsPanel : null}

      {canShowAgent && mountedViews.has('agent') && isConfigurableSidebarMenuKey(activeTab) ? (
        <AgentKeepAliveRoot active={showAgentPanel}>
          <ProjectManagementAgentPanel
            activeTab={activeTab}
            selectedProjectId={selectedProjectId}
            projects={projects}
            agentKickoffProject={agentKickoffProject}
            onAgentKickoffConsumed={handleAgentKickoffConsumed}
            onPlanApplied={handlePlanApplied}
            onProjectsChange={reloadProjectsAndDashboard}
            {...agentContext!}
          />
        </AgentKeepAliveRoot>
      ) : null}

      {showProgressDashboard && workspaceId && mountedViews.has('gantt') ? (
        <div
          className={[
            'tm-module-content',
            'tm-pm-gantt-content',
            showGanttPanel ? '' : 'tm-pm-view-hidden',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-hidden={!showGanttPanel}>
          <ProjectScheduleGanttPanel
            workspaceId={workspaceId}
            projects={projects}
            selectedProjectId={selectedProjectId}
            dataRevision={ganttDataRevision}
            onProjectsChange={reloadProjectsAndDashboard}
          />
        </div>
      ) : null}

      {workspaceId &&
      isConfigurableSidebarMenuKey(activeTab) &&
      isPmFilesDomain(activeTab) &&
      mountedViews.has('files') ? (
        <div
          className={[
            'tm-module-content',
            'tm-pm-gantt-content',
            showFeaturesPanel ? '' : 'tm-pm-view-hidden',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-hidden={!showFeaturesPanel}>
          {filesPanel}
        </div>
      ) : null}

      {activeTab === 'resource_management' &&
      workspaceId &&
      mountedViews.has('resource_table') ? (
        <div
          className={[
            'tm-module-content',
            'tm-pm-gantt-content',
            showResourceTablePanel ? '' : 'tm-pm-view-hidden',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-hidden={!showResourceTablePanel}>
          <ProjectResourceTablePanel
            workspaceId={workspaceId}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onProjectsChange={reloadProjectsAndDashboard}
          />
        </div>
      ) : null}

      {activeTab === 'cost_management' &&
      workspaceId &&
      mountedViews.has('cost_table') ? (
        <div
          className={[
            'tm-module-content',
            'tm-pm-gantt-content',
            showCostTablePanel ? '' : 'tm-pm-view-hidden',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-hidden={!showCostTablePanel}>
          <ProjectCostTablePanel
            workspaceId={workspaceId}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onProjectsChange={reloadProjectsAndDashboard}
          />
        </div>
      ) : null}

      {createProjectOpen && createProjectDefaults ? (
        <ProjectInfoDialog
          mode="create"
          createDefaults={createProjectDefaults}
          onClose={handleCreateProjectDialogClose}
          onSaved={handleCreateProjectSaved}
        />
      ) : null}

      <div
        className={[
          'tm-module-content',
          'tm-community-module-content',
          showAgentPanel || showGanttPanel || showResourceTablePanel || showCostTablePanel || showFeaturesPanel
            ? 'tm-pm-view-hidden'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-hidden={
          showAgentPanel || showGanttPanel || showResourceTablePanel || showCostTablePanel || showFeaturesPanel
        }>
        <ProjectManagerPanelShell
          title={activeMenuLabel}
          subtitle={panelSubtitle}
          showHeader={panelView === 'stats'}>
          <KeepAliveSlot active={panelView === 'stats'} mounted={mountedViews.has('stats')}>
            {statsPanel}
          </KeepAliveSlot>
          <KeepAliveSlot active={panelView === 'database'} mounted={mountedViews.has('database')}>
            {databasePanel}
          </KeepAliveSlot>
          {schedulePanels}
          {timeEntriesPanel}
          {reservedFallback}
        </ProjectManagerPanelShell>
      </div>

      {!showAgentPanel &&
      !showGanttPanel &&
      !showResourceTablePanel &&
      !showCostTablePanel &&
      !showFeaturesPanel ? (
        <ModulePageStatusBar />
      ) : null}
    </main>
  )
}

export default ProjectManagerPage

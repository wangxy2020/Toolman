import type { ReactNode } from 'react'
import { ModulePageStatusBar } from '../../components/ModulePageStatusBar'
import {
  ProjectManagementAgentPanel,
  type ProjectManagementAgentPanelProps,
} from './ProjectManagementAgentPanel'
import { ProjectManagerPanelShell } from './ProjectManagerPanelShell'
import { ProjectManagerPanelToolbar } from './ProjectManagerPanelToolbar'
import ProjectScheduleGanttPanel from './views/schedule/ProjectScheduleGanttPanel'
import ProjectInfoDialog from './views/schedule/ProjectInfoDialog'
import { isConfigurableSidebarMenuKey, type ProjectSidebarMenuTab } from './projectSidebarMenuConfig'
import { isPmFilesDomain } from './pm-domain-config'
import ProjectResourceTablePanel from './views/resource/ProjectResourceTablePanel'
import ProjectCostTablePanel from './views/cost/ProjectCostTablePanel'
import { AgentKeepAliveRoot, KeepAliveSlot } from './ProjectManagerKeepAlive'
import type { ProjectManagerPanelView } from './projectManagerPanelView'
import type { CreateDefaults } from './views/schedule/pm-project-info-dialog-utils'
import type { PmProject } from '@toolman/shared'

type AgentContext = Omit<
  ProjectManagementAgentPanelProps,
  'activeTab' | 'selectedProjectId'
> | null

type AgentKickoff = NonNullable<ProjectManagementAgentPanelProps['agentKickoffProject']> | null

export function ProjectManagerPageMain(props: {
  activeTab: ProjectSidebarMenuTab
  agentContext: AgentContext
  workspaceId: string | null
  configTitle: string
  activeMenuLabel: string
  panelSubtitle: string
  headerProjectSelect: ReactNode
  mainClassName: string
  showAgentPanel: boolean
  canShowAgent: boolean
  showGanttPanel: boolean
  showResourceTablePanel: boolean
  showCostTablePanel: boolean
  showFeaturesPanel: boolean
  showProgressDashboard: boolean
  settingsOpen: boolean
  settingsPanel: ReactNode
  panelView: ProjectManagerPanelView
  mountedViews: ReadonlySet<ProjectManagerPanelView>
  projects: PmProject[]
  selectedProjectId: string | null
  ganttDataRevision: number
  createProjectOpen: boolean
  createProjectDefaults: CreateDefaults | null
  agentKickoffProject: AgentKickoff
  toolbarActiveView: ProjectManagerPanelView
  filesPanel: ReactNode
  databasePanel: ReactNode
  statsPanel: ReactNode
  schedulePanels: ReactNode
  timeEntriesPanel: ReactNode
  reservedFallback: ReactNode
  reloadProjectsAndDashboard: () => void
  handleSelectView: (view: ProjectManagerPanelView) => void
  handleCreateProject: () => void
  handlePlanApplied: (projectId: string) => void
  handleCreateProjectSaved: (
    project: PmProject,
    options?: { manualCreate?: boolean },
  ) => void
  handleCreateProjectDialogClose: () => void
  handleAgentKickoffConsumed: () => void
}) {
  const {
    activeTab,
    agentContext,
    workspaceId,
    configTitle,
    activeMenuLabel,
    panelSubtitle,
    headerProjectSelect,
    mainClassName,
    showAgentPanel,
    canShowAgent,
    showGanttPanel,
    showResourceTablePanel,
    showCostTablePanel,
    showFeaturesPanel,
    showProgressDashboard,
    settingsOpen,
    settingsPanel,
    panelView,
    mountedViews,
    projects,
    selectedProjectId,
    ganttDataRevision,
    createProjectOpen,
    createProjectDefaults,
    agentKickoffProject,
    toolbarActiveView,
    filesPanel,
    databasePanel,
    statsPanel,
    schedulePanels,
    timeEntriesPanel,
    reservedFallback,
    reloadProjectsAndDashboard,
    handleSelectView,
    handleCreateProject,
    handlePlanApplied,
    handleCreateProjectSaved,
    handleCreateProjectDialogClose,
    handleAgentKickoffConsumed,
  } = props

  return (
    <main
      className={mainClassName}
      style={showAgentPanel ? agentContext?.messagePanelStyle : undefined}>
      <header className="tm-chat-header">
        <div className="tm-chat-breadcrumb">
          <span className="tm-model-pill tm-module-pill">{configTitle}</span>
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

      {activeTab === 'cost_management' && workspaceId && mountedViews.has('cost_table') ? (
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
          showAgentPanel ||
          showGanttPanel ||
          showResourceTablePanel ||
          showCostTablePanel ||
          showFeaturesPanel
            ? 'tm-pm-view-hidden'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-hidden={
          showAgentPanel ||
          showGanttPanel ||
          showResourceTablePanel ||
          showCostTablePanel ||
          showFeaturesPanel
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

import type { ReactNode } from 'react'
import type { ProjectManagementAgentPanelProps } from './ProjectManagementAgentPanel'
import ProjectManagementDashboard from './ProjectManagementDashboard'
import ProjectArchiveStatsPanel from './views/archive/ProjectArchiveStatsPanel'
import ProjectManagementFilesPanel from './views/files/ProjectManagementFilesPanel'
import ProjectKeyProjectsPanel from './views/key-projects/ProjectKeyProjectsPanel'
import ProjectManagementSettingsPanel from './views/settings/ProjectManagementSettingsPanel'
import ProjectScheduleCalendarPanel from './views/schedule/ProjectScheduleCalendarPanel'
import ProjectKanbanPanel from './views/kanban/ProjectKanbanPanel'
import ProjectVerticalDomainStatsPanel from './views/vertical/ProjectVerticalDomainStatsPanel'
import { isConfigurableSidebarMenuKey } from './projectSidebarMenuConfig'
import { isPmFilesDomain, isPmTimeEntriesDomain, resolvePmDatabaseListDomain } from './pm-domain-config'
import ProjectTimeEntryPanel from './views/time/ProjectTimeEntryPanel'
import ProjectResourceTablePanel from './views/resource/ProjectResourceTablePanel'
import ProjectCostTablePanel from './views/cost/ProjectCostTablePanel'
import { isProgressScheduleView, type ProjectManagerPanelView } from './projectManagerPanelView'
import { KeepAliveSlot } from './ProjectManagerKeepAlive'
import type { ProjectSidebarMenuTab } from './projectSidebarMenuConfig'
import type { PmProject } from '@toolman/shared'

type TFn = (key: string, vars?: Record<string, string>) => string

export function buildPmStatsPanel(options: {
  t: TFn
  workspaceId: string | null
  activeTab: ProjectSidebarMenuTab
  dashboardRefreshKey: number
  showWorkbench: boolean
  showUrgentTasks: boolean
  showCostDashboard: boolean
  showProgressDashboard: boolean
  showKeyProjects: boolean
  showVerticalStats: boolean
  showArchiveManagement: boolean
}): ReactNode {
  const {
    t,
    workspaceId,
    activeTab,
    dashboardRefreshKey,
    showWorkbench,
    showUrgentTasks,
    showCostDashboard,
    showProgressDashboard,
    showKeyProjects,
    showVerticalStats,
    showArchiveManagement,
  } = options

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
}

export function buildPmFilesPanel(options: {
  t: TFn
  workspaceId: string | null
  activeTab: ProjectSidebarMenuTab
  projects: PmProject[]
  selectedProjectId: string | null
  agentContext: Omit<ProjectManagementAgentPanelProps, 'activeTab' | 'selectedProjectId'> | null
  reloadProjectsAndDashboard: () => void
  openScheduleFromFeatures: (
    view: 'list' | 'gantt' | 'progressCheck' | 'resource' | 'cost',
  ) => void
}): ReactNode {
  const {
    t,
    workspaceId,
    activeTab,
    projects,
    selectedProjectId,
    agentContext,
    reloadProjectsAndDashboard,
    openScheduleFromFeatures,
  } = options

  if (
    workspaceId &&
    isConfigurableSidebarMenuKey(activeTab) &&
    isPmFilesDomain(activeTab)
  ) {
    if (activeTab === 'resource_management') {
      return (
        <ProjectResourceTablePanel
          workspaceId={workspaceId}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onProjectsChange={reloadProjectsAndDashboard}
          variant="practice"
          onOpenScheduleView={openScheduleFromFeatures}
        />
      )
    }
    if (activeTab === 'cost_management') {
      return (
        <ProjectCostTablePanel
          workspaceId={workspaceId}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onProjectsChange={reloadProjectsAndDashboard}
          variant="practice"
          onOpenScheduleView={openScheduleFromFeatures}
        />
      )
    }
    return (
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
  }
  return (
    <div className="tm-kb-file-panel-empty">
      <p>{t('projectManagerPage.panel.reserved.files')}</p>
    </div>
  )
}

export function buildPmSettingsPanel(options: {
  workspaceId: string | null
  activeTab: ProjectSidebarMenuTab
  onClose: () => void
  onProjectsChange: () => void
}): ReactNode {
  const { workspaceId, activeTab, onClose, onProjectsChange } = options
  if (!workspaceId || !isConfigurableSidebarMenuKey(activeTab)) return null
  return (
    <ProjectManagementSettingsPanel
      workspaceId={workspaceId}
      domain={activeTab}
      onClose={onClose}
      onProjectsChange={onProjectsChange}
    />
  )
}

export function buildPmSchedulePanels(options: {
  workspaceId: string | null
  showProgressDashboard: boolean
  panelView: ProjectManagerPanelView
  mountedViews: ReadonlySet<ProjectManagerPanelView>
  selectedProjectId: string | null
}): ReactNode {
  const { workspaceId, showProgressDashboard, panelView, mountedViews, selectedProjectId } = options
  if (!showProgressDashboard || !workspaceId) return null
  return (
    <KeepAliveSlot active={panelView === 'calendar'} mounted={mountedViews.has('calendar')}>
      <ProjectScheduleCalendarPanel
        workspaceId={workspaceId}
        selectedProjectId={selectedProjectId}
      />
    </KeepAliveSlot>
  )
}

export function buildPmTimeEntriesPanel(options: {
  workspaceId: string | null
  activeTab: ProjectSidebarMenuTab
  panelView: ProjectManagerPanelView
  mountedViews: ReadonlySet<ProjectManagerPanelView>
}): ReactNode {
  const { workspaceId, activeTab, panelView, mountedViews } = options
  if (
    !workspaceId ||
    !isConfigurableSidebarMenuKey(activeTab) ||
    !isPmTimeEntriesDomain(activeTab)
  ) {
    return null
  }
  return (
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
  )
}

export function buildPmReservedFallback(options: {
  t: TFn
  panelView: ProjectManagerPanelView
}): ReactNode {
  const { t, panelView } = options
  if (
    panelView === 'stats' ||
    panelView === 'agent' ||
    panelView === 'files' ||
    panelView === 'database' ||
    panelView === 'gantt' ||
    panelView === 'calendar' ||
    panelView === 'time_entries' ||
    panelView === 'resource_table' ||
    panelView === 'cost_table'
  ) {
    return null
  }
  return (
    <div className="tm-kb-file-panel-empty">
      <p>
        {isProgressScheduleView(panelView)
          ? t('projectManagerPage.panel.selectDashboardHint')
          : t(`projectManagerPage.panel.reserved.${panelView}`)}
      </p>
    </div>
  )
}

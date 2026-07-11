import { RotateCcw } from 'lucide-react'
import type { FC, ReactNode } from 'react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { PmDomain, PmProject } from '@toolman/shared'
import { nextDefaultPmProjectCode, nextDefaultPmProjectName } from '@toolman/shared'

import { CommunityPanelSecondaryButton } from '../community/CommunityPanelHeader'
import { ModulePageStatusBar } from '../../components/ModulePageStatusBar'
import { getModulePageConfig } from '../modules/module-config'
import { useI18n } from '../../i18n/useI18n'
import ProjectManagementDashboard from './ProjectManagementDashboard'
import {
  ProjectManagementAgentPanel,
  type ProjectManagementAgentPanelProps,
} from './ProjectManagementAgentPanel'
import { isProjectManagementAgentTab } from './projectManagementAgentLink'
import { ProjectManagerPanelShell } from './ProjectManagerPanelShell'
import { ProjectManagerPanelToolbar } from './ProjectManagerPanelToolbar'
import { PmHeaderProjectSelect } from './PmHeaderProjectSelect'
import { pmApi } from './pm-api'
import type { ProjectManagerPanelView } from './projectManagerPanelView'
import {
  isConfigurableSidebarMenuKey,
  PANEL_SUBTITLE_I18N_KEY,
  PROJECT_SIDEBAR_CUSTOM_TAB,
  SIDEBAR_MENU_I18N_KEY,
} from './projectSidebarMenuConfig'
import ProjectSidebarMenuSettings from './ProjectSidebarMenuSettings'
import { useProjectSidebarMenuPreferences } from './useProjectSidebarMenuPreferences'
import { clearPmPlanAppliedProject } from './ProjectPlanAgentApplyBar'
import ProjectArchiveStatsPanel from './views/archive/ProjectArchiveStatsPanel'
import ProjectManagementFilesPanel from './views/files/ProjectManagementFilesPanel'
import ProjectKeyProjectsPanel from './views/key-projects/ProjectKeyProjectsPanel'
import ProjectManagementSettingsPanel from './views/settings/ProjectManagementSettingsPanel'
import ProjectScheduleCalendarPanel from './views/schedule/ProjectScheduleCalendarPanel'
import ProjectScheduleGanttPanel from './views/schedule/ProjectScheduleGanttPanel'
import ProjectInfoDialog from './views/schedule/ProjectInfoDialog'
import ProjectKanbanPanel from './views/kanban/ProjectKanbanPanel'
import ProjectVerticalDomainStatsPanel from './views/vertical/ProjectVerticalDomainStatsPanel'
import { isProgressScheduleView } from './projectManagerPanelView'
import {
  isPmDatabaseDomain,
  isPmFilesDomain,
  isPmTimeEntriesDomain,
  isPmVerticalStatsDomain,
  resolvePmDatabaseListDomain,
} from './pm-domain-config'
import ProjectTimeEntryPanel from './views/time/ProjectTimeEntryPanel'

const HEADER_PROJECT_VIEWS = new Set<ProjectManagerPanelView>([
  'agent',
  'files',
  'database',
  'gantt',
  'calendar',
])

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
  const preferAllProjectsRef = useRef(false)

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
        return result.projects[0]?.id ?? null
      })
      return result.projects
    } catch {
      setProjects([])
      setSelectedProjectId(null)
      return []
    }
  }, [projectListDomain, workspaceId])

  useEffect(() => {
    void reloadProjects()
  }, [reloadProjects])

  useEffect(() => {
    setPanelView('stats')
    setSettingsOpen(false)
    setCreateProjectOpen(false)
    setCreateContinueWithAgent(false)
    setCreateProjectDefaults(null)
    setAgentKickoffProject(null)
    preferAllProjectsRef.current = false
    setMountedViews(new Set<ProjectManagerPanelView>(['stats']))
  }, [activeTab])

  const openAgentPanel = useCallback(() => {
    setSettingsOpen(false)
    setPanelView('agent')
    setMountedViews((prev) => {
      if (prev.has('agent')) return prev
      const next = new Set(prev)
      next.add('agent')
      return next
    })
  }, [])

  const handlePlanApplied = useCallback(
    (projectId: string) => {
      preferAllProjectsRef.current = false
      setAgentKickoffProject(null)
      setSettingsOpen(false)
      setPanelView('gantt')
      setMountedViews((prev) => {
        if (prev.has('gantt')) return prev
        const next = new Set(prev)
        next.add('gantt')
        return next
      })
      setGanttDataRevision((value) => value + 1)
      void reloadProjects().then((nextProjects) => {
        if (nextProjects.some((project) => project.id === projectId)) {
          setSelectedProjectId(projectId)
        } else if (workspaceId) {
          clearPmPlanAppliedProject(workspaceId, projectId)
          setSelectedProjectId(nextProjects[0]?.id ?? null)
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
    (project: PmProject) => {
      preferAllProjectsRef.current = false
      setSelectedProjectId(project.id)
      void reloadProjects().then(() => {
        setSelectedProjectId(project.id)
      })
      setGanttDataRevision((value) => value + 1)

      if (createContinueWithAgent && activeTab === 'progress_management') {
        setAgentKickoffProject(project)
        openAgentPanel()
      }
      setCreateContinueWithAgent(false)
    },
    [activeTab, createContinueWithAgent, openAgentPanel, reloadProjects],
  )

  const handleCreateProject = useCallback(() => {
    if (!workspaceId) return
    // Header +: project info dialog; plan management continues on agent after confirm.
    openCreateProjectDialog(activeTab === 'progress_management')
  }, [activeTab, openCreateProjectDialog, workspaceId])

  const showHeaderProject = !settingsOpen && HEADER_PROJECT_VIEWS.has(panelView)

  const headerProjectSelect = showHeaderProject ? (
    <PmHeaderProjectSelect
      projects={projects}
      value={selectedProjectId}
      onChange={(projectId) => {
        preferAllProjectsRef.current = projectId === null
        setSelectedProjectId(projectId)
      }}
      ariaLabel={t('projectManagerPage.database.project')}
    />
  ) : null

  const handleSelectView = (view: ProjectManagerPanelView) => {
    if (view === 'settings') {
      setSettingsOpen((open) => !open)
      return
    }
    setSettingsOpen(false)
    setPanelView(view)
    setMountedViews((prev) => {
      if (prev.has(view)) return prev
      const next = new Set(prev)
      next.add(view)
      return next
    })
  }

  const showAgentPanel =
    panelView === 'agent' &&
    isConfigurableSidebarMenuKey(activeTab) &&
    isProjectManagementAgentTab(activeTab) &&
    agentContext != null

  const canShowAgent =
    isConfigurableSidebarMenuKey(activeTab) &&
    isProjectManagementAgentTab(activeTab) &&
    agentContext != null

  const statsPanel = (() => {
    if (showWorkbench) {
      return (
        <ProjectManagementDashboard
          workspaceId={workspaceId ?? undefined}
          variant="progress"
          dedupeByCode
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
        />
      )
    }
    if (showProgressDashboard) {
      return (
        <ProjectManagementDashboard
          workspaceId={workspaceId ?? undefined}
          variant="progress"
          domain="progress_management"
        />
      )
    }
    if (showKeyProjects) {
      return <ProjectKeyProjectsPanel workspaceId={workspaceId ?? undefined} />
    }
    if (showVerticalStats && workspaceId) {
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
      <ProjectManagementFilesPanel
        workspaceId={workspaceId}
        workspace={agentContext?.workspace ?? null}
        systemPaths={agentContext?.systemPaths ?? null}
        projects={projects}
        selectedProjectId={selectedProjectId}
      />
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
        onClose={() => setSettingsOpen(false)}
        onProjectsChange={() => {
          void reloadProjects().then(() => {
            setGanttDataRevision((value) => value + 1)
          })
        }}
      />
    ) : null

  const showGanttPanel = panelView === 'gantt' && showProgressDashboard && workspaceId != null

  const toolbarActiveView: ProjectManagerPanelView = settingsOpen ? 'settings' : panelView

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
    panelView !== 'time_entries' ? (
      <div className="tm-kb-file-panel-empty">
        <p>
          {isProgressScheduleView(panelView)
            ? t('projectManagerPage.panel.selectDashboardHint')
            : t(`projectManagerPage.panel.reserved.${panelView}`)}
        </p>
      </div>
    ) : null

  const mainClassName = [
    'tm-main',
    'tm-project-manager-page',
    showAgentPanel && agentContext?.messageSettings.useSerifFont ? 'tm-main--serif' : '',
    showAgentPanel ? 'tm-project-manager-page--agent' : '',
  ]
    .filter(Boolean)
    .join(' ')

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

      {canShowAgent && mountedViews.has('agent') ? (
        <AgentKeepAliveRoot active={showAgentPanel}>
          <ProjectManagementAgentPanel
            activeTab={activeTab}
            selectedProjectId={selectedProjectId}
            projects={projects}
            agentKickoffProject={agentKickoffProject}
            onAgentKickoffConsumed={() => setAgentKickoffProject(null)}
            onPlanApplied={handlePlanApplied}
            onProjectsChange={async () => {
              await reloadProjects()
            }}
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
            onProjectsChange={async () => {
              await reloadProjects()
            }}
            onRequestNewProject={() => openCreateProjectDialog(false)}
          />
        </div>
      ) : null}

      {createProjectOpen && createProjectDefaults ? (
        <ProjectInfoDialog
          mode="create"
          createDefaults={createProjectDefaults}
          onClose={() => {
            setCreateProjectOpen(false)
            setCreateContinueWithAgent(false)
            setCreateProjectDefaults(null)
          }}
          onSaved={handleCreateProjectSaved}
        />
      ) : null}

      <div
        className={[
          'tm-module-content',
          'tm-community-module-content',
          showAgentPanel || showGanttPanel ? 'tm-pm-view-hidden' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-hidden={showAgentPanel || showGanttPanel}>
        <ProjectManagerPanelShell
          title={activeMenuLabel}
          subtitle={panelSubtitle}
          showHeader={panelView === 'stats'}>
          <KeepAliveSlot active={panelView === 'stats'} mounted={mountedViews.has('stats')}>
            {statsPanel}
          </KeepAliveSlot>
          <KeepAliveSlot active={panelView === 'files'} mounted={mountedViews.has('files')}>
            {filesPanel}
          </KeepAliveSlot>
          <KeepAliveSlot active={panelView === 'database'} mounted={mountedViews.has('database')}>
            {databasePanel}
          </KeepAliveSlot>
          {schedulePanels}
          {timeEntriesPanel}
          {reservedFallback}
        </ProjectManagerPanelShell>
      </div>

      {!showAgentPanel && !showGanttPanel ? <ModulePageStatusBar /> : null}
    </main>
  )
}

export default ProjectManagerPage

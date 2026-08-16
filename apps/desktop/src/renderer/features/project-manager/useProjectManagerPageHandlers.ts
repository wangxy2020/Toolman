import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'

import type { PmDomain, PmProject } from '@toolman/shared'
import { nextDefaultPmProjectCode, nextDefaultPmProjectName } from '@toolman/shared'

import type { ProjectManagerPanelView } from './projectManagerPanelView'
import type { ProjectSidebarMenuTab } from './projectSidebarMenuConfig'
import { clearPmPlanAppliedProject } from './ProjectPlanAgentApplyBar'
import { resolveDefaultProjectId, writeLastSelectedProjectId } from './pm-last-selected-project'
import { loadGanttUiPrefs, saveGanttUiPrefs } from './views/schedule/pm-gantt-prefs'
import {
  addToMountedViews,
  resolveCreateProjectDomain,
  resolveScheduleTargetView,
} from './pm-project-manager-page-utils'

export function useProjectManagerPageHandlers(options: {
  workspaceId: string | null
  activeTab: ProjectSidebarMenuTab
  projects: PmProject[]
  selectedProjectId: string | null
  setSelectedProjectId: Dispatch<SetStateAction<string | null>>
  preferAllProjectsRef: MutableRefObject<boolean>
  reloadProjects: () => Promise<PmProject[]>
  reloadProjectsAndDashboard: () => Promise<void>
  setGanttDataRevision: Dispatch<SetStateAction<number>>
  bumpDashboardRefresh: () => void
}) {
  const {
    workspaceId,
    activeTab,
    projects,
    selectedProjectId,
    setSelectedProjectId,
    preferAllProjectsRef,
    reloadProjects,
    reloadProjectsAndDashboard,
    setGanttDataRevision,
    bumpDashboardRefresh,
  } = options

  const [panelView, setPanelView] = useState<ProjectManagerPanelView>('stats')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mountedViews, setMountedViews] = useState<ReadonlySet<ProjectManagerPanelView>>(
    () => new Set<ProjectManagerPanelView>(['stats']),
  )
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

  useEffect(() => {
    setPanelView('stats')
    setSettingsOpen(false)
    setCreateProjectOpen(false)
    setCreateContinueWithAgent(false)
    setCreateProjectDefaults(null)
    setAgentKickoffProject(null)
    // Unmount heavy editors on sidebar switch. Catalog leave-save flushes on unmount
    // via usePmCatalogAutoSave — do not keep all tables alive (causes input lag).
    setMountedViews(new Set<ProjectManagerPanelView>(['stats']))
  }, [activeTab])

  const previousPanelViewRef = useRef(panelView)
  useEffect(() => {
    const previous = previousPanelViewRef.current
    previousPanelViewRef.current = panelView
    if (previous !== panelView && panelView === 'stats') {
      bumpDashboardRefresh()
    }
  }, [bumpDashboardRefresh, panelView])

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
    [
      preferAllProjectsRef,
      reloadProjects,
      setGanttDataRevision,
      setSelectedProjectId,
      workspaceId,
    ],
  )

  const openCreateProjectDialog = useCallback(
    (continueWithAgent: boolean) => {
      if (!workspaceId) return
      setCreateProjectDefaults({
        workspaceId,
        domain: resolveCreateProjectDomain(activeTab),
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
      preferAllProjectsRef,
      reloadProjectsAndDashboard,
      setGanttDataRevision,
      setSelectedProjectId,
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

  const handleHeaderProjectChange = useCallback(
    (projectId: string | null) => {
      preferAllProjectsRef.current = projectId === null
      if (projectId && workspaceId) {
        writeLastSelectedProjectId(workspaceId, projectId)
      }
      setSelectedProjectId(projectId)
    },
    [preferAllProjectsRef, setSelectedProjectId, workspaceId],
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
    [preferAllProjectsRef, projects, selectedProjectId, setSelectedProjectId, workspaceId],
  )

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
    [activeTab, preferAllProjectsRef, projects, selectedProjectId, setSelectedProjectId, workspaceId],
  )

  const handleSettingsPanelClose = useCallback(() => {
    setSettingsOpen(false)
  }, [])

  const handleSettingsPanelProjectsChange = useCallback(() => {
    void reloadProjectsAndDashboard().then(() => {
      setGanttDataRevision((value) => value + 1)
    })
  }, [reloadProjectsAndDashboard, setGanttDataRevision])

  const handleAgentKickoffConsumed = useCallback(() => {
    setAgentKickoffProject(null)
  }, [])

  return {
    panelView,
    settingsOpen,
    mountedViews,
    createProjectOpen,
    createProjectDefaults,
    agentKickoffProject,

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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { PmDomain, PmProject } from '@toolman/shared'

import { pmApi } from './pm-api'
import type { ProjectSidebarMenuTab } from './projectSidebarMenuConfig'
import { resolveDefaultProjectId } from './pm-last-selected-project'
import { resolveProjectListDomain } from './pm-project-manager-page-utils'

export function useProjectManagerPageProjects(options: {
  workspaceId: string | null
  activeTab: ProjectSidebarMenuTab
}) {
  const { workspaceId, activeTab } = options

  const [projects, setProjects] = useState<PmProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
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

  const projectListDomain = useMemo(
    (): PmDomain | undefined => resolveProjectListDomain(activeTab),
    [activeTab],
  )

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

  useEffect(() => {
    preferAllProjectsRef.current = activeTab === 'resource_management'
    if (activeTab === 'resource_management') {
      setSelectedProjectId(null)
    }
  }, [activeTab])

  return {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    preferAllProjectsRef,
    dashboardRefreshKey,
    ganttDataRevision,
    setGanttDataRevision,
    bumpDashboardRefresh,
    reloadProjects,
    reloadProjectsAndDashboard,
  }
}

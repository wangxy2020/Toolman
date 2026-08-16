import { useEffect, useMemo, useState } from 'react'
import type { PmProject, PmWorkItem } from '@toolman/shared'
import { pmApi } from '../../pm-api'
import {
  collectGanttCostSeeds,
  collectGanttFeatureSeeds,
  collectGanttNodeSeeds,
  collectGanttProcurementSeeds,
  buildResourceUnitLookup,
} from './pm-feature-gantt-rollup'
import { resolveAssignableResourceCatalog } from '../resource/pm-resource-catalog'
import { resolveProjectCostCatalog } from '../cost/pm-cost-catalog'

export function useProjectManagementFilesSeeds(args: {
  workspaceId: string
  projects: PmProject[]
  isAllScope: boolean
  editingProject: PmProject | null
  scopeKey: string
}) {
  const { workspaceId, projects, isAllScope, editingProject, scopeKey } = args
  const [workItems, setWorkItems] = useState<PmWorkItem[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        if (isAllScope) {
          const batches = await Promise.all(
            projects.map((project) =>
              pmApi.listWorkItems({
                workspaceId,
                projectId: project.id,
                domain: 'progress_management',
                limit: 1000,
              }),
            ),
          )
          if (cancelled) return
          setWorkItems(batches.flatMap((batch) => batch.items))
          return
        }
        if (!editingProject) {
          if (!cancelled) setWorkItems([])
          return
        }
        const result = await pmApi.listWorkItems({
          workspaceId,
          projectId: editingProject.id,
          domain: 'progress_management',
          limit: 1000,
        })
        if (!cancelled) setWorkItems(result.items)
      } catch {
        if (!cancelled) setWorkItems([])
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [editingProject, isAllScope, projects, scopeKey, workspaceId])

  const assignableResourceCatalog = useMemo(() => {
    if (isAllScope) {
      return projects.flatMap((project) =>
        resolveAssignableResourceCatalog(workspaceId, project.id, project.metadata),
      )
    }
    if (!editingProject) return []
    return resolveAssignableResourceCatalog(
      workspaceId,
      editingProject.id,
      editingProject.metadata,
    )
  }, [editingProject, isAllScope, projects, workspaceId])

  const unitLookup = useMemo(
    () => buildResourceUnitLookup(assignableResourceCatalog),
    [assignableResourceCatalog],
  )

  const costCatalog = useMemo(() => {
    if (isAllScope) {
      return resolveProjectCostCatalog(workspaceId, null).rows
    }
    if (!editingProject) return []
    return resolveProjectCostCatalog(workspaceId, editingProject.metadata).rows
  }, [editingProject, isAllScope, workspaceId])

  const ganttSeeds = useMemo(
    () => collectGanttFeatureSeeds(workItems, unitLookup, assignableResourceCatalog),
    [assignableResourceCatalog, unitLookup, workItems],
  )

  const costSeeds = useMemo(
    () => collectGanttCostSeeds(workItems, costCatalog),
    [costCatalog, workItems],
  )

  const procurementSeeds = useMemo(
    () => collectGanttProcurementSeeds(workItems, assignableResourceCatalog),
    [assignableResourceCatalog, workItems],
  )

  const nodeSeeds = useMemo(() => collectGanttNodeSeeds(workItems), [workItems])

  return { workItems, assignableResourceCatalog, unitLookup, costCatalog, ganttSeeds, costSeeds, procurementSeeds, nodeSeeds }
}

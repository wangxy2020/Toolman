import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  dedupeVersionBaselines,
  findDuplicateVersionBaselineIds,
  listUserBaselines,
  type PmProject,
  type PmScheduleBaseline,
  type PmWorkItem,
  type PmWorkItemRelation,
} from '@toolman/shared'

import { pmApi } from '../../pm-api'
import { resolveProjectCostCatalog, type PmCostRow } from '../cost/pm-cost-catalog'
import {
  ensureDefaultResourcesInCatalog,
  readSharedResourceCatalog,
  resolveAssignableResourceCatalog,
  sortResourceRowsByTypeMenu,
  writeSharedResourceCatalog,
  type PmResourceRow,
} from '../resource/pm-resource-catalog'
import { isSchedulableRelation } from './pm-gantt-schedule'
import { pmScheduleApi } from './pm-schedule-api'
import type { BaselineCompareMode } from './pm-gantt-baseline-compare'

export function useProjectScheduleGanttData(args: {
  workspaceId: string
  projects: PmProject[]
  selectedProjectId: string | null
  dataRevision: number
}) {
  const { workspaceId, projects, selectedProjectId, dataRevision } = args
  const [items, setItems] = useState<PmWorkItem[]>([])
  const [relations, setRelations] = useState<PmWorkItemRelation[]>([])
  const [baselines, setBaselines] = useState<PmScheduleBaseline[]>([])
  const [selectedBaselineId, setSelectedBaselineId] = useState<string | null>(null)
  const [baselineCompareMode, setBaselineCompareMode] = useState<BaselineCompareMode>('none')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hasDataRef = useRef(false)
  const itemsRef = useRef(items)
  const relationsRef = useRef(relations)
  itemsRef.current = items
  relationsRef.current = relations

  const loadProjectData = useCallback(
    async (
      projectId: string | null,
    ): Promise<{ items: PmWorkItem[]; relations: PmWorkItemRelation[] } | null> => {
      if (!projectId) {
        setItems([])
        setRelations([])
        setBaselines([])
        setSelectedBaselineId(null)
        return null
      }
      const [relationResult, itemResult] = await Promise.all([
        pmScheduleApi.listRelations(workspaceId, projectId),
        pmApi.listWorkItems({
          workspaceId,
          projectId,
          domain: 'progress_management',
          limit: 1000,
        }),
      ])
      setRelations(relationResult.relations)
      setItems(itemResult.items)

      let listedBaselines: PmScheduleBaseline[] = []
      try {
        const baselineResult = await pmScheduleApi.listBaselines(workspaceId, projectId)
        listedBaselines = baselineResult.baselines
      } catch {
        listedBaselines = []
      }

      // Soft-delete older duplicate version-plan snapshots only (not user baselines).
      const duplicateIds = findDuplicateVersionBaselineIds(listedBaselines)
      if (duplicateIds.length > 0) {
        await Promise.all(
          duplicateIds.map(async (id) => {
            try {
              await pmScheduleApi.deleteBaseline(id, { allowVersionPlan: true })
            } catch {
              // ignore; UI still dedupes below
            }
          }),
        )
        listedBaselines = listedBaselines.filter((entry) => !duplicateIds.includes(entry.id))
      }

      // Do NOT backfill missing version plan snapshots from the current plan — that makes
      // "switch to version N" a no-op and pollutes history with identical snapshots.

      listedBaselines = dedupeVersionBaselines(listedBaselines)
      setBaselines(listedBaselines)
      // Compare is opt-in: keep selection only if it still exists; never auto-pick.
      setSelectedBaselineId((currentId) => {
        if (
          currentId &&
          listUserBaselines(listedBaselines).some((entry) => entry.id === currentId)
        ) {
          return currentId
        }
        return null
      })
      return { items: itemResult.items, relations: relationResult.relations }
    },
    [workspaceId],
  )

  const reloadProjectData = useCallback(async () => {
    if (!hasDataRef.current) setLoading(true)
    setError(null)
    try {
      await loadProjectData(selectedProjectId)
      hasDataRef.current = true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [loadProjectData, selectedProjectId])


  useEffect(() => {
    hasDataRef.current = false
    void reloadProjectData()
  }, [reloadProjectData, dataRevision])

  useEffect(() => {
    setSelectedBaselineId(null)
    setBaselineCompareMode('none')
  }, [selectedProjectId])

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  const resourceCatalog = useMemo((): PmResourceRow[] => {
    if (!selectedProject) return []
    return resolveAssignableResourceCatalog(
      workspaceId,
      selectedProject.id,
      selectedProject.metadata,
      { projectCode: selectedProject.code },
    )
  }, [selectedProject, workspaceId])

  const costCatalog = useMemo((): PmCostRow[] => {
    if (!selectedProject) return []
    return resolveProjectCostCatalog(workspaceId, selectedProject.metadata).rows
  }, [selectedProject, workspaceId])

  const resourceColumnCatalog = useMemo((): PmResourceRow[] => {
    const shared = readSharedResourceCatalog(workspaceId)
    const ensured = ensureDefaultResourcesInCatalog(shared.rows)
    const ordered = sortResourceRowsByTypeMenu(ensured.rows)
    if (shared.isDefault || ensured.changed) {
      writeSharedResourceCatalog(workspaceId, ordered)
    }
    return ordered
  }, [workspaceId])


  /** Remove leftover ancestor↔descendant links (e.g. after older demotes) so CP stays consistent. */
  const prunedAncestorRelationsRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedProjectId || items.length === 0 || relations.length === 0) return
    const byId = new Map(items.map((entry) => [entry.id, entry]))
    const stale = relations.filter((relation) => !isSchedulableRelation(relation, byId))
    if (stale.length === 0) {
      prunedAncestorRelationsRef.current = selectedProjectId
      return
    }
    const key = `${selectedProjectId}:${stale
      .map((entry) => entry.id)
      .sort()
      .join(',')}`
    if (prunedAncestorRelationsRef.current === key) return
    prunedAncestorRelationsRef.current = key
    let cancelled = false
    void (async () => {
      try {
        await Promise.all(stale.map((relation) => pmScheduleApi.deleteRelation(relation.id)))
        if (!cancelled) await loadProjectData(selectedProjectId)
      } catch {
        prunedAncestorRelationsRef.current = null
      }
    })()
    return () => {
      cancelled = true
    }
  }, [items, loadProjectData, relations, selectedProjectId])

  const showLoadingPlaceholder = loading && !hasDataRef.current

  return {
    items,
    setItems,
    itemsRef,
    relations,
    setRelations,
    relationsRef,
    baselines,
    setBaselines,
    selectedBaselineId,
    setSelectedBaselineId,
    baselineCompareMode,
    setBaselineCompareMode,
    loading,
    error,
    showLoadingPlaceholder,
    hasDataRef,
    loadProjectData,
    reloadProjectData,
    selectedProject,
    resourceCatalog,
    costCatalog,
    resourceColumnCatalog,
  }
}

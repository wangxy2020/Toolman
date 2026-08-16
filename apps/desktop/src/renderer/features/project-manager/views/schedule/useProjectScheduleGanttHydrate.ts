import { useEffect, useRef } from 'react'

import type { PmWorkItem } from '@toolman/shared'

import { pmApi } from '../../pm-api'
import {
  hydrateTaskResourceAssignmentsAgainstCatalog,
  readTaskResourceAssignments,
  replaceTaskResourceAssignmentsMetadata,
} from './pm-gantt-resource-assignment'
import {
  hydrateTaskCostAssignmentsAgainstCatalog,
  readTaskCostAssignments,
  replaceTaskCostAssignmentsMetadata,
} from './pm-gantt-cost-assignment'
import type { PmResourceRow } from '../resource/pm-resource-catalog'
import type { PmCostRow } from '../cost/pm-cost-catalog'

export function useProjectScheduleGanttHydrate(args: {
  selectedProjectId: string | null
  items: PmWorkItem[]
  resourceCatalog: PmResourceRow[]
  costCatalog: PmCostRow[]
  loadProjectData: (projectId: string | null) => Promise<unknown>
}) {
  const { selectedProjectId, items, resourceCatalog, costCatalog, loadProjectData } = args
  /** Rewrite stale assignment types (e.g. 模板 still stored as material) to match resource list. */
  const assignmentHydrateKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedProjectId || items.length === 0 || resourceCatalog.length === 0) return
    const updates: Array<{ id: string; metadata: Record<string, unknown> }> = []
    for (const item of items) {
      if (item.type === 'milestone') continue
      const current = readTaskResourceAssignments(item.metadata)
      if (current.length === 0) continue
      const hydrated = hydrateTaskResourceAssignmentsAgainstCatalog(current, resourceCatalog)
      if (!hydrated.changed) continue
      updates.push({
        id: item.id,
        metadata: replaceTaskResourceAssignmentsMetadata(item.metadata, hydrated.assignments),
      })
    }
    if (updates.length === 0) {
      assignmentHydrateKeyRef.current = selectedProjectId
      return
    }
    const hydrateKey = `${selectedProjectId}:${updates.map((entry) => entry.id).join(',')}`
    if (assignmentHydrateKeyRef.current === hydrateKey) return
    assignmentHydrateKeyRef.current = hydrateKey
    let cancelled = false
    void (async () => {
      try {
        await Promise.all(
          updates.map((entry) =>
            pmApi.updateWorkItem({ id: entry.id, metadata: entry.metadata }),
          ),
        )
        if (!cancelled) await loadProjectData(selectedProjectId)
      } catch {
        assignmentHydrateKeyRef.current = null
      }
    })()
    return () => {
      cancelled = true
    }
  }, [items, loadProjectData, resourceCatalog, selectedProjectId])

  /** Bind legacy cost assignments (name-only) to price-list ids when possible. */
  const costAssignmentHydrateKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedProjectId || items.length === 0 || costCatalog.length === 0) return
    const updates: Array<{ id: string; metadata: Record<string, unknown> }> = []
    for (const item of items) {
      if (item.type === 'milestone') continue
      const current = readTaskCostAssignments(item.metadata)
      if (current.length === 0) continue
      const hydrated = hydrateTaskCostAssignmentsAgainstCatalog(current, costCatalog)
      if (!hydrated.changed) continue
      updates.push({
        id: item.id,
        metadata: replaceTaskCostAssignmentsMetadata(item.metadata, hydrated.assignments),
      })
    }
    if (updates.length === 0) {
      costAssignmentHydrateKeyRef.current = selectedProjectId
      return
    }
    const hydrateKey = `${selectedProjectId}:cost:${updates.map((entry) => entry.id).join(',')}`
    if (costAssignmentHydrateKeyRef.current === hydrateKey) return
    costAssignmentHydrateKeyRef.current = hydrateKey
    let cancelled = false
    void (async () => {
      try {
        await Promise.all(
          updates.map((entry) =>
            pmApi.updateWorkItem({ id: entry.id, metadata: entry.metadata }),
          ),
        )
        if (!cancelled) await loadProjectData(selectedProjectId)
      } catch {
        costAssignmentHydrateKeyRef.current = null
      }
    })()
    return () => {
      cancelled = true
    }
  }, [costCatalog, items, loadProjectData, selectedProjectId])

}

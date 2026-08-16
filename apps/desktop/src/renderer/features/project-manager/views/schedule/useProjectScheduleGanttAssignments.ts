import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'

import type { PmWorkItem } from '@toolman/shared'

import { pmApi } from '../../pm-api'
import {
  isEmptyAssignment,
  countResourceAssignmentsForTypeFilter,
  patchTaskResourceAssignmentMetadata,
  readTaskResourceAssignments,
  replaceTaskResourceAssignmentsMetadata,
  type TaskResourceAssignment,
} from './pm-gantt-resource-assignment'
import {
  isEmptyCostAssignment,
  countCostAssignmentsForTypeFilter,
  patchTaskCostAssignmentMetadata,
  readTaskCostAssignments,
  replaceTaskCostAssignmentsMetadata,
  type TaskCostAssignment,
} from './pm-gantt-cost-assignment'
import {
  buildDefaultResourceColumnBindings,
  DEFAULT_GANTT_COST_VIEW_PREFS,
  DEFAULT_GANTT_RESOURCE_VIEW_PREFS,
  resolveAssignViewSlotCount,
  saveGanttUiPrefs,
  type GanttUiPrefs,
} from './pm-gantt-prefs'
import { isGanttProjectRootId } from './pm-gantt-utils'

export function useProjectScheduleGanttAssignments(args: {
  selectedProjectId: string | null
  items: PmWorkItem[]
  setItems: Dispatch<SetStateAction<PmWorkItem[]>>
  uiPrefs: GanttUiPrefs
  setUiPrefs: Dispatch<SetStateAction<GanttUiPrefs>>
  loadProjectData: (projectId: string | null) => Promise<unknown>
  captureHistoryBeforeChange: () => void
}) {
  const {
    selectedProjectId,
    items,
    setItems,
    uiPrefs,
    setUiPrefs,
    loadProjectData,
    captureHistoryBeforeChange,
  } = args
  const [resourceSlotFloor, setResourceSlotFloor] = useState(
    DEFAULT_GANTT_RESOURCE_VIEW_PREFS.slotCount,
  )
  const [costSlotFloor, setCostSlotFloor] = useState(DEFAULT_GANTT_COST_VIEW_PREFS.slotCount)
  const assignSlotProjectRef = useRef<string | null>(selectedProjectId)

  useEffect(() => {
    if (assignSlotProjectRef.current === selectedProjectId) return
    assignSlotProjectRef.current = selectedProjectId
    setResourceSlotFloor(DEFAULT_GANTT_RESOURCE_VIEW_PREFS.slotCount)
    setCostSlotFloor(DEFAULT_GANTT_COST_VIEW_PREFS.slotCount)
  }, [selectedProjectId])

  /** Widest per-task assignment count — resource view must show at least this many columns. */
  const maxResourceAssignmentSlots = useMemo(() => {
    const typeFilter = uiPrefs.resourceView.typeFilter ?? 'all'
    let max = 0
    for (const item of items) {
      if (item.type === 'milestone') continue
      const count = countResourceAssignmentsForTypeFilter(
        readTaskResourceAssignments(item.metadata),
        typeFilter === 'all' ? 'all' : typeFilter,
      )
      if (count > max) max = count
    }
    return max
  }, [items, uiPrefs.resourceView.typeFilter])

  /** Widest per-task cost assignment count — cost view must show at least this many columns. */
  const maxCostAssignmentSlots = useMemo(() => {
    const typeFilter = uiPrefs.costView.typeFilter ?? 'all'
    let max = 0
    for (const item of items) {
      if (item.type === 'milestone') continue
      const count = countCostAssignmentsForTypeFilter(
        readTaskCostAssignments(item.metadata),
        typeFilter === 'all' ? 'all' : typeFilter,
      )
      if (count > max) max = count
    }
    return max
  }, [items, uiPrefs.costView.typeFilter])
  const ensureResourceViewSlotCount = useCallback((needed: number) => {
    const nextCount = resolveAssignViewSlotCount(
      needed,
      DEFAULT_GANTT_RESOURCE_VIEW_PREFS.slotCount,
    )
    setUiPrefs((current) => {
      if (nextCount <= current.resourceView.slotCount) return current
      const prevBindings = current.resourceView.columnBindings ?? []
      const next: GanttUiPrefs = {
        ...current,
        resourceView: {
          ...current.resourceView,
          slotCount: nextCount,
          columnBindings: buildDefaultResourceColumnBindings(nextCount).map(
            (binding, index) => prevBindings[index] ?? binding,
          ),
        },
      }
      saveGanttUiPrefs(next)
      return next
    })
  }, [])

  const ensureCostViewSlotCount = useCallback((needed: number) => {
    const nextCount = resolveAssignViewSlotCount(needed, DEFAULT_GANTT_COST_VIEW_PREFS.slotCount)
    setUiPrefs((current) => {
      if (nextCount <= current.costView.slotCount) return current
      const next: GanttUiPrefs = {
        ...current,
        costView: {
          ...current.costView,
          slotCount: nextCount,
        },
      }
      saveGanttUiPrefs(next)
      return next
    })
  }, [])

  useEffect(() => {
    if (uiPrefs.scheduleView !== 'resource') return
    if (maxResourceAssignmentSlots <= uiPrefs.resourceView.slotCount) return
    ensureResourceViewSlotCount(maxResourceAssignmentSlots)
  }, [
    ensureResourceViewSlotCount,
    maxResourceAssignmentSlots,
    uiPrefs.resourceView.slotCount,
    uiPrefs.scheduleView,
  ])

  useEffect(() => {
    if (uiPrefs.scheduleView !== 'cost') return
    if (maxCostAssignmentSlots <= uiPrefs.costView.slotCount) return
    ensureCostViewSlotCount(maxCostAssignmentSlots)
  }, [
    ensureCostViewSlotCount,
    maxCostAssignmentSlots,
    uiPrefs.costView.slotCount,
    uiPrefs.scheduleView,
  ])

  const handleAssignResource = useCallback(
    async (itemId: string, patch: Partial<TaskResourceAssignment>, slot = 0) => {
      if (!selectedProjectId || isGanttProjectRootId(itemId)) return
      // Summary / milestone tasks cannot be assigned resources.
      if (items.some((entry) => entry.parentId === itemId)) return
      const item = items.find((entry) => entry.id === itemId)
      if (!item || item.type === 'milestone') return
      // Patch the target slot only — do not auto-reorder other cells.
      const nextMeta = patchTaskResourceAssignmentMetadata(item.metadata, patch, slot)
      const nextList = readTaskResourceAssignments(nextMeta)
      captureHistoryBeforeChange()
      await pmApi.updateWorkItem({ id: itemId, metadata: nextMeta })
      ensureResourceViewSlotCount(nextList.filter((entry) => !isEmptyAssignment(entry)).length)
      await loadProjectData(selectedProjectId)
    },
    [captureHistoryBeforeChange, ensureResourceViewSlotCount, items, loadProjectData, selectedProjectId],
  )

  const handleReplaceResourceAssignments = useCallback(
    async (itemId: string, assignments: TaskResourceAssignment[]) => {
      if (!selectedProjectId || isGanttProjectRootId(itemId)) return
      if (items.some((entry) => entry.parentId === itemId)) return
      const item = items.find((entry) => entry.id === itemId)
      if (!item || item.type === 'milestone') return
      // Keep caller order (manual move / per-slot edits). No type/name auto-sort.
      const nextMeta = replaceTaskResourceAssignmentsMetadata(item.metadata, assignments)
      const nextList = readTaskResourceAssignments(nextMeta)
      captureHistoryBeforeChange()
      await pmApi.updateWorkItem({ id: itemId, metadata: nextMeta })
      ensureResourceViewSlotCount(nextList.length)
      await loadProjectData(selectedProjectId)
    },
    [captureHistoryBeforeChange, ensureResourceViewSlotCount, items, loadProjectData, selectedProjectId],
  )

  const handleReplaceCostAssignments = useCallback(
    async (itemId: string, assignments: TaskCostAssignment[]) => {
      if (!selectedProjectId || isGanttProjectRootId(itemId)) return
      if (items.some((entry) => entry.parentId === itemId)) return
      const item = items.find((entry) => entry.id === itemId)
      if (!item || item.type === 'milestone') return
      const nextMeta = replaceTaskCostAssignmentsMetadata(item.metadata, assignments)
      const nextList = readTaskCostAssignments(nextMeta)
      captureHistoryBeforeChange()
      // Optimistic UI so 金额 appears immediately after picking a price-list name.
      setItems((current) =>
        current.map((entry) => (entry.id === itemId ? { ...entry, metadata: nextMeta } : entry)),
      )
      ensureCostViewSlotCount(nextList.length)
      await pmApi.updateWorkItem({ id: itemId, metadata: nextMeta })
      await loadProjectData(selectedProjectId)
    },
    [captureHistoryBeforeChange, ensureCostViewSlotCount, items, loadProjectData, selectedProjectId],
  )

  const handleAssignCost = useCallback(
    async (itemId: string, patch: Partial<TaskCostAssignment>, slot = 0) => {
      if (!selectedProjectId || isGanttProjectRootId(itemId)) return
      if (items.some((entry) => entry.parentId === itemId)) return
      const item = items.find((entry) => entry.id === itemId)
      if (!item || item.type === 'milestone') return
      const nextMeta = patchTaskCostAssignmentMetadata(item.metadata, patch, slot)
      const nextList = readTaskCostAssignments(nextMeta)
      captureHistoryBeforeChange()
      setItems((current) =>
        current.map((entry) => (entry.id === itemId ? { ...entry, metadata: nextMeta } : entry)),
      )
      ensureCostViewSlotCount(nextList.filter((entry) => !isEmptyCostAssignment(entry)).length)
      await pmApi.updateWorkItem({ id: itemId, metadata: nextMeta })
      await loadProjectData(selectedProjectId)
    },
    [captureHistoryBeforeChange, ensureCostViewSlotCount, items, loadProjectData, selectedProjectId],
  )

  return {
    resourceSlotFloor,
    setResourceSlotFloor,
    costSlotFloor,
    setCostSlotFloor,
    maxResourceAssignmentSlots,
    maxCostAssignmentSlots,
    handleAssignResource,
    handleReplaceResourceAssignments,
    handleReplaceCostAssignments,
    handleAssignCost,
  }
}

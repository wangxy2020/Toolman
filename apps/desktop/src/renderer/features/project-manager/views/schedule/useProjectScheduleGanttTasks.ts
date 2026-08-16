import { useCallback, type MutableRefObject } from 'react'

import type { PmWorkItem, PmWorkItemRelation } from '@toolman/shared'

import { useI18n } from '../../../../i18n/useI18n'
import { pmApi } from '../../pm-api'
import { findDemoteParentId, flattenPmWorkItemForestCollapsed, type GanttTreeRow } from './pm-gantt-tree'
import { GANTT_MAX_DEPTH } from './pm-gantt-prefs'
import { isGanttProjectRootId } from './pm-gantt-utils'
import { isSchedulableRelation, startOfLocalDay } from './pm-gantt-schedule'
import { pmScheduleApi } from './pm-schedule-api'

export function useProjectScheduleGanttTasks(args: {
  workspaceId: string
  selectedProjectId: string | null
  items: PmWorkItem[]
  relations: PmWorkItemRelation[]
  forest: Parameters<typeof flattenPmWorkItemForestCollapsed>[0]
  rowNumberById: Map<string, number>
  treeRows: GanttTreeRow[]
  selectedItem: PmWorkItem | null
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  checkedIds: ReadonlySet<string>
  setCheckedIds: import('react').Dispatch<import('react').SetStateAction<ReadonlySet<string>>>
  setPendingDeleteSelected: (open: boolean) => void
  captureHistoryBeforeChange: () => void
  loadProjectData: (projectId: string | null) => Promise<unknown>
  lastScheduleFingerprintRef: MutableRefObject<string>
  t: ReturnType<typeof useI18n>['t']
}) {
  const {
    workspaceId, selectedProjectId, items, relations, forest, rowNumberById, treeRows,
    selectedItem, selectedId, setSelectedId, checkedIds, setCheckedIds, setPendingDeleteSelected,
    captureHistoryBeforeChange, loadProjectData, lastScheduleFingerprintRef, t,
  } = args

  const handleCreateTask = async (afterId: string | null) => {
    if (!selectedProjectId) return
    const afterAfterRoot = isGanttProjectRootId(afterId) ? null : afterId
    const after = afterAfterRoot ? items.find((item) => item.id === afterAfterRoot) : null
    const parentId = after?.parentId
    const insertSortOrder = (after?.sortOrder ?? items.length) + 1

    captureHistoryBeforeChange()
    if (after) {
      const siblingsToShift = items
        .filter(
          (item) =>
            (item.parentId ?? null) === (parentId ?? null) && item.sortOrder >= insertSortOrder,
        )
        .sort((left, right) => right.sortOrder - left.sortOrder)
      for (const sibling of siblingsToShift) {
        await pmApi.updateWorkItem({ id: sibling.id, sortOrder: sibling.sortOrder + 1 })
      }
    }

    const created = await pmApi.createWorkItem({
      workspaceId,
      projectId: selectedProjectId,
      parentId,
      title: t('projectManagerPage.schedule.newTaskTitle'),
      domain: 'progress_management',
      type: 'task',
      sortOrder: insertSortOrder,
      startDate: Date.now(),
      dueDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
    })
    setSelectedId(created.id)
    await loadProjectData(selectedProjectId)
  }

  const handleInsertTask = async () => {
    const afterId = selectedId ?? treeRows[treeRows.length - 1]?.item.id ?? null
    await handleCreateTask(isGanttProjectRootId(afterId) ? null : afterId)
  }

  const handleDeleteTask = async () => {
    if (!selectedId || !selectedProjectId || isGanttProjectRootId(selectedId)) return
    captureHistoryBeforeChange()
    await pmApi.deleteWorkItem(selectedId)
    setSelectedId(null)
    setCheckedIds((prev) => {
      if (!prev.has(selectedId)) return prev
      const next = new Set(prev)
      next.delete(selectedId)
      return next
    })
    await loadProjectData(selectedProjectId)
  }
  const handleSelectAllRows = useCallback(() => {
    setCheckedIds(
      new Set(treeRows.map((row) => row.item.id).filter((id) => !isGanttProjectRootId(id))),
    )
  }, [treeRows])
  const handleDeleteSelectedRows = useCallback(async () => {
    if (!selectedProjectId || checkedIds.size === 0) return
    const ids = [...checkedIds].filter((id) => !isGanttProjectRootId(id))
    captureHistoryBeforeChange()
    for (const id of ids) {
      try {
        await pmApi.deleteWorkItem(id)
      } catch {
        // continue deleting others
      }
    }
    setCheckedIds(new Set())
    setPendingDeleteSelected(false)
    if (selectedId && ids.includes(selectedId)) setSelectedId(null)
    await loadProjectData(selectedProjectId)
  }, [captureHistoryBeforeChange, checkedIds, loadProjectData, selectedId, selectedProjectId])

  const requestDeleteSelectedRows = useCallback(() => {
    if (!selectedProjectId || checkedIds.size === 0) return
    setPendingDeleteSelected(true)
  }, [checkedIds.size, selectedProjectId])

  const handleIndent = async () => {
    if (!selectedId || !selectedProjectId || isGanttProjectRootId(selectedId)) return
    // Use full (uncollapsed) outline so 降级 follows outline level, not visible rows.
    const fullRows = flattenPmWorkItemForestCollapsed(forest, new Set(), rowNumberById)
    const fullIndex = fullRows.findIndex((row) => row.item.id === selectedId)
    // Project summary row occupies depth 0; allow one extra level so WBS depth is unchanged.
    const parentId = findDemoteParentId(fullRows, fullIndex, GANTT_MAX_DEPTH + 1)
    if (!parentId || isGanttProjectRootId(parentId)) return
    captureHistoryBeforeChange()
    await pmApi.updateWorkItem({ id: selectedId, parentId })

    // Drop predecessor links that become ancestor↔descendant after demote (e.g. FS
    // from the new parent). Keeping them desyncs schedule vs critical path.
    const nextById = new Map(
      items.map((entry) => [
        entry.id,
        entry.id === selectedId ? { ...entry, parentId } : entry,
      ]),
    )
    const staleRelations = relations.filter((relation) => !isSchedulableRelation(relation, nextById))
    if (staleRelations.length > 0) {
      await Promise.all(staleRelations.map((relation) => pmScheduleApi.deleteRelation(relation.id)))
    }

    lastScheduleFingerprintRef.current = ''
    await loadProjectData(selectedProjectId)
  }

  const handleOutdent = async () => {
    if (!selectedItem?.parentId || !selectedProjectId || isGanttProjectRootId(selectedItem.id)) {
      return
    }
    captureHistoryBeforeChange()
    if (isGanttProjectRootId(selectedItem.parentId)) {
      await pmApi.updateWorkItem({ id: selectedItem.id, parentId: null })
    } else {
      const parent = items.find((item) => item.id === selectedItem.parentId)
      await pmApi.updateWorkItem({
        id: selectedItem.id,
        parentId: parent?.parentId ?? null,
      })
    }
    lastScheduleFingerprintRef.current = ''
    await loadProjectData(selectedProjectId)
  }

  const handleSetTaskType = async (type: 'task' | 'milestone') => {
    if (!selectedId || !selectedProjectId || isGanttProjectRootId(selectedId)) return
    const item = items.find((entry) => entry.id === selectedId)
    if (!item) return
    if (items.some((entry) => entry.parentId === selectedId)) return
    const patch: { id: string; type: 'task' | 'milestone'; startDate?: number; dueDate?: number } = {
      id: selectedId,
      type,
    }
    if (type === 'milestone') {
      const day = startOfLocalDay(item.startDate ?? item.dueDate ?? Date.now())
      patch.startDate = day
      patch.dueDate = day
    }
    captureHistoryBeforeChange()
    await pmApi.updateWorkItem(patch)
    await loadProjectData(selectedProjectId)
  }

  const handleMove = async (direction: -1 | 1) => {
    if (!selectedItem || !selectedProjectId || isGanttProjectRootId(selectedItem.id)) return
    const parentKey = isGanttProjectRootId(selectedItem.parentId)
      ? null
      : (selectedItem.parentId ?? null)
    const siblings = items
      .filter((item) => (item.parentId ?? null) === parentKey)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const index = siblings.findIndex((item) => item.id === selectedItem.id)
    const swapWith = siblings[index + direction]
    if (!swapWith || index < 0) return
    captureHistoryBeforeChange()
    await Promise.all([
      pmApi.updateWorkItem({ id: selectedItem.id, sortOrder: swapWith.sortOrder }),
      pmApi.updateWorkItem({ id: swapWith.id, sortOrder: selectedItem.sortOrder }),
    ])
    await loadProjectData(selectedProjectId)
  }

  return {
    handleCreateTask,
    handleInsertTask,
    handleDeleteTask,
    handleSelectAllRows,
    handleDeleteSelectedRows,
    requestDeleteSelectedRows,
    handleIndent,
    handleOutdent,
    handleSetTaskType,
    handleMove,
  }
}

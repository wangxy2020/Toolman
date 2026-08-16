import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react'

import type { PmWorkItem, PmWorkItemRelation } from '@toolman/shared'

import { isPmEditableEventTarget, isPmPanelDomActive } from '../../pm-editable-dom'
import { applyGanttHistorySnapshot, cloneGanttSnapshot, GanttHistoryStack } from './pm-gantt-history'
import {
  collectScheduleUpdates,
  scheduleWorkItems,
} from './pm-gantt-schedule'
import { buildScheduleUpdateFingerprint } from './pm-schedule-gantt-panel-utils'
import { pmApi } from '../../pm-api'

export function useProjectScheduleGanttHistory(args: {
  workspaceId: string
  selectedProjectId: string | null
  dataRevision: number
  items: PmWorkItem[]
  relations: PmWorkItemRelation[]
  itemsRef: MutableRefObject<PmWorkItem[]>
  relationsRef: MutableRefObject<PmWorkItemRelation[]>
  loadProjectData: (
    projectId: string | null,
  ) => Promise<{ items: PmWorkItem[]; relations: PmWorkItemRelation[] } | null>
  panelRootRef: RefObject<HTMLDivElement | null>
  projectInfoOpen: boolean
  pendingDeleteSelected: boolean
  pendingRestoreBaselineId: string | null
}) {
  const {
    workspaceId,
    selectedProjectId,
    dataRevision,
    items,
    relations,
    itemsRef,
    relationsRef,
    loadProjectData,
    panelRootRef,
    projectInfoOpen,
    pendingDeleteSelected,
    pendingRestoreBaselineId,
  } = args
  const [freezeStoredSchedule, setFreezeStoredSchedule] = useState(false)
  const [historyEpoch, setHistoryEpoch] = useState(0)
  const historyStackRef = useRef(new GanttHistoryStack())
  const historyApplyingRef = useRef(false)
  const scheduleSyncingRef = useRef(false)
  const pendingRescheduleRef = useRef(false)
  const suppressAutoScheduleRef = useRef(false)
  const lastScheduleFingerprintRef = useRef('')

  useEffect(() => {
    historyStackRef.current.clear()
    setHistoryEpoch((value) => value + 1)
  }, [dataRevision])

  useEffect(() => {
    setFreezeStoredSchedule(false)
    suppressAutoScheduleRef.current = false
    lastScheduleFingerprintRef.current = ''
    historyStackRef.current.clear()
    setHistoryEpoch((value) => value + 1)
  }, [selectedProjectId])

  const canUndo = historyEpoch >= 0 && historyStackRef.current.canUndo
  const canRedo = historyEpoch >= 0 && historyStackRef.current.canRedo

  const captureHistoryBeforeChange = useCallback(() => {
    if (historyApplyingRef.current) return
    historyStackRef.current.pushBeforeChange(
      cloneGanttSnapshot(itemsRef.current, relationsRef.current),
    )
    setHistoryEpoch((value) => value + 1)
  }, [])

  const applyHistoryTarget = useCallback(
    async (target: ReturnType<typeof cloneGanttSnapshot>) => {
      if (!selectedProjectId) return
      historyApplyingRef.current = true
      suppressAutoScheduleRef.current = true
      setFreezeStoredSchedule(true)
      try {
        await applyGanttHistorySnapshot(
          workspaceId,
          selectedProjectId,
          cloneGanttSnapshot(itemsRef.current, relationsRef.current),
          target,
        )
        lastScheduleFingerprintRef.current = ''
        await loadProjectData(selectedProjectId)
      } finally {
        historyApplyingRef.current = false
        setHistoryEpoch((value) => value + 1)
      }
    },
    [loadProjectData, selectedProjectId, workspaceId],
  )

  const handleUndo = useCallback(async () => {
    if (!selectedProjectId || !historyStackRef.current.canUndo) return
    const current = cloneGanttSnapshot(itemsRef.current, relationsRef.current)
    const previous = historyStackRef.current.popUndo(current)
    if (!previous) return
    setHistoryEpoch((value) => value + 1)
    try {
      await applyHistoryTarget(previous)
    } catch (err) {
      historyStackRef.current.revertFailedUndo(previous)
      setHistoryEpoch((value) => value + 1)
      window.alert(err instanceof Error ? err.message : String(err))
    }
  }, [applyHistoryTarget, selectedProjectId])

  const handleRedo = useCallback(async () => {
    if (!selectedProjectId || !historyStackRef.current.canRedo) return
    const current = cloneGanttSnapshot(itemsRef.current, relationsRef.current)
    const next = historyStackRef.current.popRedo(current)
    if (!next) return
    setHistoryEpoch((value) => value + 1)
    try {
      await applyHistoryTarget(next)
    } catch (err) {
      historyStackRef.current.revertFailedRedo(next)
      setHistoryEpoch((value) => value + 1)
      window.alert(err instanceof Error ? err.message : String(err))
    }
  }, [applyHistoryTarget, selectedProjectId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPmPanelDomActive(panelRootRef.current)) return
      if (projectInfoOpen || pendingDeleteSelected || pendingRestoreBaselineId) return
      if (isPmEditableEventTarget(event.target)) return
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        void handleUndo()
        return
      }
      if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault()
        void handleRedo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    handleRedo,
    handleUndo,
    pendingDeleteSelected,
    pendingRestoreBaselineId,
    projectInfoOpen,
  ])
  const persistAutoSchedule = useCallback(
    async (snapshot?: { items: PmWorkItem[]; relations: PmWorkItemRelation[] }) => {
      if (!selectedProjectId) return
      if (scheduleSyncingRef.current) {
        pendingRescheduleRef.current = true
        return
      }
      scheduleSyncingRef.current = true
      let sourceItems = snapshot?.items ?? items
      let sourceRelations = snapshot?.relations ?? relations
      const maxIterations = 8
      try {
        for (let iteration = 0; iteration < maxIterations; iteration += 1) {
          pendingRescheduleRef.current = false
          const next = scheduleWorkItems(sourceItems, sourceRelations)
          const updates = collectScheduleUpdates(sourceItems, next)
          if (updates.length === 0) break
          const fingerprint = buildScheduleUpdateFingerprint(updates)
          if (fingerprint === lastScheduleFingerprintRef.current) break
          lastScheduleFingerprintRef.current = fingerprint
          await Promise.all(
            updates.map((update) =>
              pmApi.updateWorkItem({
                id: update.id,
                startDate: update.startDate,
                dueDate: update.dueDate,
              }),
            ),
          )
          const loaded = await loadProjectData(selectedProjectId)
          if (!loaded) break
          sourceItems = loaded.items
          sourceRelations = loaded.relations
          if (!pendingRescheduleRef.current) break
        }
      } finally {
        scheduleSyncingRef.current = false
      }
      if (pendingRescheduleRef.current) {
        queueMicrotask(() => {
          void persistAutoSchedule()
        })
      }
    },
    [items, loadProjectData, relations, selectedProjectId],
  )

  useEffect(() => {
    if (!selectedProjectId || items.length === 0) return
    if (suppressAutoScheduleRef.current) {
      // Accept restored (or just-loaded) dates: remember what auto-schedule would
      // change, but do not write — otherwise version switch is immediately undone.
      const updates = collectScheduleUpdates(items, scheduleWorkItems(items, relations))
      lastScheduleFingerprintRef.current =
        updates.length > 0 ? buildScheduleUpdateFingerprint(updates) : ''
      suppressAutoScheduleRef.current = false
      return
    }
    if (scheduleSyncingRef.current) {
      pendingRescheduleRef.current = true
      return
    }
    const updates = collectScheduleUpdates(items, scheduleWorkItems(items, relations))
    if (updates.length === 0) return
    const fingerprint = buildScheduleUpdateFingerprint(updates)
    if (fingerprint === lastScheduleFingerprintRef.current) return
    void persistAutoSchedule()
  }, [items, persistAutoSchedule, relations, selectedProjectId])

  return {
    freezeStoredSchedule,
    setFreezeStoredSchedule,
    canUndo,
    canRedo,
    captureHistoryBeforeChange,
    applyHistoryTarget,
    handleUndo,
    handleRedo,
    persistAutoSchedule,
    suppressAutoScheduleRef,
    lastScheduleFingerprintRef,
    historyApplyingRef,
  }
}

import { flushSync } from 'react-dom'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

import type { PmScheduleBaseline, PmWorkItem, PmWorkItemRelation } from '@toolman/shared'

import { pmApi } from '../../pm-api'
import {
  ACTUAL_FINISH_META_KEY,
  ACTUAL_START_META_KEY,
  customColumnMetaKey,
  isGanttBuiltinColumn,
  isGanttCustomColumnId,
  SHOULD_PERCENT_META_KEY,
} from './pm-gantt-prefs'
import {
  finishFromStartDuration,
  isGanttProjectRootId,
  parseDateInput,
  parseDurationDaysInput,
  workItemDurationDays,
} from './pm-gantt-utils'
import { isSchedulableRelation, startOfLocalDay } from './pm-gantt-schedule'
import { parsePredecessors } from './pm-predecessor-utils'
import { collectProgressRollupUpdates } from './pm-gantt-progress-rollup'
import { patchBaselineWorkItemProgress } from './pm-gantt-baseline-compare'
import { setOrDeleteMetaKey } from './pm-schedule-gantt-panel-utils'
import { pmScheduleApi } from './pm-schedule-api'

type Loaded = { items: PmWorkItem[]; relations: PmWorkItemRelation[] }

export function useProjectScheduleGanttCommit(args: {
  workspaceId: string
  selectedProjectId: string | null
  items: PmWorkItem[]
  setItems: Dispatch<SetStateAction<PmWorkItem[]>>
  itemsRef: MutableRefObject<PmWorkItem[]>
  relations: PmWorkItemRelation[]
  setBaselines: Dispatch<SetStateAction<PmScheduleBaseline[]>>
  displayById: Map<string, PmWorkItem>
  idByIndex: Map<number, string>
  baselineByItemId: Map<string, { startDate?: number; dueDate?: number; progressPercent?: number }>
  showBaselineVariance: boolean
  selectedBaselineId: string | null
  captureHistoryBeforeChange: () => void
  setFreezeStoredSchedule: Dispatch<SetStateAction<boolean>>
  loadProjectData: (projectId: string | null) => Promise<Loaded | null>
  persistAutoSchedule: (snapshot?: Loaded) => Promise<void>
}) {
  const {
    workspaceId, selectedProjectId, items, setItems, itemsRef, relations, setBaselines,
    displayById, idByIndex, baselineByItemId, showBaselineVariance, selectedBaselineId,
    captureHistoryBeforeChange, setFreezeStoredSchedule, loadProjectData, persistAutoSchedule,
  } = args

  const handleCommitCell = async (itemId: string, field: string, rawValue: string) => {
    if (!selectedProjectId || isGanttProjectRootId(itemId)) return
    const item = items.find((entry) => entry.id === itemId)
    if (!item) return

    if (
      field === 'duration' ||
      field === 'start' ||
      field === 'finish' ||
      field === 'predecessors'
    ) {
      setFreezeStoredSchedule(false)
    }

    if (field === 'spacer') return

    if (isGanttCustomColumnId(field) || !isGanttBuiltinColumn(field)) {
      const key = customColumnMetaKey(field)
      const nextMeta = { ...item.metadata, [key]: rawValue.trim() }
      captureHistoryBeforeChange()
      await pmApi.updateWorkItem({ id: itemId, metadata: nextMeta })
      await loadProjectData(selectedProjectId)
      return
    }

    const hasPredecessors = relations.some((relation) => relation.toWorkItemId === itemId)

    switch (field) {
      case 'name': {
        const title = rawValue.trim()
        if (!title || title === item.title) return
        captureHistoryBeforeChange()
        await pmApi.updateWorkItem({ id: itemId, title })
        break
      }
      case 'duration': {
        const days = parseDurationDaysInput(rawValue)
        if (days == null) return
        const startMs = startOfLocalDay(
          displayById.get(itemId)?.startDate ?? item.startDate ?? Date.now(),
        )
        captureHistoryBeforeChange()
        if (days === 0) {
          await pmApi.updateWorkItem({
            id: itemId,
            type: 'milestone',
            startDate: startMs,
            dueDate: startMs,
          })
        } else {
          await pmApi.updateWorkItem({
            id: itemId,
            type: item.type === 'milestone' ? 'task' : item.type,
            startDate: startMs,
            dueDate: finishFromStartDuration(startMs, days),
          })
        }
        break
      }
      case 'start': {
        if (hasPredecessors) return
        const startMs = parseDateInput(rawValue)
        if (!startMs) return
        const days = workItemDurationDays(displayById.get(itemId) ?? item)
        captureHistoryBeforeChange()
        await pmApi.updateWorkItem({
          id: itemId,
          startDate: startMs,
          dueDate: finishFromStartDuration(startMs, days),
        })
        break
      }
      case 'finish': {
        const finishMs = parseDateInput(rawValue)
        if (!finishMs) return
        captureHistoryBeforeChange()
        if (hasPredecessors) {
          const startMs = startOfLocalDay(
            displayById.get(itemId)?.startDate ?? item.startDate ?? finishMs,
          )
          const days = Math.max(1, Math.round((finishMs - startMs) / (24 * 60 * 60 * 1000)) + 1)
          await pmApi.updateWorkItem({
            id: itemId,
            startDate: startMs,
            dueDate: finishFromStartDuration(startMs, days),
          })
        } else {
          const startMs = startOfLocalDay(
            item.startDate ?? finishMs - workItemDurationDays(item) * 24 * 60 * 60 * 1000,
          )
          await pmApi.updateWorkItem({
            id: itemId,
            startDate: Math.min(startMs, finishMs),
            dueDate: finishMs,
          })
        }
        break
      }
      case 'predecessors': {
        const tokens = parsePredecessors(rawValue)
        const existing = relations.filter((relation) => relation.toWorkItemId === itemId)
        captureHistoryBeforeChange()
        for (const relation of existing) {
          await pmScheduleApi.deleteRelation(relation.id)
        }
        const byId = new Map(items.map((entry) => [entry.id, entry]))
        for (const token of tokens) {
          const fromId = idByIndex.get(token.index)
          if (!fromId || fromId === itemId) continue
          if (!isSchedulableRelation({ fromWorkItemId: fromId, toWorkItemId: itemId }, byId)) {
            continue
          }
          await pmScheduleApi.createRelation({
            workspaceId,
            projectId: selectedProjectId,
            fromWorkItemId: fromId,
            toWorkItemId: itemId,
            type: token.type,
            lagDays: token.lagDays,
          })
        }
        break
      }
      case 'actualStart': {
        const startMs = parseDateInput(rawValue)
        const nextMeta = setOrDeleteMetaKey(item.metadata, ACTUAL_START_META_KEY, startMs)
        captureHistoryBeforeChange()
        await pmApi.updateWorkItem({ id: itemId, metadata: nextMeta })
        break
      }
      case 'actualFinish': {
        const finishMs = parseDateInput(rawValue)
        const nextMeta = setOrDeleteMetaKey(item.metadata, ACTUAL_FINISH_META_KEY, finishMs)
        captureHistoryBeforeChange()
        await pmApi.updateWorkItem({ id: itemId, metadata: nextMeta })
        break
      }
      case 'percentComplete': {
        const digits = rawValue.replace(/[^\d]/g, '')
        if (!digits) return
        if (items.some((entry) => entry.parentId === itemId)) return
        const progressPercent = Math.min(100, Math.max(0, Number.parseInt(digits, 10)))
        captureHistoryBeforeChange()
        const baselineIdForProgress =
          showBaselineVariance && selectedBaselineId ? selectedBaselineId : null
        // While comparing, roll up parents from baseline snapshot actuals (not live siblings).
        const rollupSourceItems = itemsRef.current.map((entry) => {
          if (entry.id === itemId) return { ...entry, progressPercent }
          if (!baselineIdForProgress) return entry
          const fromSnap = baselineByItemId.get(entry.id)?.progressPercent
          return typeof fromSnap === 'number' && Number.isFinite(fromSnap)
            ? { ...entry, progressPercent: fromSnap }
            : entry
        })
        const rollups = collectProgressRollupUpdates(rollupSourceItems)
        // Live schedule keeps leaf + parent rollups; baseline snapshot gets the same patch.
        const liveItems = itemsRef.current.map((entry) => {
          if (entry.id === itemId) return { ...entry, progressPercent }
          const rolled = rollups.find((update) => update.id === entry.id)
          return rolled ? { ...entry, progressPercent: rolled.progressPercent } : entry
        })
        const workItemProgress = [
          { workItemId: itemId, progressPercent },
          ...rollups.map((update) => ({
            workItemId: update.id,
            progressPercent: update.progressPercent,
          })),
        ]
        // Flush before any await so cancelEdit (called right after onCommitCell)
        // does not flash the old snapshot 0% while IPC is in flight.
        flushSync(() => {
          setItems(liveItems)
          if (baselineIdForProgress) {
            setBaselines((prev) =>
              patchBaselineWorkItemProgress(prev, baselineIdForProgress, workItemProgress),
            )
          }
        })
        await pmApi.updateWorkItem({ id: itemId, progressPercent })
        if (rollups.length > 0) {
          await Promise.all(
            rollups.map((update) =>
              pmApi.updateWorkItem({
                id: update.id,
                progressPercent: update.progressPercent,
              }),
            ),
          )
        }
        let baselinePersistOk = !baselineIdForProgress
        if (baselineIdForProgress) {
          try {
            const updated = await pmScheduleApi.updateBaseline(baselineIdForProgress, {
              workItemProgress,
            })
            setBaselines((prev) =>
              patchBaselineWorkItemProgress(
                prev.map((entry) => (entry.id === updated.id ? updated : entry)),
                baselineIdForProgress,
                workItemProgress,
              ),
            )
            baselinePersistOk = true
          } catch (err) {
            window.alert(err instanceof Error ? err.message : String(err))
            baselinePersistOk = false
          }
        }
        const loaded = await loadProjectData(selectedProjectId)
        // Re-apply only after a successful persist (guards against stale listBaselines).
        // On failure, keep the reloaded DB snapshot so UI matches disk.
        if (baselineIdForProgress && baselinePersistOk) {
          setBaselines((prev) =>
            patchBaselineWorkItemProgress(prev, baselineIdForProgress, workItemProgress),
          )
        }
        if (loaded) await persistAutoSchedule(loaded)
        return
      }
      case 'variance':
        // Read-only computed column.
        return
      case 'shouldPercentComplete': {
        const digits = rawValue.replace(/[^\d]/g, '')
        const nextMeta = setOrDeleteMetaKey(
          item.metadata,
          SHOULD_PERCENT_META_KEY,
          digits ? Math.min(100, Math.max(0, Number.parseInt(digits, 10))) : null,
        )
        captureHistoryBeforeChange()
        await pmApi.updateWorkItem({ id: itemId, metadata: nextMeta })
        break
      }
      default:
        return
    }
    const loaded = await loadProjectData(selectedProjectId)
    if (loaded) await persistAutoSchedule(loaded)
  }

  return { handleCommitCell }
}

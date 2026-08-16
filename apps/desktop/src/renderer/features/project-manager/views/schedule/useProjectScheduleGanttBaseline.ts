import { useCallback, useEffect, useRef, useState } from 'react'

import { listUserBaselines, type PmScheduleBaseline, type PmWorkItem } from '@toolman/shared'

import { useI18n } from '../../../../i18n/useI18n'
import { pmApi } from '../../pm-api'
import { SHOULD_PERCENT_META_KEY, type GanttUiPrefs } from './pm-gantt-prefs'
import {
  plannedProgressAtDate,
  suggestBaselineAsOfDate,
  type BaselineCompareMode,
} from './pm-gantt-baseline-compare'
import { formatWorkItemDate, parseDateInput } from './pm-gantt-utils'
import { startOfLocalDay } from './pm-gantt-schedule'
import { pmScheduleApi } from './pm-schedule-api'

export function useProjectScheduleGanttBaseline(args: {
  workspaceId: string
  selectedProjectId: string | null
  itemsRef: import('react').MutableRefObject<PmWorkItem[]>
  baselines: PmScheduleBaseline[]
  selectedBaselineId: string | null
  setSelectedBaselineId: (id: string | null) => void
  setBaselineCompareMode: (mode: BaselineCompareMode) => void
  loadProjectData: (projectId: string | null) => Promise<unknown>
  loading: boolean
  uiPrefs: GanttUiPrefs
  t: ReturnType<typeof useI18n>['t']
}) {
  const {
    workspaceId, selectedProjectId, itemsRef, baselines, selectedBaselineId,
    setSelectedBaselineId, setBaselineCompareMode, loadProjectData, loading, uiPrefs, t,
  } = args
  const [captureBaselineOpen, setCaptureBaselineOpen] = useState(false)
  const [editBaselineOpen, setEditBaselineOpen] = useState(false)

  useEffect(() => {
    setCaptureBaselineOpen(false)
    setEditBaselineOpen(false)
  }, [selectedProjectId])

  /** Defaults for 进度检查: Gantt compare + latest user baseline (no version restore). */
  const applyProgressCheckDefaults = useCallback(() => {
    if (!selectedProjectId) return
    setBaselineCompareMode('gantt')
    const users = listUserBaselines(baselines)
    const latestBaseline = [...users].sort(
      (a, b) => (b.snapshot.capturedAt ?? b.createdAt) - (a.snapshot.capturedAt ?? a.createdAt),
    )[0]
    setSelectedBaselineId(latestBaseline?.id ?? null)
  }, [baselines, selectedProjectId])

  const progressCheckSetupKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (uiPrefs.scheduleView !== 'progressCheck' || loading || !selectedProjectId) {
      if (uiPrefs.scheduleView !== 'progressCheck') {
        // Leaving 进度检查: restore baseline menu to 不对比 (defaults are only for that view).
        if (progressCheckSetupKeyRef.current != null) {
          setBaselineCompareMode('none')
          setSelectedBaselineId(null)
        }
        progressCheckSetupKeyRef.current = null
      }
      return
    }
    const key = `${selectedProjectId}:progressCheck`
    if (progressCheckSetupKeyRef.current === key) return
    progressCheckSetupKeyRef.current = key
    applyProgressCheckDefaults()
  }, [applyProgressCheckDefaults, loading, selectedProjectId, uiPrefs.scheduleView])
  const handleCaptureBaselineConfirm = useCallback(
    ({ name, asOfDate }: { name: string; asOfDate: string }) => {
      setCaptureBaselineOpen(false)
      if (!selectedProjectId) return
      void (async () => {
        try {
          const created = await pmScheduleApi.createBaseline(workspaceId, selectedProjectId, {
            name,
            asOfDate,
          })
          const asOfMs = parseDateInput(asOfDate)
          let leafCount = 0
          let zeroCount = 0
          let minStart: number | null = null
          if (asOfMs != null) {
            const currentItems = itemsRef.current
            const childIds = new Set(
              currentItems.map((item) => item.parentId).filter((id): id is string => Boolean(id)),
            )
            await Promise.all(
              currentItems.map((item) => {
                const should = Math.round(
                  plannedProgressAtDate(item.startDate, item.dueDate, asOfMs),
                )
                if (item.startDate != null) {
                  const start = startOfLocalDay(item.startDate)
                  minStart = minStart == null ? start : Math.min(minStart, start)
                }
                if (!childIds.has(item.id) && item.type !== 'milestone') {
                  leafCount += 1
                  if (should === 0) zeroCount += 1
                }
                const prev = item.metadata?.[SHOULD_PERCENT_META_KEY]
                if (prev === should) return Promise.resolve()
                return pmApi.updateWorkItem({
                  id: item.id,
                  metadata: {
                    ...item.metadata,
                    [SHOULD_PERCENT_META_KEY]: should,
                  },
                })
              }),
            )
          }
          await loadProjectData(selectedProjectId)
          setSelectedBaselineId(created.id)
          setBaselineCompareMode('gantt')
          if (
            asOfMs != null &&
            leafCount > 0 &&
            zeroCount === leafCount &&
            minStart != null &&
            asOfMs <= minStart
          ) {
            window.alert(
              t('projectManagerPage.schedule.baselineCapture.allZeroHint', {
                name,
                asOfDate,
                suggestDate: formatWorkItemDate(suggestBaselineAsOfDate(itemsRef.current)),
              }),
            )
          }
        } catch (err) {
          window.alert(err instanceof Error ? err.message : String(err))
        }
      })()
    },
    [loadProjectData, selectedProjectId, t, workspaceId],
  )

  const handleEditBaselineConfirm = useCallback(
    ({ name, asOfDate }: { name: string; asOfDate: string }) => {
      setEditBaselineOpen(false)
      if (!selectedBaselineId || !selectedProjectId) return
      void (async () => {
        try {
          await pmScheduleApi.updateBaseline(selectedBaselineId, { name, asOfDate })
          const asOfMs = parseDateInput(asOfDate)
          if (asOfMs != null) {
            const currentItems = itemsRef.current
            await Promise.all(
              currentItems.map((item) => {
                const should = Math.round(
                  plannedProgressAtDate(item.startDate, item.dueDate, asOfMs),
                )
                const prev = item.metadata?.[SHOULD_PERCENT_META_KEY]
                if (prev === should) return Promise.resolve()
                return pmApi.updateWorkItem({
                  id: item.id,
                  metadata: {
                    ...item.metadata,
                    [SHOULD_PERCENT_META_KEY]: should,
                  },
                })
              }),
            )
          }
          await loadProjectData(selectedProjectId)
        } catch (err) {
          window.alert(err instanceof Error ? err.message : String(err))
        }
      })()
    },
    [loadProjectData, selectedBaselineId, selectedProjectId],
  )

  return {
    captureBaselineOpen,
    setCaptureBaselineOpen,
    editBaselineOpen,
    setEditBaselineOpen,
    applyProgressCheckDefaults,
    handleCaptureBaselineConfirm,
    handleEditBaselineConfirm,
  }
}

import { useEffect, type Dispatch, type SetStateAction } from 'react'
import {
  computeScheduleTotalDurationDays,
  parseVersionPlanSnapshotName,
  PM_SAVE_HISTORY_KEY,
  readLastSavedAt,
  readSaveHistory,
  readScheduleVersion,
  removeSaveHistoryEntry,
  type PmScheduleSaveRecord,
} from '@toolman/shared'
import { pmApi } from '../../pm-api'
import { pmScheduleApi } from './pm-schedule-api'
import type { Props } from './pm-project-info-dialog-utils'
import type { PmProject, PmWorkItem } from '@toolman/shared'

export function useProjectInfoDialogSchedule(args: {
  project: PmProject | null
  workItems: PmWorkItem[]
  isResourceInfo: boolean
  isCostInfo: boolean
  isFeaturesInfo: boolean
  isWorkspaceResource: boolean
  props: Props
  t: (key: string, vars?: Record<string, string>) => string
  setScheduleHistoryRows: Dispatch<SetStateAction<PmScheduleSaveRecord[]>>
  setScheduleVersion: Dispatch<SetStateAction<number>>
  setLastSavedAt: Dispatch<SetStateAction<number | null>>
  setDeletingHistoryVersion: Dispatch<SetStateAction<number | null>>
  setError: Dispatch<SetStateAction<string | null>>
}) {
  const {
    project,
    workItems,
    isResourceInfo,
    isCostInfo,
    isFeaturesInfo,
    isWorkspaceResource,
    props,
    t,
    setScheduleHistoryRows,
    setScheduleVersion,
    setLastSavedAt,
    setDeletingHistoryVersion,
    setError,
  } = args

  // Backfill missing totalDurationDays from live items / version baselines.
  useEffect(() => {
    if (!project || isResourceInfo || isCostInfo || isFeaturesInfo) return
    let cancelled = false

    const run = async () => {
      const baseHistory = readSaveHistory(project.metadata)
      if (baseHistory.length === 0) return

      const currentVersion = readScheduleVersion(project.metadata)
      const liveDuration = computeScheduleTotalDurationDays(workItems)
      const durationByVersion = new Map<number, number>()
      if (currentVersion > 0 && liveDuration != null) {
        durationByVersion.set(currentVersion, liveDuration)
      }

      try {
        const { baselines } = await pmScheduleApi.listBaselines(
          project.workspaceId,
          project.id,
        )
        for (const baseline of baselines) {
          const version = parseVersionPlanSnapshotName(baseline.name)
          if (version == null || durationByVersion.has(version)) continue
          const days = computeScheduleTotalDurationDays(baseline.snapshot.workItems)
          if (days != null) durationByVersion.set(version, days)
        }
      } catch {
        // Display whatever we can from live items.
      }

      if (cancelled || durationByVersion.size === 0) return

      let changed = false
      const enriched = baseHistory.map((entry) => {
        if (entry.totalDurationDays != null) return entry
        const days = durationByVersion.get(entry.version)
        if (days == null) return entry
        changed = true
        return { ...entry, totalDurationDays: days }
      })
      if (!changed) return

      setScheduleHistoryRows(enriched)
      try {
        await pmApi.updateProject({
          id: project.id,
          metadata: { [PM_SAVE_HISTORY_KEY]: enriched },
        })
      } catch {
        // UI already shows enriched rows for this session.
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [project, workItems, isResourceInfo, isCostInfo, isFeaturesInfo, setScheduleHistoryRows])

  const handleDeleteScheduleHistoryEntry = async (entry: PmScheduleSaveRecord) => {
    if (!project) return
    const confirmed = window.confirm(
      t('projectManagerPage.projectInfo.saveHistoryDeleteConfirm', {
        version: String(entry.version),
      }),
    )
    if (!confirmed) return

    setDeletingHistoryVersion(entry.version)
    setError(null)
    try {
      const nextMeta = removeSaveHistoryEntry(project.metadata ?? {}, entry.version)
      const updated = await pmApi.updateProject({
        id: project.id,
        metadata: nextMeta,
      })

      try {
        const { baselines } = await pmScheduleApi.listBaselines(
          project.workspaceId,
          project.id,
        )
        for (const baseline of baselines) {
          if (parseVersionPlanSnapshotName(baseline.name) === entry.version) {
            await pmScheduleApi.deleteBaseline(baseline.id, { allowVersionPlan: true })
          }
        }
      } catch {
        // history delete already succeeded
      }

      setScheduleHistoryRows(readSaveHistory(updated.metadata))
      setScheduleVersion(readScheduleVersion(updated.metadata))
      setLastSavedAt(readLastSavedAt(updated.metadata))
      if (!isWorkspaceResource) props.onSaved?.(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeletingHistoryVersion(null)
    }
  }

  return { handleDeleteScheduleHistoryEntry }
}

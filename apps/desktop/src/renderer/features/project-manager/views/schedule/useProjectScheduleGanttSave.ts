import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react'

import {
  buildScheduleSaveMetadata,
  computeScheduleTotalDurationDays,
  PM_PENDING_AGENT_REVISION_KEY,
  parseVersionPlanSnapshotName,
  readPendingAgentScheduleRevision,
  readScheduleVersion,
  versionPlanSnapshotName,
  type PmProject,
  type PmScheduleBaseline,
  type PmWorkItem,
} from '@toolman/shared'

import { useI18n } from '../../../../i18n/useI18n'
import {
  clearSessionPendingAgentRevision,
  hasSessionPendingAgentRevision,
} from '../../pm-pending-revision'
import { pmApi } from '../../pm-api'
import { usePmStatusFeedback } from '../../usePmStatusFeedback'
import { pmScheduleApi } from './pm-schedule-api'

export function useProjectScheduleGanttSave(args: {
  workspaceId: string
  selectedProjectId: string | null
  selectedProject: PmProject | null
  items: PmWorkItem[]
  baselines: PmScheduleBaseline[]
  freezeStoredSchedule: boolean
  persistAutoSchedule: () => Promise<void>
  loadProjectData: (projectId: string | null) => Promise<unknown>
  onProjectsChange?: () => void | Promise<void>
  setFreezeStoredSchedule: (v: boolean) => void
  suppressAutoScheduleRef: import('react').MutableRefObject<boolean>
  lastScheduleFingerprintRef: import('react').MutableRefObject<string>
  setSelectedBaselineId: (id: string | null) => void
  setStatusFeedback: ReturnType<typeof usePmStatusFeedback>[1]
  t: ReturnType<typeof useI18n>['t']
  pendingRestoreBaselineId: string | null
  setPendingRestoreBaselineId: Dispatch<SetStateAction<string | null>>
}) {
  const {
    workspaceId, selectedProjectId, selectedProject, items, baselines, freezeStoredSchedule,
    persistAutoSchedule, loadProjectData, onProjectsChange, setFreezeStoredSchedule,
    suppressAutoScheduleRef, lastScheduleFingerprintRef, setSelectedBaselineId, setStatusFeedback, t,
    pendingRestoreBaselineId, setPendingRestoreBaselineId,
  } = args

  const handleScheduleSave = useCallback(
    async (options?: { asNewVersion?: boolean; note?: string }) => {
      if (!selectedProjectId || !selectedProject) return
      const asNewVersion = options?.asNewVersion === true
      try {
        // While frozen on a restored version, do not re-drive dates from live relations
        // before snapshotting — that would overwrite the version being saved.
        if (!freezeStoredSchedule) {
          await persistAutoSchedule()
        }

        // Prefer fresh project metadata — list prop can lag behind agent apply.
        let prevMeta: Record<string, unknown> = { ...(selectedProject.metadata ?? {}) }
        try {
          const fresh = await pmApi.getProject(selectedProjectId)
          prevMeta = { ...(fresh.metadata ?? {}) }
        } catch {
          // fall back to list prop metadata
        }

        const sessionPending = hasSessionPendingAgentRevision(workspaceId, selectedProjectId)
        // Session only fills the gap until fresh metadata reflects the DB pending flag.
        if (sessionPending && !readPendingAgentScheduleRevision(prevMeta)) {
          prevMeta = { ...prevMeta, [PM_PENDING_AGENT_REVISION_KEY]: true }
        }

        const prevVersion = readScheduleVersion(prevMeta)
        // 「保存」= update current (first save still creates v1). 「另存新版本」= bump.
        const bumpVersion = asNewVersion ? true : false
        const totalDurationDays = computeScheduleTotalDurationDays(items) ?? undefined
        const note = options?.note?.trim() || undefined
        const nextMeta = buildScheduleSaveMetadata(prevMeta, {
          workItemCount: items.length,
          ...(totalDurationDays != null ? { totalDurationDays } : {}),
          bumpVersion,
          ...(note ? { note } : {}),
        })
        const updated = await pmApi.updateProject({
          id: selectedProjectId,
          metadata: nextMeta,
        })
        clearSessionPendingAgentRevision(workspaceId, selectedProjectId)

        const version = readScheduleVersion(updated.metadata ?? nextMeta)
        const createdNewVersion = version > prevVersion
        if (version > 0) {
          // Persist the version's plan snapshot for version switch (not a user baseline).
          try {
            await pmScheduleApi.createBaseline(workspaceId, selectedProjectId, {
              name: versionPlanSnapshotName(version),
            })
          } catch (err) {
            window.alert(
              t('projectManagerPage.schedule.versionBaselineCreateFailed', {
                detail: err instanceof Error ? err.message : String(err),
              }),
            )
          }
        }

        setFreezeStoredSchedule(false)
        suppressAutoScheduleRef.current = false
        lastScheduleFingerprintRef.current = ''
        await onProjectsChange?.()
        await loadProjectData(selectedProjectId)
        if (createdNewVersion) {
          setStatusFeedback({
            tone: 'success',
            text: t('projectManagerPage.schedule.saveSuccessNewVersion', {
              version: String(version),
            }),
          })
        } else if (version > 0) {
          setStatusFeedback({
            tone: 'success',
            text: t('projectManagerPage.schedule.saveSuccessUpdated', {
              version: String(version),
            }),
          })
        } else {
          setStatusFeedback({
            tone: 'success',
            text: t('projectManagerPage.schedule.saveSuccess'),
          })
        }
      } catch (err) {
        window.alert(err instanceof Error ? err.message : String(err))
      }
    },
    [
      freezeStoredSchedule,
      items,
      loadProjectData,
      onProjectsChange,
      persistAutoSchedule,
      selectedProject,
      selectedProjectId,
      setStatusFeedback,
      t,
      workspaceId,
    ],
  )

  const pendingRestoreBaseline = useMemo(
    () =>
      pendingRestoreBaselineId
        ? (baselines.find((entry) => entry.id === pendingRestoreBaselineId) ?? null)
        : null,
    [baselines, pendingRestoreBaselineId],
  )

  const pendingRestoreDisplayName = useMemo(() => {
    if (!pendingRestoreBaseline) return ''
    const version = parseVersionPlanSnapshotName(pendingRestoreBaseline.name)
    if (version != null) {
      return t('projectManagerPage.schedule.versionBaselineName', {
        version: String(version),
      })
    }
    return pendingRestoreBaseline.name
  }, [pendingRestoreBaseline, t])

  const handleConfirmRestoreBaseline = useCallback(async () => {
    if (!pendingRestoreBaselineId || !selectedProjectId) return
    try {
      const result = await pmScheduleApi.restoreBaseline(pendingRestoreBaselineId)
      setPendingRestoreBaselineId(null)
      // Clear compare overlay so restored bars aren't confused with ghost baselines.
      setSelectedBaselineId(null)
      clearSessionPendingAgentRevision(workspaceId, selectedProjectId)
      // Prevent auto-schedule from rewriting restored dates/relations on next load.
      suppressAutoScheduleRef.current = true
      lastScheduleFingerprintRef.current = ''
      setFreezeStoredSchedule(true)
      await onProjectsChange?.()
      await loadProjectData(selectedProjectId)
      const restoredVersion = result.scheduleVersion
      const restoredName =
        restoredVersion != null
          ? t('projectManagerPage.schedule.versionBaselineName', {
              version: String(restoredVersion),
            })
          : result.baselineName
      window.alert(
        t('projectManagerPage.schedule.restoreBaselineSuccess', {
          name: restoredName,
          updated: String(result.changedCount),
          missing: String(result.missingCount),
        }),
      )
    } catch (err) {
      setPendingRestoreBaselineId(null)
      window.alert(err instanceof Error ? err.message : String(err))
    }
  }, [loadProjectData, onProjectsChange, pendingRestoreBaselineId, selectedProjectId, t, workspaceId])

  return {
    pendingRestoreBaseline,
    pendingRestoreDisplayName,
    handleScheduleSave,
    handleConfirmRestoreBaseline,
  }
}

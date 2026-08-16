import type { Dispatch, SetStateAction } from 'react'
import {
  readFeatureLastSavedAt,
  readFeatureSaveHistory,
  readFeatureVersion,
  removeFeatureSaveHistoryEntry,
  type PmFeatureSaveRecord,
} from '@toolman/shared'
import { pmApi } from '../../pm-api'
import {
  readSharedFeatureLastSavedAt,
  readSharedFeatureSaveHistory,
  readSharedFeatureVersion,
  removeSharedFeatureSaveHistoryEntry,
} from '../files/pm-features-catalog'
import type { Props } from './pm-project-info-dialog-utils'
import type { PmProject } from '@toolman/shared'

export function useProjectInfoDialogFeatures(args: {
  project: PmProject | null
  props: Props
  isWorkspaceFeatures: boolean
  workspaceFeaturesId: string | null
  t: (key: string, vars?: Record<string, string>) => string
  setFeatureHistoryRows: Dispatch<SetStateAction<PmFeatureSaveRecord[]>>
  setFeatureVersion: Dispatch<SetStateAction<number>>
  setLastSavedAt: Dispatch<SetStateAction<number | null>>
  setDeletingHistoryVersion: Dispatch<SetStateAction<number | null>>
  setError: Dispatch<SetStateAction<string | null>>
}) {
  const {
    project,
    props,
    isWorkspaceFeatures,
    workspaceFeaturesId,
    t,
    setFeatureHistoryRows,
    setFeatureVersion,
    setLastSavedAt,
    setDeletingHistoryVersion,
    setError,
  } = args

  const reloadWorkspaceFeaturesHistory = () => {
    if (!workspaceFeaturesId) return
    setFeatureHistoryRows(readSharedFeatureSaveHistory(workspaceFeaturesId))
    setFeatureVersion(readSharedFeatureVersion(workspaceFeaturesId))
    setLastSavedAt(readSharedFeatureLastSavedAt(workspaceFeaturesId))
  }

  const handleDeleteFeatureHistoryEntry = async (entry: PmFeatureSaveRecord) => {
    const confirmed = window.confirm(
      t('projectManagerPage.projectInfo.saveHistoryDeleteConfirmFeature', {
        version: String(entry.version),
      }),
    )
    if (!confirmed) return

    setDeletingHistoryVersion(entry.version)
    setError(null)
    try {
      if (isWorkspaceFeatures && workspaceFeaturesId) {
        const nextMeta = removeSharedFeatureSaveHistoryEntry(workspaceFeaturesId, entry.version)
        setFeatureHistoryRows(readFeatureSaveHistory(nextMeta))
        setFeatureVersion(readFeatureVersion(nextMeta))
        setLastSavedAt(readFeatureLastSavedAt(nextMeta))
        if (props.mode === 'workspaceFeatures') props.onSaved?.()
        return
      }
      if (!project) return
      const nextMeta = removeFeatureSaveHistoryEntry(project.metadata ?? {}, entry.version)
      const updated = await pmApi.updateProject({
        id: project.id,
        metadata: nextMeta,
      })
      setFeatureHistoryRows(readFeatureSaveHistory(updated.metadata))
      setFeatureVersion(readFeatureVersion(updated.metadata))
      setLastSavedAt(readFeatureLastSavedAt(updated.metadata))
      if (props.mode !== 'workspaceFeatures') {
        props.onSaved?.(updated)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeletingHistoryVersion(null)
    }
  }

  return { reloadWorkspaceFeaturesHistory, handleDeleteFeatureHistoryEntry }
}

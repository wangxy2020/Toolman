import type { Dispatch, SetStateAction } from 'react'
import {
  readResourceLastSavedAt,
  readResourceSaveHistory,
  readResourceVersion,
  removeResourceSaveHistoryEntry,
  type PmResourceSaveRecord,
} from '@toolman/shared'
import { pmApi } from '../../pm-api'
import {
  readSharedResourceLastSavedAt,
  readSharedResourceSaveHistory,
  readSharedResourceVersion,
  removeSharedResourceSaveHistoryEntry,
} from '../resource/pm-resource-catalog'
import {
  readPracticeLastSavedAt,
  readPracticeSaveHistory,
  readPracticeVersion,
  removePracticeSaveHistoryEntry,
} from '../resource/pm-resource-practice-catalog'
import type { Props } from './pm-project-info-dialog-utils'
import type { PmProject } from '@toolman/shared'

export function useProjectInfoDialogResource(args: {
  project: PmProject | null
  props: Props
  isWorkspaceResource: boolean
  workspaceResourceId: string | null
  practiceScopeId: string | null
  t: (key: string, vars?: Record<string, string>) => string
  setResourceHistoryRows: Dispatch<SetStateAction<PmResourceSaveRecord[]>>
  setResourceVersion: Dispatch<SetStateAction<number>>
  setLastSavedAt: Dispatch<SetStateAction<number | null>>
  setDeletingHistoryVersion: Dispatch<SetStateAction<number | null>>
  setError: Dispatch<SetStateAction<string | null>>
}) {
  const {
    project,
    props,
    isWorkspaceResource,
    workspaceResourceId,
    practiceScopeId,
    t,
    setResourceHistoryRows,
    setResourceVersion,
    setLastSavedAt,
    setDeletingHistoryVersion,
    setError,
  } = args

  const reloadWorkspaceResourceHistory = () => {
    if (!workspaceResourceId) return
    if (practiceScopeId) {
      setResourceHistoryRows(readPracticeSaveHistory(workspaceResourceId, practiceScopeId))
      setResourceVersion(readPracticeVersion(workspaceResourceId, practiceScopeId))
      setLastSavedAt(readPracticeLastSavedAt(workspaceResourceId, practiceScopeId))
      return
    }
    setResourceHistoryRows(readSharedResourceSaveHistory(workspaceResourceId))
    setResourceVersion(readSharedResourceVersion(workspaceResourceId))
    setLastSavedAt(readSharedResourceLastSavedAt(workspaceResourceId))
  }

  const handleDeleteResourceHistoryEntry = async (entry: PmResourceSaveRecord) => {
    const confirmed = window.confirm(
      t('projectManagerPage.projectInfo.saveHistoryDeleteConfirmResource', {
        version: String(entry.version),
      }),
    )
    if (!confirmed) return

    setDeletingHistoryVersion(entry.version)
    setError(null)
    try {
      if (isWorkspaceResource && workspaceResourceId) {
        if (practiceScopeId) {
          const nextMeta = removePracticeSaveHistoryEntry(
            workspaceResourceId,
            practiceScopeId,
            entry.version,
          )
          setResourceHistoryRows(readResourceSaveHistory(nextMeta))
          setResourceVersion(readResourceVersion(nextMeta))
          setLastSavedAt(readResourceLastSavedAt(nextMeta))
          if (props.mode === 'workspaceResource') props.onSaved?.()
          return
        }
        const nextMeta = removeSharedResourceSaveHistoryEntry(
          workspaceResourceId,
          entry.version,
        )
        setResourceHistoryRows(readResourceSaveHistory(nextMeta))
        setResourceVersion(readResourceVersion(nextMeta))
        setLastSavedAt(readResourceLastSavedAt(nextMeta))
        if (props.mode === 'workspaceResource') props.onSaved?.()
        return
      }
      if (!project) return
      if (practiceScopeId) {
        const nextMeta = removePracticeSaveHistoryEntry(
          project.workspaceId,
          practiceScopeId,
          entry.version,
        )
        setResourceHistoryRows(readResourceSaveHistory(nextMeta))
        setResourceVersion(readResourceVersion(nextMeta))
        setLastSavedAt(readResourceLastSavedAt(nextMeta))
        props.onSaved?.(project)
        return
      }
      const nextMeta = removeResourceSaveHistoryEntry(project.metadata ?? {}, entry.version)
      const updated = await pmApi.updateProject({
        id: project.id,
        metadata: nextMeta,
      })
      setResourceHistoryRows(readResourceSaveHistory(updated.metadata))
      setResourceVersion(readResourceVersion(updated.metadata))
      setLastSavedAt(readResourceLastSavedAt(updated.metadata))
      if (props.mode !== 'workspaceResource') {
        props.onSaved?.(updated)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeletingHistoryVersion(null)
    }
  }

  return { reloadWorkspaceResourceHistory, handleDeleteResourceHistoryEntry }
}

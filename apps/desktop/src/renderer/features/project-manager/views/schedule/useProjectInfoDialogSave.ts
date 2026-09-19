import type { Dispatch, SetStateAction } from 'react'
import {
  readCostPracticeLastSavedAt,
  readCostPracticeSaveHistory,
  readCostPracticeVersion,
} from '../cost/pm-cost-practice-catalog'
import { readSharedCostSaveMeta, writeSharedCostSaveMeta } from '../cost/pm-cost-catalog'
import {
  readPracticeLastSavedAt,
  readPracticeSaveHistory,
  readPracticeVersion,
} from '../resource/pm-resource-practice-catalog'
import { costDatabaseMetaCacheKey, writeCostDatabaseMetaCache } from '../cost/pm-cost-database-meta-cache'
import { pmApi } from '../../pm-api'
import {
  buildCostCurrencyMetadata,
  buildCostDatabaseDraftMetadata,
  buildMetadata,
  type CreateDefaults,
  type InfoTab,
  type ProjectInfoDraft,
  type Props,
} from './pm-project-info-dialog-utils'
import { COST_DATABASE_META_KEY, type PmCostSaveRecord, type PmProject, type PmResourceSaveRecord } from '@toolman/shared'

export function useProjectInfoDialogSave(args: {
  props: Props
  onClose: () => void
  draft: ProjectInfoDraft
  project: PmProject | null
  isCreate: boolean
  isWorkspaceResource: boolean
  isWorkspaceCost: boolean
  isWorkspaceFeatures: boolean
  isResourceInfo: boolean
  isCostInfo: boolean
  isFeaturesInfo: boolean
  workspaceCostId: string | null
  workspaceFeaturesId: string | null
  practiceScopeId: string | null
  createDefaults: CreateDefaults | null
  t: (key: string) => string
  setSaving: Dispatch<SetStateAction<boolean>>
  setError: Dispatch<SetStateAction<string | null>>
  setActiveTab: Dispatch<SetStateAction<InfoTab>>
  setResourceHistoryRows: Dispatch<SetStateAction<PmResourceSaveRecord[]>>
  setResourceVersion: Dispatch<SetStateAction<number>>
  setCostHistoryRows: Dispatch<SetStateAction<PmCostSaveRecord[]>>
  setCostVersion: Dispatch<SetStateAction<number>>
  setLastSavedAt: Dispatch<SetStateAction<number | null>>
  reloadWorkspaceResourceHistory: () => void
  reloadWorkspaceCostHistory: () => void
  reloadWorkspaceFeaturesHistory: () => void
}) {
  const {
    props,
    onClose,
    draft,
    project,
    isCreate,
    isWorkspaceCost,
    isWorkspaceFeatures,
    isResourceInfo,
    isCostInfo,
    isFeaturesInfo,
    workspaceCostId,
    workspaceFeaturesId,
    practiceScopeId,
    createDefaults,
    t,
    setSaving,
    setError,
    setActiveTab,
    setResourceHistoryRows,
    setResourceVersion,
    setCostHistoryRows,
    setCostVersion,
    setLastSavedAt,
    reloadWorkspaceResourceHistory,
    reloadWorkspaceCostHistory,
    reloadWorkspaceFeaturesHistory,
  } = args

  const handleSave = async (options?: { manualCreate?: boolean }) => {
    if (props.mode === 'workspaceResource') {
      if (!props.onSaveResources) {
        onClose()
        return
      }
      setSaving(true)
      setError(null)
      try {
        await props.onSaveResources()
        reloadWorkspaceResourceHistory()
        props.onSaved?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setSaving(false)
      }
      return
    }

    const onSaveResources =
      !isCreate && 'onSaveResources' in props ? props.onSaveResources : undefined

    if (isResourceInfo && onSaveResources && !isCreate) {
      setSaving(true)
      setError(null)
      try {
        const result = await onSaveResources()
        if (result === false) return
        if (practiceScopeId && project) {
          setResourceHistoryRows(
            readPracticeSaveHistory(project.workspaceId, practiceScopeId),
          )
          setResourceVersion(readPracticeVersion(project.workspaceId, practiceScopeId))
          setLastSavedAt(readPracticeLastSavedAt(project.workspaceId, practiceScopeId))
        }
        if (project && 'project' in props) {
          props.onSaved(project)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setSaving(false)
      }
      return
    }

    const onSaveCosts =
      props.mode === 'workspaceCost'
        ? props.onSaveCosts
        : !isCreate && 'onSaveCosts' in props
          ? props.onSaveCosts
          : undefined

    if (isCostInfo && onSaveCosts && !isCreate) {
      setSaving(true)
      setError(null)
      try {
        const currencyMeta = {
          ...buildCostCurrencyMetadata(draft),
          ...buildCostDatabaseDraftMetadata(draft),
        }
        writeCostDatabaseMetaCache(
          costDatabaseMetaCacheKey({
            workspaceId: workspaceCostId ?? project?.workspaceId,
            projectId: isWorkspaceCost ? null : project?.id,
          }),
          currencyMeta,
        )
        const result = await onSaveCosts()
        if (result === false) return
        if (isWorkspaceCost && workspaceCostId) {
          const meta = readSharedCostSaveMeta(workspaceCostId)
          writeSharedCostSaveMeta(workspaceCostId, {
            ...meta,
            ...currencyMeta,
          })
          reloadWorkspaceCostHistory()
          if (props.mode === 'workspaceCost') props.onSaved?.()
        } else if (project) {
          if (practiceScopeId) {
            setCostHistoryRows(
              readCostPracticeSaveHistory(project.workspaceId, practiceScopeId),
            )
            setCostVersion(readCostPracticeVersion(project.workspaceId, practiceScopeId))
            setLastSavedAt(
              readCostPracticeLastSavedAt(project.workspaceId, practiceScopeId),
            )
          }
          const updated = await pmApi.updateProject({
            id: project.id,
            metadata: currencyMeta,
          })
          if ('project' in props) {
            props.onSaved(updated)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setSaving(false)
      }
      return
    }

    const onSaveFeatures =
      props.mode === 'workspaceFeatures'
        ? props.onSaveFeatures
        : !isCreate && 'onSaveFeatures' in props
          ? props.onSaveFeatures
          : undefined

    if (isFeaturesInfo && onSaveFeatures && !isCreate) {
      setSaving(true)
      setError(null)
      try {
        const result = await onSaveFeatures()
        if (result === false) return
        if (isWorkspaceFeatures && workspaceFeaturesId) {
          reloadWorkspaceFeaturesHistory()
          if (props.mode === 'workspaceFeatures') props.onSaved?.()
        } else if (project && 'project' in props) {
          props.onSaved(project)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setSaving(false)
      }
      return
    }

    const code = draft.code.trim()
    const name = draft.name.trim()
    if (!code || !name) {
      setError(t('projectManagerPage.projectInfo.validationRequired'))
      setActiveTab('overview')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (isCreate && createDefaults) {
        const baseMetadata = buildMetadata(draft)
        const created = await pmApi.createProject({
          workspaceId: createDefaults.workspaceId,
          code,
          name,
          status: draft.status,
          domain: createDefaults.domain,
          description: draft.description.trim() || undefined,
          workspaceRoot: draft.workspaceRoot.trim() || undefined,
          metadata: baseMetadata,
        })
        if (props.mode === 'create') {
          props.onSaved(created, { manualCreate: options?.manualCreate === true })
        }
        onClose()
        return
      }

      if (!project) return

      const updated = await pmApi.updateProject({
        id: project.id,
        code,
        name,
        status: draft.status,
        description: draft.description.trim() || null,
        workspaceRoot: draft.workspaceRoot.trim() || null,
        metadata: buildMetadata(draft, project.metadata ?? {}),
      })
      if ('project' in props) {
        props.onSaved(updated)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const persistCostDatabase = async (override?: Partial<ProjectInfoDraft>) => {
    const nextDraft = { ...draft, ...override }
    const metadata = buildCostDatabaseDraftMetadata(nextDraft)
    const scopeKey = costDatabaseMetaCacheKey({
      workspaceId: workspaceCostId ?? project?.workspaceId,
      projectId: isWorkspaceCost ? null : project?.id,
    })
    if (metadata[COST_DATABASE_META_KEY] != null) {
      writeCostDatabaseMetaCache(scopeKey, metadata)
    }
    try {
      if (isWorkspaceCost && workspaceCostId) {
        const meta = readSharedCostSaveMeta(workspaceCostId)
        writeSharedCostSaveMeta(workspaceCostId, {
          ...meta,
          ...metadata,
        })
        return
      }
      if (!project) return
      await pmApi.updateProject({
        id: project.id,
        metadata,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return { handleSave, persistCostDatabase }
}

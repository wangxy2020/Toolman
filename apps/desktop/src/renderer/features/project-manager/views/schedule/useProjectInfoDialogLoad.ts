import { useEffect, type Dispatch, type SetStateAction } from 'react'
import {
  readCostLastSavedAt,
  readCostSaveHistory,
  readCostVersion,
  readFeatureLastSavedAt,
  readFeatureSaveHistory,
  readFeatureVersion,
  readLastSavedAt,
  readResourceLastSavedAt,
  readResourceSaveHistory,
  readResourceVersion,
  readSaveHistory,
  readScheduleVersion,
  type PmCostSaveRecord,
  type PmFeatureSaveRecord,
  type PmProject,
  type PmResourceSaveRecord,
  type PmScheduleSaveRecord,
} from '@toolman/shared'
import { readCostCurrencyState } from '../cost/pm-cost-currency'
import {
  readSharedCostLastSavedAt,
  readSharedCostSaveHistory,
  readSharedCostSaveMeta,
  readSharedCostVersion,
} from '../cost/pm-cost-catalog'
import {
  readCostPracticeLastSavedAt,
  readCostPracticeSaveHistory,
  readCostPracticeVersion,
} from '../cost/pm-cost-practice-catalog'
import {
  readSharedFeatureLastSavedAt,
  readSharedFeatureSaveHistory,
  readSharedFeatureVersion,
} from '../files/pm-features-catalog'
import {
  readSharedResourceLastSavedAt,
  readSharedResourceSaveHistory,
  readSharedResourceVersion,
} from '../resource/pm-resource-catalog'
import {
  readPracticeLastSavedAt,
  readPracticeSaveHistory,
  readPracticeVersion,
} from '../resource/pm-resource-practice-catalog'
import { emptyDraft, toDraft, type CreateDefaults, type ProjectInfoDraft } from './pm-project-info-dialog-utils'

export function useProjectInfoDialogLoad(args: {
  project: PmProject | null
  createDefaults: Pick<CreateDefaults, 'code' | 'name'> | null
  t: (key: string) => string
  isWorkspaceResource: boolean
  isWorkspaceCost: boolean
  isWorkspaceFeatures: boolean
  workspaceResourceId: string | null
  workspaceCostId: string | null
  workspaceFeaturesId: string | null
  isResourceInfo: boolean
  isCostInfo: boolean
  isFeaturesInfo: boolean
  practiceScopeId: string | null
  setDraft: Dispatch<SetStateAction<ProjectInfoDraft>>
  setResourceHistoryRows: Dispatch<SetStateAction<PmResourceSaveRecord[]>>
  setResourceVersion: Dispatch<SetStateAction<number>>
  setCostHistoryRows: Dispatch<SetStateAction<PmCostSaveRecord[]>>
  setCostVersion: Dispatch<SetStateAction<number>>
  setFeatureHistoryRows: Dispatch<SetStateAction<PmFeatureSaveRecord[]>>
  setFeatureVersion: Dispatch<SetStateAction<number>>
  setScheduleHistoryRows: Dispatch<SetStateAction<PmScheduleSaveRecord[]>>
  setScheduleVersion: Dispatch<SetStateAction<number>>
  setLastSavedAt: Dispatch<SetStateAction<number | null>>
  setError: Dispatch<SetStateAction<string | null>>
}) {
  const {
    project,
    createDefaults,
    t,
    isWorkspaceResource,
    isWorkspaceCost,
    isWorkspaceFeatures,
    workspaceResourceId,
    workspaceCostId,
    workspaceFeaturesId,
    isResourceInfo,
    isCostInfo,
    isFeaturesInfo,
    practiceScopeId,
    setDraft,
    setResourceHistoryRows,
    setResourceVersion,
    setCostHistoryRows,
    setCostVersion,
    setFeatureHistoryRows,
    setFeatureVersion,
    setScheduleHistoryRows,
    setScheduleVersion,
    setLastSavedAt,
    setError,
  } = args

  useEffect(() => {
    if (isWorkspaceResource && workspaceResourceId) {
      setDraft(
        emptyDraft({
          code: 'ALL',
          name: t('projectManagerPage.headerProject.allProjects'),
        }),
      )
      if (practiceScopeId) {
        setResourceHistoryRows(readPracticeSaveHistory(workspaceResourceId, practiceScopeId))
        setResourceVersion(readPracticeVersion(workspaceResourceId, practiceScopeId))
        setLastSavedAt(readPracticeLastSavedAt(workspaceResourceId, practiceScopeId))
      } else {
        setResourceHistoryRows(readSharedResourceSaveHistory(workspaceResourceId))
        setResourceVersion(readSharedResourceVersion(workspaceResourceId))
        setLastSavedAt(readSharedResourceLastSavedAt(workspaceResourceId))
      }
      setCostHistoryRows([])
      setCostVersion(0)
      setFeatureHistoryRows([])
      setFeatureVersion(0)
      setScheduleHistoryRows([])
      setScheduleVersion(0)
      setError(null)
      return
    }
    if (isWorkspaceCost && workspaceCostId) {
      setDraft({
        ...emptyDraft({
          code: 'ALL',
          name: t('projectManagerPage.headerProject.allProjects'),
        }),
        ...readCostCurrencyState(
          practiceScopeId ? {} : readSharedCostSaveMeta(workspaceCostId),
        ),
      })
      if (practiceScopeId) {
        setCostHistoryRows(readCostPracticeSaveHistory(workspaceCostId, practiceScopeId))
        setCostVersion(readCostPracticeVersion(workspaceCostId, practiceScopeId))
        setLastSavedAt(readCostPracticeLastSavedAt(workspaceCostId, practiceScopeId))
      } else {
        setCostHistoryRows(readSharedCostSaveHistory(workspaceCostId))
        setCostVersion(readSharedCostVersion(workspaceCostId))
        setLastSavedAt(readSharedCostLastSavedAt(workspaceCostId))
      }
      setResourceHistoryRows([])
      setResourceVersion(0)
      setFeatureHistoryRows([])
      setFeatureVersion(0)
      setScheduleHistoryRows([])
      setScheduleVersion(0)
      setError(null)
      return
    }
    if (isWorkspaceFeatures && workspaceFeaturesId) {
      setDraft(
        emptyDraft({
          code: 'ALL',
          name: t('projectManagerPage.headerProject.allProjects'),
        }),
      )
      setFeatureHistoryRows(readSharedFeatureSaveHistory(workspaceFeaturesId))
      setFeatureVersion(readSharedFeatureVersion(workspaceFeaturesId))
      setLastSavedAt(readSharedFeatureLastSavedAt(workspaceFeaturesId))
      setResourceHistoryRows([])
      setResourceVersion(0)
      setCostHistoryRows([])
      setCostVersion(0)
      setScheduleHistoryRows([])
      setScheduleVersion(0)
      setError(null)
      return
    }
    if (project) {
      setDraft(toDraft(project))
      if (isResourceInfo) {
        if (practiceScopeId) {
          setResourceHistoryRows(readPracticeSaveHistory(project.workspaceId, practiceScopeId))
          setResourceVersion(readPracticeVersion(project.workspaceId, practiceScopeId))
          setLastSavedAt(readPracticeLastSavedAt(project.workspaceId, practiceScopeId))
        } else {
          setResourceHistoryRows(readResourceSaveHistory(project.metadata))
          setResourceVersion(readResourceVersion(project.metadata))
          setLastSavedAt(readResourceLastSavedAt(project.metadata))
        }
        setCostHistoryRows([])
        setCostVersion(0)
        setFeatureHistoryRows([])
        setFeatureVersion(0)
        setScheduleHistoryRows([])
        setScheduleVersion(0)
      } else if (isCostInfo) {
        if (practiceScopeId) {
          setCostHistoryRows(readCostPracticeSaveHistory(project.workspaceId, practiceScopeId))
          setCostVersion(readCostPracticeVersion(project.workspaceId, practiceScopeId))
          setLastSavedAt(readCostPracticeLastSavedAt(project.workspaceId, practiceScopeId))
        } else {
          setCostHistoryRows(readCostSaveHistory(project.metadata))
          setCostVersion(readCostVersion(project.metadata))
          setLastSavedAt(readCostLastSavedAt(project.metadata))
        }
        setResourceHistoryRows([])
        setResourceVersion(0)
        setFeatureHistoryRows([])
        setFeatureVersion(0)
        setScheduleHistoryRows([])
        setScheduleVersion(0)
      } else if (isFeaturesInfo) {
        setFeatureHistoryRows(readFeatureSaveHistory(project.metadata))
        setFeatureVersion(readFeatureVersion(project.metadata))
        setLastSavedAt(readFeatureLastSavedAt(project.metadata))
        setResourceHistoryRows([])
        setResourceVersion(0)
        setCostHistoryRows([])
        setCostVersion(0)
        setScheduleHistoryRows([])
        setScheduleVersion(0)
      } else {
        setScheduleHistoryRows(readSaveHistory(project.metadata))
        setScheduleVersion(readScheduleVersion(project.metadata))
        setLastSavedAt(readLastSavedAt(project.metadata))
        setResourceHistoryRows([])
        setResourceVersion(0)
        setCostHistoryRows([])
        setCostVersion(0)
        setFeatureHistoryRows([])
        setFeatureVersion(0)
      }
    } else if (createDefaults) {
      setDraft(emptyDraft(createDefaults))
      setScheduleHistoryRows([])
      setResourceHistoryRows([])
      setCostHistoryRows([])
      setFeatureHistoryRows([])
      setScheduleVersion(0)
      setResourceVersion(0)
      setCostVersion(0)
      setFeatureVersion(0)
      setLastSavedAt(null)
    }
    setError(null)
  }, [
    project,
    createDefaults,
    t,
    isWorkspaceResource,
    isWorkspaceCost,
    isWorkspaceFeatures,
    workspaceResourceId,
    workspaceCostId,
    workspaceFeaturesId,
    isResourceInfo,
    isCostInfo,
    isFeaturesInfo,
    practiceScopeId,
    setDraft,
    setResourceHistoryRows,
    setResourceVersion,
    setCostHistoryRows,
    setCostVersion,
    setFeatureHistoryRows,
    setFeatureVersion,
    setScheduleHistoryRows,
    setScheduleVersion,
    setLastSavedAt,
    setError,
  ])
}

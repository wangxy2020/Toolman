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
import {
  readSharedCostLastSavedAt,
  readSharedCostSaveHistory,
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
import { emptyDraft, toDraft, type CreateDefaults, type InfoTab, type ProjectInfoDraft } from './pm-project-info-dialog-utils'

export function createProjectInfoInitialState(args: {
  project: PmProject | null
  isWorkspaceResource: boolean
  isWorkspaceCost: boolean
  isWorkspaceFeatures: boolean
  isWorkspaceCatalog: boolean
  isResourceInfo: boolean
  isCostInfo: boolean
  isFeaturesInfo: boolean
  workspaceResourceId: string | null
  workspaceCostId: string | null
  workspaceFeaturesId: string | null
  practiceScopeId: string | null
  createDefaults: Pick<CreateDefaults, 'code' | 'name'> | null
}): {
  activeTab: InfoTab
  draft: ProjectInfoDraft
  scheduleHistoryRows: PmScheduleSaveRecord[]
  resourceHistoryRows: PmResourceSaveRecord[]
  costHistoryRows: PmCostSaveRecord[]
  featureHistoryRows: PmFeatureSaveRecord[]
  scheduleVersion: number
  resourceVersion: number
  costVersion: number
  featureVersion: number
  lastSavedAt: number | null
} {
  const {
    project,
    isWorkspaceResource,
    isWorkspaceCost,
    isWorkspaceFeatures,
    isWorkspaceCatalog,
    isResourceInfo,
    isCostInfo,
    isFeaturesInfo,
    workspaceResourceId,
    workspaceCostId,
    workspaceFeaturesId,
    practiceScopeId,
    createDefaults,
  } = args

  const activeTab: InfoTab = isWorkspaceResource
    ? 'resource'
    : isWorkspaceCost
      ? 'cost'
      : isWorkspaceFeatures
        ? 'overview'
        : 'overview'

  const draft = project
    ? toDraft(project)
    : isWorkspaceCatalog
      ? emptyDraft({ code: 'ALL', name: '' })
      : emptyDraft(createDefaults ?? undefined)

  let scheduleHistoryRows: PmScheduleSaveRecord[] = []
  let resourceHistoryRows: PmResourceSaveRecord[] = []
  let costHistoryRows: PmCostSaveRecord[] = []
  let featureHistoryRows: PmFeatureSaveRecord[] = []
  let scheduleVersion = 0
  let resourceVersion = 0
  let costVersion = 0
  let featureVersion = 0
  let lastSavedAt: number | null = null

  if (isWorkspaceResource && workspaceResourceId) {
    if (practiceScopeId) {
      resourceHistoryRows = readPracticeSaveHistory(workspaceResourceId, practiceScopeId)
      resourceVersion = readPracticeVersion(workspaceResourceId, practiceScopeId)
      lastSavedAt = readPracticeLastSavedAt(workspaceResourceId, practiceScopeId)
    } else {
      resourceHistoryRows = readSharedResourceSaveHistory(workspaceResourceId)
      resourceVersion = readSharedResourceVersion(workspaceResourceId)
      lastSavedAt = readSharedResourceLastSavedAt(workspaceResourceId)
    }
  } else if (isWorkspaceCost && workspaceCostId) {
    if (practiceScopeId) {
      costHistoryRows = readCostPracticeSaveHistory(workspaceCostId, practiceScopeId)
      costVersion = readCostPracticeVersion(workspaceCostId, practiceScopeId)
      lastSavedAt = readCostPracticeLastSavedAt(workspaceCostId, practiceScopeId)
    } else {
      costHistoryRows = readSharedCostSaveHistory(workspaceCostId)
      costVersion = readSharedCostVersion(workspaceCostId)
      lastSavedAt = readSharedCostLastSavedAt(workspaceCostId)
    }
  } else if (isWorkspaceFeatures && workspaceFeaturesId) {
    featureHistoryRows = readSharedFeatureSaveHistory(workspaceFeaturesId)
    featureVersion = readSharedFeatureVersion(workspaceFeaturesId)
    lastSavedAt = readSharedFeatureLastSavedAt(workspaceFeaturesId)
  } else if (isResourceInfo && practiceScopeId && project?.workspaceId) {
    resourceHistoryRows = readPracticeSaveHistory(project.workspaceId, practiceScopeId)
    resourceVersion = readPracticeVersion(project.workspaceId, practiceScopeId)
    lastSavedAt = readPracticeLastSavedAt(project.workspaceId, practiceScopeId)
  } else if (isResourceInfo) {
    resourceHistoryRows = readResourceSaveHistory(project?.metadata)
    resourceVersion = readResourceVersion(project?.metadata)
    lastSavedAt = readResourceLastSavedAt(project?.metadata)
  } else if (isCostInfo && practiceScopeId && project?.workspaceId) {
    costHistoryRows = readCostPracticeSaveHistory(project.workspaceId, practiceScopeId)
    costVersion = readCostPracticeVersion(project.workspaceId, practiceScopeId)
    lastSavedAt = readCostPracticeLastSavedAt(project.workspaceId, practiceScopeId)
  } else if (isCostInfo) {
    costHistoryRows = readCostSaveHistory(project?.metadata)
    costVersion = readCostVersion(project?.metadata)
    lastSavedAt = readCostLastSavedAt(project?.metadata)
  } else if (isFeaturesInfo) {
    featureHistoryRows = readFeatureSaveHistory(project?.metadata)
    featureVersion = readFeatureVersion(project?.metadata)
    lastSavedAt = readFeatureLastSavedAt(project?.metadata)
  } else {
    scheduleHistoryRows = readSaveHistory(project?.metadata)
    scheduleVersion = readScheduleVersion(project?.metadata)
    lastSavedAt = readLastSavedAt(project?.metadata)
  }

  return {
    activeTab,
    draft,
    scheduleHistoryRows,
    resourceHistoryRows,
    costHistoryRows,
    featureHistoryRows,
    scheduleVersion,
    resourceVersion,
    costVersion,
    featureVersion,
    lastSavedAt,
  }
}

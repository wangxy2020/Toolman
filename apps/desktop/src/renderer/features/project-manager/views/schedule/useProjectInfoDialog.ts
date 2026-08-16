import { useEffect, useMemo, useState } from 'react'
import {
  type PmCostSaveRecord,
  type PmFeatureSaveRecord,
  type PmResourceSaveRecord,
  type PmScheduleSaveRecord,
} from '@toolman/shared'
import { getDateLocale } from '../../../../i18n/date-locale'
import { useI18n } from '../../../../i18n/useI18n'
import { isPmCostPracticeQuotaType, type PmCostType } from '../cost/pm-cost-catalog'
import { type PmResourceType } from '../resource/pm-resource-catalog'
import {
  computeCostStats,
  computeResourceStats,
  computeScheduleBounds,
  resolveDomainTabId,
  resolveDomainTabKind,
  resolveInfoDomain,
  type InfoTab,
  type PmProjectType,
  type ProjectInfoDraft,
  type Props,
} from './pm-project-info-dialog-utils'
import { useProjectInfoDialogCost } from './useProjectInfoDialogCost'
import { useProjectInfoDialogFeatures } from './useProjectInfoDialogFeatures'
import { createProjectInfoInitialState } from './useProjectInfoDialogInit'
import { useProjectInfoDialogLoad } from './useProjectInfoDialogLoad'
import { useProjectInfoDialogResource } from './useProjectInfoDialogResource'
import { useProjectInfoDialogSave } from './useProjectInfoDialogSave'
import { useProjectInfoDialogSchedule } from './useProjectInfoDialogSchedule'

export type ProjectInfoDialogState = ReturnType<typeof useProjectInfoDialog>

export function useProjectInfoDialog(props: Props) {
  const { onClose } = props
  const isWorkspaceResource = props.mode === 'workspaceResource'
  const isWorkspaceCost = props.mode === 'workspaceCost'
  const isWorkspaceFeatures = props.mode === 'workspaceFeatures'
  const isWorkspaceCatalog = isWorkspaceResource || isWorkspaceCost || isWorkspaceFeatures
  const isCreate = props.mode === 'create'
  const project = isCreate || isWorkspaceCatalog ? null : props.project
  const workItems = isWorkspaceCatalog ? [] : (props.workItems ?? [])
  const resourceRows =
    isWorkspaceCost || isWorkspaceFeatures || !('resourceRows' in props) ? [] : (props.resourceRows ?? [])
  const costRows =
    isWorkspaceResource || isWorkspaceFeatures || !('costRows' in props) ? [] : (props.costRows ?? [])
  const featureRows =
    isWorkspaceResource || isWorkspaceCost || !('featureRows' in props) ? [] : (props.featureRows ?? [])
  const variantProp = isWorkspaceResource
    ? 'resource'
    : isWorkspaceCost
      ? 'cost'
      : isWorkspaceFeatures
        ? 'features'
        : props.variant
  const createDefaults = isCreate ? props.createDefaults : null
  const workspaceResourceId = isWorkspaceResource ? props.workspaceId : null
  const workspaceCostId = isWorkspaceCost ? props.workspaceId : null
  const workspaceFeaturesId = isWorkspaceFeatures ? props.workspaceId : null
  const isResourceInfo = variantProp === 'resource' || isWorkspaceResource
  const isCostInfo = variantProp === 'cost' || isWorkspaceCost
  const isFeaturesInfo = variantProp === 'features' || isWorkspaceFeatures
  const practiceScopeId =
    isWorkspaceResource || isWorkspaceCost
      ? props.practiceScopeId?.trim() || null
      : !isCreate && !isWorkspaceCatalog && 'practiceScopeId' in props
        ? props.practiceScopeId?.trim() || null
        : null
  const infoDomain = isWorkspaceResource
    ? 'resource_management'
    : isWorkspaceCost
      ? 'cost_management'
      : isWorkspaceFeatures
        ? 'progress_management'
        : resolveInfoDomain(isCreate, createDefaults?.domain, project?.domain, variantProp)
  const domainTabKind = resolveDomainTabKind(infoDomain)
  const domainTabId = resolveDomainTabId(domainTabKind)

  const { t, language } = useI18n()
  const dateInputLang = getDateLocale(language)
  const datePlaceholder = t('projectManagerPage.projectInfo.datePlaceholder')
  const initial = createProjectInfoInitialState({
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
  })
  const [activeTab, setActiveTab] = useState<InfoTab>(initial.activeTab)
  const [draft, setDraft] = useState<ProjectInfoDraft>(initial.draft)
  const [saving, setSaving] = useState(false)
  const [deletingHistoryVersion, setDeletingHistoryVersion] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scheduleHistoryRows, setScheduleHistoryRows] = useState<PmScheduleSaveRecord[]>(
    initial.scheduleHistoryRows,
  )
  const [resourceHistoryRows, setResourceHistoryRows] = useState<PmResourceSaveRecord[]>(
    initial.resourceHistoryRows,
  )
  const [costHistoryRows, setCostHistoryRows] = useState<PmCostSaveRecord[]>(initial.costHistoryRows)
  const [featureHistoryRows, setFeatureHistoryRows] = useState<PmFeatureSaveRecord[]>(
    initial.featureHistoryRows,
  )
  const [scheduleVersion, setScheduleVersion] = useState(initial.scheduleVersion)
  const [resourceVersion, setResourceVersion] = useState(initial.resourceVersion)
  const [costVersion, setCostVersion] = useState(initial.costVersion)
  const [featureVersion, setFeatureVersion] = useState(initial.featureVersion)
  const [lastSavedAt, setLastSavedAt] = useState(initial.lastSavedAt)

  useProjectInfoDialogLoad({
    project, createDefaults, t, isWorkspaceResource, isWorkspaceCost, isWorkspaceFeatures,
    workspaceResourceId, workspaceCostId, workspaceFeaturesId, isResourceInfo, isCostInfo,
    isFeaturesInfo, practiceScopeId, setDraft, setResourceHistoryRows, setResourceVersion,
    setCostHistoryRows, setCostVersion, setFeatureHistoryRows, setFeatureVersion,
    setScheduleHistoryRows, setScheduleVersion, setLastSavedAt, setError,
  })

  useEffect(() => {
    setActiveTab((current) => {
      if (current === 'overview' || current === 'statistics' || current === 'advanced') return current
      return domainTabId
    })
  }, [domainTabId])

  const { handleDeleteScheduleHistoryEntry } = useProjectInfoDialogSchedule({
    project, workItems, isResourceInfo, isCostInfo, isFeaturesInfo, isWorkspaceResource, props, t,
    setScheduleHistoryRows, setScheduleVersion, setLastSavedAt, setDeletingHistoryVersion, setError,
  })
  const { reloadWorkspaceResourceHistory, handleDeleteResourceHistoryEntry } = useProjectInfoDialogResource({
    project, props, isWorkspaceResource, workspaceResourceId, practiceScopeId, t,
    setResourceHistoryRows, setResourceVersion, setLastSavedAt, setDeletingHistoryVersion, setError,
  })
  const { costCardCurrency, patchCostCardCurrency, reloadWorkspaceCostHistory, handleDeleteCostHistoryEntry } =
    useProjectInfoDialogCost({
      project, props, draft, setDraft, isWorkspaceCost, workspaceCostId, practiceScopeId, t,
      setCostHistoryRows, setCostVersion, setLastSavedAt, setDeletingHistoryVersion, setError,
    })
  const { reloadWorkspaceFeaturesHistory, handleDeleteFeatureHistoryEntry } = useProjectInfoDialogFeatures({
    project, props, isWorkspaceFeatures, workspaceFeaturesId, t,
    setFeatureHistoryRows, setFeatureVersion, setLastSavedAt, setDeletingHistoryVersion, setError,
  })
  const { handleSave } = useProjectInfoDialogSave({
    props, onClose, draft, project, isCreate, isWorkspaceResource, isWorkspaceCost, isWorkspaceFeatures,
    isResourceInfo, isCostInfo, isFeaturesInfo, workspaceCostId, workspaceFeaturesId, practiceScopeId,
    createDefaults, t, setSaving, setError, setActiveTab, setResourceHistoryRows, setResourceVersion,
    setCostHistoryRows, setCostVersion, setLastSavedAt, reloadWorkspaceResourceHistory,
    reloadWorkspaceCostHistory, reloadWorkspaceFeaturesHistory,
  })

  const stats = useMemo(() => {
    const total = workItems.length
    const milestones = workItems.filter((item) => item.type === 'milestone').length
    const done = workItems.filter((item) => item.status === 'done').length
    const inProgress = workItems.filter((item) => item.status === 'in_progress').length
    const blocked = workItems.filter((item) => item.status === 'blocked').length
    const avgProgress =
      total === 0
        ? 0
        : Math.round(workItems.reduce((sum, item) => sum + (item.progressPercent ?? 0), 0) / total)
    const { earliestStart, latestFinish } = computeScheduleBounds(workItems)
    return { total, milestones, done, inProgress, blocked, avgProgress, earliestStart, latestFinish }
  }, [workItems])
  const resourceStats = useMemo(() => computeResourceStats(resourceRows), [resourceRows])
  const costStats = useMemo(() => computeCostStats(costRows), [costRows])
  const featureStats = useMemo(() => ({ total: featureRows.length }), [featureRows])
  const resourceTypeLabel = (type: PmResourceType): string =>
    t(`projectManagerPage.resourceTable.types.${type}`)
  const costTypeLabel = (type: PmCostType): string =>
    isPmCostPracticeQuotaType(type)
      ? t(`projectManagerPage.costPractice.views.${type}`)
      : t(`projectManagerPage.costTable.types.${type}`)
  const projectTypeLabel = (type: PmProjectType): string => {
    switch (type) {
      case 'construction_gc':
        return t('projectManagerPage.projectInfo.projectTypeConstructionGc')
      case 'epc':
        return t('projectManagerPage.projectInfo.projectTypeEpc')
      case 'owner_managed':
        return t('projectManagerPage.projectInfo.projectTypeOwnerManaged')
      default:
        return t('projectManagerPage.projectInfo.projectTypeOrdinary')
    }
  }
  const patchDraft = (patch: Partial<ProjectInfoDraft>) => {
    setDraft((current) => ({ ...current, ...patch }))
  }

  const domainTabLabel = (() => {
    switch (infoDomain) {
      case 'progress_management':
        return t('projectManagerPage.projectInfo.tabSchedule')
      case 'resource_management':
        return t('projectManagerPage.projectInfo.tabResource')
      case 'cost_management':
        return t('projectManagerPage.projectInfo.tabPrice')
      case 'security_management':
        return t('projectManagerPage.projectInfo.tabSecurity')
      case 'quality_management':
        return t('projectManagerPage.projectInfo.tabQuality')
      case 'archive_management':
        return t('projectManagerPage.projectInfo.tabArchive')
      case 'technical_management':
        return t('projectManagerPage.projectInfo.tabTechnical')
      case 'contract_risk_management':
        return t('projectManagerPage.projectInfo.tabContractRisk')
      case 'operations_management':
        return t('projectManagerPage.projectInfo.tabOperations')
      case 'key_projects':
        return t('projectManagerPage.projectInfo.tabKeyProjects')
      case 'urgent_tasks':
        return t('projectManagerPage.projectInfo.tabUrgentTasks')
      case 'all_projects':
        return t('projectManagerPage.projectInfo.tabAllProjects')
      default:
        return t('projectManagerPage.projectInfo.tabDomain')
    }
  })()
  const tabs: Array<{ id: InfoTab; label: string }> = isWorkspaceResource
    ? [
        { id: 'resource', label: t('projectManagerPage.projectInfo.tabResource') },
        { id: 'statistics', label: t('projectManagerPage.projectInfo.tabStatistics') },
        { id: 'advanced', label: t('projectManagerPage.projectInfo.tabAdvanced') },
      ]
    : isWorkspaceCost
      ? [
          { id: 'cost', label: t('projectManagerPage.projectInfo.tabPrice') },
          { id: 'statistics', label: t('projectManagerPage.projectInfo.tabStatistics') },
          { id: 'advanced', label: t('projectManagerPage.projectInfo.tabAdvanced') },
        ]
      : [
          { id: 'overview', label: t('projectManagerPage.projectInfo.tabOverview') },
          { id: domainTabId, label: domainTabLabel },
          { id: 'statistics', label: t('projectManagerPage.projectInfo.tabStatistics') },
          { id: 'advanced', label: t('projectManagerPage.projectInfo.tabAdvanced') },
        ]
  const modalTitle = isWorkspaceResource
    ? t('projectManagerPage.projectInfo.modalTitleAllProjectsResource')
    : isWorkspaceCost
      ? t('projectManagerPage.projectInfo.modalTitleAllProjectsCost')
      : isWorkspaceFeatures
        ? t('projectManagerPage.projectInfo.modalTitleAllProjectsFeatures')
        : isCreate
          ? t('projectManagerPage.projectInfo.modalTitleCreate')
          : t('projectManagerPage.projectInfo.modalTitle')

  return {
    onClose, isWorkspaceResource, isWorkspaceCost, isWorkspaceFeatures, isWorkspaceCatalog,
    isCreate, isResourceInfo, isCostInfo, isFeaturesInfo, project, t, dateInputLang, datePlaceholder,
    activeTab, setActiveTab, tabs, modalTitle, domainTabKind, domainTabLabel, draft, patchDraft,
    projectTypeLabel, costCardCurrency, patchCostCardCurrency, saving, error, deletingHistoryVersion,
    stats, resourceStats, costStats, featureStats, resourceTypeLabel, costTypeLabel, lastSavedAt,
    scheduleVersion, scheduleHistoryRows, resourceVersion, resourceHistoryRows, costVersion,
    costHistoryRows, featureVersion, featureHistoryRows, handleDeleteScheduleHistoryEntry,
    handleDeleteResourceHistoryEntry, handleDeleteCostHistoryEntry, handleDeleteFeatureHistoryEntry,
    handleSave,
  }
}

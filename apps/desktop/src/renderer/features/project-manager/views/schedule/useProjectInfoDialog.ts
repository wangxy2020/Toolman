import { useEffect, useMemo, useState } from 'react'

import {
  computeScheduleTotalDurationDays,
  parseVersionPlanSnapshotName,
  PM_SAVE_HISTORY_KEY,
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
  removeCostSaveHistoryEntry,
  removeFeatureSaveHistoryEntry,
  removeResourceSaveHistoryEntry,
  removeSaveHistoryEntry,
  type PmCostSaveRecord,
  type PmFeatureSaveRecord,
  type PmResourceSaveRecord,
  type PmScheduleSaveRecord,
} from '@toolman/shared'

import { getDateLocale } from '../../../../i18n/date-locale'
import { useI18n } from '../../../../i18n/useI18n'
import { pmApi } from '../../pm-api'
import { getCostCardCurrency, readCostCurrencyState } from '../cost/pm-cost-currency'
import {
  isPmCostPracticeQuotaType,
  readSharedCostLastSavedAt,
  readSharedCostSaveHistory,
  readSharedCostSaveMeta,
  readSharedCostVersion,
  removeSharedCostSaveHistoryEntry,
  writeSharedCostSaveMeta,
  type PmCostType,
} from '../cost/pm-cost-catalog'
import {
  readCostPracticeLastSavedAt,
  readCostPracticeSaveHistory,
  readCostPracticeVersion,
  removeCostPracticeSaveHistoryEntry,
} from '../cost/pm-cost-practice-catalog'
import {
  readSharedFeatureLastSavedAt,
  readSharedFeatureSaveHistory,
  readSharedFeatureVersion,
  removeSharedFeatureSaveHistoryEntry,
} from '../files/pm-features-catalog'
import {
  readSharedResourceLastSavedAt,
  readSharedResourceSaveHistory,
  readSharedResourceVersion,
  removeSharedResourceSaveHistoryEntry,
  type PmResourceType,
} from '../resource/pm-resource-catalog'
import {
  readPracticeLastSavedAt,
  readPracticeSaveHistory,
  readPracticeVersion,
  removePracticeSaveHistoryEntry,
} from '../resource/pm-resource-practice-catalog'
import { pmScheduleApi } from './pm-schedule-api'
import {
  buildCostCurrencyMetadata,
  buildMetadata,
  computeCostStats,
  computeResourceStats,
  computeScheduleBounds,
  emptyDraft,
  resolveDomainTabId,
  resolveDomainTabKind,
  resolveInfoDomain,
  toDraft,
  type InfoTab,
  type PmProjectType,
  type ProjectInfoDraft,
  type Props,
} from './pm-project-info-dialog-utils'

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
    isWorkspaceCost || isWorkspaceFeatures || !('resourceRows' in props)
      ? []
      : (props.resourceRows ?? [])
  const costRows =
    isWorkspaceResource || isWorkspaceFeatures || !('costRows' in props)
      ? []
      : (props.costRows ?? [])
  const featureRows =
    isWorkspaceResource || isWorkspaceCost || !('featureRows' in props)
      ? []
      : (props.featureRows ?? [])
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
        : resolveInfoDomain(
            isCreate,
            createDefaults?.domain,
            project?.domain,
            variantProp,
          )
  const domainTabKind = resolveDomainTabKind(infoDomain)
  const domainTabId = resolveDomainTabId(domainTabKind)

  const { t, language } = useI18n()
  const dateInputLang = getDateLocale(language)
  const datePlaceholder = t('projectManagerPage.projectInfo.datePlaceholder')
  const [activeTab, setActiveTab] = useState<InfoTab>(() =>
    isWorkspaceResource
      ? 'resource'
      : isWorkspaceCost
        ? 'cost'
        : isWorkspaceFeatures
          ? 'overview'
          : 'overview',
  )
  const [draft, setDraft] = useState<ProjectInfoDraft>(() =>
    project
      ? toDraft(project)
      : isWorkspaceCatalog
        ? emptyDraft({
            code: 'ALL',
            name: '', // filled after i18n below via effect
          })
        : emptyDraft(createDefaults ?? undefined),
  )
  const [saving, setSaving] = useState(false)
  const [deletingHistoryVersion, setDeletingHistoryVersion] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scheduleHistoryRows, setScheduleHistoryRows] = useState<PmScheduleSaveRecord[]>(() =>
    isResourceInfo || isCostInfo || isFeaturesInfo ? [] : readSaveHistory(project?.metadata),
  )
  const [resourceHistoryRows, setResourceHistoryRows] = useState<PmResourceSaveRecord[]>(() => {
    if (isWorkspaceResource && workspaceResourceId) {
      if (practiceScopeId) {
        return readPracticeSaveHistory(workspaceResourceId, practiceScopeId)
      }
      return readSharedResourceSaveHistory(workspaceResourceId)
    }
    if (isResourceInfo && practiceScopeId && project?.workspaceId) {
      return readPracticeSaveHistory(project.workspaceId, practiceScopeId)
    }
    if (isResourceInfo) return readResourceSaveHistory(project?.metadata)
    return []
  })
  const [costHistoryRows, setCostHistoryRows] = useState<PmCostSaveRecord[]>(() => {
    if (isWorkspaceCost && workspaceCostId) {
      if (practiceScopeId) {
        return readCostPracticeSaveHistory(workspaceCostId, practiceScopeId)
      }
      return readSharedCostSaveHistory(workspaceCostId)
    }
    if (isCostInfo && practiceScopeId && project?.workspaceId) {
      return readCostPracticeSaveHistory(project.workspaceId, practiceScopeId)
    }
    if (isCostInfo) return readCostSaveHistory(project?.metadata)
    return []
  })
  const [featureHistoryRows, setFeatureHistoryRows] = useState<PmFeatureSaveRecord[]>(() => {
    if (isWorkspaceFeatures && workspaceFeaturesId) {
      return readSharedFeatureSaveHistory(workspaceFeaturesId)
    }
    if (isFeaturesInfo) return readFeatureSaveHistory(project?.metadata)
    return []
  })
  const [scheduleVersion, setScheduleVersion] = useState(() =>
    isResourceInfo || isCostInfo || isFeaturesInfo ? 0 : readScheduleVersion(project?.metadata),
  )
  const [resourceVersion, setResourceVersion] = useState(() => {
    if (isWorkspaceResource && workspaceResourceId) {
      return practiceScopeId
        ? readPracticeVersion(workspaceResourceId, practiceScopeId)
        : readSharedResourceVersion(workspaceResourceId)
    }
    if (isResourceInfo && practiceScopeId && project?.workspaceId) {
      return readPracticeVersion(project.workspaceId, practiceScopeId)
    }
    if (isResourceInfo) return readResourceVersion(project?.metadata)
    return 0
  })
  const [costVersion, setCostVersion] = useState(() => {
    if (isWorkspaceCost && workspaceCostId) {
      return practiceScopeId
        ? readCostPracticeVersion(workspaceCostId, practiceScopeId)
        : readSharedCostVersion(workspaceCostId)
    }
    if (isCostInfo && practiceScopeId && project?.workspaceId) {
      return readCostPracticeVersion(project.workspaceId, practiceScopeId)
    }
    if (isCostInfo) return readCostVersion(project?.metadata)
    return 0
  })
  const [featureVersion, setFeatureVersion] = useState(() => {
    if (isWorkspaceFeatures && workspaceFeaturesId) {
      return readSharedFeatureVersion(workspaceFeaturesId)
    }
    if (isFeaturesInfo) return readFeatureVersion(project?.metadata)
    return 0
  })
  const [lastSavedAt, setLastSavedAt] = useState(() => {
    if (isWorkspaceResource && workspaceResourceId) {
      return practiceScopeId
        ? readPracticeLastSavedAt(workspaceResourceId, practiceScopeId)
        : readSharedResourceLastSavedAt(workspaceResourceId)
    }
    if (isWorkspaceCost && workspaceCostId) {
      return practiceScopeId
        ? readCostPracticeLastSavedAt(workspaceCostId, practiceScopeId)
        : readSharedCostLastSavedAt(workspaceCostId)
    }
    if (isWorkspaceFeatures && workspaceFeaturesId) {
      return readSharedFeatureLastSavedAt(workspaceFeaturesId)
    }
    if (isResourceInfo && practiceScopeId && project?.workspaceId) {
      return readPracticeLastSavedAt(project.workspaceId, practiceScopeId)
    }
    if (isResourceInfo) return readResourceLastSavedAt(project?.metadata)
    if (isCostInfo && practiceScopeId && project?.workspaceId) {
      return readCostPracticeLastSavedAt(project.workspaceId, practiceScopeId)
    }
    if (isCostInfo) return readCostLastSavedAt(project?.metadata)
    if (isFeaturesInfo) return readFeatureLastSavedAt(project?.metadata)
    return readLastSavedAt(project?.metadata)
  })

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
  ])

  useEffect(() => {
    setActiveTab((current) => {
      if (current === 'overview' || current === 'statistics' || current === 'advanced') {
        return current
      }
      return domainTabId
    })
  }, [domainTabId])

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
        // Persist so reopening project info keeps the column filled.
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
  }, [project, workItems, isResourceInfo, isCostInfo, isFeaturesInfo])

  const stats = useMemo(() => {
    const total = workItems.length
    const milestones = workItems.filter((item) => item.type === 'milestone').length
    const done = workItems.filter((item) => item.status === 'done').length
    const inProgress = workItems.filter((item) => item.status === 'in_progress').length
    const blocked = workItems.filter((item) => item.status === 'blocked').length
    const avgProgress =
      total === 0
        ? 0
        : Math.round(
            workItems.reduce((sum, item) => sum + (item.progressPercent ?? 0), 0) / total,
          )
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

      // Best-effort: remove matching version plan snapshot.
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
          props.onSaved?.()
          return
        }
        const nextMeta = removeSharedResourceSaveHistoryEntry(
          workspaceResourceId,
          entry.version,
        )
        setResourceHistoryRows(readResourceSaveHistory(nextMeta))
        setResourceVersion(readResourceVersion(nextMeta))
        setLastSavedAt(readResourceLastSavedAt(nextMeta))
        props.onSaved?.()
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

  const costCardCurrency = (cardKey: string) =>
    getCostCardCurrency(draft.costCurrencies, draft.unsetCostCurrency, cardKey)

  const patchCostCardCurrency = (cardKey: string, value: string) => {
    setDraft((current) => ({
      ...current,
      costCurrencies: { ...current.costCurrencies, [cardKey]: value },
    }))
  }

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

  const reloadWorkspaceCostHistory = () => {
    if (!workspaceCostId) return
    if (practiceScopeId) {
      setCostHistoryRows(readCostPracticeSaveHistory(workspaceCostId, practiceScopeId))
      setCostVersion(readCostPracticeVersion(workspaceCostId, practiceScopeId))
      setLastSavedAt(readCostPracticeLastSavedAt(workspaceCostId, practiceScopeId))
      return
    }
    setCostHistoryRows(readSharedCostSaveHistory(workspaceCostId))
    setCostVersion(readSharedCostVersion(workspaceCostId))
    setLastSavedAt(readSharedCostLastSavedAt(workspaceCostId))
  }

  const reloadWorkspaceFeaturesHistory = () => {
    if (!workspaceFeaturesId) return
    setFeatureHistoryRows(readSharedFeatureSaveHistory(workspaceFeaturesId))
    setFeatureVersion(readSharedFeatureVersion(workspaceFeaturesId))
    setLastSavedAt(readSharedFeatureLastSavedAt(workspaceFeaturesId))
  }

  const handleDeleteCostHistoryEntry = async (entry: PmCostSaveRecord) => {
    const confirmed = window.confirm(
      t('projectManagerPage.projectInfo.saveHistoryDeleteConfirmCost', {
        version: String(entry.version),
      }),
    )
    if (!confirmed) return

    setDeletingHistoryVersion(entry.version)
    setError(null)
    try {
      if (isWorkspaceCost && workspaceCostId) {
        if (practiceScopeId) {
          const nextMeta = removeCostPracticeSaveHistoryEntry(
            workspaceCostId,
            practiceScopeId,
            entry.version,
          )
          setCostHistoryRows(readCostSaveHistory(nextMeta))
          setCostVersion(readCostVersion(nextMeta))
          setLastSavedAt(readCostLastSavedAt(nextMeta))
          props.onSaved?.()
          return
        }
        const nextMeta = removeSharedCostSaveHistoryEntry(workspaceCostId, entry.version)
        setCostHistoryRows(readCostSaveHistory(nextMeta))
        setCostVersion(readCostVersion(nextMeta))
        setLastSavedAt(readCostLastSavedAt(nextMeta))
        props.onSaved?.()
        return
      }
      if (!project) return
      if (practiceScopeId) {
        const nextMeta = removeCostPracticeSaveHistoryEntry(
          project.workspaceId,
          practiceScopeId,
          entry.version,
        )
        setCostHistoryRows(readCostSaveHistory(nextMeta))
        setCostVersion(readCostVersion(nextMeta))
        setLastSavedAt(readCostLastSavedAt(nextMeta))
        props.onSaved?.(project)
        return
      }
      const nextMeta = removeCostSaveHistoryEntry(project.metadata ?? {}, entry.version)
      const updated = await pmApi.updateProject({
        id: project.id,
        metadata: nextMeta,
      })
      setCostHistoryRows(readCostSaveHistory(updated.metadata))
      setCostVersion(readCostVersion(updated.metadata))
      setLastSavedAt(readCostLastSavedAt(updated.metadata))
      if (props.mode !== 'workspaceCost') {
        props.onSaved?.(updated)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeletingHistoryVersion(null)
    }
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
        props.onSaved?.()
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

  const handleSave = async (options?: { manualCreate?: boolean }) => {
    if (isWorkspaceResource) {
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

    // Price-list info: Save persists the cost catalog (peer of resource list).
    if (isCostInfo && onSaveCosts && !isCreate) {
      setSaving(true)
      setError(null)
      try {
        const currencyMeta = buildCostCurrencyMetadata(draft)
        const result = await onSaveCosts()
        if (result === false) return
        // Write currency after catalog save so persistProjectCatalog cannot wipe it
        // (updateProject shallow-merges metadata).
        if (isWorkspaceCost && workspaceCostId) {
          const meta = readSharedCostSaveMeta(workspaceCostId)
          writeSharedCostSaveMeta(workspaceCostId, {
            ...meta,
            ...currencyMeta,
          })
          reloadWorkspaceCostHistory()
          props.onSaved?.()
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
          props.onSaved?.()
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
        props.onSaved(created, { manualCreate: options?.manualCreate === true })
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
      props.onSaved?.(updated)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
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
    // Identity / scope
    onClose,
    isWorkspaceResource,
    isWorkspaceCost,
    isWorkspaceFeatures,
    isWorkspaceCatalog,
    isCreate,
    isResourceInfo,
    isCostInfo,
    isFeaturesInfo,
    project,

    // i18n / locale
    t,
    dateInputLang,
    datePlaceholder,

    // Tabs / chrome
    activeTab,
    setActiveTab,
    tabs,
    modalTitle,
    domainTabKind,
    domainTabLabel,

    // Draft form state
    draft,
    patchDraft,
    projectTypeLabel,
    costCardCurrency,
    patchCostCardCurrency,

    // Status
    saving,
    error,
    deletingHistoryVersion,

    // Stats
    stats,
    resourceStats,
    costStats,
    featureStats,
    resourceTypeLabel,
    costTypeLabel,

    // History
    lastSavedAt,
    scheduleVersion,
    scheduleHistoryRows,
    resourceVersion,
    resourceHistoryRows,
    costVersion,
    costHistoryRows,
    featureVersion,
    featureHistoryRows,
    handleDeleteScheduleHistoryEntry,
    handleDeleteResourceHistoryEntry,
    handleDeleteCostHistoryEntry,
    handleDeleteFeatureHistoryEntry,

    // Save
    handleSave,
  }
}

import type { FC } from 'react'
import { useEffect, useMemo, useState } from 'react'

import {
  computeScheduleTotalDurationDays,
  parseVersionPlanSnapshotName,
  PM_SAVE_HISTORY_KEY,
  readLastSavedAt,
  readResourceLastSavedAt,
  readResourceSaveHistory,
  readResourceVersion,
  readSaveHistory,
  readScheduleVersion,
  removeResourceSaveHistoryEntry,
  removeSaveHistoryEntry,
  type PmDomain,
  type PmProject,
  type PmProjectStatus,
  type PmResourceSaveRecord,
  type PmScheduleSaveRecord,
  type PmWorkItem,
} from '@toolman/shared'

import { getDateLocale } from '../../../../i18n/date-locale'
import { useI18n } from '../../../../i18n/useI18n'
import { pmApi } from '../../pm-api'
import {
  PM_RESOURCE_TYPES,
  readSharedResourceLastSavedAt,
  readSharedResourceSaveHistory,
  readSharedResourceVersion,
  removeSharedResourceSaveHistoryEntry,
  type PmResourceRow,
  type PmResourceType,
} from '../resource/pm-resource-catalog'
import { formatWorkItemDate } from './pm-gantt-utils'
import { pmScheduleApi } from './pm-schedule-api'

type ProjectInfoVariant = 'schedule' | 'resource'
type InfoTab = 'overview' | 'schedule' | 'resource' | 'domain' | 'statistics' | 'advanced'
type DomainTabKind = 'schedule' | 'resource' | 'placeholder'

function resolveInfoDomain(
  isCreate: boolean,
  createDomain: PmDomain | undefined,
  projectDomain: PmDomain | undefined,
  variant: ProjectInfoVariant | undefined,
): PmDomain {
  if (isCreate && createDomain) return createDomain
  // Explicit opener context (resource / schedule panels) wins over stored domain.
  if (variant === 'resource') return 'resource_management'
  if (variant === 'schedule') return 'progress_management'
  return projectDomain ?? 'progress_management'
}

function resolveDomainTabKind(domain: PmDomain): DomainTabKind {
  if (domain === 'progress_management') return 'schedule'
  if (domain === 'resource_management') return 'resource'
  return 'placeholder'
}

function resolveDomainTabId(kind: DomainTabKind): InfoTab {
  if (kind === 'schedule') return 'schedule'
  if (kind === 'resource') return 'resource'
  return 'domain'
}

type PmProjectType = 'construction_gc' | 'epc' | 'owner_managed' | 'ordinary'
type PmPlanCalendar = 'calendar_days' | 'working_days'

type ProjectInfoDraft = {
  code: string
  name: string
  status: PmProjectStatus
  projectType: PmProjectType
  description: string
  workspaceRoot: string
  planStart: string
  planFinish: string
  statusDate: string
  scheduleFrom: 'project_start' | 'project_finish'
  planCalendar: PmPlanCalendar
  planPhase: string
  period: string
  region: string
  contractValue: string
  settledAmount: string
  progressPercent: string
}

type CreateDefaults = {
  workspaceId: string
  domain: PmDomain
  code: string
  name: string
}

interface EditProps {
  mode?: 'edit'
  project: PmProject
  workItems?: PmWorkItem[]
  /** When `resource`, middle tab is 资源 and stats come from the catalog. */
  variant?: ProjectInfoVariant
  resourceRows?: PmResourceRow[]
  onClose: () => void
  onSaved: (project: PmProject, options?: { manualCreate?: boolean }) => void
}

interface CreateProps {
  mode: 'create'
  createDefaults: CreateDefaults
  workItems?: PmWorkItem[]
  variant?: ProjectInfoVariant
  resourceRows?: PmResourceRow[]
  onClose: () => void
  onSaved: (project: PmProject, options?: { manualCreate?: boolean }) => void
}

/** Workspace「全部项目」resource info (no concrete PmProject). */
interface WorkspaceResourceProps {
  mode: 'workspaceResource'
  workspaceId: string
  resourceRows?: PmResourceRow[]
  /** Persist the shared resource catalog (same as toolbar Save). */
  onSaveResources?: () => void | Promise<void>
  onClose: () => void
  onSaved?: () => void
}

type Props = EditProps | CreateProps | WorkspaceResourceProps

const PROJECT_TYPE_OPTIONS: PmProjectType[] = [
  'construction_gc',
  'epc',
  'owner_managed',
  'ordinary',
]

function parseProjectType(raw: string): PmProjectType {
  return raw === 'construction_gc' || raw === 'epc' || raw === 'owner_managed'
    ? raw
    : 'ordinary'
}

function readMetaString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key]
  return typeof value === 'string' ? value : value != null ? String(value) : ''
}

function readMetaNumber(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key]
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return value.trim()
  }
  return ''
}

function emptyDraft(defaults?: Pick<CreateDefaults, 'code' | 'name'>): ProjectInfoDraft {
  return {
    code: defaults?.code ?? '',
    name: defaults?.name ?? '',
    status: 'planning',
    projectType: 'ordinary',
    description: '',
    workspaceRoot: '',
    planStart: '',
    planFinish: '',
    statusDate: '',
    scheduleFrom: 'project_start',
    planCalendar: 'calendar_days',
    planPhase: '',
    period: '',
    region: '',
    contractValue: '',
    settledAmount: '',
    progressPercent: '',
  }
}

function toDraft(project: PmProject): ProjectInfoDraft {
  const metadata = project.metadata ?? {}
  return {
    code: project.code,
    name: project.name,
    status: project.status,
    projectType: parseProjectType(readMetaString(metadata, 'projectType')),
    description: project.description ?? '',
    workspaceRoot: project.workspaceRoot ?? '',
    planStart: readMetaString(metadata, 'planStartDate'),
    planFinish: readMetaString(metadata, 'planFinishDate'),
    statusDate: readMetaString(metadata, 'statusDate'),
    scheduleFrom:
      readMetaString(metadata, 'scheduleFrom') === 'project_finish'
        ? 'project_finish'
        : 'project_start',
    planCalendar:
      readMetaString(metadata, 'planCalendar') === 'working_days'
        ? 'working_days'
        : 'calendar_days',
    planPhase: readMetaString(metadata, 'planPhase'),
    period: readMetaString(metadata, 'period'),
    region: readMetaString(metadata, 'region'),
    contractValue: readMetaNumber(metadata, 'contractValue'),
    settledAmount: readMetaNumber(metadata, 'settledAmount'),
    progressPercent: readMetaNumber(metadata, 'progressPercent'),
  }
}

function parseOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

function buildMetadata(draft: ProjectInfoDraft, base: Record<string, unknown> = {}): Record<string, unknown> {
  const metadata: Record<string, unknown> = { ...base }
  const setMeta = (key: string, value: string | number | undefined) => {
    if (value === undefined || value === '') delete metadata[key]
    else metadata[key] = value
  }
  setMeta('projectType', draft.projectType)
  setMeta('planStartDate', draft.planStart.trim() || undefined)
  setMeta('planFinishDate', draft.planFinish.trim() || undefined)
  setMeta('statusDate', draft.statusDate.trim() || undefined)
  setMeta('scheduleFrom', draft.scheduleFrom)
  setMeta('planCalendar', draft.planCalendar)
  setMeta('planPhase', draft.planPhase.trim() || undefined)
  setMeta('period', draft.period.trim() || undefined)
  setMeta('region', draft.region.trim() || undefined)
  setMeta('contractValue', parseOptionalNumber(draft.contractValue))
  setMeta('settledAmount', parseOptionalNumber(draft.settledAmount))
  setMeta('progressPercent', parseOptionalNumber(draft.progressPercent))
  return metadata
}

function computeScheduleBounds(items: PmWorkItem[]): {
  earliestStart: number | null
  latestFinish: number | null
} {
  let earliestStart: number | null = null
  let latestFinish: number | null = null
  for (const item of items) {
    if (item.startDate != null) {
      earliestStart =
        earliestStart == null ? item.startDate : Math.min(earliestStart, item.startDate)
    }
    if (item.dueDate != null) {
      latestFinish = latestFinish == null ? item.dueDate : Math.max(latestFinish, item.dueDate)
    }
  }
  return { earliestStart, latestFinish }
}

function formatDateTime(ms: number, locale: string): string {
  return new Date(ms).toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMoney(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })
}

function computeResourceStats(rows: PmResourceRow[]) {
  const byType = Object.fromEntries(PM_RESOURCE_TYPES.map((type) => [type, 0])) as Record<
    PmResourceType,
    number
  >
  let priced = 0
  let priceSum = 0
  let minPrice: number | null = null
  let maxPrice: number | null = null
  for (const row of rows) {
    byType[row.type] += 1
    if (row.unitPrice == null || !Number.isFinite(row.unitPrice)) continue
    priced += 1
    priceSum += row.unitPrice
    minPrice = minPrice == null ? row.unitPrice : Math.min(minPrice, row.unitPrice)
    maxPrice = maxPrice == null ? row.unitPrice : Math.max(maxPrice, row.unitPrice)
  }
  return {
    total: rows.length,
    priced,
    unpriced: rows.length - priced,
    avgUnitPrice: priced === 0 ? null : Math.round((priceSum / priced) * 100) / 100,
    priceSum,
    minPrice,
    maxPrice,
    byType,
  }
}

const ProjectInfoDialog: FC<Props> = (props) => {
  const { onClose } = props
  const isWorkspaceResource = props.mode === 'workspaceResource'
  const isCreate = props.mode === 'create'
  const project = isCreate || isWorkspaceResource ? null : props.project
  const workItems = isWorkspaceResource ? [] : (props.workItems ?? [])
  const resourceRows = props.resourceRows ?? []
  const variantProp = isWorkspaceResource ? 'resource' : props.variant
  const createDefaults = isCreate ? props.createDefaults : null
  const workspaceResourceId = isWorkspaceResource ? props.workspaceId : null
  const isResourceInfo = variantProp === 'resource' || isWorkspaceResource
  const infoDomain = isWorkspaceResource
    ? 'resource_management'
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
    isWorkspaceResource ? 'resource' : 'overview',
  )
  const [draft, setDraft] = useState<ProjectInfoDraft>(() =>
    project
      ? toDraft(project)
      : isWorkspaceResource
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
    isResourceInfo ? [] : readSaveHistory(project?.metadata),
  )
  const [resourceHistoryRows, setResourceHistoryRows] = useState<PmResourceSaveRecord[]>(() => {
    if (isWorkspaceResource && workspaceResourceId) {
      return readSharedResourceSaveHistory(workspaceResourceId)
    }
    if (isResourceInfo) return readResourceSaveHistory(project?.metadata)
    return []
  })
  const [scheduleVersion, setScheduleVersion] = useState(() =>
    isResourceInfo ? 0 : readScheduleVersion(project?.metadata),
  )
  const [resourceVersion, setResourceVersion] = useState(() => {
    if (isWorkspaceResource && workspaceResourceId) {
      return readSharedResourceVersion(workspaceResourceId)
    }
    if (isResourceInfo) return readResourceVersion(project?.metadata)
    return 0
  })
  const [lastSavedAt, setLastSavedAt] = useState(() => {
    if (isWorkspaceResource && workspaceResourceId) {
      return readSharedResourceLastSavedAt(workspaceResourceId)
    }
    if (isResourceInfo) return readResourceLastSavedAt(project?.metadata)
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
      setResourceHistoryRows(readSharedResourceSaveHistory(workspaceResourceId))
      setResourceVersion(readSharedResourceVersion(workspaceResourceId))
      setLastSavedAt(readSharedResourceLastSavedAt(workspaceResourceId))
      setScheduleHistoryRows([])
      setScheduleVersion(0)
      setError(null)
      return
    }
    if (project) {
      setDraft(toDraft(project))
      if (isResourceInfo) {
        setResourceHistoryRows(readResourceSaveHistory(project.metadata))
        setResourceVersion(readResourceVersion(project.metadata))
        setLastSavedAt(readResourceLastSavedAt(project.metadata))
        setScheduleHistoryRows([])
        setScheduleVersion(0)
      } else {
        setScheduleHistoryRows(readSaveHistory(project.metadata))
        setScheduleVersion(readScheduleVersion(project.metadata))
        setLastSavedAt(readLastSavedAt(project.metadata))
        setResourceHistoryRows([])
        setResourceVersion(0)
      }
    } else if (createDefaults) {
      setDraft(emptyDraft(createDefaults))
      setScheduleHistoryRows([])
      setResourceHistoryRows([])
      setScheduleVersion(0)
      setResourceVersion(0)
      setLastSavedAt(null)
    }
    setError(null)
  }, [
    project,
    createDefaults?.workspaceId,
    createDefaults?.domain,
    createDefaults?.code,
    createDefaults?.name,
    isWorkspaceResource,
    workspaceResourceId,
    isResourceInfo,
    t,
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
    if (!project || isResourceInfo) return
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
  }, [project, workItems, isResourceInfo])

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

  const resourceTypeLabel = (type: PmResourceType): string =>
    t(`projectManagerPage.resourceTable.types.${type}`)

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
      if (!isWorkspaceResource) props.onSaved(updated)
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
      const nextMeta = removeResourceSaveHistoryEntry(project.metadata ?? {}, entry.version)
      const updated = await pmApi.updateProject({
        id: project.id,
        metadata: nextMeta,
      })
      setResourceHistoryRows(readResourceSaveHistory(updated.metadata))
      setResourceVersion(readResourceVersion(updated.metadata))
      setLastSavedAt(readResourceLastSavedAt(updated.metadata))
      if (props.mode !== 'workspaceResource') {
        props.onSaved(updated)
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

  const reloadWorkspaceResourceHistory = () => {
    if (!workspaceResourceId) return
    setResourceHistoryRows(readSharedResourceSaveHistory(workspaceResourceId))
    setResourceVersion(readSharedResourceVersion(workspaceResourceId))
    setLastSavedAt(readSharedResourceLastSavedAt(workspaceResourceId))
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
      props.onSaved(updated)
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
        return t('projectManagerPage.projectInfo.tabCost')
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
    : [
        { id: 'overview', label: t('projectManagerPage.projectInfo.tabOverview') },
        { id: domainTabId, label: domainTabLabel },
        { id: 'statistics', label: t('projectManagerPage.projectInfo.tabStatistics') },
        { id: 'advanced', label: t('projectManagerPage.projectInfo.tabAdvanced') },
      ]

  const modalTitle = isWorkspaceResource
    ? t('projectManagerPage.projectInfo.modalTitleAllProjectsResource')
    : isCreate
      ? t('projectManagerPage.projectInfo.modalTitleCreate')
      : t('projectManagerPage.projectInfo.modalTitle')

  return (
    <div className="tm-modal-overlay tm-modal-overlay--kb-settings" onClick={onClose}>
      <div
        className="tm-kb-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pm-project-info-title"
        onClick={(event) => event.stopPropagation()}>
        <header className="tm-kb-settings-modal-header">
          <h3 id="pm-project-info-title" className="tm-kb-settings-modal-title">
            <span className="tm-kb-settings-modal-title-dot" aria-hidden="true" />
            {modalTitle}
          </h3>
          <button
            type="button"
            className="tm-kb-settings-modal-close"
            aria-label={t('projectManagerPage.database.cancel')}
            onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </header>

        <div className="tm-kb-settings-modal-body">
          <nav className="tm-kb-settings-modal-nav" aria-label={modalTitle}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={[
                  'tm-kb-settings-modal-nav-item',
                  activeTab === tab.id ? 'tm-kb-settings-modal-nav-item--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setActiveTab(tab.id)}>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          <div className="tm-kb-settings-modal-content">
            {error ? <p className="tm-kb-settings-hint tm-pm-project-info-error">{error}</p> : null}

            {activeTab === 'overview' ? (
              <div className="tm-kb-settings-form">
                <p className="tm-kb-settings-hint">{t('projectManagerPage.projectInfo.overviewHint')}</p>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-code">
                    {t('projectManagerPage.projectInfo.fieldCode')}
                  </label>
                  <input
                    id="pm-info-code"
                    className="tm-kb-settings-input"
                    value={draft.code}
                    onChange={(event) => patchDraft({ code: event.target.value })}
                  />
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-name">
                    {t('projectManagerPage.projectInfo.fieldName')}
                  </label>
                  <input
                    id="pm-info-name"
                    className="tm-kb-settings-input"
                    value={draft.name}
                    onChange={(event) => patchDraft({ name: event.target.value })}
                  />
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-project-type">
                    {t('projectManagerPage.projectInfo.fieldProjectType')}
                  </label>
                  <select
                    id="pm-info-project-type"
                    className="tm-kb-settings-input"
                    value={draft.projectType}
                    onChange={(event) =>
                      patchDraft({ projectType: parseProjectType(event.target.value) })
                    }>
                    {PROJECT_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>
                        {projectTypeLabel(type)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="tm-kb-settings-row tm-kb-settings-row--stack">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-description">
                    {t('projectManagerPage.projectInfo.fieldDescription')}
                  </label>
                  <textarea
                    id="pm-info-description"
                    className="tm-kb-settings-input tm-kb-settings-textarea"
                    rows={4}
                    value={draft.description}
                    onChange={(event) => patchDraft({ description: event.target.value })}
                  />
                </div>
              </div>
            ) : null}

            {activeTab === 'domain' ? (
              <div className="tm-kb-settings-form">
                <p className="tm-kb-settings-hint">
                  {t('projectManagerPage.projectInfo.domainPlaceholderHint', {
                    domain: domainTabLabel,
                  })}
                </p>
                <div className="tm-pm-project-info-domain-placeholder" role="status">
                  {t('projectManagerPage.projectInfo.domainPlaceholderEmpty')}
                </div>
              </div>
            ) : null}

            {activeTab === 'resource' ? (
              <div className="tm-kb-settings-form">
                <p className="tm-kb-settings-hint">
                  {isWorkspaceResource
                    ? t('projectManagerPage.projectInfo.resourceHintAllProjects')
                    : t('projectManagerPage.projectInfo.resourceHint')}
                </p>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label">
                    {t('projectManagerPage.projectInfo.fieldResourceScope')}
                  </label>
                  <span className="tm-kb-settings-readonly">
                    {isWorkspaceResource
                      ? t('projectManagerPage.headerProject.allProjects')
                      : project
                        ? [project.code.trim(), project.name.trim()].filter(Boolean).join(' · ') ||
                          project.id
                        : '—'}
                  </span>
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label">
                    {t('projectManagerPage.projectInfo.statResources')}
                  </label>
                  <span className="tm-kb-settings-readonly">{resourceStats.total}</span>
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label">
                    {t('projectManagerPage.projectInfo.statPriced')}
                  </label>
                  <span className="tm-kb-settings-readonly">{resourceStats.priced}</span>
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label">
                    {t('projectManagerPage.projectInfo.statUnpriced')}
                  </label>
                  <span className="tm-kb-settings-readonly">{resourceStats.unpriced}</span>
                </div>
                <div className="tm-pm-project-info-stats">
                  {PM_RESOURCE_TYPES.map((type) => (
                    <div key={type} className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {resourceTypeLabel(type)}
                      </span>
                      <strong>{resourceStats.byType[type]}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {activeTab === 'schedule' ? (
              <div className="tm-kb-settings-form">
                <p className="tm-kb-settings-hint">{t('projectManagerPage.projectInfo.scheduleHint')}</p>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-plan-start">
                    {t('projectManagerPage.projectInfo.fieldPlanStart')}
                  </label>
                  <input
                    id="pm-info-plan-start"
                    className="tm-kb-settings-input"
                    type="date"
                    lang={dateInputLang}
                    placeholder={datePlaceholder}
                    value={draft.planStart}
                    onChange={(event) => patchDraft({ planStart: event.target.value })}
                  />
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-plan-finish">
                    {t('projectManagerPage.projectInfo.fieldPlanFinish')}
                  </label>
                  <input
                    id="pm-info-plan-finish"
                    className="tm-kb-settings-input"
                    type="date"
                    lang={dateInputLang}
                    placeholder={datePlaceholder}
                    value={draft.planFinish}
                    onChange={(event) => patchDraft({ planFinish: event.target.value })}
                  />
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-status-date">
                    {t('projectManagerPage.projectInfo.fieldStatusDate')}
                  </label>
                  <input
                    id="pm-info-status-date"
                    className="tm-kb-settings-input"
                    type="date"
                    lang={dateInputLang}
                    placeholder={datePlaceholder}
                    value={draft.statusDate}
                    onChange={(event) => patchDraft({ statusDate: event.target.value })}
                  />
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-schedule-from">
                    {t('projectManagerPage.projectInfo.fieldScheduleFrom')}
                  </label>
                  <select
                    id="pm-info-schedule-from"
                    className="tm-kb-settings-input"
                    value={draft.scheduleFrom}
                    onChange={(event) =>
                      patchDraft({
                        scheduleFrom: event.target.value as 'project_start' | 'project_finish',
                      })
                    }>
                    <option value="project_start">
                      {t('projectManagerPage.projectInfo.scheduleFromStart')}
                    </option>
                    <option value="project_finish">
                      {t('projectManagerPage.projectInfo.scheduleFromFinish')}
                    </option>
                  </select>
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-plan-calendar">
                    {t('projectManagerPage.projectInfo.fieldPlanCalendar')}
                  </label>
                  <select
                    id="pm-info-plan-calendar"
                    className="tm-kb-settings-input"
                    value={draft.planCalendar}
                    onChange={(event) =>
                      patchDraft({
                        planCalendar:
                          event.target.value === 'working_days'
                            ? 'working_days'
                            : 'calendar_days',
                      })
                    }>
                    <option value="calendar_days">
                      {t('projectManagerPage.projectInfo.planCalendarCalendarDays')}
                    </option>
                    <option value="working_days">
                      {t('projectManagerPage.projectInfo.planCalendarWorkingDays')}
                    </option>
                  </select>
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-plan-phase">
                    {t('projectManagerPage.projectInfo.fieldPlanPhase')}
                  </label>
                  <input
                    id="pm-info-plan-phase"
                    className="tm-kb-settings-input"
                    value={draft.planPhase}
                    onChange={(event) => patchDraft({ planPhase: event.target.value })}
                  />
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-period">
                    {t('projectManagerPage.projectInfo.fieldPeriod')}
                  </label>
                  <input
                    id="pm-info-period"
                    className="tm-kb-settings-input"
                    value={draft.period}
                    onChange={(event) => patchDraft({ period: event.target.value })}
                  />
                </div>
              </div>
            ) : null}

            {activeTab === 'statistics' ? (
              <div className="tm-kb-settings-form">
                <p className="tm-kb-settings-hint">
                  {domainTabKind === 'resource'
                    ? t('projectManagerPage.projectInfo.resourceStatisticsHint')
                    : domainTabKind === 'placeholder'
                      ? t('projectManagerPage.projectInfo.domainStatisticsPlaceholderHint', {
                          domain: domainTabLabel,
                        })
                      : t('projectManagerPage.projectInfo.statisticsHint')}
                </p>
                {domainTabKind === 'placeholder' ? (
                  <div className="tm-pm-project-info-domain-placeholder" role="status">
                    {t('projectManagerPage.projectInfo.domainPlaceholderEmpty')}
                  </div>
                ) : domainTabKind === 'resource' ? (
                  <div className="tm-pm-project-info-stats">
                    <div className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {t('projectManagerPage.projectInfo.statResources')}
                      </span>
                      <strong>{resourceStats.total}</strong>
                    </div>
                    <div className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {t('projectManagerPage.projectInfo.statPriced')}
                      </span>
                      <strong>{resourceStats.priced}</strong>
                    </div>
                    <div className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {t('projectManagerPage.projectInfo.statUnpriced')}
                      </span>
                      <strong>{resourceStats.unpriced}</strong>
                    </div>
                    <div className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {t('projectManagerPage.projectInfo.statAvgUnitPrice')}
                      </span>
                      <strong>
                        {resourceStats.avgUnitPrice != null
                          ? formatMoney(resourceStats.avgUnitPrice)
                          : '—'}
                      </strong>
                    </div>
                    <div className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {t('projectManagerPage.projectInfo.statMinUnitPrice')}
                      </span>
                      <strong>
                        {resourceStats.minPrice != null
                          ? formatMoney(resourceStats.minPrice)
                          : '—'}
                      </strong>
                    </div>
                    <div className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {t('projectManagerPage.projectInfo.statMaxUnitPrice')}
                      </span>
                      <strong>
                        {resourceStats.maxPrice != null
                          ? formatMoney(resourceStats.maxPrice)
                          : '—'}
                      </strong>
                    </div>
                    <div className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {t('projectManagerPage.projectInfo.statCatalogValue')}
                      </span>
                      <strong>
                        {resourceStats.priced > 0
                          ? formatMoney(resourceStats.priceSum)
                          : '—'}
                      </strong>
                    </div>
                  </div>
                ) : (
                  <div className="tm-pm-project-info-stats">
                    <div className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {t('projectManagerPage.projectInfo.statTasks')}
                      </span>
                      <strong>{stats.total}</strong>
                    </div>
                    <div className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {t('projectManagerPage.projectInfo.statMilestones')}
                      </span>
                      <strong>{stats.milestones}</strong>
                    </div>
                    <div className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {t('projectManagerPage.projectInfo.statDone')}
                      </span>
                      <strong>{stats.done}</strong>
                    </div>
                    <div className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {t('projectManagerPage.projectInfo.statInProgress')}
                      </span>
                      <strong>{stats.inProgress}</strong>
                    </div>
                    <div className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {t('projectManagerPage.projectInfo.statBlocked')}
                      </span>
                      <strong>{stats.blocked}</strong>
                    </div>
                    <div className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {t('projectManagerPage.projectInfo.statAvgProgress')}
                      </span>
                      <strong>{stats.avgProgress}%</strong>
                    </div>
                    <div className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {t('projectManagerPage.projectInfo.statEarliestStart')}
                      </span>
                      <strong>
                        {stats.earliestStart != null
                          ? formatWorkItemDate(stats.earliestStart)
                          : '—'}
                      </strong>
                    </div>
                    <div className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {t('projectManagerPage.projectInfo.statLatestFinish')}
                      </span>
                      <strong>
                        {stats.latestFinish != null
                          ? formatWorkItemDate(stats.latestFinish)
                          : '—'}
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {activeTab === 'advanced' ? (
              <div className="tm-kb-settings-form">
                <p className="tm-kb-settings-hint">
                  {isResourceInfo
                    ? t('projectManagerPage.projectInfo.advancedHintResource')
                    : t('projectManagerPage.projectInfo.advancedHint')}
                </p>
                {!isWorkspaceResource ? (
                  <>
                    <div className="tm-kb-settings-row">
                      <label className="tm-kb-settings-label" htmlFor="pm-info-region">
                        {t('projectManagerPage.projectInfo.fieldRegion')}
                      </label>
                      <input
                        id="pm-info-region"
                        className="tm-kb-settings-input"
                        value={draft.region}
                        onChange={(event) => patchDraft({ region: event.target.value })}
                      />
                    </div>
                    <div className="tm-kb-settings-row">
                      <label className="tm-kb-settings-label" htmlFor="pm-info-contract">
                        {t('projectManagerPage.projectInfo.fieldContractValue')}
                      </label>
                      <input
                        id="pm-info-contract"
                        className="tm-kb-settings-input"
                        value={draft.contractValue}
                        onChange={(event) => patchDraft({ contractValue: event.target.value })}
                      />
                    </div>
                    <div className="tm-kb-settings-row">
                      <label className="tm-kb-settings-label" htmlFor="pm-info-settled">
                        {t('projectManagerPage.projectInfo.fieldSettledAmount')}
                      </label>
                      <input
                        id="pm-info-settled"
                        className="tm-kb-settings-input"
                        value={draft.settledAmount}
                        onChange={(event) => patchDraft({ settledAmount: event.target.value })}
                      />
                    </div>
                    <div className="tm-kb-settings-row">
                      <label className="tm-kb-settings-label" htmlFor="pm-info-progress">
                        {t('projectManagerPage.projectInfo.fieldProgressPercent')}
                      </label>
                      <input
                        id="pm-info-progress"
                        className="tm-kb-settings-input"
                        value={draft.progressPercent}
                        onChange={(event) => patchDraft({ progressPercent: event.target.value })}
                      />
                    </div>
                    <div className="tm-kb-settings-row">
                      <label className="tm-kb-settings-label" htmlFor="pm-info-root">
                        {t('projectManagerPage.projectInfo.fieldWorkspaceRoot')}
                      </label>
                      <input
                        id="pm-info-root"
                        className="tm-kb-settings-input"
                        value={draft.workspaceRoot}
                        onChange={(event) => patchDraft({ workspaceRoot: event.target.value })}
                      />
                    </div>
                  </>
                ) : null}
                {isResourceInfo && (!isCreate || isWorkspaceResource) ? (
                  <>
                    <div className="tm-kb-settings-row">
                      <label className="tm-kb-settings-label">
                        {t('projectManagerPage.projectInfo.fieldUpdatedAt')}
                      </label>
                      <span className="tm-kb-settings-readonly">
                        {lastSavedAt != null
                          ? formatDateTime(lastSavedAt, dateInputLang)
                          : '—'}
                      </span>
                    </div>
                    <div className="tm-kb-settings-row">
                      <label className="tm-kb-settings-label">
                        {t('projectManagerPage.projectInfo.fieldResourceVersion')}
                      </label>
                      <span className="tm-kb-settings-readonly">
                        {resourceVersion > 0
                          ? t('projectManagerPage.projectInfo.saveHistoryVersion', {
                              version: String(resourceVersion),
                            })
                          : t('projectManagerPage.projectInfo.resourceVersionNever')}
                      </span>
                    </div>
                    <div className="tm-kb-settings-row">
                      <label className="tm-kb-settings-label">
                        {t('projectManagerPage.projectInfo.fieldLastSavedAt')}
                      </label>
                      <span className="tm-kb-settings-readonly">
                        {lastSavedAt != null
                          ? formatDateTime(lastSavedAt, dateInputLang)
                          : '—'}
                      </span>
                    </div>
                    <div className="tm-kb-settings-row tm-kb-settings-row--top">
                      <label className="tm-kb-settings-label">
                        {t('projectManagerPage.projectInfo.fieldSaveHistory')}
                      </label>
                      {resourceHistoryRows.length === 0 ? (
                        <span className="tm-kb-settings-readonly">
                          {t('projectManagerPage.projectInfo.saveHistoryEmpty')}
                        </span>
                      ) : (
                        <div
                          className="tm-pm-project-info-save-history tm-pm-project-info-save-history--resource"
                          role="table">
                          <div
                            className="tm-pm-project-info-save-history-head"
                            role="row">
                            <span role="columnheader">
                              {t('projectManagerPage.projectInfo.saveHistoryColVersion')}
                            </span>
                            <span role="columnheader">
                              {t('projectManagerPage.projectInfo.saveHistoryColSavedAt')}
                            </span>
                            <span role="columnheader">
                              {t('projectManagerPage.projectInfo.saveHistoryColResources')}
                            </span>
                            <span
                              role="columnheader"
                              className="tm-pm-project-info-save-history-actions">
                              {t('projectManagerPage.projectInfo.saveHistoryColActions')}
                            </span>
                          </div>
                          {resourceHistoryRows.map((entry) => (
                            <div
                              key={`${entry.version}-${entry.savedAt}`}
                              className="tm-pm-project-info-save-history-row"
                              role="row">
                              <span role="cell">
                                {t('projectManagerPage.projectInfo.saveHistoryVersion', {
                                  version: String(entry.version),
                                })}
                                {entry.version === resourceVersion ? (
                                  <span className="tm-pm-project-info-save-history-current">
                                    {t('projectManagerPage.projectInfo.saveHistoryCurrent')}
                                  </span>
                                ) : null}
                              </span>
                              <span role="cell">
                                {formatDateTime(entry.savedAt, dateInputLang)}
                              </span>
                              <span role="cell">
                                {t('projectManagerPage.projectInfo.saveHistoryResources', {
                                  count: String(entry.resourceCount),
                                })}
                              </span>
                              <span
                                role="cell"
                                className="tm-pm-project-info-save-history-actions">
                                <button
                                  type="button"
                                  className="tm-pm-project-info-save-history-delete"
                                  disabled={deletingHistoryVersion === entry.version}
                                  onClick={() => void handleDeleteResourceHistoryEntry(entry)}>
                                  {deletingHistoryVersion === entry.version
                                    ? '…'
                                    : t('common.delete')}
                                </button>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
                {!isResourceInfo && !isCreate && project ? (
                  <>
                    <div className="tm-kb-settings-row">
                      <label className="tm-kb-settings-label">
                        {t('projectManagerPage.projectInfo.fieldUpdatedAt')}
                      </label>
                      <span className="tm-kb-settings-readonly">
                        {formatWorkItemDate(project.updatedAt)}
                      </span>
                    </div>
                    <div className="tm-kb-settings-row">
                      <label className="tm-kb-settings-label">
                        {t('projectManagerPage.projectInfo.fieldScheduleVersion')}
                      </label>
                      <span className="tm-kb-settings-readonly">
                        {scheduleVersion > 0
                          ? t('projectManagerPage.projectInfo.saveHistoryVersion', {
                              version: String(scheduleVersion),
                            })
                          : t('projectManagerPage.projectInfo.scheduleVersionNever')}
                      </span>
                    </div>
                    <div className="tm-kb-settings-row">
                      <label className="tm-kb-settings-label">
                        {t('projectManagerPage.projectInfo.fieldLastSavedAt')}
                      </label>
                      <span className="tm-kb-settings-readonly">
                        {lastSavedAt != null
                          ? formatDateTime(lastSavedAt, dateInputLang)
                          : '—'}
                      </span>
                    </div>
                    <div className="tm-kb-settings-row tm-kb-settings-row--top">
                      <label className="tm-kb-settings-label">
                        {t('projectManagerPage.projectInfo.fieldSaveHistory')}
                      </label>
                      {scheduleHistoryRows.length === 0 ? (
                        <span className="tm-kb-settings-readonly">
                          {t('projectManagerPage.projectInfo.saveHistoryEmpty')}
                        </span>
                      ) : (
                        <div className="tm-pm-project-info-save-history" role="table">
                          <div
                            className="tm-pm-project-info-save-history-head"
                            role="row">
                            <span role="columnheader">
                              {t('projectManagerPage.projectInfo.saveHistoryColVersion')}
                            </span>
                            <span role="columnheader">
                              {t('projectManagerPage.projectInfo.saveHistoryColSavedAt')}
                            </span>
                            <span role="columnheader">
                              {t('projectManagerPage.projectInfo.saveHistoryColDuration')}
                            </span>
                            <span role="columnheader">
                              {t('projectManagerPage.projectInfo.saveHistoryColTasks')}
                            </span>
                            <span
                              role="columnheader"
                              className="tm-pm-project-info-save-history-actions">
                              {t('projectManagerPage.projectInfo.saveHistoryColActions')}
                            </span>
                          </div>
                          {scheduleHistoryRows.map((entry) => (
                            <div
                              key={`${entry.version}-${entry.savedAt}`}
                              className="tm-pm-project-info-save-history-row"
                              role="row">
                              <span role="cell">
                                {t('projectManagerPage.projectInfo.saveHistoryVersion', {
                                  version: String(entry.version),
                                })}
                                {entry.version === scheduleVersion ? (
                                  <span className="tm-pm-project-info-save-history-current">
                                    {t('projectManagerPage.projectInfo.saveHistoryCurrent')}
                                  </span>
                                ) : null}
                              </span>
                              <span role="cell">
                                {formatDateTime(entry.savedAt, dateInputLang)}
                              </span>
                              <span role="cell">
                                {entry.totalDurationDays != null
                                  ? t('projectManagerPage.projectInfo.saveHistoryDuration', {
                                      days: String(entry.totalDurationDays),
                                    })
                                  : '—'}
                              </span>
                              <span role="cell">
                                {t('projectManagerPage.projectInfo.saveHistoryTasks', {
                                  count: String(entry.workItemCount),
                                })}
                              </span>
                              <span
                                role="cell"
                                className="tm-pm-project-info-save-history-actions">
                                <button
                                  type="button"
                                  className="tm-pm-project-info-save-history-delete"
                                  disabled={deletingHistoryVersion === entry.version}
                                  onClick={() => void handleDeleteScheduleHistoryEntry(entry)}>
                                  {deletingHistoryVersion === entry.version
                                    ? '…'
                                    : t('common.delete')}
                                </button>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <footer className="tm-kb-settings-modal-footer">
          <div className="tm-kb-settings-modal-footer-actions">
            <button
              type="button"
              className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--secondary"
              onClick={onClose}
              disabled={saving}>
              {t('projectManagerPage.database.cancel')}
            </button>
            {isWorkspaceResource ? (
              <button
                type="button"
                className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--primary"
                onClick={() => void handleSave()}
                disabled={saving || !props.onSaveResources}>
                {saving
                  ? t('projectManagerPage.projectInfo.saving')
                  : t('projectManagerPage.projectInfo.saveResources')}
              </button>
            ) : (
              <>
                {isCreate ? (
                  <button
                    type="button"
                    className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--secondary"
                    onClick={() => void handleSave({ manualCreate: true })}
                    disabled={saving}>
                    {saving
                      ? t('projectManagerPage.projectInfo.saving')
                      : t('projectManagerPage.projectInfo.manualCreate')}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--primary"
                  onClick={() => void handleSave()}
                  disabled={saving}>
                  {saving
                    ? t('projectManagerPage.projectInfo.saving')
                    : isCreate
                      ? t('projectManagerPage.projectInfo.confirmCreate')
                      : t('projectManagerPage.database.save')}
                </button>
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}

export default ProjectInfoDialog

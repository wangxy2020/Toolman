import type { FC } from 'react'
import { Fragment, useEffect, useMemo, useState } from 'react'

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
  type PmDomain,
  type PmFeatureSaveRecord,
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
  computeCostTotalPrice,
  costSectionalWorkKey,
  PM_COST_PRIMARY_TYPES,
  PM_COST_RESOURCE_TYPES,
  PM_COST_TYPES,
  readSharedCostLastSavedAt,
  readSharedCostSaveHistory,
  readSharedCostSaveMeta,
  readSharedCostVersion,
  removeSharedCostSaveHistoryEntry,
  writeSharedCostSaveMeta,
  type PmCostRow,
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
  type PmFeatureRow,
} from '../files/pm-features-catalog'
import {
  PM_RESOURCE_TYPES,
  readSharedResourceLastSavedAt,
  readSharedResourceSaveHistory,
  readSharedResourceVersion,
  removeSharedResourceSaveHistoryEntry,
  type PmResourceRow,
  type PmResourceType,
} from '../resource/pm-resource-catalog'
import {
  readPracticeLastSavedAt,
  readPracticeSaveHistory,
  readPracticeVersion,
  removePracticeSaveHistoryEntry,
} from '../resource/pm-resource-practice-catalog'
import { formatWorkItemDate } from './pm-gantt-utils'
import { pmScheduleApi } from './pm-schedule-api'

type ProjectInfoVariant = 'schedule' | 'resource' | 'cost' | 'features'
type InfoTab = 'overview' | 'schedule' | 'resource' | 'cost' | 'domain' | 'statistics' | 'advanced'
type DomainTabKind = 'schedule' | 'resource' | 'cost' | 'placeholder'

function resolveInfoDomain(
  isCreate: boolean,
  createDomain: PmDomain | undefined,
  projectDomain: PmDomain | undefined,
  variant: ProjectInfoVariant | undefined,
): PmDomain {
  if (isCreate && createDomain) return createDomain
  // Explicit opener context (resource / cost / schedule panels) wins over stored domain.
  if (variant === 'resource') return 'resource_management'
  if (variant === 'cost') return 'cost_management'
  if (variant === 'schedule' || variant === 'features') return 'progress_management'
  return projectDomain ?? 'progress_management'
}

function resolveDomainTabKind(domain: PmDomain): DomainTabKind {
  if (domain === 'progress_management') return 'schedule'
  if (domain === 'resource_management') return 'resource'
  if (domain === 'cost_management') return 'cost'
  return 'placeholder'
}

function resolveDomainTabId(kind: DomainTabKind): InfoTab {
  if (kind === 'schedule') return 'schedule'
  if (kind === 'resource') return 'resource'
  if (kind === 'cost') return 'cost'
  return 'domain'
}

type PmProjectType = 'construction_gc' | 'epc' | 'owner_managed' | 'ordinary'
type PmPlanCalendar = 'calendar_days' | 'working_days'

/** Default currency for price-list project info (价格 tab). */
const DEFAULT_COST_CURRENCY = '元'
const COST_CURRENCY_META_KEY = 'costCurrency'
const PM_COST_ESTIMATE_TYPES = [
  'investment',
  'designEstimate',
  'constructionBudget',
  'costBudget',
] as const satisfies readonly PmCostType[]
const PM_COST_ESTIMATE_TYPE_SET = new Set<PmCostType>(PM_COST_ESTIMATE_TYPES)

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
  /** Price-list currency label; defaults to 元. */
  costCurrency: string
}

function readCostCurrency(metadata: Record<string, unknown> | null | undefined): string {
  if (!metadata) return DEFAULT_COST_CURRENCY
  const value = metadata[COST_CURRENCY_META_KEY]
  if (typeof value === 'string' && value.trim()) return value.trim()
  return DEFAULT_COST_CURRENCY
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
  /** When `resource` / `cost` / `features`, middle tab and stats come from that catalog. */
  variant?: ProjectInfoVariant
  resourceRows?: PmResourceRow[]
  costRows?: PmCostRow[]
  featureRows?: PmFeatureRow[]
  /**
   * When set with `variant` resource/cost, Advanced history uses practice localStorage
   * (not project price/resource catalog metadata).
   */
  practiceScopeId?: string
  /** Persist the resource catalog (same as toolbar Save). Used when `variant` is `resource`. */
  onSaveResources?: () => void | Promise<void | boolean>
  /** Persist the price catalog (same as toolbar Save). Used when `variant` is `cost`. */
  onSaveCosts?: () => void | Promise<void | boolean>
  /** Persist the practice catalog (same as toolbar Save). Used when `variant` is `features`. */
  onSaveFeatures?: () => void | Promise<void | boolean>
  onClose: () => void
  onSaved: (project: PmProject, options?: { manualCreate?: boolean }) => void
}

interface CreateProps {
  mode: 'create'
  createDefaults: CreateDefaults
  workItems?: PmWorkItem[]
  variant?: ProjectInfoVariant
  resourceRows?: PmResourceRow[]
  costRows?: PmCostRow[]
  featureRows?: PmFeatureRow[]
  onClose: () => void
  onSaved: (project: PmProject, options?: { manualCreate?: boolean }) => void
}

/** Workspace「全部项目」resource info (no concrete PmProject). */
interface WorkspaceResourceProps {
  mode: 'workspaceResource'
  workspaceId: string
  resourceRows?: PmResourceRow[]
  /** When set, Advanced history uses resource-practice localStorage. */
  practiceScopeId?: string
  /** Persist the shared resource catalog (same as toolbar Save). */
  onSaveResources?: () => void | Promise<void | boolean>
  onClose: () => void
  onSaved?: () => void
}

/** Workspace「全部项目」price-list info (no concrete PmProject). */
interface WorkspaceCostProps {
  mode: 'workspaceCost'
  workspaceId: string
  costRows?: PmCostRow[]
  /** When set, Advanced history uses cost-practice localStorage. */
  practiceScopeId?: string
  /** Persist the shared price catalog (same as toolbar Save). */
  onSaveCosts?: () => void | Promise<void | boolean>
  onClose: () => void
  onSaved?: () => void
}

/** Workspace「全部项目」practice-catalog info (no concrete PmProject). */
interface WorkspaceFeaturesProps {
  mode: 'workspaceFeatures'
  workspaceId: string
  featureRows?: PmFeatureRow[]
  /** Persist the shared practice catalog (same as toolbar Save). */
  onSaveFeatures?: () => void | Promise<void | boolean>
  onClose: () => void
  onSaved?: () => void
}

type Props = EditProps | CreateProps | WorkspaceResourceProps | WorkspaceCostProps | WorkspaceFeaturesProps

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
    costCurrency: DEFAULT_COST_CURRENCY,
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
    costCurrency: readCostCurrency(metadata),
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
  setMeta(
    COST_CURRENCY_META_KEY,
    draft.costCurrency.trim() || DEFAULT_COST_CURRENCY,
  )
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

function computeCostStats(rows: PmCostRow[]) {
  const amountByType = Object.fromEntries(
    PM_COST_TYPES.map((type) => [type, { total: 0, hasAmount: false }]),
  ) as Record<PmCostType, { total: number; hasAmount: boolean }>
  const sectionTotals = new Map<string, { total: number; hasAmount: boolean }>()
  const sectionOrder: string[] = []
  let priced = 0
  let priceSum = 0
  let totalPriceSum = 0
  let hasTotal = false
  let minPrice: number | null = null
  let maxPrice: number | null = null
  for (const row of rows) {
    const sectionKey = costSectionalWorkKey(row)
    if (!sectionTotals.has(sectionKey)) {
      sectionTotals.set(sectionKey, { total: 0, hasAmount: false })
      sectionOrder.push(sectionKey)
    }
    const section = sectionTotals.get(sectionKey)!
    const amount = computeCostTotalPrice(row.quantity, row.unitPrice)
    if (amount != null) {
      section.total += amount
      section.hasAmount = true
      amountByType[row.type].total += amount
      amountByType[row.type].hasAmount = true
      totalPriceSum += amount
      hasTotal = true
    }
    if (row.unitPrice != null && Number.isFinite(row.unitPrice)) {
      priced += 1
      priceSum += row.unitPrice
      minPrice = minPrice == null ? row.unitPrice : Math.min(minPrice, row.unitPrice)
      maxPrice = maxPrice == null ? row.unitPrice : Math.max(maxPrice, row.unitPrice)
    }
  }
  return {
    total: rows.length,
    priced,
    unpriced: rows.length - priced,
    avgUnitPrice: priced === 0 ? null : Math.round((priceSum / priced) * 100) / 100,
    totalPriceSum: hasTotal ? Math.round(totalPriceSum * 100) / 100 : null,
    minPrice,
    maxPrice,
    /** 分部工程 cards: name + 合价 (first-appearance order). */
    sections: sectionOrder.map((key) => {
      const entry = sectionTotals.get(key)!
      return {
        key,
        amount: entry.hasAmount ? Math.round(entry.total * 100) / 100 : null,
      }
    }),
    /** Per-type 合价合计 (quantity × unitPrice). */
    amountByType: Object.fromEntries(
      PM_COST_TYPES.map((type) => {
        const entry = amountByType[type]
        return [type, entry.hasAmount ? Math.round(entry.total * 100) / 100 : null]
      }),
    ) as Record<PmCostType, number | null>,
  }
}

const ProjectInfoDialog: FC<Props> = (props) => {
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
        costCurrency: readCostCurrency(
          practiceScopeId
            ? {}
            : readSharedCostSaveMeta(workspaceCostId),
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
    t(`projectManagerPage.costTable.types.${type}`)

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
        const currency = draft.costCurrency.trim() || DEFAULT_COST_CURRENCY
        const result = await onSaveCosts()
        if (result === false) return
        // Write currency after catalog save so persistProjectCatalog cannot wipe it
        // (updateProject shallow-merges metadata).
        if (isWorkspaceCost && workspaceCostId) {
          const meta = readSharedCostSaveMeta(workspaceCostId)
          writeSharedCostSaveMeta(workspaceCostId, {
            ...meta,
            [COST_CURRENCY_META_KEY]: currency,
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
            metadata: {
              [COST_CURRENCY_META_KEY]: currency,
            },
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

            {activeTab === 'cost' ? (
              <div className="tm-kb-settings-form">
                <p className="tm-kb-settings-hint">
                  {isWorkspaceCost
                    ? t('projectManagerPage.projectInfo.costHintAllProjects')
                    : t('projectManagerPage.projectInfo.costHint')}
                </p>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label">
                    {t('projectManagerPage.projectInfo.fieldResourceScope')}
                  </label>
                  <span className="tm-kb-settings-readonly">
                    {isWorkspaceCost
                      ? t('projectManagerPage.headerProject.allProjects')
                      : project
                        ? [project.code.trim(), project.name.trim()].filter(Boolean).join(' · ') ||
                          project.id
                        : '—'}
                  </span>
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label">
                    {t('projectManagerPage.projectInfo.statCosts')}
                  </label>
                  <span className="tm-kb-settings-readonly">{costStats.total}</span>
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label">
                    {t('projectManagerPage.projectInfo.statPriced')}
                  </label>
                  <span className="tm-kb-settings-readonly">{costStats.priced}</span>
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label">
                    {t('projectManagerPage.projectInfo.statUnpriced')}
                  </label>
                  <span className="tm-kb-settings-readonly">{costStats.unpriced}</span>
                </div>
                <div className="tm-pm-project-info-stats-group">
                  <div className="tm-pm-project-info-stats-group-title">
                    {t('projectManagerPage.projectInfo.statGroupResource')}
                  </div>
                  <div className="tm-pm-project-info-stats">
                    {PM_COST_RESOURCE_TYPES.map((type) => (
                      <div key={type} className="tm-pm-project-info-stat">
                        <div className="tm-pm-project-info-stat-label-row">
                          <span className="tm-pm-project-info-stat-label">
                            {costTypeLabel(type)}
                          </span>
                          <span className="tm-pm-project-info-stat-currency-tag">
                            {t('projectManagerPage.projectInfo.fieldCurrency')}
                          </span>
                        </div>
                        <div className="tm-pm-project-info-stat-value-row">
                          <strong>
                            {costStats.amountByType[type] != null
                              ? formatMoney(costStats.amountByType[type]!)
                              : '—'}
                          </strong>
                          <input
                            className="tm-kb-settings-input tm-pm-project-info-stat-currency-input"
                            value={draft.costCurrency}
                            onChange={(event) =>
                              patchDraft({ costCurrency: event.target.value })
                            }
                            placeholder={DEFAULT_COST_CURRENCY}
                            aria-label={t('projectManagerPage.projectInfo.fieldCurrency')}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="tm-pm-project-info-stats-group">
                  <div className="tm-pm-project-info-stats-group-title">
                    {t('projectManagerPage.projectInfo.statGroupCost')}
                  </div>
                  <div className="tm-pm-project-info-stats">
                    {PM_COST_PRIMARY_TYPES.filter(
                      (type) => !PM_COST_ESTIMATE_TYPE_SET.has(type),
                    ).map((type) => (
                      <Fragment key={type}>
                        <div className="tm-pm-project-info-stat">
                          <div className="tm-pm-project-info-stat-label-row">
                            <span className="tm-pm-project-info-stat-label">
                              {costTypeLabel(type)}
                            </span>
                            <span className="tm-pm-project-info-stat-currency-tag">
                              {t('projectManagerPage.projectInfo.fieldCurrency')}
                            </span>
                          </div>
                          <div className="tm-pm-project-info-stat-value-row">
                            <strong>
                              {costStats.amountByType[type] != null
                                ? formatMoney(costStats.amountByType[type]!)
                                : '—'}
                            </strong>
                            <input
                              className="tm-kb-settings-input tm-pm-project-info-stat-currency-input"
                              value={draft.costCurrency}
                              onChange={(event) =>
                                patchDraft({ costCurrency: event.target.value })
                              }
                              placeholder={DEFAULT_COST_CURRENCY}
                              aria-label={t('projectManagerPage.projectInfo.fieldCurrency')}
                            />
                          </div>
                        </div>
                        {type === 'comprehensive'
                          ? costStats.sections.map((section) => {
                              const sectionName =
                                section.key ||
                                t('projectManagerPage.costTable.views.sectionEmpty')
                              return (
                                <div
                                  key={`section:${section.key || '__empty__'}`}
                                  className="tm-pm-project-info-stat"
                                >
                                  <div className="tm-pm-project-info-stat-label-row">
                                    <span className="tm-pm-project-info-stat-label">
                                      {t('projectManagerPage.projectInfo.statSectionalWorkNamed', {
                                        name: sectionName,
                                      })}
                                    </span>
                                    <span className="tm-pm-project-info-stat-currency-tag">
                                      {t('projectManagerPage.projectInfo.fieldCurrency')}
                                    </span>
                                  </div>
                                  <div className="tm-pm-project-info-stat-value-row">
                                    <strong>
                                      {section.amount != null
                                        ? formatMoney(section.amount)
                                        : '—'}
                                    </strong>
                                    <input
                                      className="tm-kb-settings-input tm-pm-project-info-stat-currency-input"
                                      value={draft.costCurrency}
                                      onChange={(event) =>
                                        patchDraft({ costCurrency: event.target.value })
                                      }
                                      placeholder={DEFAULT_COST_CURRENCY}
                                      aria-label={t(
                                        'projectManagerPage.projectInfo.fieldCurrency',
                                      )}
                                    />
                                  </div>
                                </div>
                              )
                            })
                          : null}
                      </Fragment>
                    ))}
                  </div>
                </div>
                <div className="tm-pm-project-info-stats-group">
                  <div className="tm-pm-project-info-stats-group-title">
                    {t('projectManagerPage.projectInfo.statGroupEstimate')}
                  </div>
                  <div className="tm-pm-project-info-stats">
                    {PM_COST_ESTIMATE_TYPES.map((type) => (
                      <div key={type} className="tm-pm-project-info-stat">
                        <div className="tm-pm-project-info-stat-label-row">
                          <span className="tm-pm-project-info-stat-label">
                            {costTypeLabel(type)}
                          </span>
                          <span className="tm-pm-project-info-stat-currency-tag">
                            {t('projectManagerPage.projectInfo.fieldCurrency')}
                          </span>
                        </div>
                        <div className="tm-pm-project-info-stat-value-row">
                          <strong>
                            {costStats.amountByType[type] != null
                              ? formatMoney(costStats.amountByType[type]!)
                              : '—'}
                          </strong>
                          <input
                            className="tm-kb-settings-input tm-pm-project-info-stat-currency-input"
                            value={draft.costCurrency}
                            onChange={(event) =>
                              patchDraft({ costCurrency: event.target.value })
                            }
                            placeholder={DEFAULT_COST_CURRENCY}
                            aria-label={t('projectManagerPage.projectInfo.fieldCurrency')}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
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
                  {isFeaturesInfo
                    ? t('projectManagerPage.projectInfo.featuresStatisticsHint')
                    : domainTabKind === 'resource'
                      ? t('projectManagerPage.projectInfo.resourceStatisticsHint')
                      : domainTabKind === 'cost'
                        ? t('projectManagerPage.projectInfo.costStatisticsHint')
                        : domainTabKind === 'placeholder'
                          ? t('projectManagerPage.projectInfo.domainStatisticsPlaceholderHint', {
                              domain: domainTabLabel,
                            })
                          : t('projectManagerPage.projectInfo.statisticsHint')}
                </p>
                {isFeaturesInfo ? (
                  <div className="tm-pm-project-info-stats">
                    <div className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {t('projectManagerPage.projectInfo.statFeatures')}
                      </span>
                      <strong>{featureStats.total}</strong>
                    </div>
                  </div>
                ) : domainTabKind === 'placeholder' ? (
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
                ) : domainTabKind === 'cost' ? (
                  <div className="tm-pm-project-info-stats">
                    <div className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {t('projectManagerPage.projectInfo.statCosts')}
                      </span>
                      <strong>{costStats.total}</strong>
                    </div>
                    <div className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {t('projectManagerPage.projectInfo.statPriced')}
                      </span>
                      <strong>{costStats.priced}</strong>
                    </div>
                    <div className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {t('projectManagerPage.projectInfo.statUnpriced')}
                      </span>
                      <strong>{costStats.unpriced}</strong>
                    </div>
                    <div className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {t('projectManagerPage.projectInfo.statAvgUnitPrice')}
                      </span>
                      <strong>
                        {costStats.avgUnitPrice != null
                          ? formatMoney(costStats.avgUnitPrice)
                          : '—'}
                      </strong>
                    </div>
                    <div className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {t('projectManagerPage.projectInfo.statMinUnitPrice')}
                      </span>
                      <strong>
                        {costStats.minPrice != null ? formatMoney(costStats.minPrice) : '—'}
                      </strong>
                    </div>
                    <div className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {t('projectManagerPage.projectInfo.statMaxUnitPrice')}
                      </span>
                      <strong>
                        {costStats.maxPrice != null ? formatMoney(costStats.maxPrice) : '—'}
                      </strong>
                    </div>
                    <div className="tm-pm-project-info-stat">
                      <span className="tm-pm-project-info-stat-label">
                        {t('projectManagerPage.projectInfo.statCatalogTotalPrice')}
                      </span>
                      <strong>
                        {costStats.totalPriceSum != null
                          ? formatMoney(costStats.totalPriceSum)
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
                {isFeaturesInfo ? (
                  <p className="tm-kb-settings-hint">
                    {t('projectManagerPage.projectInfo.advancedHintFeatures')}
                  </p>
                ) : null}
                {!isWorkspaceCatalog ? (
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
                {isCostInfo && (!isCreate || isWorkspaceCost) ? (
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
                        {t('projectManagerPage.projectInfo.fieldCostVersion')}
                      </label>
                      <span className="tm-kb-settings-readonly">
                        {costVersion > 0
                          ? t('projectManagerPage.projectInfo.saveHistoryVersion', {
                              version: String(costVersion),
                            })
                          : t('projectManagerPage.projectInfo.costVersionNever')}
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
                      {costHistoryRows.length === 0 ? (
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
                              {t('projectManagerPage.projectInfo.saveHistoryColCosts')}
                            </span>
                            <span
                              role="columnheader"
                              className="tm-pm-project-info-save-history-actions">
                              {t('projectManagerPage.projectInfo.saveHistoryColActions')}
                            </span>
                          </div>
                          {costHistoryRows.map((entry) => (
                            <div
                              key={`${entry.version}-${entry.savedAt}`}
                              className="tm-pm-project-info-save-history-row"
                              role="row">
                              <span role="cell">
                                {t('projectManagerPage.projectInfo.saveHistoryVersion', {
                                  version: String(entry.version),
                                })}
                                {entry.version === costVersion ? (
                                  <span className="tm-pm-project-info-save-history-current">
                                    {t('projectManagerPage.projectInfo.saveHistoryCurrent')}
                                  </span>
                                ) : null}
                              </span>
                              <span role="cell">
                                {formatDateTime(entry.savedAt, dateInputLang)}
                              </span>
                              <span role="cell">
                                {t('projectManagerPage.projectInfo.saveHistoryCosts', {
                                  count: String(entry.costCount),
                                })}
                              </span>
                              <span
                                role="cell"
                                className="tm-pm-project-info-save-history-actions">
                                <button
                                  type="button"
                                  className="tm-pm-project-info-save-history-delete"
                                  disabled={deletingHistoryVersion === entry.version}
                                  onClick={() => void handleDeleteCostHistoryEntry(entry)}>
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
                {isFeaturesInfo && (!isCreate || isWorkspaceFeatures) ? (
                  <>
                    <div className="tm-kb-settings-row">
                      <label className="tm-kb-settings-label">
                        {t('projectManagerPage.projectInfo.fieldFeatureVersion')}
                      </label>
                      <span className="tm-kb-settings-readonly">
                        {featureVersion > 0
                          ? t('projectManagerPage.projectInfo.saveHistoryVersion', {
                              version: String(featureVersion),
                            })
                          : t('projectManagerPage.projectInfo.featureVersionNever')}
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
                      {featureHistoryRows.length === 0 ? (
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
                              {t('projectManagerPage.projectInfo.saveHistoryColFeatures')}
                            </span>
                            <span
                              role="columnheader"
                              className="tm-pm-project-info-save-history-actions">
                              {t('projectManagerPage.projectInfo.saveHistoryColActions')}
                            </span>
                          </div>
                          {featureHistoryRows.map((entry) => (
                            <div
                              key={`${entry.version}-${entry.savedAt}`}
                              className="tm-pm-project-info-save-history-row"
                              role="row">
                              <span role="cell">
                                {t('projectManagerPage.projectInfo.saveHistoryVersion', {
                                  version: String(entry.version),
                                })}
                                {entry.version === featureVersion ? (
                                  <span className="tm-pm-project-info-save-history-current">
                                    {t('projectManagerPage.projectInfo.saveHistoryCurrent')}
                                  </span>
                                ) : null}
                              </span>
                              <span role="cell">
                                {formatDateTime(entry.savedAt, dateInputLang)}
                              </span>
                              <span role="cell">
                                {t('projectManagerPage.projectInfo.saveHistoryFeatures', {
                                  count: String(entry.featureCount),
                                })}
                              </span>
                              <span
                                role="cell"
                                className="tm-pm-project-info-save-history-actions">
                                <button
                                  type="button"
                                  className="tm-pm-project-info-save-history-delete"
                                  disabled={deletingHistoryVersion === entry.version}
                                  onClick={() => void handleDeleteFeatureHistoryEntry(entry)}>
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
                {!isResourceInfo && !isCostInfo && !isFeaturesInfo && !isCreate && project ? (
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
            {isWorkspaceResource ||
            (isResourceInfo &&
              !isCreate &&
              'onSaveResources' in props &&
              props.onSaveResources) ? (
              <button
                type="button"
                className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--primary"
                onClick={() => void handleSave()}
                disabled={
                  saving ||
                  !(isWorkspaceResource
                    ? props.onSaveResources
                    : 'onSaveResources' in props && props.onSaveResources)
                }>
                {saving
                  ? t('projectManagerPage.projectInfo.saving')
                  : t('projectManagerPage.projectInfo.saveCatalog')}
              </button>
            ) : isCostInfo &&
              ((props.mode === 'workspaceCost' && props.onSaveCosts) ||
                (props.mode !== 'workspaceCost' &&
                  props.mode !== 'create' &&
                  'onSaveCosts' in props &&
                  props.onSaveCosts)) ? (
              <button
                type="button"
                className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--primary"
                onClick={() => void handleSave()}
                disabled={saving}>
                {saving
                  ? t('projectManagerPage.projectInfo.saving')
                  : t('projectManagerPage.projectInfo.saveCatalog')}
              </button>
            ) : isFeaturesInfo &&
              ((props.mode === 'workspaceFeatures' && props.onSaveFeatures) ||
                (props.mode !== 'workspaceFeatures' &&
                  props.mode !== 'create' &&
                  'onSaveFeatures' in props &&
                  props.onSaveFeatures)) ? (
              <button
                type="button"
                className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--primary"
                onClick={() => void handleSave()}
                disabled={saving}>
                {saving
                  ? t('projectManagerPage.projectInfo.saving')
                  : t('projectManagerPage.projectInfo.saveCatalog')}
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

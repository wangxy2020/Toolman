/** Pure types and helpers for `ProjectInfoDialog` (no React). */

import type { PmDomain, PmProject, PmProjectStatus, PmWorkItem } from '@toolman/shared'

import {
  COST_CURRENCIES_META_KEY,
  COST_CURRENCY_META_KEY,
  DEFAULT_COST_CURRENCY,
  normalizeCostCurrencies,
  readCostCurrencyState,
} from '../cost/pm-cost-currency'
import {
  costSectionalWorkKey,
  PM_COST_TYPES,
  sumCostRowsTotalPrice,
  type PmCostRow,
  type PmCostType,
} from '../cost/pm-cost-catalog'
import type { PmFeatureRow } from '../files/pm-features-catalog'
import { PM_RESOURCE_TYPES, type PmResourceRow, type PmResourceType } from '../resource/pm-resource-catalog'

export type ProjectInfoVariant = 'schedule' | 'resource' | 'cost' | 'features'
export type InfoTab = 'overview' | 'schedule' | 'resource' | 'cost' | 'domain' | 'statistics' | 'advanced'
export type DomainTabKind = 'schedule' | 'resource' | 'cost' | 'placeholder'

export function resolveInfoDomain(
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

export function resolveDomainTabKind(domain: PmDomain): DomainTabKind {
  if (domain === 'progress_management') return 'schedule'
  if (domain === 'resource_management') return 'resource'
  if (domain === 'cost_management') return 'cost'
  return 'placeholder'
}

export function resolveDomainTabId(kind: DomainTabKind): InfoTab {
  if (kind === 'schedule') return 'schedule'
  if (kind === 'resource') return 'resource'
  if (kind === 'cost') return 'cost'
  return 'domain'
}

export type PmProjectType = 'construction_gc' | 'epc' | 'owner_managed' | 'ordinary'
export type PmPlanCalendar = 'calendar_days' | 'working_days'

export const PM_COST_ESTIMATE_TYPES = [
  'investment',
  'designEstimate',
  'constructionBudget',
  'costBudget',
] as const satisfies readonly PmCostType[]
export const PM_COST_ESTIMATE_TYPE_SET = new Set<PmCostType>(PM_COST_ESTIMATE_TYPES)

export type ProjectInfoDraft = {
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
  /** Per-card currency overrides; each card defaults to unsetCostCurrency / 元. */
  costCurrencies: Record<string, string>
  /** Default for cards without an override (migrates from legacy shared currency). */
  unsetCostCurrency: string
}

export function buildCostCurrencyMetadata(draft: ProjectInfoDraft): Record<string, unknown> {
  return {
    [COST_CURRENCIES_META_KEY]: normalizeCostCurrencies(draft.costCurrencies),
    [COST_CURRENCY_META_KEY]: draft.unsetCostCurrency.trim() || DEFAULT_COST_CURRENCY,
  }
}

export type CreateDefaults = {
  workspaceId: string
  domain: PmDomain
  code: string
  name: string
}

export interface EditProps {
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

export interface CreateProps {
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
export interface WorkspaceResourceProps {
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
export interface WorkspaceCostProps {
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
export interface WorkspaceFeaturesProps {
  mode: 'workspaceFeatures'
  workspaceId: string
  featureRows?: PmFeatureRow[]
  /** Persist the shared practice catalog (same as toolbar Save). */
  onSaveFeatures?: () => void | Promise<void | boolean>
  onClose: () => void
  onSaved?: () => void
}

export type Props = EditProps | CreateProps | WorkspaceResourceProps | WorkspaceCostProps | WorkspaceFeaturesProps

export const PROJECT_TYPE_OPTIONS: PmProjectType[] = [
  'construction_gc',
  'epc',
  'owner_managed',
  'ordinary',
]

export function parseProjectType(raw: string): PmProjectType {
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

export function emptyDraft(defaults?: Pick<CreateDefaults, 'code' | 'name'>): ProjectInfoDraft {
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
    costCurrencies: {},
    unsetCostCurrency: DEFAULT_COST_CURRENCY,
  }
}

export function toDraft(project: PmProject): ProjectInfoDraft {
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
    ...readCostCurrencyState(metadata, project.code),
  }
}

export function parseOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

export function buildMetadata(
  draft: ProjectInfoDraft,
  base: Record<string, unknown> = {},
): Record<string, unknown> {
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
  Object.assign(metadata, buildCostCurrencyMetadata(draft))
  return metadata
}

export function computeScheduleBounds(items: PmWorkItem[]): {
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

export function formatDateTime(ms: number, locale: string): string {
  return new Date(ms).toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatMoney(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })
}

export function computeResourceStats(rows: PmResourceRow[]) {
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

export function computeCostStats(rows: PmCostRow[]) {
  const sectionTotals = new Map<string, number | null>()
  const sectionOrder: string[] = []
  const rowsByType = Object.fromEntries(PM_COST_TYPES.map((type) => [type, [] as PmCostRow[]])) as Record<
    PmCostType,
    PmCostRow[]
  >
  let priced = 0
  let priceSum = 0
  let minPrice: number | null = null
  let maxPrice: number | null = null
  for (const row of rows) {
    const sectionKey = costSectionalWorkKey(row)
    if (!sectionTotals.has(sectionKey)) {
      sectionTotals.set(sectionKey, null)
      sectionOrder.push(sectionKey)
    }
    rowsByType[row.type].push(row)
    if (row.unitPrice != null && Number.isFinite(row.unitPrice)) {
      priced += 1
      priceSum += row.unitPrice
      minPrice = minPrice == null ? row.unitPrice : Math.min(minPrice, row.unitPrice)
      maxPrice = maxPrice == null ? row.unitPrice : Math.max(maxPrice, row.unitPrice)
    }
  }
  for (const key of sectionOrder) {
    const group = rows.filter((row) => costSectionalWorkKey(row) === key)
    sectionTotals.set(key, sumCostRowsTotalPrice(group))
  }
  const totalPriceSum = sumCostRowsTotalPrice(rows)
  return {
    total: rows.length,
    priced,
    unpriced: rows.length - priced,
    avgUnitPrice: priced === 0 ? null : Math.round((priceSum / priced) * 100) / 100,
    totalPriceSum,
    minPrice,
    maxPrice,
    /** 分部工程 cards: name + 合价 (first-appearance order). */
    sections: sectionOrder.map((key) => ({
      key,
      amount: sectionTotals.get(key) ?? null,
    })),
    /** Per-type 合价合计 (child rollup; no double-count). */
    amountByType: Object.fromEntries(
      PM_COST_TYPES.map((type) => [type, sumCostRowsTotalPrice(rowsByType[type])]),
    ) as Record<PmCostType, number | null>,
  }
}

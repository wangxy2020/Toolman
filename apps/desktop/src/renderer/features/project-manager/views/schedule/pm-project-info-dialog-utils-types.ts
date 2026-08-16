/** Types, constants, and domain/tab resolution for `ProjectInfoDialog`. */

import type { PmDomain, PmProject, PmProjectStatus, PmWorkItem } from '@toolman/shared'

import type { PmCostRow, PmCostType } from '../cost/pm-cost-catalog'
import type { PmFeatureRow } from '../files/pm-features-catalog'
import type { PmResourceRow } from '../resource/pm-resource-catalog'

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

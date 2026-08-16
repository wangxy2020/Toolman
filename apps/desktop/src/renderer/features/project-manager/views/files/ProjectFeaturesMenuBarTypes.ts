import type { ReactNode } from 'react'

import {
  PM_COST_PRACTICE_QUOTA_TYPES,
  type PmCostPracticeQuotaType,
} from '../cost/pm-cost-catalog'
import type { PmFeatureViewFilter } from './pm-features-catalog'

export type FeaturesMenuAction =
  | 'save'
  | 'saveAsNewVersion'
  | 'print'
  | 'projectInfo'
  | 'undo'
  | 'redo'
  | 'add'
  | 'insert'
  | 'delete'
  | 'indent'
  | 'outdent'
  | 'moveUp'
  | 'moveDown'
  | 'labor'
  | 'auxiliary'
  | 'material'
  | 'machinery'
  | 'device'
  | 'instrument'
  | 'scheduleAll'
  | 'procurement'
  | 'metering'
  | 'node'
  | 'funds'

export type FeaturesScheduleView = 'list' | 'gantt' | 'progressCheck' | 'resource' | 'cost'

/** 资源管理-实务「视图」下拉：人工 / 材料 / 机械定额。 */
export type ResourcePracticeQuotaView = 'labor' | 'material' | 'equipment'

export const RESOURCE_PRACTICE_QUOTA_VIEWS = [
  'labor',
  'material',
  'equipment',
] as const satisfies readonly ResourcePracticeQuotaView[]

/** 成本管理-实务「视图」下拉。 */
export type CostPracticeQuotaView = PmCostPracticeQuotaType

export const COST_PRACTICE_QUOTA_VIEWS = PM_COST_PRACTICE_QUOTA_TYPES

export type FeaturesVersionSwitchEntry = {
  version: number
  name: string
  hasSnapshot: boolean
  isCurrent: boolean
}

export type FeaturesMenuItem = {
  key: FeaturesMenuAction
  title: string
  label: ReactNode
  disabled?: boolean
  dividerAfter?: boolean
  icon?: boolean
  active?: boolean
}

/** Align with practice catalog filters (includes cost primary types like `other`). */
export type FeaturesViewFilter = PmFeatureViewFilter

/** Resource-stat filters shown in the「资源统计」dropdown (default: scheduleAll). */
export const FEATURES_RESOURCE_STAT_FILTERS = [
  'scheduleAll',
  'labor',
  'auxiliary',
  'material',
  'machinery',
  'device',
  'instrument',
] as const satisfies readonly FeaturesViewFilter[]

export type FeaturesResourceStatFilter = (typeof FEATURES_RESOURCE_STAT_FILTERS)[number]

export function isFeaturesResourceStatFilter(
  value: string | null | undefined,
): value is FeaturesResourceStatFilter {
  return (
    value != null &&
    (FEATURES_RESOURCE_STAT_FILTERS as readonly string[]).includes(value)
  )
}

export interface ProjectFeaturesMenuBarProps {
  disabled?: boolean
  hasSelection?: boolean
  hasProject?: boolean
  canUndo?: boolean
  canRedo?: boolean
  canEdit?: boolean
  /** Highlights the matching type /「全部」button. */
  selectedType?: FeaturesViewFilter
  scheduleView?: FeaturesScheduleView
  onScheduleViewChange?: (view: FeaturesScheduleView) => void
  /**
   * `schedule` = 计划实务；`resourceQuota` = 资源实务；`costQuota` = 成本实务。
   */
  viewMenuMode?: 'schedule' | 'resourceQuota' | 'costQuota'
  quotaView?: ResourcePracticeQuotaView
  onQuotaViewChange?: (view: ResourcePracticeQuotaView) => void
  costQuotaView?: CostPracticeQuotaView
  onCostQuotaViewChange?: (view: CostPracticeQuotaView) => void
  versionSwitchEntries?: FeaturesVersionSwitchEntry[]
  onRestoreVersion?: (version: number) => void
  onAction: (action: FeaturesMenuAction) => void
  /**
   * When false, hide menus after「基线」(资源统计 / 采购 / 节点 / 资金).
   * Used by 资源管理-实务 / 成本管理-实务 / 成本-价格表·计量.
   */
  showTrailingMenus?: boolean
  /** When false, hide the leading「视图」dropdown (used by locked metering view). */
  showViewMenu?: boolean
}

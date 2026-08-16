/** Cost catalog types and type-menu constants. */

import { PM_RESOURCE_TYPES } from '../resource/pm-resource-catalog'

export const PM_COST_CATALOG_KEY = 'costCatalog'

/**
 * 成本管理-实务「视图 / 类型」共用标识（施工定额 … 估算指标）。
 * Kept out of the price-list primary menu.
 */
export const PM_COST_PRACTICE_QUOTA_TYPES = [
  'constructionQuota',
  'budgetQuota',
  'estimateQuota',
  'estimateIndicator',
  'investmentIndicator',
] as const

export type PmCostPracticeQuotaType = (typeof PM_COST_PRACTICE_QUOTA_TYPES)[number]

export function isPmCostPracticeQuotaType(
  value: unknown,
): value is PmCostPracticeQuotaType {
  return (
    typeof value === 'string' &&
    (PM_COST_PRACTICE_QUOTA_TYPES as readonly string[]).includes(value)
  )
}

/** Price-list + practice type taxonomy. */
export const PM_COST_TYPES = [
  ...PM_RESOURCE_TYPES,
  ...PM_COST_PRACTICE_QUOTA_TYPES,
] as const

export type PmCostType = (typeof PM_COST_TYPES)[number]

/**
 * Price-list view/type menus: cost-oriented types stay top-level;
 * 「综合单价」is listed first (right under「全部类型」);
 * labor…instrument nest under「资源成本」(view: reserved/disabled).
 * 「资金」is a cost primary type (not under 资源成本).
 */
export const PM_COST_PRIMARY_TYPES = [
  'comprehensive',
  'management',
  'fees',
  'measures',
  'other',
  'tax',
  'investment',
  'designEstimate',
  'constructionBudget',
  'costBudget',
  'funds',
] as const satisfies readonly PmCostType[]

/** Resource types nested under「资源成本」in price-list menus (excludes 资金). */
export const PM_COST_RESOURCE_TYPES = [
  'labor',
  'auxiliary',
  'material',
  'equipment',
  'device',
  'instrument',
] as const satisfies readonly PmCostType[]

export type PmCostResourceType = (typeof PM_COST_RESOURCE_TYPES)[number]

export function isPmCostResourceType(value: unknown): value is PmCostResourceType {
  return (
    typeof value === 'string' &&
    (PM_COST_RESOURCE_TYPES as readonly string[]).includes(value)
  )
}

export const PM_COST_APPLICABLE_ALL = 'all'

export type PmCostRow = {
  id: string
  type: PmCostType
  /** Item code (编码). */
  code: string
  name: string
  /** Feature / project characteristics description (特征描述). */
  featureDescription: string
  unit: string
  quantity: number | null
  unitPrice: number | null
  /** `'all'` = 全部项目, otherwise a project id. */
  applicable: string
  note: string
  /** Sectional / divisional work (分部工程). */
  sectionalWork: string
  /**
   * Code shown / edited on the 分部工程 summary row.
   * Kept in sync across rows that share the same sectionalWork key.
   */
  sectionCode: string
  /**
   * Note shown / edited on the 分部工程 summary row.
   * Kept in sync across rows that share the same sectionalWork key.
   */
  sectionNote: string
  /**
   * Display name on the 分部工程 / 汇总 summary row (工作名称).
   * Kept in sync across rows that share the same sectionalWork key.
   */
  sectionName: string
  /**
   * Feature description on the 分部工程 / 汇总 summary row (特征描述).
   * Kept in sync across rows that share the same sectionalWork key.
   */
  sectionFeatureDescription: string
  /**
   * Optional 合价 formula on the 分部工程 summary row (e.g. `=A+B`).
   * Empty = auto-sum detail rows in the section.
   */
  sectionTotalFormula: string
  sortOrder: number
  parentId?: string | null
}

export function isPmCostType(value: unknown): value is PmCostType {
  return typeof value === 'string' && (PM_COST_TYPES as readonly string[]).includes(value)
}

/**
 * Map a UI cost type onto the durable shared price-list type enum.
 * Practice quota types are first-class on the shared catalog.
 */
export function toSharedCostCatalogType(type: PmCostType): PmCostType {
  return type
}

/** Menu / table order for price-list types (matches view dropdown). */
const PM_COST_MENU_TYPE_ORDER: readonly PmCostType[] = [
  ...PM_COST_PRIMARY_TYPES,
  ...PM_COST_RESOURCE_TYPES,
]

export function costTypeMenuRank(type: PmCostType): number {
  const index = PM_COST_MENU_TYPE_ORDER.indexOf(type)
  return index >= 0 ? index : PM_COST_MENU_TYPE_ORDER.length
}

export function costMatchKey(type: PmCostType, name: string): string {
  return `${type}\0${name.trim()}`
}

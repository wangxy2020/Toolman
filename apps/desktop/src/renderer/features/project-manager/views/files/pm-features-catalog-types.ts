/** Practice (实务) feature catalog types and type guards. */

export const PM_FEATURE_CATALOG_KEY = 'featureCatalog'

/**
 * Cost primary types used on the 资金 page (aligned with 价格表 type menu).
 * Declared here as string literals to avoid a circular import with pm-cost-catalog.
 */
export const PM_FEATURE_COST_PRIMARY_TYPES = [
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
] as const

export const PM_FEATURE_TYPES = [
  'labor',
  'auxiliary',
  'material',
  'machinery',
  'device',
  'instrument',
  'procurement',
  'metering',
  'node',
  ...PM_FEATURE_COST_PRIMARY_TYPES,
] as const

export type PmFeatureType = (typeof PM_FEATURE_TYPES)[number]

export type PmFeatureCostPrimaryType = (typeof PM_FEATURE_COST_PRIMARY_TYPES)[number]

export const PM_FEATURE_APPLICABLE_ALL = 'all'

/** Schedule-synced types shown under 人力…仪器 / 「全部」. */
export const PM_FEATURE_SCHEDULE_TYPES = [
  'labor',
  'auxiliary',
  'material',
  'machinery',
  'device',
  'instrument',
] as const satisfies readonly PmFeatureType[]

export type PmFeatureViewFilter = PmFeatureType | 'scheduleAll'

export function isPmFeatureCostPrimaryType(
  value: unknown,
): value is PmFeatureCostPrimaryType {
  return (
    typeof value === 'string' &&
    (PM_FEATURE_COST_PRIMARY_TYPES as readonly string[]).includes(value)
  )
}

export type PmFeatureRow = {
  id: string
  type: PmFeatureType
  name: string
  unit: string
  /** Pricing unit (计价单位); used on 采购 rows. */
  pricingUnit: string
  /** Procurement lead time in days (采购周期). */
  purchaseCycle: number | null
  /** Transport lead time in days (运输周期). */
  transportCycle: number | null
  /** Optional quantity / amount depending on type. */
  quantity: number | null
  remark: string
  /** Item code (编码); used on cost · 价格表 metering view. */
  code: string
  /** Feature / project characteristics description (特征描述). */
  featureDescription: string
  /** Sectional / divisional work (分部工程). */
  sectionalWork: string
  /** Unit price (单价); used on cost · 价格表 metering view. */
  unitPrice: number | null
  /** `'all'` = 全部项目, otherwise a project id. */
  applicable: string
  sortOrder: number
  parentId?: string | null
}

const SCHEDULE_FEATURE_TYPES: ReadonlySet<PmFeatureType> = new Set(PM_FEATURE_SCHEDULE_TYPES)

export function isScheduleFeatureType(type: PmFeatureType): boolean {
  return SCHEDULE_FEATURE_TYPES.has(type)
}

export function featureTypeMenuRank(type: PmFeatureType): number {
  const index = PM_FEATURE_TYPES.indexOf(type)
  return index >= 0 ? index : PM_FEATURE_TYPES.length
}

export function isPmFeatureType(value: unknown): value is PmFeatureType {
  return typeof value === 'string' && (PM_FEATURE_TYPES as readonly string[]).includes(value)
}

export function featureMatchKey(type: PmFeatureType, name: string): string {
  return `${type}::${name.trim()}`
}

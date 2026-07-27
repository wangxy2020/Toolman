/** Cost catalog stored on `PmProject.metadata.costCatalog`.
 * Workspace-wide「全部项目」catalog is stored in localStorage per workspace.
 */

import {
  buildCostSaveMetadata,
  readCostLastSavedAt,
  readCostSaveHistory,
  readCostVersion,
  removeCostSaveHistoryEntry,
  type PmCostCatalogSnapshotRow,
  type PmCostSaveRecord,
} from '@toolman/shared'

import {
  PM_RESOURCE_TYPES,
} from '../resource/pm-resource-catalog'

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

function sharedCatalogStorageKey(workspaceId: string): string {
  return `toolman.pm.costCatalog.shared.${workspaceId}`
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

export function computeCostTotalPrice(
  quantity: number | null | undefined,
  unitPrice: number | null | undefined,
): number | null {
  if (
    quantity == null ||
    unitPrice == null ||
    !Number.isFinite(quantity) ||
    !Number.isFinite(unitPrice)
  ) {
    return null
  }
  return Math.round(quantity * unitPrice * 100) / 100
}

/**
 * 合价 for a row: if it has children, sum of child 合价 (recursive);
 * otherwise quantity × unitPrice.
 */
export function computeCostRowTotalPrice(
  row: PmCostRow,
  rows: readonly PmCostRow[],
  childIndex?: ReadonlyMap<string, PmCostRow[]>,
): number | null {
  const children =
    childIndex?.get(row.id) ?? rows.filter((entry) => entry.parentId === row.id)
  if (children.length > 0) {
    let sum = 0
    let hasAmount = false
    for (const child of children) {
      const amount = computeCostRowTotalPrice(child, rows, childIndex)
      if (amount != null) {
        sum += amount
        hasAmount = true
      }
    }
    return hasAmount ? Math.round(sum * 100) / 100 : null
  }
  return computeCostTotalPrice(row.quantity, row.unitPrice)
}

/** Build parentId → children list for O(n) rollups. */
export function buildCostChildrenIndex(
  rows: readonly PmCostRow[],
): Map<string, PmCostRow[]> {
  const index = new Map<string, PmCostRow[]>()
  for (const row of rows) {
    const parentId = row.parentId
    if (!parentId) continue
    const list = index.get(parentId)
    if (list) list.push(row)
    else index.set(parentId, [row])
  }
  return index
}

/**
 * Sum 合价 without double-counting: only roots whose parent is outside `rows`
 * (or null), each using child rollup when present.
 */
export function sumCostRowsTotalPrice(rows: readonly PmCostRow[]): number | null {
  if (rows.length === 0) return null
  const idSet = new Set(rows.map((row) => row.id))
  const childIndex = buildCostChildrenIndex(rows)
  let sum = 0
  let hasAmount = false
  for (const row of rows) {
    const parentId = row.parentId ?? null
    if (parentId && idSet.has(parentId)) continue
    const amount = computeCostRowTotalPrice(row, rows, childIndex)
    if (amount != null) {
      sum += amount
      hasAmount = true
    }
  }
  return hasAmount ? Math.round(sum * 100) / 100 : null
}

/**
 * Suggest the next 编码 from the previous row: increment the trailing number
 * while preserving prefix and zero-padding (e.g. `1.01` → `1.02`, `A-9` → `A-10`).
 */
export function suggestNextCostCode(previousCode: string): string {
  const trimmed = previousCode.trim()
  if (!trimmed) return ''
  const match = trimmed.match(/^(.*?)(\d+)$/)
  if (!match) return ''
  const prefix = match[1] ?? ''
  const digits = match[2] ?? ''
  const next = String(Number(digits) + 1)
  return `${prefix}${next.padStart(digits.length, '0')}`
}

export function formatCostTotalPrice(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

/** Trimmed 分部工程 key (`''` when blank). */
export function costSectionalWorkKey(row: Pick<PmCostRow, 'sectionalWork'>): string {
  return row.sectionalWork?.trim() ?? ''
}

export type CostSectionalSummary = {
  key: string
  total: number | null
  rowCount: number
  code: string
  note: string
}

/** Section-menu value for the rollup view (各分部汇总再汇总). */
export const COST_SECTION_FILTER_SUMMARY = '__summary__'

export function isCostSectionSummaryFilter(filter: string): boolean {
  return filter === COST_SECTION_FILTER_SUMMARY
}

export type CostSectionalDisplayEntry =
  | { kind: 'grand'; summary: CostSectionalSummary }
  | { kind: 'section'; summary: CostSectionalSummary }
  | { kind: 'row'; row: PmCostRow; index: number }

/**
 * Insert a 分部工程合价 summary before the rows of each sectional group.
 * Groups are keyed by trimmed 分部工程 (first-appearance order), so the same
 * section never produces duplicate summary rows when rows are interleaved
 * (e.g. after type-menu sort or mid-list inserts).
 */
export function buildCostSectionalDisplayEntries(
  rows: readonly PmCostRow[],
): CostSectionalDisplayEntry[] {
  const order: string[] = []
  const groups = new Map<string, { rows: PmCostRow[] }>()
  for (const row of rows) {
    const key = costSectionalWorkKey(row)
    let group = groups.get(key)
    if (!group) {
      group = { rows: [] }
      groups.set(key, group)
      order.push(key)
    }
    group.rows.push(row)
  }

  const entries: CostSectionalDisplayEntry[] = []
  let displayIndex = 0
  for (const key of order) {
    const group = groups.get(key)!
    const total = sumCostRowsTotalPrice(group.rows)
    const code =
      group.rows.map((row) => row.sectionCode?.trim() ?? '').find((value) => value) ?? ''
    const note =
      group.rows.map((row) => row.sectionNote?.trim() ?? '').find((value) => value) ?? ''
    entries.push({
      kind: 'section',
      summary: {
        key,
        total,
        rowCount: group.rows.length,
        code,
        note,
      },
    })
    for (const row of group.rows) {
      entries.push({ kind: 'row', row, index: displayIndex })
      displayIndex += 1
    }
  }
  return entries
}

/** Patch summary-row fields onto every row in the given sectional group. */
export function patchCostSectionMeta(
  rows: readonly PmCostRow[],
  sectionKey: string,
  patch: Partial<
    Pick<
      PmCostRow,
      | 'sectionCode'
      | 'sectionNote'
      | 'sectionName'
      | 'sectionFeatureDescription'
      | 'sectionTotalFormula'
    >
  >,
): PmCostRow[] {
  return rows.map((row) =>
    costSectionalWorkKey(row) === sectionKey ? { ...row, ...patch } : row,
  )
}

export function parseCostRows(raw: unknown): PmCostRow[] | null {
  if (!Array.isArray(raw)) return null
  const rows: PmCostRow[] = []
  for (const entry of raw) {
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) continue
    const row = entry as Record<string, unknown>
    const id = typeof row.id === 'string' && row.id.trim() ? row.id : crypto.randomUUID()
    const type = isPmCostType(row.type) ? row.type : 'other'
    const code = typeof row.code === 'string' ? row.code : ''
    const name = typeof row.name === 'string' ? row.name : ''
    const featureDescription =
      typeof row.featureDescription === 'string' ? row.featureDescription : ''
    const unit = typeof row.unit === 'string' ? row.unit : ''
    const quantity =
      typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : null
    const unitPrice =
      typeof row.unitPrice === 'number' && Number.isFinite(row.unitPrice) ? row.unitPrice : null
    const applicable =
      typeof row.applicable === 'string' && row.applicable.trim()
        ? row.applicable
        : PM_COST_APPLICABLE_ALL
    const note = typeof row.note === 'string' ? row.note : ''
    const sectionalWork = typeof row.sectionalWork === 'string' ? row.sectionalWork : ''
    const sectionCode = typeof row.sectionCode === 'string' ? row.sectionCode : ''
    const sectionNote = typeof row.sectionNote === 'string' ? row.sectionNote : ''
    const sectionName = typeof row.sectionName === 'string' ? row.sectionName : ''
    const sectionFeatureDescription =
      typeof row.sectionFeatureDescription === 'string' ? row.sectionFeatureDescription : ''
    const sectionTotalFormula =
      typeof row.sectionTotalFormula === 'string' ? row.sectionTotalFormula : ''
    const sortOrder =
      typeof row.sortOrder === 'number' && Number.isFinite(row.sortOrder)
        ? Math.floor(row.sortOrder)
        : rows.length
    const parentId =
      row.parentId === null
        ? null
        : typeof row.parentId === 'string'
          ? row.parentId
          : undefined
    rows.push({
      id,
      type,
      code,
      name,
      featureDescription,
      unit,
      quantity,
      unitPrice,
      applicable,
      note,
      sectionalWork,
      sectionCode,
      sectionNote,
      sectionName,
      sectionFeatureDescription,
      sectionTotalFormula,
      sortOrder,
      ...(parentId !== undefined ? { parentId } : {}),
    })
  }
  return reindexCostRows(rows)
}

export function createEmptyCostRow(
  sortOrder: number,
  type: PmCostType = 'other',
  parentId: string | null = null,
  applicable: string = PM_COST_APPLICABLE_ALL,
): PmCostRow {
  return {
    id: crypto.randomUUID(),
    type,
    code: '',
    name: '',
    featureDescription: '',
    unit: '',
    quantity: null,
    unitPrice: null,
    applicable,
    note: '',
    sectionalWork: '',
    sectionCode: '',
    sectionNote: '',
    sectionName: '',
    sectionFeatureDescription: '',
    sectionTotalFormula: '',
    sortOrder,
    parentId,
  }
}

export function reindexCostRows(rows: PmCostRow[]): PmCostRow[] {
  return rows.map((row, index) => ({ ...row, sortOrder: index }))
}

export function fingerprintCostCatalog(rows: readonly PmCostRow[]): string {
  return JSON.stringify(
    rows.map((row) => ({
      id: row.id,
      type: row.type,
      code: row.code,
      name: row.name,
      featureDescription: row.featureDescription,
      unit: row.unit,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      applicable: row.applicable,
      note: row.note,
      sectionalWork: row.sectionalWork,
      sectionCode: row.sectionCode,
      sectionNote: row.sectionNote,
      sectionName: row.sectionName,
      sectionFeatureDescription: row.sectionFeatureDescription,
      sectionTotalFormula: row.sectionTotalFormula,
      sortOrder: row.sortOrder,
      parentId: row.parentId ?? null,
    })),
  )
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

export function sortCostRowsByTypeMenu(rows: readonly PmCostRow[]): PmCostRow[] {
  const indexed = rows.map((row, index) => ({ row, index }))
  indexed.sort((left, right) => {
    const typeDelta = costTypeMenuRank(left.row.type) - costTypeMenuRank(right.row.type)
    if (typeDelta !== 0) return typeDelta
    if (left.row.sortOrder !== right.row.sortOrder) {
      return left.row.sortOrder - right.row.sortOrder
    }
    return left.index - right.index
  })
  return reindexCostRows(indexed.map((entry) => entry.row))
}

function costMatchKey(type: PmCostType, name: string): string {
  return `${type}\0${name.trim()}`
}

export function sortCostRowsLikeSharedCatalog(
  rows: readonly PmCostRow[],
  sharedRows: readonly PmCostRow[],
): PmCostRow[] {
  const sharedRank = new Map<string, number>()
  sharedRows.forEach((row, index) => {
    const name = row.name.trim()
    if (!name) return
    const key = costMatchKey(row.type, name)
    if (!sharedRank.has(key)) sharedRank.set(key, index)
  })

  const indexed = rows.map((row, index) => ({ row, index }))
  indexed.sort((left, right) => {
    const typeDelta = costTypeMenuRank(left.row.type) - costTypeMenuRank(right.row.type)
    if (typeDelta !== 0) return typeDelta
    const leftKey = costMatchKey(left.row.type, left.row.name)
    const rightKey = costMatchKey(right.row.type, right.row.name)
    const leftShared = sharedRank.get(leftKey)
    const rightShared = sharedRank.get(rightKey)
    if (leftShared != null && rightShared != null && leftShared !== rightShared) {
      return leftShared - rightShared
    }
    if (leftShared != null && rightShared == null) return -1
    if (leftShared == null && rightShared != null) return 1
    if (left.row.sortOrder !== right.row.sortOrder) {
      return left.row.sortOrder - right.row.sortOrder
    }
    return left.index - right.index
  })
  return reindexCostRows(indexed.map((entry) => entry.row))
}

export function costRowDepth(
  row: PmCostRow,
  byId: ReadonlyMap<string, PmCostRow>,
): number {
  let depth = 0
  let parentId = row.parentId ?? null
  const seen = new Set<string>()
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) break
    depth += 1
    parentId = parent.parentId ?? null
  }
  return depth
}

export function buildBaselinePriceIndex(baselineRows: readonly PmCostRow[]): {
  byId: Map<string, number | null>
  byKey: Map<string, number | null>
} {
  const byId = new Map<string, number | null>()
  const byKey = new Map<string, number | null>()
  for (const row of baselineRows) {
    byId.set(row.id, row.unitPrice)
    const name = row.name.trim()
    if (!name) continue
    const key = costMatchKey(row.type, name)
    if (!byKey.has(key)) byKey.set(key, row.unitPrice)
  }
  return { byId, byKey }
}

export function lookupBaselineUnitPrice(
  row: PmCostRow,
  index: { byId: Map<string, number | null>; byKey: Map<string, number | null> },
): number | null {
  if (index.byId.has(row.id)) return index.byId.get(row.id) ?? null
  const name = row.name.trim()
  if (!name) return null
  return index.byKey.get(costMatchKey(row.type, name)) ?? null
}

export function computeCostBaselineRatio(
  projectPrice: number | null,
  baselinePrice: number | null,
): number | null {
  if (
    projectPrice == null ||
    baselinePrice == null ||
    !Number.isFinite(projectPrice) ||
    !Number.isFinite(baselinePrice) ||
    baselinePrice === 0
  ) {
    return null
  }
  return projectPrice / baselinePrice
}

export function formatCostBaselineRatio(ratio: number): string {
  return ratio.toFixed(2)
}

export function isCostBaselineRatioOff(ratio: number | null): boolean {
  return ratio != null && Number.isFinite(ratio) && Math.abs(ratio - 1) > 0.001
}

export function deriveCostApplicable(
  row: PmCostRow,
  baseline: ReturnType<typeof buildBaselinePriceIndex> | null,
  projectId: string,
): string {
  if (!baseline) return projectId
  const baselinePrice = lookupBaselineUnitPrice(row, baseline)
  if (baselinePrice == null) return projectId
  if (
    row.unitPrice != null &&
    Number.isFinite(row.unitPrice) &&
    Math.abs(row.unitPrice - baselinePrice) < 1e-9
  ) {
    return PM_COST_APPLICABLE_ALL
  }
  return projectId
}

export function withDerivedCostApplicable(
  rows: readonly PmCostRow[],
  baseline: ReturnType<typeof buildBaselinePriceIndex>,
  projectId: string,
): PmCostRow[] {
  return rows.map((row) => ({
    ...row,
    applicable: deriveCostApplicable(row, baseline, projectId),
  }))
}

export function readSharedCostCatalog(workspaceId: string): {
  rows: PmCostRow[]
  isDefault: boolean
} {
  try {
    const raw = localStorage.getItem(sharedCatalogStorageKey(workspaceId))
    if (!raw) return { rows: [], isDefault: true }
    const parsed = parseCostRows(JSON.parse(raw) as unknown)
    if (!parsed) return { rows: [], isDefault: true }
    return {
      rows: parsed.map((row) => ({ ...row, applicable: PM_COST_APPLICABLE_ALL })),
      isDefault: false,
    }
  } catch {
    return { rows: [], isDefault: true }
  }
}

export function writeSharedCostCatalog(workspaceId: string, rows: PmCostRow[]): Promise<void> {
  const normalized = rows.map((row) => ({
    ...row,
    applicable: PM_COST_APPLICABLE_ALL,
  }))
  localStorage.setItem(sharedCatalogStorageKey(workspaceId), JSON.stringify(normalized))
  // Best-effort durable mirror for agent hints / main-process apply.
  return import('../../pm-api')
    .then(({ pmApi }) =>
      pmApi.setSharedCostCatalog(
        workspaceId,
        normalized.map((row) => ({
          id: row.id,
          type: toSharedCostCatalogType(row.type),
          code: row.code,
          name: row.name,
          featureDescription: row.featureDescription,
          unit: row.unit,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          applicable: row.applicable,
          note: row.note,
          sectionalWork: row.sectionalWork,
          sectionCode: row.sectionCode,
          sectionNote: row.sectionNote,
          sectionName: row.sectionName,
          sectionFeatureDescription: row.sectionFeatureDescription,
          sectionTotalFormula: row.sectionTotalFormula,
          sortOrder: row.sortOrder,
          parentId: row.parentId ?? null,
        })),
      ),
    )
    .then(() => undefined)
    .catch(() => {
      // ignore offline / IPC failures; localStorage remains source for UI
    })
}

/**
 * Pull durable「全部项目」catalog into localStorage when main has a non-default store.
 * If main still has defaults but localStorage already has a saved catalog, push local → main
 * so the agent runtime snapshot can see the same list.
 */
export async function hydrateSharedCostCatalogFromMain(workspaceId: string): Promise<PmCostRow[]> {
  try {
    const { pmApi } = await import('../../pm-api')
    const remote = await pmApi.getSharedCostCatalog(workspaceId)
    if (!remote.isDefault) {
      const mapped: PmCostRow[] = remote.rows.map((row) => ({
        id: row.id,
        type: row.type as PmCostType,
        code: row.code ?? '',
        name: row.name,
        featureDescription: row.featureDescription ?? '',
        unit: row.unit,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        applicable: row.applicable || PM_COST_APPLICABLE_ALL,
        note: row.note ?? '',
        sectionalWork: row.sectionalWork ?? '',
        sectionCode: row.sectionCode ?? '',
        sectionNote: row.sectionNote ?? '',
        sectionName: row.sectionName ?? '',
        sectionFeatureDescription: row.sectionFeatureDescription ?? '',
        sectionTotalFormula: row.sectionTotalFormula ?? '',
        sortOrder: row.sortOrder,
        parentId: row.parentId ?? null,
      }))
      const local = readSharedCostCatalog(workspaceId)
      const remoteIds = new Set(mapped.map((row) => row.id))
      const localExtras = !local.isDefault ? local.rows.filter((row) => !remoteIds.has(row.id)) : []
      const merged = localExtras.length > 0 ? [...mapped, ...localExtras] : mapped
      writeSharedCostCatalog(workspaceId, merged)
      return merged
    }

    const local = readSharedCostCatalog(workspaceId)
    if (!local.isDefault && local.rows.length > 0) {
      writeSharedCostCatalog(workspaceId, local.rows)
      return local.rows
    }
  } catch {
    // fall through to local
  }
  return readSharedCostCatalog(workspaceId).rows
}

export function readProjectCostCatalog(
  metadata: Record<string, unknown> | null | undefined,
): PmCostRow[] | null {
  if (!metadata) return null
  const raw = metadata[PM_COST_CATALOG_KEY]
  return parseCostRows(raw)
}

export function resolveProjectCostCatalog(
  workspaceId: string,
  metadata: Record<string, unknown> | null | undefined,
): { rows: PmCostRow[]; fromShared: boolean } {
  const owned = readProjectCostCatalog(metadata)
  if (owned) return { rows: owned, fromShared: false }
  return { rows: readSharedCostCatalog(workspaceId).rows, fromShared: true }
}

export function upsertSharedCostCatalog(
  sharedRows: readonly PmCostRow[],
  candidates: readonly PmCostRow[],
): { rows: PmCostRow[]; changed: boolean } {
  const next = sharedRows.map((row) => ({ ...row }))
  let changed = false
  for (const candidate of candidates) {
    const name = candidate.name.trim()
    if (!name) continue
    const key = costMatchKey(candidate.type, name)
    const existingIndex = next.findIndex(
      (row) => costMatchKey(row.type, row.name) === key,
    )
    if (existingIndex >= 0) {
      const existing = next[existingIndex]!
      if (
        existing.unit !== candidate.unit ||
        existing.quantity !== candidate.quantity ||
        existing.unitPrice !== candidate.unitPrice ||
        existing.note !== candidate.note ||
        existing.sectionalWork !== candidate.sectionalWork ||
        existing.sectionCode !== candidate.sectionCode ||
        existing.sectionNote !== candidate.sectionNote ||
        existing.sectionName !== candidate.sectionName ||
        existing.sectionFeatureDescription !== candidate.sectionFeatureDescription ||
        existing.sectionTotalFormula !== candidate.sectionTotalFormula
      ) {
        next[existingIndex] = {
          ...existing,
          unit: candidate.unit,
          quantity: candidate.quantity,
          unitPrice: candidate.unitPrice,
          note: candidate.note,
          sectionalWork: candidate.sectionalWork,
          sectionCode: candidate.sectionCode,
          sectionNote: candidate.sectionNote,
          sectionName: candidate.sectionName,
          sectionFeatureDescription: candidate.sectionFeatureDescription,
          sectionTotalFormula: candidate.sectionTotalFormula,
        }
        changed = true
      }
    } else {
      next.push({
        ...candidate,
        id: crypto.randomUUID(),
        applicable: PM_COST_APPLICABLE_ALL,
        parentId: null,
      })
      changed = true
    }
  }
  return { rows: reindexCostRows(next), changed }
}

function sharedCatalogMetaStorageKey(workspaceId: string): string {
  return `toolman.pm.costCatalog.sharedMeta.${workspaceId}`
}

/** Workspace「全部项目」price-list version / save history (localStorage). */
export function readSharedCostSaveMeta(workspaceId: string): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(sharedCatalogMetaStorageKey(workspaceId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export function writeSharedCostSaveMeta(
  workspaceId: string,
  metadata: Record<string, unknown>,
): void {
  localStorage.setItem(sharedCatalogMetaStorageKey(workspaceId), JSON.stringify(metadata))
}

/** Snapshot shape stored on save-history entries. */
export function toCostCatalogSnapshot(rows: readonly PmCostRow[]): PmCostCatalogSnapshotRow[] {
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    code: row.code,
    name: row.name,
    featureDescription: row.featureDescription,
    unit: row.unit,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    applicable: row.applicable,
    note: row.note,
    sectionalWork: row.sectionalWork,
    sectionCode: row.sectionCode,
    sectionNote: row.sectionNote,
    sectionName: row.sectionName,
    sectionFeatureDescription: row.sectionFeatureDescription,
    sectionTotalFormula: row.sectionTotalFormula,
    sortOrder: row.sortOrder,
    parentId: row.parentId ?? null,
  }))
}

/**
 * Record shared「全部项目」save meta after a catalog save.
 * Pass `bumpVersion: true` for「另存为新版本」; `false` (default) updates current only
 * (first save still creates v1).
 */
export function recordSharedCostSaveMeta(
  workspaceId: string,
  rows: readonly PmCostRow[],
  options?: { savedAt?: number; bumpVersion?: boolean; note?: string },
): Record<string, unknown> {
  const next = buildCostSaveMetadata(readSharedCostSaveMeta(workspaceId), {
    costCount: rows.length,
    contentFingerprint: fingerprintCostCatalog(rows),
    savedAt: options?.savedAt ?? Date.now(),
    catalog: toCostCatalogSnapshot(rows),
    bumpVersion: options?.bumpVersion ?? false,
    ...(options?.note?.trim() ? { note: options.note.trim() } : {}),
  })
  writeSharedCostSaveMeta(workspaceId, next)
  return next
}

export function readSharedCostVersion(workspaceId: string): number {
  return readCostVersion(readSharedCostSaveMeta(workspaceId))
}

export function readSharedCostLastSavedAt(workspaceId: string): number | null {
  return readCostLastSavedAt(readSharedCostSaveMeta(workspaceId))
}

export function readSharedCostSaveHistory(workspaceId: string): PmCostSaveRecord[] {
  return readCostSaveHistory(readSharedCostSaveMeta(workspaceId))
}

export function removeSharedCostSaveHistoryEntry(
  workspaceId: string,
  version: number,
): Record<string, unknown> {
  const next = removeCostSaveHistoryEntry(readSharedCostSaveMeta(workspaceId), version)
  writeSharedCostSaveMeta(workspaceId, next)
  return next
}

import { z } from 'zod'

import {
  PmAgentResourceTypeSchema,
  PM_AGENT_RESOURCE_TYPE_LABELS,
} from './pm-resource-apply.js'

/** Practice quota types used by 成本管理-实务 (durable on shared price-list). */
export const PmCostPracticeQuotaTypeSchema = z.enum([
  'constructionQuota',
  'budgetQuota',
  'estimateQuota',
  'estimateIndicator',
  'investmentIndicator',
])

export type PmCostPracticeQuotaType = z.infer<typeof PmCostPracticeQuotaTypeSchema>

export const PmSharedCostCatalogTypeSchema = z.enum([
  ...PmAgentResourceTypeSchema.options,
  ...PmCostPracticeQuotaTypeSchema.options,
])

export type PmSharedCostCatalogType = z.infer<typeof PmSharedCostCatalogTypeSchema>

export const PM_SHARED_COST_TYPE_LABELS: Record<PmSharedCostCatalogType, string> = {
  ...PM_AGENT_RESOURCE_TYPE_LABELS,
  constructionQuota: '施工定额',
  budgetQuota: '预算定额',
  estimateQuota: '概算定额',
  estimateIndicator: '估算指标',
  investmentIndicator: '投资指标',
}

/** Workspace「全部项目」cost/price-list (价格表) catalog row (durable + UI). */
export const PmSharedCostCatalogRowSchema = z.object({
  id: z.string().min(1),
  type: PmSharedCostCatalogTypeSchema,
  /** Item code (编码). */
  code: z.string().default(''),
  name: z.string(),
  /** Feature description (特征描述). */
  featureDescription: z.string().default(''),
  unit: z.string(),
  quantity: z.number().finite().nullable(),
  unitPrice: z.number().finite().nullable(),
  applicable: z.string().default('all'),
  note: z.string().default(''),
  /** Sectional / divisional work (分部工程). */
  sectionalWork: z.string().default(''),
  /** Code on 分部工程 summary row. */
  sectionCode: z.string().default(''),
  /** Note on 分部工程 summary row. */
  sectionNote: z.string().default(''),
  /** Display name on 分部工程 / 汇总 summary row. */
  sectionName: z.string().default(''),
  /** Feature description on 分部工程 / 汇总 summary row. */
  sectionFeatureDescription: z.string().default(''),
  /** Optional 合价 formula on 分部工程 summary row. */
  sectionTotalFormula: z.string().default(''),
  sortOrder: z.number().int(),
  parentId: z.string().nullable().optional(),
})

export type PmSharedCostCatalogRow = z.infer<typeof PmSharedCostCatalogRowSchema>

export const PmSharedCostCatalogGetInputSchema = z.object({
  workspaceId: z.string().uuid(),
})

export const PmSharedCostCatalogSetInputSchema = z.object({
  workspaceId: z.string().uuid(),
  rows: z.array(PmSharedCostCatalogRowSchema),
})

export const PmSharedCostCatalogUpsertInputSchema = z.object({
  workspaceId: z.string().uuid(),
  upserts: z.array(
    z.object({
      type: PmSharedCostCatalogTypeSchema,
      name: z.string().min(1),
      code: z.string().optional(),
      unit: z.string().optional(),
      quantity: z.number().finite().nullable().optional(),
      unitPrice: z.number().finite().nullable().optional(),
      featureDescription: z.string().optional(),
      note: z.string().optional(),
      sectionalWork: z.string().optional(),
    }),
  ),
})

export const PM_SHARED_COST_APPLICABLE_ALL = 'all'

export function costCatalogMatchKey(type: PmSharedCostCatalogType, name: string): string {
  return `${type}::${name.trim().toLowerCase()}`
}

export function parseSharedCostCatalogRows(raw: unknown): PmSharedCostCatalogRow[] | null {
  if (!Array.isArray(raw)) return null
  if (raw.length === 0) return []
  const rows: PmSharedCostCatalogRow[] = []
  for (const entry of raw) {
    const parsed = PmSharedCostCatalogRowSchema.safeParse(entry)
    if (parsed.success) rows.push(parsed.data)
  }
  return rows
}

export function formatCostCatalogHintLines(
  rows: readonly PmSharedCostCatalogRow[],
  limit = 80,
): string {
  if (rows.length === 0) return '（价格表为空）'
  const lines = rows.slice(0, limit).map((row) => {
    const typeLabel = PM_SHARED_COST_TYPE_LABELS[row.type] ?? row.type
    const price =
      row.unitPrice != null && Number.isFinite(row.unitPrice) ? String(row.unitPrice) : '-'
    const quantity =
      row.quantity != null && Number.isFinite(row.quantity) ? String(row.quantity) : '-'
    const feature = row.featureDescription.trim()
    const note = row.note.trim()
    const section = row.sectionalWork.trim()
    const extras = [
      row.code.trim() ? `编码 ${row.code.trim()}` : '',
      feature ? `特征 ${feature}` : '',
      section ? `分部 ${section}` : '',
      note ? `说明 ${note}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
    return `- [${typeLabel}] ${row.name} · 单位 ${row.unit || '-'} · 数量 ${quantity} · 单价 ${price}${
      extras ? ` · ${extras}` : ''
    }`
  })
  if (rows.length > limit) {
    lines.push(`- …另有 ${rows.length - limit} 条未列出`)
  }
  return lines.join('\n')
}

/** Price list starts empty; unlike the resource catalog there is no built-in starter set. */
export function createDefaultSharedCostCatalogRows(): PmSharedCostCatalogRow[] {
  return []
}

export function upsertSharedCostCatalogRows(
  existing: readonly PmSharedCostCatalogRow[],
  upserts: ReadonlyArray<{
    type: PmSharedCostCatalogType
    name: string
    code?: string
    unit?: string
    quantity?: number | null
    unitPrice?: number | null
    featureDescription?: string
    note?: string
    sectionalWork?: string
  }>,
  createId: () => string = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `cost-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
): { rows: PmSharedCostCatalogRow[]; changed: boolean } {
  let changed = false
  const next = existing.map((row) => ({ ...row }))
  const indexByKey = new Map<string, number>()
  for (let i = 0; i < next.length; i += 1) {
    const name = next[i]!.name.trim()
    if (!name) continue
    indexByKey.set(costCatalogMatchKey(next[i]!.type, name), i)
  }

  for (const entry of upserts) {
    const name = entry.name.trim()
    if (!name) continue
    const key = costCatalogMatchKey(entry.type, name)
    const existingIndex = indexByKey.get(key)
    if (existingIndex == null) {
      next.push({
        id: createId(),
        type: entry.type,
        code: entry.code?.trim() ?? '',
        name,
        featureDescription: entry.featureDescription?.trim() ?? '',
        unit: entry.unit?.trim() ?? '',
        quantity: entry.quantity ?? null,
        unitPrice: entry.unitPrice ?? null,
        applicable: PM_SHARED_COST_APPLICABLE_ALL,
        note: entry.note?.trim() ?? '',
        sectionalWork: entry.sectionalWork?.trim() ?? '',
        sectionCode: '',
        sectionNote: '',
        sectionName: '',
        sectionFeatureDescription: '',
        sectionTotalFormula: '',
        sortOrder: next.length,
        parentId: null,
      })
      indexByKey.set(key, next.length - 1)
      changed = true
      continue
    }
    const prev = next[existingIndex]!
    const unit = entry.unit?.trim()
    const code = entry.code?.trim()
    const sectionalWork = entry.sectionalWork?.trim()
    const nextRow: PmSharedCostCatalogRow = {
      ...prev,
      name,
      type: entry.type,
      code: code != null && code.length > 0 ? code : prev.code,
      featureDescription:
        entry.featureDescription !== undefined
          ? entry.featureDescription.trim()
          : prev.featureDescription,
      unit: unit != null && unit.length > 0 ? unit : prev.unit,
      quantity: entry.quantity !== undefined ? entry.quantity : prev.quantity,
      unitPrice: entry.unitPrice !== undefined ? entry.unitPrice : prev.unitPrice,
      applicable: PM_SHARED_COST_APPLICABLE_ALL,
      note: entry.note !== undefined ? entry.note.trim() : prev.note,
      sectionalWork: sectionalWork != null && sectionalWork.length > 0 ? sectionalWork : prev.sectionalWork,
    }
    if (
      nextRow.unit !== prev.unit ||
      nextRow.code !== prev.code ||
      nextRow.quantity !== prev.quantity ||
      nextRow.unitPrice !== prev.unitPrice ||
      nextRow.name !== prev.name ||
      nextRow.featureDescription !== prev.featureDescription ||
      nextRow.note !== prev.note ||
      nextRow.sectionalWork !== prev.sectionalWork
    ) {
      next[existingIndex] = nextRow
      changed = true
    }
  }

  if (!changed) return { rows: [...existing], changed: false }
  return { rows: next.map((row, index) => ({ ...row, sortOrder: index })), changed: true }
}

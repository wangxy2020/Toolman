import { z } from 'zod'

import {
  PmAgentResourceTypeSchema,
  PM_AGENT_RESOURCE_TYPE_LABELS,
  type PmAgentResourceType,
} from './pm-resource-apply.js'

/** Workspace「全部项目」resource catalog row (durable + UI). */
export const PmSharedResourceCatalogRowSchema = z
  .object({
    id: z.string().min(1),
    type: PmAgentResourceTypeSchema,
    name: z.string(),
    spec: z.string().default(''),
    unit: z.string(),
    /** Pricing unit for unitPrice; defaults to measurement `unit` when omitted. */
    pricingUnit: z.string().optional(),
    unitPrice: z.number().finite().nullable(),
    applicable: z.string().default('all'),
    note: z.string().default(''),
    sortOrder: z.number().int(),
    parentId: z.string().nullable().optional(),
  })
  .transform((row) => ({
    ...row,
    pricingUnit:
      row.pricingUnit != null && row.pricingUnit.trim().length > 0
        ? row.pricingUnit
        : row.unit,
  }))

export type PmSharedResourceCatalogRow = z.infer<typeof PmSharedResourceCatalogRowSchema>

export const PmSharedResourceCatalogGetInputSchema = z.object({
  workspaceId: z.string().uuid(),
})

export const PmSharedResourceCatalogSetInputSchema = z.object({
  workspaceId: z.string().uuid(),
  rows: z.array(PmSharedResourceCatalogRowSchema),
})

export const PmSharedResourceCatalogUpsertInputSchema = z.object({
  workspaceId: z.string().uuid(),
  upserts: z.array(
    z.object({
      type: PmAgentResourceTypeSchema,
      name: z.string().min(1),
      unit: z.string().optional(),
      pricingUnit: z.string().optional(),
      unitPrice: z.number().finite().nullable().optional(),
      spec: z.string().optional(),
      note: z.string().optional(),
    }),
  ),
})

export const PM_SHARED_RESOURCE_APPLICABLE_ALL = 'all'

export function resourceCatalogMatchKey(type: PmAgentResourceType, name: string): string {
  return `${type}::${name.trim().toLowerCase()}`
}

export function parseSharedResourceCatalogRows(raw: unknown): PmSharedResourceCatalogRow[] | null {
  if (!Array.isArray(raw)) return null
  if (raw.length === 0) return []
  const rows: PmSharedResourceCatalogRow[] = []
  for (const entry of raw) {
    const parsed = PmSharedResourceCatalogRowSchema.safeParse(entry)
    if (parsed.success) rows.push(parsed.data)
  }
  return rows
}

export function formatResourceCatalogHintLines(
  rows: readonly PmSharedResourceCatalogRow[],
  limit = 80,
): string {
  if (rows.length === 0) return '（资源列表为空）'
  const lines = rows.slice(0, limit).map((row) => {
    const typeLabel = PM_AGENT_RESOURCE_TYPE_LABELS[row.type] ?? row.type
    const price =
      row.unitPrice != null && Number.isFinite(row.unitPrice) ? String(row.unitPrice) : '-'
    const spec = row.spec.trim()
    const note = row.note.trim()
    const extras = [
      spec ? `规格 ${spec}` : '',
      note ? `说明 ${note}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
    const pricing =
      row.pricingUnit.trim() && row.pricingUnit !== row.unit
        ? ` · 计价单位 ${row.pricingUnit}`
        : ''
    return `- [${typeLabel}] ${row.name} · 计量单位 ${row.unit || '-'}${pricing} · 单价 ${price}${
      extras ? ` · ${extras}` : ''
    }`
  })
  if (rows.length > limit) {
    lines.push(`- …另有 ${rows.length - limit} 条未列出`)
  }
  return lines.join('\n')
}

/** Built-in starter rows (same names as desktop defaults). */
export function createDefaultSharedResourceCatalogRows(): PmSharedResourceCatalogRow[] {
  const defs: ReadonlyArray<{
    type: PmAgentResourceType
    name: string
    unit: string
    pricingUnit: string
    unitPrice: number | null
  }> = [
    { type: 'labor', name: '普通工', unit: '人', pricingUnit: '工日', unitPrice: 250 },
    { type: 'labor', name: '技术工人', unit: '人', pricingUnit: '工日', unitPrice: 400 },
    { type: 'labor', name: '管理人员', unit: '人', pricingUnit: '工日', unitPrice: 500 },
    { type: 'material', name: '砂子', unit: 'm³', pricingUnit: 'm³', unitPrice: 100 },
    { type: 'material', name: '石子', unit: 'm³', pricingUnit: 'm³', unitPrice: 110 },
    { type: 'material', name: '水泥', unit: 't', pricingUnit: 't', unitPrice: 400 },
    { type: 'material', name: '商品混凝土', unit: 'm³', pricingUnit: 'm³', unitPrice: 420 },
    { type: 'material', name: '钢筋', unit: 't', pricingUnit: 't', unitPrice: 3800 },
    { type: 'material', name: '模板', unit: 'm²', pricingUnit: 'm²', unitPrice: 50 },
    { type: 'material', name: '方木', unit: 'm³', pricingUnit: 'm³', unitPrice: 1800 },
    { type: 'material', name: '脚手架', unit: 't', pricingUnit: 't', unitPrice: 5000 },
    { type: 'material', name: '砌块/砖', unit: 'm³', pricingUnit: 'm³', unitPrice: 280 },
    { type: 'material', name: '防水卷材', unit: 'm²', pricingUnit: 'm²', unitPrice: 25 },
    { type: 'material', name: '预拌砂浆', unit: 'm³', pricingUnit: 'm³', unitPrice: 450 },
    { type: 'material', name: '电缆', unit: 'm', pricingUnit: 'm', unitPrice: 20 },
    { type: 'material', name: '钢管', unit: 't', pricingUnit: 't', unitPrice: 4800 },
    { type: 'equipment', name: '钢筋切断机', unit: '台', pricingUnit: '台班', unitPrice: 200 },
    { type: 'equipment', name: '钢筋折弯机', unit: '台', pricingUnit: '台班', unitPrice: 220 },
    { type: 'equipment', name: '钢筋调直机', unit: '台', pricingUnit: '台班', unitPrice: 250 },
    { type: 'equipment', name: '洒水车', unit: '台', pricingUnit: '台班', unitPrice: 800 },
    { type: 'equipment', name: '铲车', unit: '台', pricingUnit: '台班', unitPrice: 1000 },
    { type: 'equipment', name: '吊车', unit: '台', pricingUnit: '台班', unitPrice: 2000 },
    { type: 'equipment', name: '挖掘机', unit: '台', pricingUnit: '台班', unitPrice: 1500 },
    { type: 'device', name: '发电机', unit: '台', pricingUnit: '台班', unitPrice: 600 },
    { type: 'device', name: '电焊机', unit: '台', pricingUnit: '台班', unitPrice: 180 },
    { type: 'device', name: '空压机', unit: '台', pricingUnit: '台班', unitPrice: 350 },
    { type: 'device', name: '水泵', unit: '台', pricingUnit: '台班', unitPrice: 200 },
    { type: 'device', name: '搅拌机', unit: '台', pricingUnit: '台班', unitPrice: 450 },
    { type: 'instrument', name: '全站仪', unit: '台', pricingUnit: '台班', unitPrice: 400 },
    { type: 'instrument', name: '水准仪', unit: '台', pricingUnit: '台班', unitPrice: 150 },
    { type: 'instrument', name: '塔尺', unit: '台', pricingUnit: '台班', unitPrice: 30 },
    { type: 'funds', name: '投资估算', unit: '元', pricingUnit: '元', unitPrice: null },
    { type: 'funds', name: '设计概算', unit: '元', pricingUnit: '元', unitPrice: null },
    { type: 'funds', name: '施工图预算', unit: '元', pricingUnit: '元', unitPrice: null },
    { type: 'funds', name: '成本预算', unit: '元', pricingUnit: '元', unitPrice: null },
  ]
  return defs.map((entry, index) => ({
    id: `default-resource-${index + 1}`,
    type: entry.type,
    name: entry.name,
    spec: '',
    unit: entry.unit,
    pricingUnit: entry.pricingUnit,
    unitPrice: entry.unitPrice,
    applicable: PM_SHARED_RESOURCE_APPLICABLE_ALL,
    note: '',
    sortOrder: index,
    parentId: null,
  }))
}

export function upsertSharedResourceCatalogRows(
  existing: readonly PmSharedResourceCatalogRow[],
  upserts: ReadonlyArray<{
    type: PmAgentResourceType
    name: string
    unit?: string
    pricingUnit?: string
    unitPrice?: number | null
    spec?: string
    note?: string
  }>,
  createId: () => string = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `resource-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
): { rows: PmSharedResourceCatalogRow[]; changed: boolean } {
  let changed = false
  const next = existing.map((row) => ({ ...row }))
  const indexByKey = new Map<string, number>()
  for (let i = 0; i < next.length; i += 1) {
    const name = next[i]!.name.trim()
    if (!name) continue
    indexByKey.set(resourceCatalogMatchKey(next[i]!.type, name), i)
  }

  for (const entry of upserts) {
    const name = entry.name.trim()
    if (!name) continue
    const key = resourceCatalogMatchKey(entry.type, name)
    const existingIndex = indexByKey.get(key)
    if (existingIndex == null) {
      const unit = entry.unit?.trim() ?? ''
      let pricingUnit = entry.pricingUnit?.trim() || ''
      if (!pricingUnit) {
        if (entry.type === 'labor') pricingUnit = '工日'
        else if (
          entry.type === 'equipment' ||
          entry.type === 'device' ||
          entry.type === 'instrument'
        ) {
          pricingUnit = '台班'
        } else {
          pricingUnit = unit
        }
      }
      next.push({
        id: createId(),
        type: entry.type,
        name,
        spec: entry.spec?.trim() ?? '',
        unit,
        pricingUnit,
        unitPrice: entry.unitPrice ?? null,
        applicable: PM_SHARED_RESOURCE_APPLICABLE_ALL,
        note: entry.note?.trim() ?? '',
        sortOrder: next.length,
        parentId: null,
      })
      indexByKey.set(key, next.length - 1)
      changed = true
      continue
    }
    const prev = next[existingIndex]!
    const unit = entry.unit?.trim()
    const pricingUnit = entry.pricingUnit?.trim()
    const nextRow: PmSharedResourceCatalogRow = {
      ...prev,
      name,
      type: entry.type,
      spec: entry.spec !== undefined ? entry.spec.trim() : prev.spec,
      unit: unit != null && unit.length > 0 ? unit : prev.unit,
      pricingUnit:
        pricingUnit != null && pricingUnit.length > 0 ? pricingUnit : prev.pricingUnit,
      unitPrice: entry.unitPrice !== undefined ? entry.unitPrice : prev.unitPrice,
      applicable: PM_SHARED_RESOURCE_APPLICABLE_ALL,
      note: entry.note !== undefined ? entry.note.trim() : prev.note,
    }
    if (
      nextRow.unit !== prev.unit ||
      nextRow.pricingUnit !== prev.pricingUnit ||
      nextRow.unitPrice !== prev.unitPrice ||
      nextRow.name !== prev.name ||
      nextRow.spec !== prev.spec ||
      nextRow.note !== prev.note
    ) {
      next[existingIndex] = nextRow
      changed = true
    }
  }

  if (!changed) return { rows: [...existing], changed: false }
  return { rows: next.map((row, index) => ({ ...row, sortOrder: index })), changed: true }
}

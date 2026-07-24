import { z } from 'zod'

import {
  PmAgentResourceTypeSchema,
  resolvePmAgentResourceTypeLabel,
  type PmAgentResourceType,
} from './pm-resource-apply.js'
import { isPmSystemDefaultResourceProjectCode } from './pm-resource-catalog-agent.js'
import {
  costCatalogMatchKey,
  formatCostCatalogHintLines,
  type PmSharedCostCatalogRow,
} from './pm-shared-cost-catalog.js'

/** Stored on `PmProject.metadata`. */
export const PM_PROJECT_COST_CATALOG_KEY = 'costCatalog'

export type PmAgentProjectCostCatalogSummary = {
  projectId: string
  code: string
  name: string
  /** System sample catalogs vs user-created projects. */
  kind: 'system' | 'user'
  /** Owned `metadata.costCatalog` vs live fallback to「全部项目」. */
  source: 'owned' | 'shared-fallback'
  rowCount: number
  summary: string
}

export const PmCostCatalogUpsertEntrySchema = z.object({
  type: PmAgentResourceTypeSchema,
  name: z.string().min(1),
  code: z.string().optional(),
  unit: z.string().optional(),
  quantity: z.number().finite().nullable().optional(),
  unitPrice: z.number().finite().nullable().optional(),
  featureDescription: z.string().optional(),
  note: z.string().optional(),
  sectionalWork: z.string().optional(),
})

export type PmCostCatalogUpsertEntry = z.infer<typeof PmCostCatalogUpsertEntrySchema>

export const PmCostCatalogRemoveEntrySchema = z.object({
  type: PmAgentResourceTypeSchema.optional(),
  typeLabel: z.string().optional(),
  name: z.string().min(1),
})

export type PmCostCatalogRemoveEntry = z.infer<typeof PmCostCatalogRemoveEntrySchema>

export const PmCostCatalogPatchTargetSchema = z.union([
  z.literal('shared'),
  z.literal('all'),
  z.string().min(1),
])

export const PmCostCatalogPatchSchema = z.object({
  /** `shared` / `all` / `全部项目` → workspace catalog; otherwise project code or id. */
  target: PmCostCatalogPatchTargetSchema,
  upserts: z.array(PmCostCatalogUpsertEntrySchema).default([]),
  removes: z.array(PmCostCatalogRemoveEntrySchema).default([]),
})

export type PmCostCatalogPatch = z.infer<typeof PmCostCatalogPatchSchema>

export const PmApplyCostCatalogPatchInputSchema = z.object({
  workspaceId: z.string().uuid(),
  patches: z.array(PmCostCatalogPatchSchema).min(1),
})

export type PmApplyCostCatalogPatchInput = z.infer<typeof PmApplyCostCatalogPatchInputSchema>

export type PmParsedCostCatalogPatches = {
  patches: PmCostCatalogPatch[]
}

function isSharedTarget(target: string): boolean {
  const value = target.trim().toLowerCase()
  return (
    value === 'shared' ||
    value === 'all' ||
    value === '全部项目' ||
    value === 'allprojects' ||
    value === 'workspace'
  )
}

export function normalizeCostCatalogPatchTarget(target: string): 'shared' | string {
  const trimmed = target.trim()
  if (!trimmed) return 'shared'
  if (isSharedTarget(trimmed)) return 'shared'
  return trimmed
}

export function removeCostCatalogRows(
  existing: readonly PmSharedCostCatalogRow[],
  removes: ReadonlyArray<{ type?: PmAgentResourceType | null; name: string }>,
): { rows: PmSharedCostCatalogRow[]; changed: boolean; removedCount: number } {
  if (removes.length === 0) {
    return { rows: [...existing], changed: false, removedCount: 0 }
  }
  const removeKeys = new Set<string>()
  const removeNames = new Set<string>()
  for (const entry of removes) {
    const name = entry.name.trim()
    if (!name) continue
    if (entry.type) {
      removeKeys.add(costCatalogMatchKey(entry.type, name))
    } else {
      removeNames.add(name.toLowerCase())
    }
  }
  const next = existing.filter((row) => {
    const name = row.name.trim()
    if (!name) return true
    if (removeKeys.has(costCatalogMatchKey(row.type, name))) return false
    if (removeNames.has(name.toLowerCase())) return false
    return true
  })
  const removedCount = existing.length - next.length
  if (removedCount === 0) {
    return { rows: [...existing], changed: false, removedCount: 0 }
  }
  return {
    rows: next.map((row, index) => ({ ...row, sortOrder: index })),
    changed: true,
    removedCount,
  }
}

function normalizeUpsertEntry(entry: unknown): unknown {
  if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) return entry
  const row = entry as Record<string, unknown>
  const typeLabel = typeof row.typeLabel === 'string' ? row.typeLabel : undefined
  const typeRaw = typeof row.type === 'string' ? row.type : undefined
  const resolved =
    (typeRaw ? resolvePmAgentResourceTypeLabel(typeRaw) : null) ??
    (typeLabel ? resolvePmAgentResourceTypeLabel(typeLabel) : null)
  return {
    type: resolved ?? undefined,
    name: row.name ?? row.costName,
    code: row.code,
    unit: row.unit,
    quantity: row.quantity ?? row.qty,
    unitPrice: row.unitPrice ?? row.price,
    featureDescription: row.featureDescription ?? row.feature ?? row.spec,
    note: row.note ?? row.description ?? row.remark,
    sectionalWork: row.sectionalWork ?? row.section,
  }
}

function normalizeRemoveEntry(entry: unknown): unknown {
  if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) return entry
  const row = entry as Record<string, unknown>
  const typeLabel = typeof row.typeLabel === 'string' ? row.typeLabel : undefined
  const typeRaw = typeof row.type === 'string' ? row.type : undefined
  const resolved =
    (typeRaw ? resolvePmAgentResourceTypeLabel(typeRaw) : null) ??
    (typeLabel ? resolvePmAgentResourceTypeLabel(typeLabel) : null)
  return {
    type: resolved ?? undefined,
    typeLabel,
    name: row.name ?? row.costName,
  }
}

function normalizePatch(entry: unknown): unknown {
  if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) return entry
  const row = entry as Record<string, unknown>
  const upsertsRaw = row.upserts ?? row.add ?? row.update ?? row.items
  const removesRaw = row.removes ?? row.delete ?? row.remove
  return {
    target: row.target ?? row.scope ?? row.project ?? row.projectCode ?? 'shared',
    upserts: Array.isArray(upsertsRaw) ? upsertsRaw.map(normalizeUpsertEntry) : [],
    removes: Array.isArray(removesRaw) ? removesRaw.map(normalizeRemoveEntry) : [],
  }
}

function parsePatchList(raw: unknown): PmCostCatalogPatch[] {
  if (!Array.isArray(raw)) return []
  const patches: PmCostCatalogPatch[] = []
  for (const entry of raw) {
    const parsed = PmCostCatalogPatchSchema.safeParse(normalizePatch(entry))
    if (!parsed.success) continue
    if (parsed.data.upserts.length === 0 && parsed.data.removes.length === 0) continue
    patches.push({
      ...parsed.data,
      target: normalizeCostCatalogPatchTarget(String(parsed.data.target)),
    })
  }
  return patches
}

function extractJsonPayloads(text: string): string[] {
  const payloads: string[] = []
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi
  let match: RegExpExecArray | null
  while ((match = fenceRe.exec(text)) != null) {
    const body = match[1]?.trim()
    if (body) payloads.push(body)
  }
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    payloads.push(trimmed)
  }
  return payloads
}

/**
 * Parse assistant text for cost-catalog patches. Accepts:
 * - `{ "costCatalogPatch": { target, upserts, removes } }`
 * - `{ "costCatalogPatches": [ ... ] }`
 * - bare patch object / array
 */
export function parsePmCostCatalogPatchesFromText(text: string): PmParsedCostCatalogPatches {
  const fenced = extractJsonPayloads(text)
  for (const payload of fenced) {
    try {
      const parsed = JSON.parse(payload) as unknown
      if (Array.isArray(parsed)) {
        const patches = parsePatchList(parsed)
        if (patches.length > 0) return { patches }
        continue
      }
      if (parsed && typeof parsed === 'object') {
        const root = parsed as Record<string, unknown>
        if (root.costCatalogPatches != null) {
          const patches = parsePatchList(root.costCatalogPatches)
          if (patches.length > 0) return { patches }
        }
        if (root.costCatalogPatch != null) {
          const patches = parsePatchList([root.costCatalogPatch])
          if (patches.length > 0) return { patches }
        }
        // Bare single patch object
        const bare = parsePatchList([root])
        if (bare.length > 0) return { patches: bare }
      }
    } catch {
      // try next fence
    }
  }
  return { patches: [] }
}

export function buildPmCostCatalogPatchFingerprint(
  patches: readonly PmCostCatalogPatch[],
): string {
  return JSON.stringify(
    patches.map((patch) => ({
      target: normalizeCostCatalogPatchTarget(String(patch.target)),
      upserts: patch.upserts.map((entry) => ({
        type: entry.type,
        name: entry.name.trim(),
        code: entry.code ?? null,
        unit: entry.unit ?? null,
        quantity: entry.quantity ?? null,
        unitPrice: entry.unitPrice ?? null,
        featureDescription: entry.featureDescription ?? null,
        note: entry.note ?? null,
        sectionalWork: entry.sectionalWork ?? null,
      })),
      removes: patch.removes.map((entry) => ({
        type:
          entry.type ??
          (entry.typeLabel ? resolvePmAgentResourceTypeLabel(entry.typeLabel) : null),
        name: entry.name.trim(),
      })),
    })),
  )
}

export function formatProjectCostCatalogAgentBlock(
  entries: readonly PmAgentProjectCostCatalogSummary[],
): string {
  if (entries.length === 0) return ''
  const lines: string[] = ['', '### 项目价格表']
  for (const entry of entries) {
    const kindLabel = entry.kind === 'system' ? '系统默认' : '用户自建'
    const sourceLabel =
      entry.source === 'owned' ? `自有 ${entry.rowCount} 条` : '继承「全部项目」（未单独保存）'
    lines.push(`#### ${entry.code} · ${entry.name}（${kindLabel} · ${sourceLabel}）`)
    lines.push(entry.summary.trim() || '（空）')
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}

export function buildProjectCostCatalogSummaryEntry(options: {
  projectId: string
  code: string
  name: string
  rows: readonly PmSharedCostCatalogRow[] | null
  limit?: number
}): PmAgentProjectCostCatalogSummary {
  const owned = options.rows != null
  const rows = options.rows ?? []
  const limit = options.limit ?? (isPmSystemDefaultResourceProjectCode(options.code) ? 50 : 25)
  return {
    projectId: options.projectId,
    code: options.code,
    name: options.name,
    kind: isPmSystemDefaultResourceProjectCode(options.code) ? 'system' : 'user',
    source: owned ? 'owned' : 'shared-fallback',
    rowCount: rows.length,
    summary: owned
      ? formatCostCatalogHintLines(rows, limit)
      : '（当前继承工作区「全部项目」价格表；修改后将形成该项目自有价格表）',
  }
}

/** Prompt fragment: how the cost agent should present price-list changes. */
export const PM_COST_CATALOG_PATCH_OUTPUT_HINT = [
  '## 价格表建议输出（默认可读清单）',
  '查询/分析可直接依据上方注入的「全部项目」与各项目价格表作答。',
  '提出增改删建议时：**默认只用 Markdown 列表/表格**写清目标价格表、操作（新增/修改/删除）、类型、编码、名称、特征描述、计量单位、数量、单价、分部工程、说明。',
  '**禁止**在日常回答中输出 `costCatalogPatches` JSON 或 ```json 代码块；用户未要求时不要展示底层补丁格式。',
  '仅当用户明确要求「JSON」「补丁」「costCatalogPatches」「输出代码」时，再附加如下结构（可用 ```json 代码块）：',
  '{',
  '  "costCatalogPatches": [',
  '    {',
  '      "target": "全部项目",',
  '      "upserts": [',
  '        { "type": "material", "name": "电缆", "code": "02-001", "unit": "m", "quantity": 100, "unitPrice": 20, "featureDescription": "YJV-3×95", "note": "" }',
  '      ],',
  '      "removes": [',
  '        { "type": "labor", "name": "临时工种" }',
  '      ]',
  '    }',
  '  ]',
  '}',
  'target：`全部项目`/`shared`/`all` 写入工作区默认价格表；或项目编码（如 EMP-2401、PRJ-2601、用户项目编码）。',
  '系统默认价格表：全部项目、EMP-2401、PRJ-2601；其余为用户自建项目价格表。均可查询、分析与修改。',
  'type 可用：labor/auxiliary/material/equipment/device/instrument/funds/custom/management/fees/comprehensive/measures/tax/investment/designEstimate/constructionBudget/costBudget/other（或中文人力/辅材/材料/机械/设备/仪器/资金/自定义/综合单价/措施费/税金/投资估算/设计概算/施工预算/成本预算等）。',
  '未写入价格表前不要声称已生效；有 UI 确认条时，以用户确认的结果为准。',
].join('\n')

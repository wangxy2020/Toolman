import { z } from 'zod'

import {
  PmAgentResourceTypeSchema,
  resolvePmAgentResourceTypeLabel,
  type PmAgentResourceType,
} from './pm-resource-apply.js'
import {
  formatResourceCatalogHintLines,
  resourceCatalogMatchKey,
  type PmSharedResourceCatalogRow,
} from './pm-shared-resource-catalog.js'

/** System-default project catalogs (alongside workspace「全部项目」). */
export const PM_SYSTEM_DEFAULT_RESOURCE_PROJECT_CODES = ['EMP-2401', 'PRJ-2601'] as const

export function isPmSystemDefaultResourceProjectCode(code: string): boolean {
  const normalized = code.trim().toUpperCase()
  return (PM_SYSTEM_DEFAULT_RESOURCE_PROJECT_CODES as readonly string[]).includes(normalized)
}

/** Stored on `PmProject.metadata`. */
export const PM_PROJECT_RESOURCE_CATALOG_KEY = 'resourceCatalog'

export type PmAgentProjectResourceCatalogSummary = {
  projectId: string
  code: string
  name: string
  /** System sample catalogs vs user-created projects. */
  kind: 'system' | 'user'
  /** Owned `metadata.resourceCatalog` vs live fallback to「全部项目」. */
  source: 'owned' | 'shared-fallback'
  rowCount: number
  summary: string
}

export const PmResourceCatalogUpsertEntrySchema = z.object({
  type: PmAgentResourceTypeSchema,
  name: z.string().min(1),
  unit: z.string().optional(),
  pricingUnit: z.string().optional(),
  unitPrice: z.number().finite().nullable().optional(),
  spec: z.string().optional(),
  note: z.string().optional(),
})

export type PmResourceCatalogUpsertEntry = z.infer<typeof PmResourceCatalogUpsertEntrySchema>

export const PmResourceCatalogRemoveEntrySchema = z.object({
  type: PmAgentResourceTypeSchema.optional(),
  typeLabel: z.string().optional(),
  name: z.string().min(1),
})

export type PmResourceCatalogRemoveEntry = z.infer<typeof PmResourceCatalogRemoveEntrySchema>

export const PmResourceCatalogPatchTargetSchema = z.union([
  z.literal('shared'),
  z.literal('all'),
  z.string().min(1),
])

export const PmResourceCatalogPatchSchema = z.object({
  /** `shared` / `all` / `全部项目` → workspace catalog; otherwise project code or id. */
  target: PmResourceCatalogPatchTargetSchema,
  upserts: z.array(PmResourceCatalogUpsertEntrySchema).default([]),
  removes: z.array(PmResourceCatalogRemoveEntrySchema).default([]),
})

export type PmResourceCatalogPatch = z.infer<typeof PmResourceCatalogPatchSchema>

export const PmApplyResourceCatalogPatchInputSchema = z.object({
  workspaceId: z.string().uuid(),
  patches: z.array(PmResourceCatalogPatchSchema).min(1),
})

export type PmApplyResourceCatalogPatchInput = z.infer<
  typeof PmApplyResourceCatalogPatchInputSchema
>

export type PmParsedResourceCatalogPatches = {
  patches: PmResourceCatalogPatch[]
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

export function normalizeResourceCatalogPatchTarget(target: string): 'shared' | string {
  const trimmed = target.trim()
  if (!trimmed) return 'shared'
  if (isSharedTarget(trimmed)) return 'shared'
  return trimmed
}

export function removeResourceCatalogRows(
  existing: readonly PmSharedResourceCatalogRow[],
  removes: ReadonlyArray<{ type?: PmAgentResourceType | null; name: string }>,
): { rows: PmSharedResourceCatalogRow[]; changed: boolean; removedCount: number } {
  if (removes.length === 0) {
    return { rows: [...existing], changed: false, removedCount: 0 }
  }
  const removeKeys = new Set<string>()
  const removeNames = new Set<string>()
  for (const entry of removes) {
    const name = entry.name.trim()
    if (!name) continue
    if (entry.type) {
      removeKeys.add(resourceCatalogMatchKey(entry.type, name))
    } else {
      removeNames.add(name.toLowerCase())
    }
  }
  const next = existing.filter((row) => {
    const name = row.name.trim()
    if (!name) return true
    if (removeKeys.has(resourceCatalogMatchKey(row.type, name))) return false
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
    name: row.name ?? row.resourceName,
    unit: row.unit,
    pricingUnit: row.pricingUnit,
    unitPrice: row.unitPrice ?? row.price ?? null,
    spec: row.spec ?? row.specification,
    note: row.note ?? row.description ?? row.remark,
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
    name: row.name ?? row.resourceName,
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

function parsePatchList(raw: unknown): PmResourceCatalogPatch[] {
  if (!Array.isArray(raw)) return []
  const patches: PmResourceCatalogPatch[] = []
  for (const entry of raw) {
    const parsed = PmResourceCatalogPatchSchema.safeParse(normalizePatch(entry))
    if (!parsed.success) continue
    if (parsed.data.upserts.length === 0 && parsed.data.removes.length === 0) continue
    patches.push({
      ...parsed.data,
      target: normalizeResourceCatalogPatchTarget(String(parsed.data.target)),
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
 * Parse assistant text for resource-catalog patches. Accepts:
 * - `{ "resourceCatalogPatch": { target, upserts, removes } }`
 * - `{ "resourceCatalogPatches": [ ... ] }`
 * - bare patch object / array
 */
export function parsePmResourceCatalogPatchesFromText(
  text: string,
): PmParsedResourceCatalogPatches {
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
        if (root.resourceCatalogPatches != null) {
          const patches = parsePatchList(root.resourceCatalogPatches)
          if (patches.length > 0) return { patches }
        }
        if (root.resourceCatalogPatch != null) {
          const patches = parsePatchList([root.resourceCatalogPatch])
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

export function buildPmResourceCatalogPatchFingerprint(
  patches: readonly PmResourceCatalogPatch[],
): string {
  return JSON.stringify(
    patches.map((patch) => ({
      target: normalizeResourceCatalogPatchTarget(String(patch.target)),
      upserts: patch.upserts.map((entry) => ({
        type: entry.type,
        name: entry.name.trim(),
        unit: entry.unit ?? null,
        pricingUnit: entry.pricingUnit ?? null,
        unitPrice: entry.unitPrice ?? null,
        spec: entry.spec ?? null,
        note: entry.note ?? null,
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

export function formatProjectResourceCatalogAgentBlock(
  entries: readonly PmAgentProjectResourceCatalogSummary[],
): string {
  if (entries.length === 0) return ''
  const lines: string[] = ['', '### 项目资源列表']
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

export function buildProjectResourceCatalogSummaryEntry(options: {
  projectId: string
  code: string
  name: string
  rows: readonly PmSharedResourceCatalogRow[] | null
  limit?: number
}): PmAgentProjectResourceCatalogSummary {
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
      ? formatResourceCatalogHintLines(rows, limit)
      : '（当前继承工作区「全部项目」资源列表；修改后将形成该项目自有列表）',
  }
}

/** Prompt fragment: how the resource agent should present catalog changes. */
export const PM_RESOURCE_CATALOG_PATCH_OUTPUT_HINT = [
  '## 资源列表建议输出（默认可读清单）',
  '查询/分析可直接依据上方注入的「全部项目」与各项目资源列表作答。',
  '提出增改删建议时：**默认只用 Markdown 列表/表格**写清目标列表、操作（新增/修改/删除）、类型、名称、规格、计量单位、计价单位、单价、说明。',
  '**禁止**在日常回答中输出 `resourceCatalogPatches` JSON 或 ```json 代码块；用户未要求时不要展示底层补丁格式。',
  '仅当用户明确要求「JSON」「补丁」「resourceCatalogPatches」「输出代码」时，再附加如下结构（可用 ```json 代码块）：',
  '{',
  '  "resourceCatalogPatches": [',
  '    {',
  '      "target": "全部项目",',
  '      "upserts": [',
  '        { "type": "material", "name": "电缆", "unit": "m", "unitPrice": 20, "spec": "YJV-3×95", "note": "" }',
  '      ],',
  '      "removes": [',
  '        { "type": "labor", "name": "临时工种" }',
  '      ]',
  '    }',
  '  ]',
  '}',
  'target：`全部项目`/`shared`/`all` 写入工作区默认列表；或项目编码（如 EMP-2401、PRJ-2601、用户项目编码）。',
  '系统默认列表：全部项目、EMP-2401、PRJ-2601；其余为用户自建项目列表。均可查询、分析与修改。',
  'type 可用：labor/auxiliary/material/equipment/device/instrument/funds/custom/management/fees/comprehensive/measures/tax/investment/designEstimate/constructionBudget/costBudget/other（或中文人力/辅材/材料/机械/设备/仪器/资金/自定义/综合单价/措施费/税金/投资估算/设计概算/施工预算/成本预算等）。',
  '未写入资源字典前不要声称已生效；有 UI 确认条时，以用户确认的结果为准。',
].join('\n')

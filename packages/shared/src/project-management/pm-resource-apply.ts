import { z } from 'zod'

/** Mirrors desktop catalog types used by Gantt resource allocation. */
export const PmAgentResourceTypeSchema = z.enum([
  'labor',
  'auxiliary',
  'material',
  'equipment',
  'device',
  'instrument',
  'management',
  'fees',
  'comprehensive',
  'measures',
  'tax',
  'investment',
  'designEstimate',
  'constructionBudget',
  'costBudget',
  'funds',
  'custom',
  'other',
])

export type PmAgentResourceType = z.infer<typeof PmAgentResourceTypeSchema>

export const PM_AGENT_RESOURCE_TYPE_LABELS: Record<PmAgentResourceType, string> = {
  labor: '人力',
  auxiliary: '辅材',
  material: '材料',
  equipment: '机械',
  device: '设备',
  instrument: '仪器',
  management: '管理费',
  fees: '规费',
  comprehensive: '综合单价',
  measures: '措施费',
  tax: '税金',
  investment: '投资估算',
  designEstimate: '设计概算',
  constructionBudget: '施工预算',
  costBudget: '成本预算',
  funds: '资金',
  custom: '自定义',
  other: '其他费',
}

export function resolvePmAgentResourceTypeLabel(label: string): PmAgentResourceType | null {
  const trimmed = label.trim()
  if (!trimmed) return null
  if ((PmAgentResourceTypeSchema.options as readonly string[]).includes(trimmed)) {
    return trimmed as PmAgentResourceType
  }
  // Common LLM aliases / informal labels
  const aliases: Record<string, PmAgentResourceType> = {
    mechanical: 'equipment',
    machinery: 'equipment',
    machine: 'equipment',
    机具: 'equipment',
    施工机械: 'equipment',
  }
  const alias = aliases[trimmed.toLowerCase()] ?? aliases[trimmed]
  if (alias) return alias
  if (trimmed === '其他') return 'other'
  if (trimmed === '管理') return 'management'
  for (const [type, zh] of Object.entries(PM_AGENT_RESOURCE_TYPE_LABELS) as Array<
    [PmAgentResourceType, string]
  >) {
    if (zh === trimmed) return type
  }
  return null
}

export const PmResourceAssignmentSuggestionSchema = z.object({
  type: PmAgentResourceTypeSchema.optional(),
  /** Chinese or English type label; resolved when `type` omitted. */
  typeLabel: z.string().optional(),
  name: z.string().min(1),
  quantity: z.number().finite().optional(),
  unit: z.string().optional(),
  unitPrice: z.number().finite().optional(),
  note: z.string().optional(),
})

export type PmResourceAssignmentSuggestion = z.infer<typeof PmResourceAssignmentSuggestionSchema>

export const PmResourceTaskPlanSuggestionSchema = z
  .object({
    workItemId: z.string().uuid().optional(),
    workItemCode: z.string().optional(),
    workItemTitle: z.string().min(1).optional(),
    assignments: z.array(PmResourceAssignmentSuggestionSchema).min(1),
  })
  .refine((value) => value.workItemId != null || value.workItemTitle != null, {
    message: 'workItemId or workItemTitle is required',
  })

export type PmResourceTaskPlanSuggestion = z.infer<typeof PmResourceTaskPlanSuggestionSchema>

export const PmResourceCatalogUpsertSchema = z.object({
  type: PmAgentResourceTypeSchema,
  name: z.string().min(1),
  unit: z.string().optional(),
  pricingUnit: z.string().optional(),
  unitPrice: z.number().finite().nullable().optional(),
})

export type PmResourceCatalogUpsert = z.infer<typeof PmResourceCatalogUpsertSchema>

export const PmApplyResourcePlanInputSchema = z.object({
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  suggestions: z.array(PmResourceTaskPlanSuggestionSchema).min(1),
})

export type PmApplyResourcePlanInput = z.infer<typeof PmApplyResourcePlanInputSchema>

export const TASK_RESOURCE_ASSIGNMENTS_KEY = 'resourceAssignments'
export const TASK_RESOURCE_ASSIGNMENT_KEY = 'resourceAssignment'

export type PmTaskResourceAssignment = {
  resourceId: string | null
  type: PmAgentResourceType | null
  name: string
  quantity: number | null
  note: string
}

export const EMPTY_TASK_RESOURCE_ASSIGNMENT: PmTaskResourceAssignment = {
  resourceId: null,
  type: null,
  name: '',
  quantity: null,
  note: '',
}

export function isEmptyTaskResourceAssignment(assignment: PmTaskResourceAssignment): boolean {
  return (
    assignment.resourceId == null &&
    assignment.type == null &&
    !assignment.name.trim() &&
    assignment.quantity == null
  )
}

export function readTaskResourceAssignmentsFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): PmTaskResourceAssignment[] {
  const list = metadata?.[TASK_RESOURCE_ASSIGNMENTS_KEY]
  if (Array.isArray(list)) {
    return list.map((entry) => parseAssignmentRow(entry))
  }
  const legacy = metadata?.[TASK_RESOURCE_ASSIGNMENT_KEY]
  if (legacy != null) return [parseAssignmentRow(legacy)]
  return []
}

function parseAssignmentRow(raw: unknown): PmTaskResourceAssignment {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...EMPTY_TASK_RESOURCE_ASSIGNMENT }
  }
  const row = raw as Record<string, unknown>
  const quantity =
    typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : null
  const type =
    typeof row.type === 'string' ? resolvePmAgentResourceTypeLabel(row.type) : null
  return {
    resourceId: typeof row.resourceId === 'string' && row.resourceId ? row.resourceId : null,
    type,
    name: typeof row.name === 'string' ? row.name : '',
    quantity,
    note: typeof row.note === 'string' ? row.note : '',
  }
}

export function replaceTaskResourceAssignmentsMetadata(
  metadata: Record<string, unknown> | null | undefined,
  assignments: readonly PmTaskResourceAssignment[],
): Record<string, unknown> {
  const list = assignments.filter((entry) => !isEmptyTaskResourceAssignment(entry))
  const base = { ...(metadata ?? {}) }
  base[TASK_RESOURCE_ASSIGNMENT_KEY] = null
  if (list.length === 0) {
    base[TASK_RESOURCE_ASSIGNMENTS_KEY] = null
  } else {
    base[TASK_RESOURCE_ASSIGNMENTS_KEY] = list.map((entry) => ({ ...entry }))
  }
  return base
}

/** Merge incoming into existing by resource name (and type when both set). */
export function mergeTaskResourceAssignmentsByName(
  existing: readonly PmTaskResourceAssignment[],
  incoming: readonly PmTaskResourceAssignment[],
): PmTaskResourceAssignment[] {
  const next = existing
    .filter((entry) => !isEmptyTaskResourceAssignment(entry))
    .map((entry) => ({ ...entry }))

  for (const row of incoming) {
    if (isEmptyTaskResourceAssignment(row)) continue
    const name = row.name.trim()
    const index = next.findIndex((entry) => {
      if (entry.name.trim() !== name) return false
      if (row.type != null && entry.type != null) return entry.type === row.type
      return true
    })
    if (index >= 0) {
      const prev = next[index]!
      next[index] = {
        resourceId: row.resourceId ?? prev.resourceId,
        type: row.type ?? prev.type,
        name: row.name.trim() || prev.name,
        quantity: row.quantity !== undefined ? row.quantity : prev.quantity,
        note: row.note.trim() ? row.note : prev.note,
      }
    } else {
      next.push({ ...row, name })
    }
  }
  return next
}

export type PmParsedResourcePlanFromText = {
  resourcePlan: PmResourceTaskPlanSuggestion[]
}

function parseResourcePlanArray(parsed: unknown): PmResourceTaskPlanSuggestion[] {
  if (!Array.isArray(parsed)) return []
  const suggestions: PmResourceTaskPlanSuggestion[] = []
  for (const entry of parsed) {
    const result = PmResourceTaskPlanSuggestionSchema.safeParse(normalizeTaskSuggestion(entry))
    if (result.success) suggestions.push(result.data)
  }
  return suggestions
}

function normalizeTaskSuggestion(entry: unknown): unknown {
  if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) return entry
  const row = entry as Record<string, unknown>
  const assignmentsRaw = row.assignments ?? row.resources ?? row.items
  const assignments = Array.isArray(assignmentsRaw)
    ? assignmentsRaw.map((item) => normalizeAssignmentSuggestion(item))
    : []
  return {
    workItemId: row.workItemId ?? row.taskId ?? row.id,
    workItemCode: row.workItemCode ?? row.taskCode ?? row.code ?? row.wbsCode,
    workItemTitle: row.workItemTitle ?? row.title ?? row.taskTitle ?? row.task,
    assignments,
  }
}

function normalizeAssignmentSuggestion(entry: unknown): unknown {
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
    quantity: row.quantity ?? row.qty,
    unit: row.unit,
    unitPrice: row.unitPrice ?? row.price,
    note: row.note,
  }
}

/**
 * Parse assistant text for a resource plan. Accepts:
 * - `{ "resourcePlan": [ ... ] }`
 * - `{ "assignments": [ ... ] }` (task-level list)
 * - bare `[ ... ]` of task suggestions
 */
export function parsePmResourcePlanFromText(text: string): PmParsedResourcePlanFromText {
  // Do not steal pure costPlan payloads (same assignment shape).
  if (
    /"costPlan"\s*:/.test(text) &&
    !/"resourcePlan"\s*:/.test(text) &&
    !/"resourceAssignments"\s*:/.test(text)
  ) {
    return { resourcePlan: [] }
  }

  for (const payload of extractJsonPayloads(text)) {
    try {
      const parsed = JSON.parse(payload) as unknown
      if (Array.isArray(parsed)) {
        const resourcePlan = parseResourcePlanArray(parsed)
        if (resourcePlan.length > 0) return { resourcePlan }
        continue
      }
      if (parsed && typeof parsed === 'object') {
        const root = parsed as Record<string, unknown>
        if (
          ('costPlan' in root || 'costAssignments' in root) &&
          !('resourcePlan' in root || 'resourceAssignments' in root || 'assignments' in root)
        ) {
          continue
        }
        const resourcePlan = parseResourcePlanArray(
          root.resourcePlan ?? root.resourceAssignments ?? root.assignments,
        )
        if (resourcePlan.length > 0) return { resourcePlan }
      }
    } catch {
      // try next payload
    }
  }
  return { resourcePlan: [] }
}

function extractJsonObjectSnippet(text: string): string | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  return text.slice(start, end + 1)
}

function extractJsonArraySnippet(text: string): string | null {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return null
  return text.slice(start, end + 1)
}

function extractJsonPayloads(text: string): string[] {
  const payloads: string[] = []
  const seen = new Set<string>()
  const push = (body: string | null | undefined) => {
    const trimmed = body?.trim()
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    payloads.push(trimmed)
  }

  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi
  let match: RegExpExecArray | null
  while ((match = fenceRe.exec(text)) != null) {
    push(match[1])
  }
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    push(trimmed)
  }
  push(extractJsonObjectSnippet(text))
  push(extractJsonArraySnippet(text))
  return payloads
}

export function buildPmResourcePlanFingerprint(
  suggestions: readonly PmResourceTaskPlanSuggestion[],
): string {
  return JSON.stringify(
    suggestions.map((task) => ({
      workItemId: task.workItemId ?? null,
      workItemCode: task.workItemCode?.trim() ?? null,
      workItemTitle: task.workItemTitle?.trim() ?? null,
      assignments: task.assignments.map((entry) => ({
        type: entry.type ?? resolvePmAgentResourceTypeLabel(entry.typeLabel ?? '') ?? null,
        name: entry.name.trim(),
        quantity: entry.quantity ?? null,
        unit: entry.unit ?? null,
        unitPrice: entry.unitPrice ?? null,
        note: entry.note ?? '',
      })),
    })),
  )
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()
}

function formatResourceTypeCell(entry: PmResourceAssignmentSuggestion): string {
  if (entry.type) return PM_AGENT_RESOURCE_TYPE_LABELS[entry.type]
  const resolved = entry.typeLabel
    ? resolvePmAgentResourceTypeLabel(entry.typeLabel)
    : null
  if (resolved) return PM_AGENT_RESOURCE_TYPE_LABELS[resolved]
  return entry.typeLabel?.trim() || '—'
}

/** Human-readable resource plan table for chat display. */
export function formatPmResourcePlanAsMarkdownTable(
  plan: PmParsedResourcePlanFromText,
): string {
  const { resourcePlan } = plan
  if (resourcePlan.length === 0) return ''

  const lines: string[] = [
    '### 资源计划',
    '',
    '| 任务名称 | 类型 | 资源名称 | 数量 | 单位 |',
    '| --- | :---: | --- | :---: | :---: |',
  ]

  for (const task of resourcePlan) {
    const title = escapeMarkdownTableCell(
      task.workItemTitle?.trim() || task.workItemCode?.trim() || task.workItemId || '任务',
    )
    for (const entry of task.assignments) {
      lines.push(
        `| ${title} | ${escapeMarkdownTableCell(formatResourceTypeCell(entry))} | ${escapeMarkdownTableCell(
          entry.name,
        )} | ${entry.quantity ?? '—'} | ${escapeMarkdownTableCell(entry.unit?.trim() || '—')} |`,
      )
    }
  }

  return lines.join('\n')
}

/**
 * Replace resourcePlan JSON (fenced or raw) with a readable markdown table for chat UI.
 * Original message text is unchanged — apply/parse still uses the stored JSON.
 */
export function presentPmResourcePlanMarkdownForDisplay(text: string): string {
  let replacedFence = false
  const withFences = text.replace(
    /```(?:json)?\s*([\s\S]*?)```/gi,
    (full, body: string) => {
      try {
        const parsed = JSON.parse(body.trim()) as unknown
        let resourcePlan: PmResourceTaskPlanSuggestion[] = []
        if (Array.isArray(parsed)) {
          resourcePlan = parseResourcePlanArray(parsed)
        } else if (parsed && typeof parsed === 'object') {
          const root = parsed as Record<string, unknown>
          // Prefer explicit resourcePlan keys; do not treat bare WBS / cost as resources.
          if ('costPlan' in root || 'costAssignments' in root) {
            return full
          }
          if (!('resourcePlan' in root || 'resourceAssignments' in root || 'assignments' in root)) {
            return full
          }
          if ('wbs' in root || 'projectPlan' in root) {
            return full
          }
          resourcePlan = parseResourcePlanArray(
            root.resourcePlan ?? root.resourceAssignments ?? root.assignments,
          )
        }
        if (resourcePlan.length === 0) return full
        replacedFence = true
        return formatPmResourcePlanAsMarkdownTable({ resourcePlan })
      } catch {
        return full
      }
    },
  )
  if (replacedFence) {
    return withFences.replace(/JSON\s*数据结构\s*[（(]供系统确认[）)]\s*[:：]?\s*/gi, '')
  }

  // Pure costPlan messages must not be rewritten as resource tables.
  if (/"costPlan"\s*:/.test(text) && !/"resourcePlan"\s*:/.test(text)) {
    return text
  }

  const plan = parsePmResourcePlanFromText(text)
  if (plan.resourcePlan.length === 0) return text

  const snippet = extractJsonObjectSnippet(text) ?? extractJsonArraySnippet(text)
  if (snippet) {
    const table = formatPmResourcePlanAsMarkdownTable(plan)
    const withoutLabel = text.replace(
      /JSON\s*数据结构\s*[（(]供系统确认[）)]\s*[:：]?\s*/gi,
      '',
    )
    const idx = withoutLabel.indexOf(snippet)
    if (idx >= 0) {
      return `${withoutLabel.slice(0, idx).trimEnd()}\n\n${table}\n\n${withoutLabel
        .slice(idx + snippet.length)
        .trimStart()}`.trim()
    }
  }

  const trimmed = text.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return text
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const root = parsed as Record<string, unknown>
      if ('wbs' in root || 'projectPlan' in root) return text
      if ('costPlan' in root || 'costAssignments' in root) return text
    }
  } catch {
    return text
  }
  return formatPmResourcePlanAsMarkdownTable(plan)
}

export function normalizeResourceAssignmentSuggestion(
  entry: PmResourceAssignmentSuggestion,
): PmTaskResourceAssignment {
  const type =
    entry.type ??
    (entry.typeLabel ? resolvePmAgentResourceTypeLabel(entry.typeLabel) : null) ??
    null
  return {
    resourceId: null,
    type,
    name: entry.name.trim(),
    quantity: entry.quantity ?? null,
    note: entry.note?.trim() ?? '',
  }
}

/** Prompt fragment: how the plan agent should emit resource quantities. */
export const PM_RESOURCE_PLAN_OUTPUT_HINT = [
  '## 资源计划输出（写入甘特「资源分配」）',
  '仅在进度计划已完善、甘特中已有任务时再输出资源分配；不要与进度 WBS / 成本计划写在同一条消息里。',
  '1. **先**输出 Markdown 资源表（给人阅读），列固定为：',
  '   | 任务名称 | 类型 | 资源名称 | 数量 | 单位 |',
  '2. **再**附加如下 JSON（可用 ```json 代码块），供系统确认写入；聊天界面会隐藏该 JSON 并展示为表格：',
  '{',
  '  "resourcePlan": [',
  '    {',
  '      "workItemId": "优先填写下方任务列表中的任务 id（uuid）",',
  '      "workItemTitle": "无法确定 id 时，填写与甘特任务名称一致的叶子任务作为兜底",',
  '      "assignments": [',
  '        { "type": "labor", "name": "普通工", "quantity": 20, "unit": "工日" }',
  '      ]',
  '    }',
  '  ]',
  '}',
  'type 可用：labor/auxiliary/material/equipment/device/instrument/funds/custom/management/fees/comprehensive/measures/other/tax/investment/designEstimate/constructionBudget/costBudget（或中文：人力/辅材/材料/机械/设备/仪器/资金/自定义/管理费/规费/综合单价/措施费/其他费/税金/投资估算/设计概算/施工预算/成本预算）。',
  '名称尽量使用资源列表中的现有名称；若需新增，仍输出该名称，系统确认后会写入「全部项目」资源列表。',
  '同一任务再次应用时按资源名称合并数量，不会无故清空其他资源。',
].join('\n')

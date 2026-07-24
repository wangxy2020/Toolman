import { z } from 'zod'

import {
  PmAgentResourceTypeSchema,
  PM_AGENT_RESOURCE_TYPE_LABELS,
  resolvePmAgentResourceTypeLabel,
} from './pm-resource-apply.js'

export const PmCostAssignmentSuggestionSchema = z.object({
  type: PmAgentResourceTypeSchema.optional(),
  /** Chinese or English type label; resolved when `type` omitted. */
  typeLabel: z.string().optional(),
  name: z.string().min(1),
  amount: z.number().finite().optional(),
  quantity: z.number().finite().optional(),
  unit: z.string().optional(),
  unitPrice: z.number().finite().optional(),
  note: z.string().optional(),
})

export type PmCostAssignmentSuggestion = z.infer<typeof PmCostAssignmentSuggestionSchema>

export const PmCostTaskPlanSuggestionSchema = z
  .object({
    workItemId: z.string().uuid().optional(),
    workItemCode: z.string().optional(),
    workItemTitle: z.string().min(1).optional(),
    assignments: z.array(PmCostAssignmentSuggestionSchema).min(1),
  })
  .refine((value) => value.workItemId != null || value.workItemTitle != null, {
    message: 'workItemId or workItemTitle is required',
  })

export type PmCostTaskPlanSuggestion = z.infer<typeof PmCostTaskPlanSuggestionSchema>

export const PmApplyCostPlanInputSchema = z.object({
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  suggestions: z.array(PmCostTaskPlanSuggestionSchema).min(1),
})

export type PmApplyCostPlanInput = z.infer<typeof PmApplyCostPlanInputSchema>

export const TASK_COST_ASSIGNMENTS_KEY = 'costAssignments'

export type PmTaskCostAssignment = {
  costId: string | null
  type: string | null
  name: string
  amount: number | null
  note: string
}

export const EMPTY_TASK_COST_ASSIGNMENT: PmTaskCostAssignment = {
  costId: null,
  type: null,
  name: '',
  amount: null,
  note: '',
}

export function isEmptyTaskCostAssignment(assignment: PmTaskCostAssignment): boolean {
  return (
    assignment.costId == null &&
    assignment.type == null &&
    !assignment.name.trim() &&
    assignment.amount == null
  )
}

function parseAssignmentRow(raw: unknown): PmTaskCostAssignment {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...EMPTY_TASK_COST_ASSIGNMENT }
  }
  const row = raw as Record<string, unknown>
  const amount = typeof row.amount === 'number' && Number.isFinite(row.amount) ? row.amount : null
  const type =
    typeof row.type === 'string'
      ? resolvePmAgentResourceTypeLabel(row.type) ?? row.type
      : null
  return {
    costId: typeof row.costId === 'string' && row.costId ? row.costId : null,
    type,
    name: typeof row.name === 'string' ? row.name : '',
    amount,
    note: typeof row.note === 'string' ? row.note : '',
  }
}

export function readTaskCostAssignmentsFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): PmTaskCostAssignment[] {
  const list = metadata?.[TASK_COST_ASSIGNMENTS_KEY]
  if (Array.isArray(list)) {
    return list.map((entry) => parseAssignmentRow(entry))
  }
  return []
}

export function replaceTaskCostAssignmentsMetadata(
  metadata: Record<string, unknown> | null | undefined,
  assignments: readonly PmTaskCostAssignment[],
): Record<string, unknown> {
  const list = assignments.filter((entry) => !isEmptyTaskCostAssignment(entry))
  const base = { ...(metadata ?? {}) }
  if (list.length === 0) {
    base[TASK_COST_ASSIGNMENTS_KEY] = null
  } else {
    base[TASK_COST_ASSIGNMENTS_KEY] = list.map((entry) => ({ ...entry }))
  }
  return base
}

/** Merge incoming into existing by cost item name (and type when both set). */
export function mergeTaskCostAssignmentsByName(
  existing: readonly PmTaskCostAssignment[],
  incoming: readonly PmTaskCostAssignment[],
): PmTaskCostAssignment[] {
  const next = existing
    .filter((entry) => !isEmptyTaskCostAssignment(entry))
    .map((entry) => ({ ...entry }))

  for (const row of incoming) {
    if (isEmptyTaskCostAssignment(row)) continue
    const name = row.name.trim()
    const index = next.findIndex((entry) => {
      if (entry.name.trim() !== name) return false
      if (row.type != null && entry.type != null) return entry.type === row.type
      return true
    })
    if (index >= 0) {
      const prev = next[index]!
      next[index] = {
        costId: row.costId ?? prev.costId,
        type: row.type ?? prev.type,
        name: row.name.trim() || prev.name,
        amount: row.amount !== undefined ? row.amount : prev.amount,
        note: row.note.trim() ? row.note : prev.note,
      }
    } else {
      next.push({ ...row, name })
    }
  }
  return next
}

/** Resolves the assignment `amount`, falling back to `quantity * unitPrice`. */
export function normalizeCostAssignmentSuggestion(
  entry: PmCostAssignmentSuggestion,
): PmTaskCostAssignment {
  const type =
    entry.type ??
    (entry.typeLabel ? resolvePmAgentResourceTypeLabel(entry.typeLabel) : null) ??
    null
  const amount =
    entry.amount ??
    (entry.quantity != null && entry.unitPrice != null ? entry.quantity * entry.unitPrice : null)
  return {
    costId: null,
    type,
    name: entry.name.trim(),
    amount,
    note: entry.note?.trim() ?? '',
  }
}

export type PmParsedCostPlanFromText = {
  costPlan: PmCostTaskPlanSuggestion[]
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
    name: row.name ?? row.costName,
    amount: row.amount ?? row.total,
    quantity: row.quantity ?? row.qty,
    unit: row.unit,
    unitPrice: row.unitPrice ?? row.price,
    note: row.note,
  }
}

function normalizeTaskSuggestion(entry: unknown): unknown {
  if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) return entry
  const row = entry as Record<string, unknown>
  const assignmentsRaw = row.assignments ?? row.costs ?? row.items
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

function parseCostPlanArray(parsed: unknown): PmCostTaskPlanSuggestion[] {
  if (!Array.isArray(parsed)) return []
  const suggestions: PmCostTaskPlanSuggestion[] = []
  for (const entry of parsed) {
    const result = PmCostTaskPlanSuggestionSchema.safeParse(normalizeTaskSuggestion(entry))
    if (result.success) suggestions.push(result.data)
  }
  return suggestions
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
  // Embedded prose + JSON (e.g.「JSON 数据结构（供系统确认）：{ ... }」)
  push(extractJsonObjectSnippet(text))
  push(extractJsonArraySnippet(text))
  return payloads
}

function rootLooksLikeResourcePlanOnly(root: Record<string, unknown>): boolean {
  return (
    ('resourcePlan' in root || 'resourceAssignments' in root) &&
    !('costPlan' in root || 'costAssignments' in root)
  )
}

/**
 * Parse assistant text for a cost plan. Accepts:
 * - `{ "costPlan": [ ... ] }`
 * - `{ "costAssignments": [ ... ] }` (task-level list)
 * - bare `[ ... ]` of task suggestions
 */
export function parsePmCostPlanFromText(text: string): PmParsedCostPlanFromText {
  // Do not steal pure resourcePlan payloads.
  if (
    /"resourcePlan"\s*:/.test(text) &&
    !/"costPlan"\s*:/.test(text) &&
    !/"costAssignments"\s*:/.test(text)
  ) {
    return { costPlan: [] }
  }

  for (const payload of extractJsonPayloads(text)) {
    try {
      const parsed = JSON.parse(payload) as unknown
      if (Array.isArray(parsed)) {
        const costPlan = parseCostPlanArray(parsed)
        if (costPlan.length > 0) return { costPlan }
        continue
      }
      if (parsed && typeof parsed === 'object') {
        const root = parsed as Record<string, unknown>
        if (rootLooksLikeResourcePlanOnly(root)) continue
        const costPlan = parseCostPlanArray(root.costPlan ?? root.costAssignments)
        if (costPlan.length > 0) return { costPlan }
      }
    } catch {
      // try next payload
    }
  }
  return { costPlan: [] }
}

export function buildPmCostPlanFingerprint(
  suggestions: readonly PmCostTaskPlanSuggestion[],
): string {
  return JSON.stringify(
    suggestions.map((task) => ({
      workItemId: task.workItemId ?? null,
      workItemCode: task.workItemCode?.trim() ?? null,
      workItemTitle: task.workItemTitle?.trim() ?? null,
      assignments: task.assignments.map((entry) => ({
        type: entry.type ?? resolvePmAgentResourceTypeLabel(entry.typeLabel ?? '') ?? null,
        name: entry.name.trim(),
        amount: entry.amount ?? null,
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

function formatCostTypeCell(entry: PmCostAssignmentSuggestion): string {
  if (entry.type) {
    const resolved = resolvePmAgentResourceTypeLabel(entry.type) ?? entry.type
    return (
      (PM_AGENT_RESOURCE_TYPE_LABELS as Record<string, string>)[resolved] ??
      resolved
    )
  }
  const fromLabel = entry.typeLabel
    ? resolvePmAgentResourceTypeLabel(entry.typeLabel)
    : null
  if (fromLabel) return PM_AGENT_RESOURCE_TYPE_LABELS[fromLabel]
  return entry.typeLabel?.trim() || '—'
}

function formatAmountCell(entry: PmCostAssignmentSuggestion): string {
  if (entry.amount != null && Number.isFinite(entry.amount)) return String(entry.amount)
  if (entry.quantity != null && entry.unitPrice != null) {
    return String(entry.quantity * entry.unitPrice)
  }
  return '—'
}

/** Human-readable cost plan table for chat display. */
export function formatPmCostPlanAsMarkdownTable(plan: PmParsedCostPlanFromText): string {
  const { costPlan } = plan
  if (costPlan.length === 0) return ''

  const lines: string[] = [
    '### 成本计划',
    '',
    '| 任务名称 | 类型 | 费用名称 | 数量 | 单价 | 金额 | 单位 |',
    '| --- | :---: | --- | :---: | :---: | :---: | :---: |',
  ]

  for (const task of costPlan) {
    const title = escapeMarkdownTableCell(
      task.workItemTitle?.trim() || task.workItemCode?.trim() || task.workItemId || '任务',
    )
    for (const entry of task.assignments) {
      lines.push(
        `| ${title} | ${escapeMarkdownTableCell(formatCostTypeCell(entry))} | ${escapeMarkdownTableCell(
          entry.name,
        )} | ${entry.quantity ?? '—'} | ${entry.unitPrice ?? '—'} | ${formatAmountCell(entry)} | ${escapeMarkdownTableCell(
          entry.unit?.trim() || '—',
        )} |`,
      )
    }
  }

  return lines.join('\n')
}

const COST_JSON_CONFIRM_LABEL_RE = /JSON\s*数据结构\s*[（(]供系统确认[）)]\s*[:：]?\s*/gi

/**
 * Replace costPlan JSON (fenced, raw, or embedded after a confirm label) with a readable table.
 * Original message text is unchanged — apply/parse still uses the stored JSON.
 */
export function presentPmCostPlanMarkdownForDisplay(text: string): string {
  let replacedFence = false
  const withFences = text.replace(
    /```(?:json)?\s*([\s\S]*?)```/gi,
    (full, body: string) => {
      try {
        const parsed = JSON.parse(body.trim()) as unknown
        let costPlan: PmCostTaskPlanSuggestion[] = []
        if (Array.isArray(parsed)) {
          costPlan = parseCostPlanArray(parsed)
        } else if (parsed && typeof parsed === 'object') {
          const root = parsed as Record<string, unknown>
          if (rootLooksLikeResourcePlanOnly(root)) return full
          if (!('costPlan' in root || 'costAssignments' in root)) return full
          if ('wbs' in root || 'projectPlan' in root) return full
          costPlan = parseCostPlanArray(root.costPlan ?? root.costAssignments)
        }
        if (costPlan.length === 0) return full
        replacedFence = true
        return formatPmCostPlanAsMarkdownTable({ costPlan })
      } catch {
        return full
      }
    },
  )
  if (replacedFence) {
    return withFences.replace(COST_JSON_CONFIRM_LABEL_RE, '')
  }

  const plan = parsePmCostPlanFromText(text)
  if (plan.costPlan.length === 0) return text

  const snippet = extractJsonObjectSnippet(text) ?? extractJsonArraySnippet(text)
  if (!snippet) return text

  const table = formatPmCostPlanAsMarkdownTable(plan)
  const withoutLabel = text.replace(COST_JSON_CONFIRM_LABEL_RE, '')
  const idx = withoutLabel.indexOf(snippet)
  if (idx < 0) {
    // Fallback: whole-text JSON
    const trimmed = text.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return table
    return text
  }
  return `${withoutLabel.slice(0, idx).trimEnd()}\n\n${table}\n\n${withoutLabel
    .slice(idx + snippet.length)
    .trimStart()}`.trim()
}

/** Prompt fragment: how the plan agent should emit cost assignments. */
export const PM_COST_PLAN_OUTPUT_HINT = [
  '## 成本计划输出（写入甘特「成本分配」）',
  '仅在进度计划已完善、甘特中已有任务时再输出成本分配；不要与进度 WBS / 资源计划写在同一条消息里。',
  '1. **先**输出 Markdown 成本表（给人阅读），列固定为：',
  '   | 任务名称 | 类型 | 费用名称 | 数量 | 单价 | 金额 | 单位 |',
  '2. **再**附加如下 JSON（可用 ```json 代码块），供系统确认写入；聊天界面会隐藏该 JSON 并展示为表格：',
  '{',
  '  "costPlan": [',
  '    {',
  '      "workItemId": "优先填写下方任务列表中的任务 id（uuid）",',
  '      "workItemCode": "无法确定 id 时，可填写任务编号（WBS 编码等）",',
  '      "workItemTitle": "无法确定 id/编号时，填写与甘特任务名称一致的叶子任务作为兜底",',
  '      "assignments": [',
  '        { "type": "material", "name": "商品混凝土", "quantity": 30, "unitPrice": 420, "unit": "m³" }',
  '      ]',
  '    }',
  '  ]',
  '}',
  'amount 可直接给出，或省略由 quantity × unitPrice 计算。',
  'type 可用：labor/auxiliary/material/equipment/device/instrument/funds/custom/management/fees/comprehensive/measures/other/tax/investment/designEstimate/constructionBudget/costBudget（或中文：人力/辅材/材料/机械/设备/仪器/资金/自定义/管理费/规费/综合单价/措施费/其他费/税金/投资估算/设计概算/施工预算/成本预算）。',
  '名称尽量使用价格表中的现有名称；若需新增，仍输出该名称，系统确认后会写入「全部项目」价格表。',
  '同一任务再次应用时按名称合并金额，不会无故清空其他成本项。',
].join('\n')

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
  management: '管理',
  fees: '规费',
  comprehensive: '综合单价',
  measures: '措施费',
  tax: '税金',
  investment: '投资估算',
  designEstimate: '设计概算',
  constructionBudget: '施工预算',
  costBudget: '成本预算',
  funds: '资金',
  other: '其他',
}

export function resolvePmAgentResourceTypeLabel(label: string): PmAgentResourceType | null {
  const trimmed = label.trim()
  if (!trimmed) return null
  if ((PmAgentResourceTypeSchema.options as readonly string[]).includes(trimmed)) {
    return trimmed as PmAgentResourceType
  }
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

export const PmResourceTaskPlanSuggestionSchema = z.object({
  workItemTitle: z.string().min(1),
  assignments: z.array(PmResourceAssignmentSuggestionSchema).min(1),
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
  const fenced = extractJsonPayloads(text)
  for (const payload of fenced) {
    try {
      const parsed = JSON.parse(payload) as unknown
      if (Array.isArray(parsed)) {
        const resourcePlan = parseResourcePlanArray(parsed)
        if (resourcePlan.length > 0) return { resourcePlan }
        continue
      }
      if (parsed && typeof parsed === 'object') {
        const root = parsed as Record<string, unknown>
        const resourcePlan = parseResourcePlanArray(
          root.resourcePlan ?? root.resourceAssignments ?? root.assignments,
        )
        if (resourcePlan.length > 0) return { resourcePlan }
      }
    } catch {
      // try next fence
    }
  }
  return { resourcePlan: [] }
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

export function buildPmResourcePlanFingerprint(
  suggestions: readonly PmResourceTaskPlanSuggestion[],
): string {
  return JSON.stringify(
    suggestions.map((task) => ({
      workItemTitle: task.workItemTitle.trim(),
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
  '在给出任务资源用量时，除可读说明外，请附加如下 JSON（可用 ```json 代码块）：',
  '{',
  '  "resourcePlan": [',
  '    {',
  '      "workItemTitle": "与甘特任务名称一致的叶子任务",',
  '      "assignments": [',
  '        { "type": "labor", "name": "普通工", "quantity": 20, "unit": "工日" }',
  '      ]',
  '    }',
  '  ]',
  '}',
  'type 可用：labor/auxiliary/material/equipment/device/instrument/management/fees/comprehensive/measures/tax/investment/designEstimate/constructionBudget/costBudget/funds/other（或中文：人力/辅材/材料/机械/设备/仪器/管理/规费/综合单价/措施费/税金/投资估算/设计概算/施工预算/成本预算/资金/其他）。',
  '名称尽量使用资源列表中的现有名称；若需新增，仍输出该名称，系统确认后会写入「全部项目」资源列表。',
  '同一任务再次应用时按资源名称合并数量，不会无故清空其他资源。',
].join('\n')

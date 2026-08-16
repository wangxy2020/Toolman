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

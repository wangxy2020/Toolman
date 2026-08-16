import { z } from 'zod'

import {
  PmAgentResourceTypeSchema,
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

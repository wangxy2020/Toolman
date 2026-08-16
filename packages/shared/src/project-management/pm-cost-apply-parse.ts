import {
  PmCostTaskPlanSuggestionSchema,
  type PmCostTaskPlanSuggestion,
} from './pm-cost-apply-schema.js'
import { resolvePmAgentResourceTypeLabel } from './pm-resource-apply.js'

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

export function parseCostPlanArray(parsed: unknown): PmCostTaskPlanSuggestion[] {
  if (!Array.isArray(parsed)) return []
  const suggestions: PmCostTaskPlanSuggestion[] = []
  for (const entry of parsed) {
    const result = PmCostTaskPlanSuggestionSchema.safeParse(normalizeTaskSuggestion(entry))
    if (result.success) suggestions.push(result.data)
  }
  return suggestions
}

export function extractJsonObjectSnippet(text: string): string | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  return text.slice(start, end + 1)
}

export function extractJsonArraySnippet(text: string): string | null {
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

export function rootLooksLikeResourcePlanOnly(root: Record<string, unknown>): boolean {
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

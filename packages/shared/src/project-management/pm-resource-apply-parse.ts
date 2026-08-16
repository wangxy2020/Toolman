import {
  PmResourceTaskPlanSuggestionSchema,
  resolvePmAgentResourceTypeLabel,
  type PmResourceTaskPlanSuggestion,
} from './pm-resource-apply-schema.js'

export type PmParsedResourcePlanFromText = {
  resourcePlan: PmResourceTaskPlanSuggestion[]
}

export function parseResourcePlanArray(parsed: unknown): PmResourceTaskPlanSuggestion[] {
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

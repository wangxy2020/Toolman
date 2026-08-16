/** Format / parse resource assignment input strings. */

import {
  canonicalizeResourceName,
  isPmResourceType,
  type PmResourceRow,
  type PmResourceType,
} from '../resource/pm-resource-catalog'
import {
  EMPTY_TASK_RESOURCE_ASSIGNMENT,
  isEmptyAssignment,
  type TaskResourceAssignment,
} from './pm-gantt-resource-assignment-types'

/** Display one assignment as `类型，名称，数量` (empty → blank). */
export function formatResourceAssignmentInput(
  assignment: TaskResourceAssignment,
  typeLabel: (type: PmResourceType) => string,
  options?: {
    resolveCustomTypeName?: (assignment: TaskResourceAssignment) => string
  },
): string {
  if (isEmptyAssignment(assignment)) return ''
  let typePart = ''
  if (assignment.type === 'custom') {
    typePart =
      options?.resolveCustomTypeName?.(assignment)?.trim() || typeLabel('custom')
  } else if (assignment.type) {
    typePart = typeLabel(assignment.type)
  }
  const namePart = assignment.name.trim()
  const qtyPart = assignment.quantity != null ? String(assignment.quantity) : ''
  return [typePart, namePart, qtyPart].join('，')
}

/**
 * Join multiple assignments with `；` — semicolon after each quantity except the last.
 * Example: `人力，普通工，3；材料，水泥，2`
 */
export function formatResourceAssignmentsInput(
  assignments: readonly TaskResourceAssignment[],
  typeLabel: (type: PmResourceType) => string,
  options?: {
    resolveCustomTypeName?: (assignment: TaskResourceAssignment) => string
  },
): string {
  return assignments
    .map((entry) => formatResourceAssignmentInput(entry, typeLabel, options))
    .filter((part) => part.length > 0)
    .join('；')
}

/**
 * Parse one `类型，名称，数量` group (also accepts ASCII commas).
 * Resolves catalog rows by name (+ optional type) when possible.
 */
export function parseResourceAssignmentInput(
  raw: string,
  catalog: readonly PmResourceRow[],
  resolveTypeLabel: (label: string) => PmResourceType | null,
): TaskResourceAssignment {
  const trimmed = raw.trim()
  if (!trimmed) return { ...EMPTY_TASK_RESOURCE_ASSIGNMENT }

  const parts = trimmed.split(/[,，]/u).map((part) => part.trim())
  let type: PmResourceType | null = null
  let name = ''
  let quantity: number | null = null

  if (parts.length === 1) {
    const only = parts[0] ?? ''
    type = resolveTypeLabel(only) ?? (isPmResourceType(only) ? only : null)
    if (!type) {
      const byCustomName = catalog.find(
        (row) =>
          row.type === 'custom' &&
          (row.customTypeName?.trim() ?? '') === only,
      )
      if (byCustomName) type = 'custom'
      else name = only
    }
  } else {
    const typeRaw = parts[0] ?? ''
    name = parts[1] ?? ''
    const qtyRaw = parts[2] ?? ''
    type = resolveTypeLabel(typeRaw) ?? (isPmResourceType(typeRaw) ? typeRaw : null)
    if (!type) {
      const byCustomName = catalog.find(
        (row) =>
          row.type === 'custom' &&
          (row.customTypeName?.trim() ?? '') === typeRaw,
      )
      if (byCustomName) type = 'custom'
    }
    if (qtyRaw !== '') {
      const parsed = Number(qtyRaw)
      quantity = Number.isFinite(parsed) ? parsed : null
    }
  }

  if (name) {
    const canon = canonicalizeResourceName(name)
    const matched =
      catalog.find(
        (row) =>
          canonicalizeResourceName(row.name) === canon && (type == null || row.type === type),
      ) ?? catalog.find((row) => canonicalizeResourceName(row.name) === canon)
    if (matched) {
      return {
        resourceId: matched.id,
        type: matched.type,
        name: matched.name,
        quantity,
        note: '',
      }
    }
    name = canon
  }

  return {
    resourceId: null,
    type,
    name,
    quantity,
    note: '',
  }
}

/**
 * Parse `类型，名称，数量；类型，名称，数量` (groups split on `;` / `；`).
 * Trailing semicolon is ignored; empty groups are skipped.
 * Optional `previous` notes are preserved when type+name still match.
 */
export function parseResourceAssignmentsInput(
  raw: string,
  catalog: readonly PmResourceRow[],
  resolveTypeLabel: (label: string) => PmResourceType | null,
  previous: readonly TaskResourceAssignment[] = [],
): TaskResourceAssignment[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  return trimmed
    .split(/[;；]/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part, index) => {
      const parsed = parseResourceAssignmentInput(part, catalog, resolveTypeLabel)
      const matchedPrev =
        previous.find(
          (entry) =>
            entry.name.trim() === parsed.name.trim() &&
            (parsed.type == null || entry.type === parsed.type),
        ) ?? previous[index]
      if (!matchedPrev?.note) return parsed
      return { ...parsed, note: matchedPrev.note }
    })
    .filter((entry) => !isEmptyAssignment(entry))
}

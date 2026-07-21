/** Task ↔ resource-catalog assignment(s) stored on `PmWorkItem.metadata`. */

import {
  canonicalizeResourceName,
  isPmResourceType,
  type PmResourceRow,
  type PmResourceType,
} from '../resource/pm-resource-catalog'

/** Legacy single-assignment key (migrated into the array). */
export const TASK_RESOURCE_ASSIGNMENT_KEY = 'resourceAssignment'
/** Multi-slot assignments aligned with resource-view column groups. */
export const TASK_RESOURCE_ASSIGNMENTS_KEY = 'resourceAssignments'

export type TaskResourceAssignment = {
  /** Linked catalog row id when assigned from the project resource list. */
  resourceId: string | null
  type: PmResourceType | null
  name: string
  quantity: number | null
  /** Free-text note shown in the resource-assignment popup. */
  note: string
}

export type ResourceColumnField = 'type' | 'name' | 'qty' | 'input'

export const EMPTY_TASK_RESOURCE_ASSIGNMENT: TaskResourceAssignment = {
  resourceId: null,
  type: null,
  name: '',
  quantity: null,
  note: '',
}

const RESOURCE_COLUMN_RE = /^resource:(\d+):(type|name|qty|input)$/

export function makeResourceColumnId(slot: number, field: ResourceColumnField): string {
  return `resource:${Math.max(0, Math.floor(slot))}:${field}`
}

export function parseResourceColumnId(
  id: string,
): { slot: number; field: ResourceColumnField } | null {
  const match = RESOURCE_COLUMN_RE.exec(id)
  if (!match) return null
  const slot = Number(match[1])
  const field = match[2] as ResourceColumnField
  if (!Number.isFinite(slot) || slot < 0) return null
  return { slot, field }
}

export function isResourceColumnId(id: string): boolean {
  return parseResourceColumnId(id) != null
}

export function isEmptyAssignment(assignment: TaskResourceAssignment): boolean {
  return (
    assignment.resourceId == null &&
    assignment.type == null &&
    !assignment.name.trim() &&
    assignment.quantity == null
  )
}

/** Column display order: 人力 → 辅材 → 材料 → 机械, then remaining types. */
export const RESOURCE_COLUMN_TYPE_ORDER: readonly PmResourceType[] = [
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
] as const

function resourceTypeRank(type: PmResourceType): number {
  const index = RESOURCE_COLUMN_TYPE_ORDER.indexOf(type)
  return index >= 0 ? index : RESOURCE_COLUMN_TYPE_ORDER.length
}

export function resourceMatchKey(
  type: PmResourceType | null | undefined,
  name: string,
): string {
  return `${type ?? ''}\0${name.trim()}`
}

/**
 * Order「全部项目」resources for Gantt resource columns:
 * labor → auxiliary → material → equipment (then other types), then by name.
 */
export function orderResourcesForGanttColumns(
  catalog: readonly PmResourceRow[],
): PmResourceRow[] {
  return catalog
    .filter((row) => row.name.trim().length > 0)
    .slice()
    .sort((left, right) => {
      const typeDelta = resourceTypeRank(left.type) - resourceTypeRank(right.type)
      if (typeDelta !== 0) return typeDelta
      return left.name.localeCompare(right.name, 'zh')
    })
}

export function findAssignmentIndexForResource(
  assignments: readonly TaskResourceAssignment[],
  resource: PmResourceRow,
): number {
  const byId = assignments.findIndex(
    (entry) => entry.resourceId != null && entry.resourceId === resource.id,
  )
  if (byId >= 0) return byId
  const key = resourceMatchKey(resource.type, resource.name)
  const byTypeName = assignments.findIndex(
    (entry) => resourceMatchKey(entry.type, entry.name) === key,
  )
  if (byTypeName >= 0) return byTypeName
  // Catalog reclassification (e.g. material→auxiliary) leaves stale stored types.
  const name = canonicalizeResourceName(resource.name)
  if (!name) return -1
  return assignments.findIndex(
    (entry) => canonicalizeResourceName(entry.name) === name,
  )
}

export function assignmentForResourceColumn(
  assignments: readonly TaskResourceAssignment[],
  resource: PmResourceRow | null | undefined,
): TaskResourceAssignment {
  if (!resource) return { ...EMPTY_TASK_RESOURCE_ASSIGNMENT }
  const index = findAssignmentIndexForResource(assignments, resource)
  return index >= 0
    ? { ...assignments[index]! }
    : { ...EMPTY_TASK_RESOURCE_ASSIGNMENT }
}

/** Set / clear quantity for a catalog resource column (match by id or type+name). */
export function upsertResourceColumnQuantity(
  assignments: readonly TaskResourceAssignment[],
  resource: PmResourceRow,
  quantity: number | null,
): TaskResourceAssignment[] {
  const list = assignments.map((entry) => ({ ...entry }))
  const index = findAssignmentIndexForResource(list, resource)
  if (quantity == null) {
    if (index < 0) return list
    list.splice(index, 1)
    return list
  }
  if (index >= 0) {
    list[index] = {
      ...list[index]!,
      resourceId: resource.id,
      type: resource.type,
      name: resource.name,
      quantity,
    }
    return list
  }
  list.push({
    resourceId: resource.id,
    type: resource.type,
    name: resource.name,
    quantity,
    note: '',
  })
  return list
}

function parseAssignment(raw: unknown): TaskResourceAssignment {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...EMPTY_TASK_RESOURCE_ASSIGNMENT }
  }
  const row = raw as Record<string, unknown>
  const quantity =
    typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : null
  return {
    resourceId: typeof row.resourceId === 'string' && row.resourceId ? row.resourceId : null,
    type: isPmResourceType(row.type) ? row.type : null,
    name: canonicalizeResourceName(typeof row.name === 'string' ? row.name : ''),
    quantity,
    note: typeof row.note === 'string' ? row.note : '',
  }
}

/** Read all slots (migrates legacy single `resourceAssignment`). */
export function readTaskResourceAssignments(
  metadata: Record<string, unknown> | null | undefined,
): TaskResourceAssignment[] {
  const list = metadata?.[TASK_RESOURCE_ASSIGNMENTS_KEY]
  if (Array.isArray(list)) {
    return list.map((entry) => parseAssignment(entry))
  }
  const legacy = metadata?.[TASK_RESOURCE_ASSIGNMENT_KEY]
  if (legacy != null) {
    return [parseAssignment(legacy)]
  }
  return []
}

export function readTaskResourceAssignmentAt(
  metadata: Record<string, unknown> | null | undefined,
  slot: number,
): TaskResourceAssignment {
  const list = readTaskResourceAssignments(metadata)
  return list[slot] ? { ...list[slot]! } : { ...EMPTY_TASK_RESOURCE_ASSIGNMENT }
}

/** @deprecated Prefer slot-aware helpers. */
export function readTaskResourceAssignment(
  metadata: Record<string, unknown> | null | undefined,
): TaskResourceAssignment {
  return readTaskResourceAssignmentAt(metadata, 0)
}

/**
 * Patch one slot. Writes `resourceAssignments` array and clears legacy key via `null`
 * so shallow metadata merges on the server actually drop the old single object.
 */
export function patchTaskResourceAssignmentMetadata(
  metadata: Record<string, unknown> | null | undefined,
  patch: Partial<TaskResourceAssignment>,
  slot = 0,
): Record<string, unknown> {
  const index = Math.max(0, Math.floor(slot))
  const currentList = readTaskResourceAssignments(metadata)
  const current = currentList[index] ?? { ...EMPTY_TASK_RESOURCE_ASSIGNMENT }
  const next: TaskResourceAssignment = {
    resourceId: patch.resourceId !== undefined ? patch.resourceId : current.resourceId,
    type: patch.type !== undefined ? patch.type : current.type,
    name: patch.name !== undefined ? patch.name : current.name,
    quantity: patch.quantity !== undefined ? patch.quantity : current.quantity,
    note: patch.note !== undefined ? patch.note : current.note,
  }

  const list: Array<TaskResourceAssignment | null> = []
  const maxIndex = Math.max(currentList.length - 1, index)
  for (let i = 0; i <= maxIndex; i += 1) {
    if (i === index) {
      list[i] = isEmptyAssignment(next) ? null : next
    } else {
      const entry = currentList[i]
      list[i] = entry && !isEmptyAssignment(entry) ? entry : null
    }
  }

  // Trim trailing nulls
  while (list.length > 0 && list[list.length - 1] == null) {
    list.pop()
  }

  const base = { ...(metadata ?? {}) }
  // Force-clear legacy key under shallow merge.
  base[TASK_RESOURCE_ASSIGNMENT_KEY] = null
  if (list.length === 0) {
    base[TASK_RESOURCE_ASSIGNMENTS_KEY] = null
  } else {
    base[TASK_RESOURCE_ASSIGNMENTS_KEY] = list.map((entry) =>
      entry ? entry : { ...EMPTY_TASK_RESOURCE_ASSIGNMENT },
    )
  }
  return base
}

/** Replace the full assignment list (used by input-mode combined column). */
export function replaceTaskResourceAssignmentsMetadata(
  metadata: Record<string, unknown> | null | undefined,
  assignments: readonly TaskResourceAssignment[],
): Record<string, unknown> {
  const list = assignments.filter((entry) => !isEmptyAssignment(entry))
  const base = { ...(metadata ?? {}) }
  base[TASK_RESOURCE_ASSIGNMENT_KEY] = null
  if (list.length === 0) {
    base[TASK_RESOURCE_ASSIGNMENTS_KEY] = null
  } else {
    base[TASK_RESOURCE_ASSIGNMENTS_KEY] = list.map((entry) => ({ ...entry }))
  }
  return base
}

/**
 * Match an assignment to a catalog row (id → type+name → name-only).
 * Returns null when nothing in the catalog matches.
 */
export function findCatalogRowForAssignment(
  assignment: TaskResourceAssignment,
  catalog: readonly PmResourceRow[],
): PmResourceRow | null {
  if (assignment.resourceId) {
    const found = catalog.find((row) => row.id === assignment.resourceId)
    if (found) return found
  }
  const name = canonicalizeResourceName(assignment.name)
  if (!name) return null
  const typedMatch = catalog.find(
    (row) =>
      canonicalizeResourceName(row.name) === name &&
      (assignment.type == null || row.type === assignment.type),
  )
  if (typedMatch) return typedMatch
  // Fall back to name-only so stale/wrong stored types still resolve after catalog reclass.
  return catalog.find((row) => canonicalizeResourceName(row.name) === name) ?? null
}

/** Resolve display fields against the live catalog (prefer catalog name/type by id). */
export function resolveAssignmentAgainstCatalog(
  assignment: TaskResourceAssignment,
  catalog: readonly PmResourceRow[],
): TaskResourceAssignment {
  const found = findCatalogRowForAssignment(assignment, catalog)
  if (found) {
    return {
      resourceId: found.id,
      type: found.type,
      name: found.name,
      quantity: assignment.quantity,
      note: assignment.note,
    }
  }

  // Identity not in the assignable catalog → drop ghost names (e.g. shared defaults).
  if (assignment.resourceId || assignment.name.trim()) {
    return {
      ...EMPTY_TASK_RESOURCE_ASSIGNMENT,
      quantity: assignment.quantity,
      note: typeof assignment.note === 'string' ? assignment.note : '',
    }
  }

  return assignment
}

/**
 * Rewrite stored assignment type/name/id to match the live resource list.
 * Unlike display resolve, unmatched (ghost) rows are left unchanged so hydrate
 * does not wipe free-text entries.
 */
export function hydrateTaskResourceAssignmentsAgainstCatalog(
  assignments: readonly TaskResourceAssignment[],
  catalog: readonly PmResourceRow[],
): { assignments: TaskResourceAssignment[]; changed: boolean } {
  let changed = false
  const next = assignments.map((assignment) => {
    if (isEmptyAssignment(assignment)) return assignment
    const found = findCatalogRowForAssignment(assignment, catalog)
    if (!found) return assignment
    if (
      assignment.resourceId === found.id &&
      assignment.type === found.type &&
      canonicalizeResourceName(assignment.name) === canonicalizeResourceName(found.name)
    ) {
      return assignment
    }
    changed = true
    return {
      resourceId: found.id,
      type: found.type,
      name: found.name,
      quantity: assignment.quantity,
      note: assignment.note,
    }
  })
  return { assignments: changed ? next : [...assignments], changed }
}

/** True when assignment identity (id or name) exists in the catalog. */
export function isAssignmentInCatalog(
  assignment: TaskResourceAssignment,
  catalog: readonly PmResourceRow[],
): boolean {
  if (isEmptyAssignment(assignment)) return false
  if (assignment.resourceId && catalog.some((row) => row.id === assignment.resourceId)) {
    return true
  }
  const name = canonicalizeResourceName(assignment.name)
  if (!name) return false
  return (
    catalog.some(
      (row) =>
        canonicalizeResourceName(row.name) === name &&
        (assignment.type == null || row.type === assignment.type),
    ) || catalog.some((row) => canonicalizeResourceName(row.name) === name)
  )
}

/** Options for a type picker — keep resource-list order, only filter by type. */
export function catalogRowsForType(
  catalog: readonly PmResourceRow[],
  type: PmResourceType | null,
): PmResourceRow[] {
  const named = catalog.filter((row) => row.name.trim().length > 0)
  if (!type) return named
  return named.filter((row) => row.type === type)
}

/** True when the slot has a concrete catalog resource (name or id), not type-only draft. */
export function isAssignedResource(assignment: TaskResourceAssignment): boolean {
  return Boolean(assignment.resourceId || assignment.name.trim())
}

/**
 * Manually reorder assignments (popup up/down). Preserves relative order otherwise.
 * Indexes refer to the stored dense list (empty draft rows are not persisted).
 */
export function moveTaskResourceAssignment(
  assignments: readonly TaskResourceAssignment[],
  fromIndex: number,
  toIndex: number,
): TaskResourceAssignment[] {
  const list = assignments.map((entry) => ({ ...entry }))
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= list.length ||
    toIndex >= list.length ||
    fromIndex === toIndex
  ) {
    return list
  }
  const [entry] = list.splice(fromIndex, 1)
  if (!entry) return list
  list.splice(toIndex, 0, entry)
  return list
}

/**
 * Optional helper: order by labor → auxiliary → material → equipment, then name.
 * Not applied automatically — call only from explicit user actions if needed.
 */
export function orderAssignmentsByResourceCatalog(
  assignments: readonly TaskResourceAssignment[],
  catalog: readonly PmResourceRow[],
  maxSlots = Number.POSITIVE_INFINITY,
): TaskResourceAssignment[] {
  const ranked = assignments
    .map((entry) => resolveAssignmentAgainstCatalog(entry, catalog))
    .filter((entry) => isAssignedResource(entry))
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const typeDelta =
        resourceTypeRank(left.entry.type ?? 'other') -
        resourceTypeRank(right.entry.type ?? 'other')
      if (typeDelta !== 0) return typeDelta
      const nameDelta = left.entry.name
        .trim()
        .localeCompare(right.entry.name.trim(), 'zh')
      if (nameDelta !== 0) return nameDelta
      return left.index - right.index
    })
    .map(({ entry }) => ({ ...entry }))

  if (!Number.isFinite(maxSlots)) return ranked
  return ranked.slice(0, Math.max(0, Math.floor(maxSlots)))
}

export function catalogTypesInUse(catalog: readonly PmResourceRow[]): PmResourceType[] {
  const seen = new Set<PmResourceType>()
  const ordered: PmResourceType[] = []
  for (const row of catalog) {
    if (!row.name.trim() || seen.has(row.type)) continue
    seen.add(row.type)
    ordered.push(row.type)
  }
  return ordered
}

/** Display one assignment as `类型，名称，数量` (empty → blank). */
export function formatResourceAssignmentInput(
  assignment: TaskResourceAssignment,
  typeLabel: (type: PmResourceType) => string,
): string {
  if (isEmptyAssignment(assignment)) return ''
  const typePart = assignment.type ? typeLabel(assignment.type) : ''
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
): string {
  return assignments
    .map((entry) => formatResourceAssignmentInput(entry, typeLabel))
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
    if (!type) name = only
  } else {
    const typeRaw = parts[0] ?? ''
    name = parts[1] ?? ''
    const qtyRaw = parts[2] ?? ''
    type = resolveTypeLabel(typeRaw) ?? (isPmResourceType(typeRaw) ? typeRaw : null)
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

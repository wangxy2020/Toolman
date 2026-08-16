/** Task ↔ resource-catalog assignment types and column ids. */

import type { PmResourceType } from '../resource/pm-resource-catalog'

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
  'other',
  'tax',
  'investment',
  'designEstimate',
  'constructionBudget',
  'costBudget',
  'funds',
] as const

export function resourceTypeRank(type: PmResourceType): number {
  const index = RESOURCE_COLUMN_TYPE_ORDER.indexOf(type)
  return index >= 0 ? index : RESOURCE_COLUMN_TYPE_ORDER.length
}

export function resourceMatchKey(
  type: PmResourceType | null | undefined,
  name: string,
): string {
  return `${type ?? ''}\0${name.trim()}`
}

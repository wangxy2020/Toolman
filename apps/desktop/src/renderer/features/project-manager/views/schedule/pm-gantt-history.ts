import type { PmWorkItem, PmWorkItemRelation } from '@toolman/shared'

import { pmApi } from '../../pm-api'
import { pmScheduleApi } from './pm-schedule-api'

export type GanttHistorySnapshot = {
  items: PmWorkItem[]
  relations: PmWorkItemRelation[]
}

const MAX_HISTORY = 50

export function cloneGanttSnapshot(
  items: readonly PmWorkItem[],
  relations: readonly PmWorkItemRelation[],
): GanttHistorySnapshot {
  return {
    items: items.map((item) => ({ ...item, metadata: { ...item.metadata } })),
    relations: relations.map((relation) => ({ ...relation })),
  }
}

export class GanttHistoryStack {
  private undo: GanttHistorySnapshot[] = []
  private redo: GanttHistorySnapshot[] = []

  get canUndo(): boolean {
    return this.undo.length > 0
  }

  get canRedo(): boolean {
    return this.redo.length > 0
  }

  clear(): void {
    this.undo = []
    this.redo = []
  }

  pushBeforeChange(snapshot: GanttHistorySnapshot): void {
    this.undo.push(snapshot)
    if (this.undo.length > MAX_HISTORY) this.undo.shift()
    this.redo = []
  }

  popUndo(current: GanttHistorySnapshot): GanttHistorySnapshot | null {
    const previous = this.undo.pop()
    if (!previous) return null
    this.redo.push(current)
    if (this.redo.length > MAX_HISTORY) this.redo.shift()
    return previous
  }

  popRedo(current: GanttHistorySnapshot): GanttHistorySnapshot | null {
    const next = this.redo.pop()
    if (!next) return null
    this.undo.push(current)
    if (this.undo.length > MAX_HISTORY) this.undo.shift()
    return next
  }

  /** Drop the newest undo frame without moving it to redo (failed mutation). */
  discardLastUndo(): void {
    this.undo.pop()
  }

  /** Undo failed after pop — put target back on undo and drop the redo frame. */
  revertFailedUndo(target: GanttHistorySnapshot): void {
    this.redo.pop()
    this.undo.push(target)
    if (this.undo.length > MAX_HISTORY) this.undo.shift()
  }

  /** Redo failed after pop — put target back on redo and drop the undo frame. */
  revertFailedRedo(target: GanttHistorySnapshot): void {
    this.undo.pop()
    this.redo.push(target)
    if (this.redo.length > MAX_HISTORY) this.redo.shift()
  }
}

function itemSignature(item: PmWorkItem): string {
  return JSON.stringify({
    parentId: item.parentId ?? null,
    type: item.type,
    title: item.title,
    status: item.status,
    priority: item.priority,
    domain: item.domain,
    assignee: item.assignee ?? null,
    description: item.description ?? null,
    startDate: item.startDate ?? null,
    dueDate: item.dueDate ?? null,
    progressPercent: item.progressPercent,
    sortOrder: item.sortOrder,
    metadata: item.metadata,
  })
}

function relationKey(relation: Pick<PmWorkItemRelation, 'fromWorkItemId' | 'toWorkItemId' | 'type' | 'lagDays'>): string {
  return `${relation.fromWorkItemId}|${relation.toWorkItemId}|${relation.type}|${relation.lagDays}`
}

function sortForCreate(items: PmWorkItem[]): PmWorkItem[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const ordered: PmWorkItem[] = []

  const visit = (id: string) => {
    if (visited.has(id) || !byId.has(id)) return
    if (visiting.has(id)) return
    visiting.add(id)
    const item = byId.get(id)!
    if (item.parentId) visit(item.parentId)
    visiting.delete(id)
    visited.add(id)
    ordered.push(item)
  }

  for (const item of items) visit(item.id)
  return ordered
}

/**
 * Bring live schedule state in line with a history snapshot (updates / creates / deletes).
 * Recreated work items get new ids; parent/relation links are remapped.
 */
export async function applyGanttHistorySnapshot(
  workspaceId: string,
  projectId: string,
  current: GanttHistorySnapshot,
  target: GanttHistorySnapshot,
): Promise<void> {
  const currentById = new Map(current.items.map((item) => [item.id, item]))
  const targetById = new Map(target.items.map((item) => [item.id, item]))
  const idMap = new Map<string, string>()

  for (const item of current.items) {
    if (targetById.has(item.id)) idMap.set(item.id, item.id)
  }

  const toDeleteIds = new Set(
    current.items.filter((item) => !targetById.has(item.id)).map((item) => item.id),
  )

  // Drop relations first so work-item deletes do not leave orphans.
  for (const relation of current.relations) {
    const touchesDeleted =
      toDeleteIds.has(relation.fromWorkItemId) || toDeleteIds.has(relation.toWorkItemId)
    if (!touchesDeleted) continue
    try {
      await pmScheduleApi.deleteRelation(relation.id)
    } catch {
      // already removed
    }
  }

  const toDelete = current.items
    .filter((item) => toDeleteIds.has(item.id))
    .sort((left, right) => right.sortOrder - left.sortOrder)

  for (const item of toDelete) {
    await pmApi.deleteWorkItem(item.id)
  }

  for (const item of current.items) {
    const targetItem = targetById.get(item.id)
    if (!targetItem) continue
    if (itemSignature(item) === itemSignature(targetItem)) continue
    await pmApi.updateWorkItem({
      id: item.id,
      parentId: targetItem.parentId ?? null,
      type: targetItem.type,
      title: targetItem.title,
      status: targetItem.status,
      priority: targetItem.priority,
      domain: targetItem.domain,
      assignee: targetItem.assignee ?? null,
      description: targetItem.description ?? null,
      startDate: targetItem.startDate ?? null,
      dueDate: targetItem.dueDate ?? null,
      progressPercent: targetItem.progressPercent,
      sortOrder: targetItem.sortOrder,
      metadata: targetItem.metadata,
    })
  }

  const toCreate = sortForCreate(target.items.filter((item) => !currentById.has(item.id)))
  for (const item of toCreate) {
    const parentId = item.parentId ? idMap.get(item.parentId) : undefined
    const created = await pmApi.createWorkItem({
      workspaceId,
      projectId,
      parentId,
      type: item.type,
      title: item.title,
      status: item.status,
      priority: item.priority,
      domain: item.domain,
      assignee: item.assignee,
      description: item.description,
      startDate: item.startDate,
      dueDate: item.dueDate,
      progressPercent: item.progressPercent,
      sortOrder: item.sortOrder,
      metadata: item.metadata,
    })
    idMap.set(item.id, created.id)
  }

  const currentRelationKeys = new Map(
    current.relations.map((relation) => [relationKey(relation), relation]),
  )
  const desiredRelations = target.relations.map((relation) => ({
    fromWorkItemId: idMap.get(relation.fromWorkItemId) ?? relation.fromWorkItemId,
    toWorkItemId: idMap.get(relation.toWorkItemId) ?? relation.toWorkItemId,
    type: relation.type,
    lagDays: relation.lagDays,
  }))

  for (const relation of current.relations) {
    if (toDeleteIds.has(relation.fromWorkItemId) || toDeleteIds.has(relation.toWorkItemId)) {
      continue
    }
    const stillDesired = desiredRelations.some(
      (entry) => relationKey(entry) === relationKey(relation),
    )
    if (!stillDesired) {
      try {
        await pmScheduleApi.deleteRelation(relation.id)
      } catch {
        // already removed
      }
    }
  }

  for (const relation of desiredRelations) {
    if (currentRelationKeys.has(relationKey(relation))) continue
    if (!relation.fromWorkItemId || !relation.toWorkItemId) continue
    await pmScheduleApi.createRelation({
      workspaceId,
      projectId,
      fromWorkItemId: relation.fromWorkItemId,
      toWorkItemId: relation.toWorkItemId,
      type: relation.type,
      lagDays: relation.lagDays,
    })
  }
}

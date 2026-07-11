import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, inArray, isNull, isNotNull, lt, notInArray, or } from 'drizzle-orm'
import {
  PmWorkItemSchema,
  type PmDomain,
  type PmWorkItem,
  type PmWorkItemPriority,
  type PmWorkItemStatus,
  type PmWorkItemType,
} from '@toolman/shared'
import type { ToolmanDatabase } from '../index.js'
import { pmWorkItems } from '../schema/pm.js'

export type PmWorkItemRow = typeof pmWorkItems.$inferSelect

function parseMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return {}
  } catch {
    return {}
  }
}

export function rowToPmWorkItem(row: PmWorkItemRow): PmWorkItem {
  return PmWorkItemSchema.parse({
    id: row.id,
    projectId: row.projectId,
    workspaceId: row.workspaceId,
    parentId: row.parentId ?? undefined,
    type: row.type,
    title: row.title,
    status: row.status,
    priority: row.priority,
    domain: row.domain,
    assignee: row.assignee ?? undefined,
    description: row.description ?? undefined,
    startDate: row.startDate?.getTime(),
    dueDate: row.dueDate?.getTime(),
    progressPercent: row.progressPercent,
    sortOrder: row.sortOrder,
    metadata: parseMetadata(row.metadataJson),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  })
}

export interface CreatePmWorkItemInput {
  workspaceId: string
  projectId: string
  parentId?: string
  type?: PmWorkItemType
  title: string
  status?: PmWorkItemStatus
  priority?: PmWorkItemPriority
  domain: PmDomain
  assignee?: string
  description?: string
  startDate?: number
  dueDate?: number
  progressPercent?: number
  sortOrder?: number
  metadata?: Record<string, unknown>
}

export interface UpdatePmWorkItemPatch {
  parentId?: string | null
  type?: PmWorkItemType
  title?: string
  status?: PmWorkItemStatus
  priority?: PmWorkItemPriority
  domain?: PmDomain
  assignee?: string | null
  description?: string | null
  startDate?: number | null
  dueDate?: number | null
  progressPercent?: number
  sortOrder?: number
  metadata?: Record<string, unknown>
}

export class PmWorkItemRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  getById(id: string): PmWorkItem | null {
    const row = this.db.select().from(pmWorkItems).where(eq(pmWorkItems.id, id)).get()
    if (!row || row.deletedAt) return null
    return rowToPmWorkItem(row)
  }

  list(options: {
    workspaceId: string
    projectId?: string
    parentId?: string
    rootOnly?: boolean
    domain?: PmDomain
    status?: PmWorkItemStatus
    priority?: PmWorkItemPriority
    type?: PmWorkItemType
    assignee?: string
    urgentOnly?: boolean
    limit?: number
  }): PmWorkItem[] {
    const conditions = [
      eq(pmWorkItems.workspaceId, options.workspaceId),
      isNull(pmWorkItems.deletedAt),
    ]
    if (options.projectId) {
      conditions.push(eq(pmWorkItems.projectId, options.projectId))
    }
    if (options.parentId) {
      conditions.push(eq(pmWorkItems.parentId, options.parentId))
    } else if (options.rootOnly) {
      conditions.push(isNull(pmWorkItems.parentId))
    }
    if (options.domain) {
      conditions.push(eq(pmWorkItems.domain, options.domain))
    }
    if (options.status) {
      conditions.push(eq(pmWorkItems.status, options.status))
    }
    if (options.priority) {
      conditions.push(eq(pmWorkItems.priority, options.priority))
    }
    if (options.type) {
      conditions.push(eq(pmWorkItems.type, options.type))
    }
    if (options.assignee) {
      conditions.push(eq(pmWorkItems.assignee, options.assignee))
    }
    if (options.urgentOnly) {
      const now = new Date()
      conditions.push(
        or(
          inArray(pmWorkItems.priority, ['urgent', 'high']),
          and(
            isNotNull(pmWorkItems.dueDate),
            lt(pmWorkItems.dueDate, now),
            notInArray(pmWorkItems.status, ['done', 'cancelled']),
          ),
        )!,
      )
    }

    return this.db
      .select()
      .from(pmWorkItems)
      .where(and(...conditions))
      .orderBy(asc(pmWorkItems.sortOrder), desc(pmWorkItems.updatedAt))
      .limit(options.limit ?? 500)
      .all()
      .map(rowToPmWorkItem)
  }

  create(input: CreatePmWorkItemInput): PmWorkItem {
    const now = new Date()
    const id = randomUUID()
    const row: PmWorkItemRow = {
      id,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      parentId: input.parentId ?? null,
      type: input.type ?? 'task',
      title: input.title.trim(),
      status: input.status ?? 'todo',
      priority: input.priority ?? 'normal',
      domain: input.domain,
      assignee: input.assignee?.trim() || null,
      description: input.description?.trim() || null,
      startDate: input.startDate != null ? new Date(input.startDate) : null,
      dueDate: input.dueDate != null ? new Date(input.dueDate) : null,
      progressPercent: input.progressPercent ?? 0,
      sortOrder: input.sortOrder ?? 0,
      metadataJson: JSON.stringify(input.metadata ?? {}),
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    this.db.insert(pmWorkItems).values(row).run()
    return rowToPmWorkItem(row)
  }

  update(id: string, patch: UpdatePmWorkItemPatch): PmWorkItem | null {
    const existing = this.getById(id)
    if (!existing) return null

    const now = new Date()
    const metadata =
      patch.metadata != null ? { ...existing.metadata, ...patch.metadata } : existing.metadata

    this.db
      .update(pmWorkItems)
      .set({
        parentId:
          patch.parentId === null ? null : patch.parentId ?? existing.parentId ?? null,
        type: patch.type ?? existing.type,
        title: patch.title?.trim() ?? existing.title,
        status: patch.status ?? existing.status,
        priority: patch.priority ?? existing.priority,
        domain: patch.domain ?? existing.domain,
        assignee:
          patch.assignee === null ? null : patch.assignee?.trim() ?? existing.assignee ?? null,
        description:
          patch.description === null
            ? null
            : patch.description?.trim() ?? existing.description ?? null,
        startDate:
          patch.startDate === null
            ? null
            : patch.startDate != null
              ? new Date(patch.startDate)
              : existing.startDate != null
                ? new Date(existing.startDate)
                : null,
        dueDate:
          patch.dueDate === null
            ? null
            : patch.dueDate != null
              ? new Date(patch.dueDate)
              : existing.dueDate != null
                ? new Date(existing.dueDate)
                : null,
        progressPercent: patch.progressPercent ?? existing.progressPercent,
        sortOrder: patch.sortOrder ?? existing.sortOrder,
        metadataJson: JSON.stringify(metadata),
        updatedAt: now,
      })
      .where(eq(pmWorkItems.id, id))
      .run()

    return this.getById(id)
  }

  softDelete(id: string): boolean {
    const existing = this.getById(id)
    if (!existing) return false
    this.db
      .update(pmWorkItems)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(pmWorkItems.id, id))
      .run()
    return true
  }

  upsertFromSync(item: PmWorkItem): PmWorkItem {
    const createdAt = new Date(item.createdAt)
    const updatedAt = new Date(item.updatedAt)
    const existing = this.db.select().from(pmWorkItems).where(eq(pmWorkItems.id, item.id)).get()
    const row: PmWorkItemRow = {
      id: item.id,
      workspaceId: item.workspaceId,
      projectId: item.projectId,
      parentId: item.parentId ?? null,
      type: item.type,
      title: item.title,
      status: item.status,
      priority: item.priority,
      domain: item.domain,
      assignee: item.assignee ?? null,
      description: item.description ?? null,
      startDate: item.startDate != null ? new Date(item.startDate) : null,
      dueDate: item.dueDate != null ? new Date(item.dueDate) : null,
      progressPercent: item.progressPercent,
      sortOrder: item.sortOrder,
      metadataJson: JSON.stringify(item.metadata ?? {}),
      deletedAt: null,
      createdAt,
      updatedAt,
    }
    if (existing) {
      this.db.update(pmWorkItems).set(row).where(eq(pmWorkItems.id, item.id)).run()
    } else {
      this.db.insert(pmWorkItems).values(row).run()
    }
    return rowToPmWorkItem(row)
  }
}

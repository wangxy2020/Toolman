import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { PmTimeEntrySchema, type PmTimeEntry } from '@toolman/shared'
import type { ToolmanDatabase } from '../index.js'
import { pmTimeEntries } from '../schema/pm.js'

export type PmTimeEntryRow = typeof pmTimeEntries.$inferSelect

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

export function rowToPmTimeEntry(row: PmTimeEntryRow): PmTimeEntry {
  return PmTimeEntrySchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    workItemId: row.workItemId ?? undefined,
    assignee: row.assignee ?? undefined,
    spentHours: row.spentHours,
    workDate: row.workDate.getTime(),
    description: row.description ?? undefined,
    metadata: parseMetadata(row.metadataJson),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  })
}

export interface CreatePmTimeEntryInput {
  workspaceId: string
  projectId: string
  workItemId?: string
  assignee?: string
  spentHours: number
  workDate: number
  description?: string
  metadata?: Record<string, unknown>
}

export class PmTimeEntryRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  getById(id: string): PmTimeEntry | null {
    const row = this.db.select().from(pmTimeEntries).where(eq(pmTimeEntries.id, id)).get()
    if (!row || row.deletedAt) return null
    return rowToPmTimeEntry(row)
  }

  list(options: {
    workspaceId: string
    projectId?: string
    workItemId?: string
    limit?: number
  }): PmTimeEntry[] {
    const conditions = [
      eq(pmTimeEntries.workspaceId, options.workspaceId),
      isNull(pmTimeEntries.deletedAt),
    ]
    if (options.projectId) {
      conditions.push(eq(pmTimeEntries.projectId, options.projectId))
    }
    if (options.workItemId) {
      conditions.push(eq(pmTimeEntries.workItemId, options.workItemId))
    }

    return this.db
      .select()
      .from(pmTimeEntries)
      .where(and(...conditions))
      .orderBy(desc(pmTimeEntries.workDate), desc(pmTimeEntries.updatedAt))
      .limit(options.limit ?? 500)
      .all()
      .map(rowToPmTimeEntry)
  }

  create(input: CreatePmTimeEntryInput): PmTimeEntry {
    const now = new Date()
    const id = randomUUID()
    const row: PmTimeEntryRow = {
      id,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      workItemId: input.workItemId ?? null,
      assignee: input.assignee?.trim() || null,
      spentHours: input.spentHours,
      workDate: new Date(input.workDate),
      description: input.description?.trim() || null,
      metadataJson: JSON.stringify(input.metadata ?? {}),
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    this.db.insert(pmTimeEntries).values(row).run()
    return rowToPmTimeEntry(row)
  }

  softDelete(id: string): boolean {
    const row = this.db.select().from(pmTimeEntries).where(eq(pmTimeEntries.id, id)).get()
    if (!row || row.deletedAt) return false
    this.db
      .update(pmTimeEntries)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(pmTimeEntries.id, id))
      .run()
    return true
  }

  update(
    id: string,
    patch: {
      workItemId?: string | null
      assignee?: string | null
      spentHours?: number
      workDate?: number
      description?: string | null
      metadata?: Record<string, unknown>
    },
  ): PmTimeEntry | null {
    const existing = this.getById(id)
    if (!existing) return null
    const now = new Date()
    this.db
      .update(pmTimeEntries)
      .set({
        workItemId:
          patch.workItemId === undefined
            ? existing.workItemId ?? null
            : patch.workItemId,
        assignee:
          patch.assignee === undefined ? existing.assignee ?? null : patch.assignee?.trim() || null,
        spentHours: patch.spentHours ?? existing.spentHours,
        workDate: patch.workDate != null ? new Date(patch.workDate) : new Date(existing.workDate),
        description:
          patch.description === undefined
            ? existing.description ?? null
            : patch.description?.trim() || null,
        metadataJson:
          patch.metadata !== undefined
            ? JSON.stringify(patch.metadata)
            : JSON.stringify(existing.metadata ?? {}),
        updatedAt: now,
      })
      .where(eq(pmTimeEntries.id, id))
      .run()
    return this.getById(id)
  }

  upsertFromSync(entry: PmTimeEntry): PmTimeEntry {
    const createdAt = new Date(entry.createdAt)
    const updatedAt = new Date(entry.updatedAt)
    const existing = this.db.select().from(pmTimeEntries).where(eq(pmTimeEntries.id, entry.id)).get()
    const row: PmTimeEntryRow = {
      id: entry.id,
      workspaceId: entry.workspaceId,
      projectId: entry.projectId,
      workItemId: entry.workItemId ?? null,
      assignee: entry.assignee ?? null,
      spentHours: entry.spentHours,
      workDate: new Date(entry.workDate),
      description: entry.description ?? null,
      metadataJson: JSON.stringify(entry.metadata ?? {}),
      deletedAt: null,
      createdAt,
      updatedAt,
    }
    if (existing) {
      this.db.update(pmTimeEntries).set(row).where(eq(pmTimeEntries.id, entry.id)).run()
    } else {
      this.db.insert(pmTimeEntries).values(row).run()
    }
    return rowToPmTimeEntry(row)
  }
}

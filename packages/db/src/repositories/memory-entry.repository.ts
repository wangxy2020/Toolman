import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import { memoryEntries } from '../schema/knowledge.js'

export type MemoryEntrySource = 'conversation' | 'manual' | 'import'

export interface MemoryEntryRow {
  id: string
  workspaceId: string
  assistantId: string | null
  sessionId: string | null
  content: string
  contentHash: string
  source: MemoryEntrySource
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateMemoryEntryInput {
  workspaceId: string
  content: string
  contentHash: string
  assistantId?: string | null
  sessionId?: string | null
  source?: MemoryEntrySource
}

export class MemoryEntryRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  findById(id: string, workspaceId: string): MemoryEntryRow | null {
    const row = this.db
      .select()
      .from(memoryEntries)
      .where(and(eq(memoryEntries.id, id), eq(memoryEntries.workspaceId, workspaceId)))
      .get()
    if (!row || row.deletedAt) return null
    return row
  }

  findByHash(workspaceId: string, contentHash: string): MemoryEntryRow | null {
    const row = this.db
      .select()
      .from(memoryEntries)
      .where(
        and(
          eq(memoryEntries.workspaceId, workspaceId),
          eq(memoryEntries.contentHash, contentHash),
          isNull(memoryEntries.deletedAt),
        ),
      )
      .get()
    return row ?? null
  }

  listByWorkspace(
    workspaceId: string,
    options?: { assistantId?: string; limit?: number },
  ): MemoryEntryRow[] {
    const rows = this.db
      .select()
      .from(memoryEntries)
      .where(and(eq(memoryEntries.workspaceId, workspaceId), isNull(memoryEntries.deletedAt)))
      .orderBy(desc(memoryEntries.createdAt))
      .all()

    const filtered = rows.filter((row) => {
      if (!options?.assistantId || !row.assistantId) return true
      return row.assistantId === options.assistantId
    })

    return filtered.slice(0, options?.limit ?? 200)
  }

  create(input: CreateMemoryEntryInput): MemoryEntryRow {
    const now = new Date()
    const id = randomUUID()

    this.db
      .insert(memoryEntries)
      .values({
        id,
        workspaceId: input.workspaceId,
        assistantId: input.assistantId ?? null,
        sessionId: input.sessionId ?? null,
        content: input.content,
        contentHash: input.contentHash,
        source: input.source ?? 'manual',
        createdAt: now,
        updatedAt: now,
      })
      .run()

    return this.findById(id, input.workspaceId)!
  }

  softDelete(id: string, workspaceId: string): boolean {
    const existing = this.findById(id, workspaceId)
    if (!existing) return false

    this.db
      .update(memoryEntries)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(memoryEntries.id, id), eq(memoryEntries.workspaceId, workspaceId)))
      .run()

    return true
  }
}

export function createMemoryEntryRepository(db: ToolmanDatabase) {
  return new MemoryEntryRepository(db)
}

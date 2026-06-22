import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import { knowledgeBases } from '../schema/knowledge.js'
import type { KnowledgeBaseRow } from '../types/knowledge.js'

export interface CreateKnowledgeBaseInput {
  id?: string
  workspaceId: string
  name: string
  description?: string
  kind?: 'local' | 'network' | 'local_files'
  embedConfigJson?: string
  chunkConfigJson?: string
  watchConfigJson?: string
}

export interface UpdateKnowledgeBaseInput {
  id: string
  workspaceId: string
  name?: string
  description?: string | null
  embedConfigJson?: string
  chunkConfigJson?: string
  watchConfigJson?: string
  status?: KnowledgeBaseRow['status']
  documentCount?: number
  chunkCount?: number
}

export class KnowledgeBaseRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  findRowById(id: string, workspaceId: string): KnowledgeBaseRow | null {
    const row = this.db
      .select()
      .from(knowledgeBases)
      .where(and(eq(knowledgeBases.id, id), eq(knowledgeBases.workspaceId, workspaceId)))
      .get()
    if (!row || row.deletedAt) return null
    return row
  }

  findRowByIdOnly(id: string): KnowledgeBaseRow | null {
    const row = this.db
      .select()
      .from(knowledgeBases)
      .where(and(eq(knowledgeBases.id, id), isNull(knowledgeBases.deletedAt)))
      .get()
    return row ?? null
  }

  findRowByIdAny(id: string): KnowledgeBaseRow | null {
    const row = this.db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id)).get()
    return row ?? null
  }

  restore(id: string, workspaceId: string): KnowledgeBaseRow | null {
    const existing = this.findRowByIdAny(id)
    if (!existing || existing.workspaceId !== workspaceId) return null

    const now = new Date()
    this.db
      .update(knowledgeBases)
      .set({ deletedAt: null, updatedAt: now })
      .where(and(eq(knowledgeBases.id, id), eq(knowledgeBases.workspaceId, workspaceId)))
      .run()

    return this.findRowById(id, workspaceId)
  }

  listByWorkspace(workspaceId: string): KnowledgeBaseRow[] {
    return this.db
      .select()
      .from(knowledgeBases)
      .where(and(eq(knowledgeBases.workspaceId, workspaceId), isNull(knowledgeBases.deletedAt)))
      .orderBy(desc(knowledgeBases.updatedAt))
      .all()
  }

  listAllActive(): KnowledgeBaseRow[] {
    return this.db
      .select()
      .from(knowledgeBases)
      .where(isNull(knowledgeBases.deletedAt))
      .all()
  }

  create(input: CreateKnowledgeBaseInput): KnowledgeBaseRow {
    const now = new Date()
    const id = input.id ?? randomUUID()

    this.db
      .insert(knowledgeBases)
      .values({
        id,
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description ?? null,
        kind: input.kind ?? 'local',
        embedConfigJson: input.embedConfigJson ?? '{}',
        chunkConfigJson: input.chunkConfigJson ?? '{}',
        watchConfigJson: input.watchConfigJson ?? '{}',
        status: 'idle',
        documentCount: 0,
        chunkCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    return this.findRowById(id, input.workspaceId)!
  }

  update(input: UpdateKnowledgeBaseInput): KnowledgeBaseRow | null {
    const existing = this.findRowById(input.id, input.workspaceId)
    if (!existing) return null

    const now = new Date()
    this.db
      .update(knowledgeBases)
      .set({
        name: input.name ?? existing.name,
        description: input.description !== undefined ? input.description : existing.description,
        embedConfigJson: input.embedConfigJson ?? existing.embedConfigJson,
        chunkConfigJson: input.chunkConfigJson ?? existing.chunkConfigJson,
        watchConfigJson: input.watchConfigJson ?? existing.watchConfigJson,
        status: input.status ?? existing.status,
        documentCount: input.documentCount ?? existing.documentCount,
        chunkCount: input.chunkCount ?? existing.chunkCount,
        updatedAt: now,
      })
      .where(and(eq(knowledgeBases.id, input.id), eq(knowledgeBases.workspaceId, input.workspaceId)))
      .run()

    return this.findRowById(input.id, input.workspaceId)
  }

  softDelete(id: string, workspaceId: string): boolean {
    const existing = this.findRowById(id, workspaceId)
    if (!existing) return false

    this.db
      .update(knowledgeBases)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(knowledgeBases.id, id), eq(knowledgeBases.workspaceId, workspaceId)))
      .run()

    return true
  }
}

export function createKnowledgeBaseRepository(db: ToolmanDatabase) {
  return new KnowledgeBaseRepository(db)
}

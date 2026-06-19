import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull, like } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import { sessions } from '../schema/session.js'
import type {
  CreateSessionInput,
  ListSessionsQuery,
  Session,
  UpdateSessionInput,
} from '../types/chat.js'
import type { SessionRow } from '../types/rows.js'

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    title: row.title,
    modelId: row.modelId,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

export class SessionRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  findRowById(id: string): SessionRow | null {
    const row = this.db.select().from(sessions).where(eq(sessions.id, id)).get()
    if (!row || row.deletedAt) return null
    return row
  }

  create(input: CreateSessionInput): Session {
    const now = new Date()
    const id = randomUUID()

    this.db
      .insert(sessions)
      .values({
        id,
        workspaceId: input.workspaceId,
        assistantId: input.assistantId ?? null,
        modelId: input.modelId ?? null,
        title: input.title ?? '新对话',
        type: input.type ?? 'chat',
        parentSessionId: input.parentSessionId ?? null,
        forkMessageId: input.forkMessageId ?? null,
        metadataJson: JSON.stringify(input.metadata ?? {}),
        createdAt: now,
        updatedAt: now,
      })
      .run()

    return this.getById(id)!
  }

  getById(id: string): Session | null {
    const row = this.findRowById(id)
    return row ? toSession(row) : null
  }

  list(query: ListSessionsQuery): Session[] {
    return this.listRows(query).map(toSession)
  }

  listRows(query: ListSessionsQuery): SessionRow[] {
    const conditions = [eq(sessions.workspaceId, query.workspaceId)]
    if (!query.includeDeleted) {
      conditions.push(isNull(sessions.deletedAt))
    }
    if (query.type) conditions.push(eq(sessions.type, query.type))
    if (query.assistantId) conditions.push(eq(sessions.assistantId, query.assistantId))
    if (query.query) conditions.push(like(sessions.title, `%${query.query}%`))

    return this.db
      .select()
      .from(sessions)
      .where(and(...conditions))
      .orderBy(desc(sessions.lastMessageAt), desc(sessions.id))
      .limit(query.limit ?? 50)
      .offset(query.offset ?? 0)
      .all()
  }

  listWithCursor(query: ListSessionsQuery & { limit: number }) {
    const rows = this.listRows({ ...query, limit: query.limit + 1 })
    const hasMore = rows.length > query.limit
    const items = hasMore ? rows.slice(0, query.limit) : rows
    const last = items[items.length - 1]
    const nextCursor =
      hasMore && last?.lastMessageAt
        ? `${last.lastMessageAt.getTime()}:${last.id}`
        : hasMore && last
          ? `${last.createdAt.getTime()}:${last.id}`
          : undefined

    return { items, nextCursor }
  }

  update(id: string, input: UpdateSessionInput): Session | null {
    const existing = this.findRowById(id)
    if (!existing) return null

    const now = new Date()
    const metadata =
      input.metadata !== undefined
        ? { ...JSON.parse(existing.metadataJson), ...input.metadata }
        : JSON.parse(existing.metadataJson)

    this.db
      .update(sessions)
      .set({
        title: input.title ?? existing.title,
        modelId: input.modelId !== undefined ? input.modelId : existing.modelId,
        assistantId: input.assistantId ?? existing.assistantId,
        metadataJson: JSON.stringify(metadata),
        updatedAt: now,
      })
      .where(eq(sessions.id, id))
      .run()

    return this.getById(id)
  }

  delete(id: string): boolean {
    const result = this.db
      .update(sessions)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(sessions.id, id))
      .run()

    return result.changes > 0
  }

  deleteByAssistantId(assistantId: string): string[] {
    const rows = this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.assistantId, assistantId), isNull(sessions.deletedAt)))
      .all()

    if (rows.length === 0) return []

    const now = new Date()
    this.db
      .update(sessions)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(sessions.assistantId, assistantId), isNull(sessions.deletedAt)))
      .run()

    return rows.map((row) => row.id)
  }

  touch(id: string, messageDelta = 1): void {
    const existing = this.findRowById(id)
    if (!existing) return

    const now = new Date()
    this.db
      .update(sessions)
      .set({
        messageCount: existing.messageCount + messageDelta,
        lastMessageAt: now,
        updatedAt: now,
      })
      .where(eq(sessions.id, id))
      .run()
  }
}

export function createSessionRepository(db: ToolmanDatabase) {
  return new SessionRepository(db)
}

import { randomUUID } from 'node:crypto'
import { and, asc, eq, isNull, ne } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import { messages } from '../schema/session.js'
import type {
  CreateMessageInput,
  ListMessagesQuery,
  Message,
  UpdateMessageInput,
} from '../types/chat.js'
import type { MessageRow } from '../types/rows.js'
import { createSessionRepository } from './session.repository.js'

function blocksToText(blocks: Array<{ type: string; text?: string }>): string {
  return blocks
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text!)
    .join('\n')
}

function toContentBlocks(
  content: string,
  blocks?: Array<{ type: string; text?: string }>,
): string {
  if (blocks) return JSON.stringify(blocks)
  return JSON.stringify([{ type: 'text', text: content }])
}

function fromContentBlocks(json: string, plain: string | null): string {
  if (plain) return plain
  try {
    return blocksToText(JSON.parse(json) as Array<{ type: string; text?: string }>)
  } catch {
    return ''
  }
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    sessionId: row.sessionId,
    role: row.role,
    content: fromContentBlocks(row.contentBlocksJson, row.content),
    timestamp: row.createdAt.getTime(),
  }
}

export class MessageRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  findRowById(id: string): MessageRow | null {
    const row = this.db.select().from(messages).where(eq(messages.id, id)).get()
    if (!row || row.deletedAt) return null
    return row
  }

  create(input: CreateMessageInput): Message {
    const now = new Date()
    const id = randomUUID()
    const contentBlocks = input.contentBlocks ?? [{ type: 'text', text: input.content }]

    this.db
      .insert(messages)
      .values({
        id,
        sessionId: input.sessionId,
        parentMessageId: input.parentMessageId ?? null,
        role: input.role,
        modelId: input.modelId ?? null,
        content: input.content,
        contentBlocksJson: toContentBlocks(input.content, contentBlocks),
        status: input.status ?? 'completed',
        createdAt: now,
        updatedAt: now,
      })
      .run()

    if (input.touchSession !== false) {
      createSessionRepository(this.db).touch(input.sessionId, 1)
    }

    return this.getById(id)!
  }

  createWithId(input: CreateMessageInput & { id: string }): MessageRow {
    const now = new Date()
    const contentBlocks = input.contentBlocks ?? [{ type: 'text', text: input.content }]

    const row = {
      id: input.id,
      sessionId: input.sessionId,
      parentMessageId: input.parentMessageId ?? null,
      role: input.role,
      modelId: input.modelId ?? null,
      content: input.content,
      contentBlocksJson: toContentBlocks(input.content, contentBlocks),
      status: input.status ?? 'completed',
      createdAt: now,
      updatedAt: now,
    }

    this.db.insert(messages).values(row).run()

    if (input.touchSession !== false) {
      createSessionRepository(this.db).touch(input.sessionId, 1)
    }

    return this.findRowById(input.id)!
  }

  getById(id: string): Message | null {
    const row = this.findRowById(id)
    return row ? toMessage(row) : null
  }

  list(query: ListMessagesQuery): Message[] {
    return this.listRows(query).map(toMessage)
  }

  listRows(query: ListMessagesQuery): MessageRow[] {
    return this.db
      .select()
      .from(messages)
      .where(and(eq(messages.sessionId, query.sessionId), isNull(messages.deletedAt)))
      .orderBy(asc(messages.createdAt))
      .limit(query.limit ?? 200)
      .offset(query.offset ?? 0)
      .all()
  }

  listCompletedRows(sessionId: string, excludeMessageId?: string): MessageRow[] {
    const conditions = [
      eq(messages.sessionId, sessionId),
      eq(messages.status, 'completed'),
      isNull(messages.deletedAt),
    ]
    if (excludeMessageId) {
      conditions.push(ne(messages.id, excludeMessageId))
    }

    return this.db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(asc(messages.createdAt))
      .all()
  }

  update(id: string, input: UpdateMessageInput): Message | null {
    const existing = this.findRowById(id)
    if (!existing) return null

    const contentBlocks = input.contentBlocks
    const content =
      input.content ??
      existing.content ??
      fromContentBlocks(existing.contentBlocksJson, null)
    const now = new Date()

    this.db
      .update(messages)
      .set({
        role: input.role ?? existing.role,
        content,
        contentBlocksJson: contentBlocks
          ? JSON.stringify(contentBlocks)
          : toContentBlocks(content),
        status: input.status ?? existing.status,
        errorJson:
          input.error !== undefined
            ? input.error
              ? JSON.stringify(input.error)
              : null
            : existing.errorJson,
        tokenUsageJson:
          input.tokenUsage !== undefined
            ? input.tokenUsage
              ? JSON.stringify(input.tokenUsage)
              : null
            : existing.tokenUsageJson,
        updatedAt: now,
      })
      .where(eq(messages.id, id))
      .run()

    return this.getById(id)
  }

  updateStreamContent(id: string, accumulated: string): void {
    this.updateStreamBlocks(id, [{ type: 'text', text: accumulated }])
  }

  updateStreamBlocks(
    id: string,
    blocks: Array<{ type: string; text?: string; [key: string]: unknown }>,
  ): void {
    const plain = blocks
      .filter((block) => block.type === 'text' && block.text)
      .map((block) => block.text!)
      .join('\n')

    this.db
      .update(messages)
      .set({
        content: plain,
        contentBlocksJson: JSON.stringify(blocks),
        updatedAt: new Date(),
      })
      .where(and(eq(messages.id, id), isNull(messages.deletedAt)))
      .run()
  }

  recoverStaleStreaming(error: { code: string; message: string; retryable: boolean }): void {
    const stale = this.db
      .select()
      .from(messages)
      .where(and(eq(messages.status, 'streaming'), isNull(messages.deletedAt)))
      .all()

    for (const msg of stale) {
      this.update(msg.id, {
        status: 'aborted',
        error,
      })
    }
  }

  delete(id: string): boolean {
    const existing = this.findRowById(id)
    if (!existing) return false

    const now = new Date()
    const result = this.db
      .update(messages)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(messages.id, id))
      .run()

    if (result.changes > 0) {
      createSessionRepository(this.db).touch(existing.sessionId, -1)
    }
    return result.changes > 0
  }

  deleteMany(ids: string[], options?: { touchSession?: boolean }): number {
    if (ids.length === 0) return 0

    const touchSession = options?.touchSession !== false
    const now = new Date()
    const sessionDeltas = new Map<string, number>()
    let deleted = 0

    for (const id of ids) {
      const existing = this.findRowById(id)
      if (!existing) continue

      const result = this.db
        .update(messages)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(messages.id, id))
        .run()

      if (result.changes > 0) {
        sessionDeltas.set(
          existing.sessionId,
          (sessionDeltas.get(existing.sessionId) ?? 0) + 1,
        )
        deleted++
      }
    }

    if (touchSession) {
      const sessions = createSessionRepository(this.db)
      for (const [sessionId, count] of sessionDeltas) {
        sessions.touch(sessionId, -count)
      }
    }

    return deleted
  }

  countBySession(sessionId: string): number {
    return this.db
      .select()
      .from(messages)
      .where(and(eq(messages.sessionId, sessionId), isNull(messages.deletedAt)))
      .all().length
  }
}

export function createMessageRepository(db: ToolmanDatabase) {
  return new MessageRepository(db)
}

export { blocksToText, fromContentBlocks, toContentBlocks }

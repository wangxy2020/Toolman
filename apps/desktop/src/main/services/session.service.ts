import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import {
  ContentBlockSchema,
  SessionClearMessagesInputSchema,
  SessionCreateInputSchema,
  SessionDeleteInputSchema,
  SessionForkInputSchema,
  SessionGetInputSchema,
  SessionListInputSchema,
  SessionUpdateInputSchema,
  isAssistantLibSession,
  type ContentBlock,
  type Session,
} from '@toolman/shared'
import { createMessageRepository, createSessionRepository, fromContentBlocks, runInTransaction, sessions } from '@toolman/db'
import { assistants } from '@toolman/db'
import { getDatabase } from '../bootstrap/database'
import { getMessageRepository, getSessionRepository } from '../db/repos'
import { toIpcSession } from '../mappers/chat'
import { inheritGroupProxySessionMetadata } from './p2p/p2p-group-agent-proxy.service'
import {
  publishClassroomSessionDeleteSyncChange,
  publishClassroomSessionSyncChange,
} from './classroom-mobile-sync'

function parseCopiedContentBlocks(json: string, fallbackText: string): ContentBlock[] {
  try {
    const parsed = ContentBlockSchema.array().safeParse(JSON.parse(json) as unknown)
    if (parsed.success) return parsed.data
  } catch {
    // corrupt JSON — fall back to plain text
  }
  return [{ type: 'text', text: fallbackText }]
}

export function createSession(input: unknown): Session {
  const data = SessionCreateInputSchema.parse(input)
  const db = getDatabase()
  const sessions = getSessionRepository()

  let assistantId = data.assistantId
  if (!assistantId) {
    const defaultAssistant = db
      .select()
      .from(assistants)
      .where(and(eq(assistants.workspaceId, data.workspaceId), isNull(assistants.deletedAt)))
      .orderBy(desc(assistants.isPinned))
      .get()
    assistantId = defaultAssistant?.id
  }

  const row = sessions.create({
    workspaceId: data.workspaceId,
    assistantId: assistantId ?? null,
    title: data.title,
    type: data.type,
    metadata: data.metadata ?? inheritGroupProxySessionMetadata(data.workspaceId, assistantId),
  })

  const session = toIpcSession(sessions.findRowById(row.id)!)
  try {
    publishClassroomSessionSyncChange(session)
  } catch {
    // Sync must not block session create.
  }
  return session
}

export function listSessions(input: unknown) {
  const data = SessionListInputSchema.parse(input)
  const limit = data.pagination?.limit ?? 20

  const { items, nextCursor } = getSessionRepository().listWithCursor({
    workspaceId: data.workspaceId,
    type: data.type,
    assistantId: data.assistantId,
    query: data.query,
    cursor: data.pagination?.cursor,
    limit,
  })

  return {
    items: items.map(toIpcSession),
    nextCursor,
  }
}

export function getSession(input: unknown): Session | null {
  const { id } = SessionGetInputSchema.parse(input)
  const row = getSessionRepository().findRowById(id)
  return row ? toIpcSession(row) : null
}

export function updateSession(input: unknown): Session | null {
  const data = SessionUpdateInputSchema.parse(input)
  const sessions = getSessionRepository()

  sessions.update(data.id, {
    title: data.title,
    assistantId: data.assistantId,
    metadata: data.metadata,
  })

  const row = sessions.findRowById(data.id)
  const session = row ? toIpcSession(row) : null
  if (session) {
    try {
      publishClassroomSessionSyncChange(session)
    } catch {
      // Sync must not block session update.
    }
  }
  return session
}

export function deleteSession(input: unknown): boolean {
  const data = SessionDeleteInputSchema.parse(input)
  const existing = getSession(data)
  const deleted = getSessionRepository().delete(data.id)
  if (deleted && existing && isAssistantLibSession(existing.metadata)) {
    try {
      publishClassroomSessionDeleteSyncChange(existing.id)
    } catch {
      // Sync must not block session delete.
    }
  }
  return deleted
}

export function clearSessionMessages(input: unknown): number {
  const { sessionId } = SessionClearMessagesInputSchema.parse(input)
  const sessionRepo = getSessionRepository()
  const messageRepo = getMessageRepository()

  const session = sessionRepo.findRowById(sessionId)
  if (!session) {
    throw new Error('Session not found')
  }

  const rows = messageRepo.listRows({ sessionId })
  const cleared = messageRepo.deleteMany(
    rows.map((row) => row.id),
    { touchSession: false },
  )

  if (cleared > 0) {
    const now = new Date()
    getDatabase()
      .update(sessions)
      .set({ messageCount: 0, lastMessageAt: null, updatedAt: now })
      .where(eq(sessions.id, sessionId))
      .run()
  }

  return cleared
}

function deriveForkTitle(sourceTitle: string, forkText: string): string {
  const snippet = forkText.replace(/\s+/g, ' ').trim()
  if (snippet.length > 0) {
    const label = snippet.length <= 16 ? snippet : `${snippet.slice(0, 16)}…`
    return `${sourceTitle} · ${label}`
  }
  return `${sourceTitle} (分叉)`
}

export function forkSession(input: unknown): Session {
  const data = SessionForkInputSchema.parse(input)
  const sessions = getSessionRepository()
  const messages = getMessageRepository()

  const source = sessions.findRowById(data.sessionId)
  if (!source) {
    throw new Error('Session not found')
  }

  const forkRow = messages.findRowById(data.forkMessageId)
  if (!forkRow || forkRow.sessionId !== data.sessionId) {
    throw new Error('Fork message not found')
  }

  const allRows = messages.listRows({ sessionId: data.sessionId })
  const forkIndex = allRows.findIndex((row) => row.id === data.forkMessageId)
  if (forkIndex < 0) {
    throw new Error('Fork message not found in session')
  }

  const copiedRows = allRows.slice(0, forkIndex + 1)
  const forkText = fromContentBlocks(forkRow.contentBlocksJson, forkRow.content)

  const idMap = new Map<string, string>()
  for (const row of copiedRows) {
    idMap.set(row.id, randomUUID())
  }

  return runInTransaction(getDatabase(), (tx) => {
    const sessions = createSessionRepository(tx)
    const messages = createMessageRepository(tx)

    const created = sessions.create({
      workspaceId: source.workspaceId,
      assistantId: source.assistantId,
      type: source.type,
      parentSessionId: source.id,
      forkMessageId: data.forkMessageId,
      title: data.title ?? deriveForkTitle(source.title, forkText),
    })

    for (const row of copiedRows) {
      const contentBlocks = parseCopiedContentBlocks(row.contentBlocksJson, row.content)
      const status = row.status === 'streaming' ? 'aborted' : row.status

      messages.createWithId({
        id: idMap.get(row.id)!,
        sessionId: created.id,
        parentMessageId: row.parentMessageId ? idMap.get(row.parentMessageId) ?? null : null,
        role: row.role,
        modelId: row.modelId,
        content: row.content,
        contentBlocks,
        status,
        touchSession: false,
      })
    }

    sessions.touch(created.id, copiedRows.length)
    return toIpcSession(sessions.findRowById(created.id)!)
  })
}

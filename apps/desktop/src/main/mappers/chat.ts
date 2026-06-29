import { SessionSchema, MessageSchema, type Message, type Session } from '@toolman/shared'
import type { MessageRow, SessionRow } from '@toolman/db'

function parseDbJson(raw: string, field: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`Corrupt ${field} JSON in database row`)
  }
}

export function toIpcSession(row: SessionRow): Session {
  return SessionSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    assistantId: row.assistantId,
    title: row.title,
    type: row.type,
    parentSessionId: row.parentSessionId,
    forkMessageId: row.forkMessageId,
    metadata: parseDbJson(row.metadataJson, 'session metadata'),
    messageCount: row.messageCount,
    lastMessageAt: row.lastMessageAt?.getTime() ?? null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  })
}

export function toIpcMessage(row: MessageRow): Message {
  return MessageSchema.parse({
    id: row.id,
    sessionId: row.sessionId,
    parentMessageId: row.parentMessageId,
    role: row.role,
    modelId: row.modelId,
    status: row.status,
    contentBlocks: parseDbJson(row.contentBlocksJson, 'message content blocks'),
    error: row.errorJson ? parseDbJson(row.errorJson, 'message error') : null,
    tokenUsage: row.tokenUsageJson ? parseDbJson(row.tokenUsageJson, 'message token usage') : null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  })
}

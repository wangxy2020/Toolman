import { SessionSchema, MessageSchema, type Message, type Session } from '@toolman/shared'
import type { MessageRow, SessionRow } from '@toolman/db'

export function toIpcSession(row: SessionRow): Session {
  return SessionSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    assistantId: row.assistantId,
    title: row.title,
    type: row.type,
    parentSessionId: row.parentSessionId,
    forkMessageId: row.forkMessageId,
    metadata: JSON.parse(row.metadataJson),
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
    contentBlocks: JSON.parse(row.contentBlocksJson),
    error: row.errorJson ? JSON.parse(row.errorJson) : null,
    tokenUsage: row.tokenUsageJson ? JSON.parse(row.tokenUsageJson) : null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  })
}

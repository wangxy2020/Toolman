import type { ContentBlock } from '@toolman/shared'

/**
 * Persistence-layer chat types used by `@toolman/db` repositories.
 *
 * Do **not** confuse with IPC DTOs:
 * - IPC / renderer: `Session` / `Message` from `@toolman/shared` (Zod schemas)
 * - Drizzle rows: `SessionRow` / `MessageRow` from `./rows`
 * - This file: slim persisted views returned by repositories
 */

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

/** Slim persisted session (repository API). Prefer `@toolman/shared` Session for IPC. */
export interface PersistedChatSession {
  id: string
  title: string
  modelId: string | null
  createdAt: number
  updatedAt: number
}

/** Slim persisted message (repository API). Prefer `@toolman/shared` Message for IPC. */
export interface PersistedChatMessage {
  id: string
  sessionId: string
  role: MessageRole
  content: string
  timestamp: number
}
export interface CreateSessionInput {
  title?: string
  modelId?: string | null
  workspaceId: string
  assistantId?: string | null
  type?: 'chat' | 'meeting' | 'multi_model'
  parentSessionId?: string | null
  forkMessageId?: string | null
  metadata?: Record<string, unknown>
}

export interface UpdateSessionInput {
  title?: string
  modelId?: string | null
  assistantId?: string | null
  metadata?: Record<string, unknown>
}

export interface ListSessionsQuery {
  workspaceId: string
  limit?: number
  offset?: number
  /** Keyset cursor: `{sortTimeMs}:{sessionId}` where sortTime is COALESCE(lastMessageAt, createdAt). */
  cursor?: string
  includeDeleted?: boolean
  type?: 'chat' | 'meeting' | 'multi_model'
  assistantId?: string
  query?: string
}

export interface CreateMessageInput {
  sessionId: string
  role: MessageRole
  content: string
  modelId?: string | null
  status?: 'pending' | 'streaming' | 'completed' | 'aborted' | 'failed'
  parentMessageId?: string | null
  contentBlocks?: ContentBlock[]
  /** 为 false 时不更新 session.messageCount（批量插入时用） */
  touchSession?: boolean
  metadata?: Record<string, unknown>
}

export interface UpdateMessageInput {
  content?: string
  role?: MessageRole
  status?: 'pending' | 'streaming' | 'completed' | 'aborted' | 'failed'
  contentBlocks?: ContentBlock[]
  error?: { code: string; message: string; retryable: boolean } | null
  tokenUsage?: { prompt: number; completion: number; total: number } | null
}

export interface ListMessagesQuery {
  sessionId: string
  limit?: number
  offset?: number
}

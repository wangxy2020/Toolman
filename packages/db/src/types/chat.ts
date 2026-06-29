/**
 * 对外暴露的会话/消息领域类型（持久化 API 使用）
 *
 * DB 映射：
 * - Session.modelId  → sessions.model_id
 * - Message.content  → messages.content（同时镜像到 content_blocks_json 供旧代码读取）
 * - Message.timestamp → messages.created_at
 */

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface Session {
  id: string
  title: string
  modelId: string | null
  createdAt: number
  updatedAt: number
}

export interface Message {
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
  contentBlocks?: Array<{ type: string; text?: string }>
  /** 为 false 时不更新 session.messageCount（批量插入时用） */
  touchSession?: boolean
}

export interface UpdateMessageInput {
  content?: string
  role?: MessageRole
  status?: 'pending' | 'streaming' | 'completed' | 'aborted' | 'failed'
  contentBlocks?: Array<{ type: string; text?: string }>
  error?: { code: string; message: string; retryable: boolean } | null
  tokenUsage?: { prompt: number; completion: number; total: number } | null
}

export interface ListMessagesQuery {
  sessionId: string
  limit?: number
  offset?: number
}

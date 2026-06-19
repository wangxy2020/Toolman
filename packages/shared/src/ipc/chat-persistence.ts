/**
 * Session / Message 持久化 IPC 接口签名（供 Main 进程实现、Renderer 调用）
 *
 * 所有 invoke 返回 IpcResult<T>（见 @toolman/shared ipc/base.ts）
 */

import type { IpcResult } from './base.js'

// ── 领域类型（与 @toolman/db types/chat 对齐）────────────────

export type ChatMessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatSessionDto {
  id: string
  title: string
  modelId: string | null
  createdAt: number
  updatedAt: number
}

export interface ChatMessageDto {
  id: string
  sessionId: string
  role: ChatMessageRole
  content: string
  timestamp: number
}

// ── Session IPC ───────────────────────────────────────────────

export interface SessionCreateRequest {
  workspaceId: string
  title?: string
  modelId?: string | null
  assistantId?: string | null
}

export interface SessionGetRequest {
  id: string
}

export interface SessionListRequest {
  workspaceId: string
  limit?: number
  offset?: number
}

export interface SessionUpdateRequest {
  id: string
  title?: string
  modelId?: string | null
}

export interface SessionDeleteRequest {
  id: string
}

export type SessionCreateResponse = ChatSessionDto
export type SessionGetResponse = ChatSessionDto
export type SessionListResponse = { items: ChatSessionDto[] }
export type SessionUpdateResponse = ChatSessionDto
export type SessionDeleteResponse = { deleted: boolean }

export type SessionCreateHandler = (
  input: SessionCreateRequest,
) => Promise<IpcResult<SessionCreateResponse>>

export type SessionGetHandler = (
  input: SessionGetRequest,
) => Promise<IpcResult<SessionGetResponse>>

export type SessionListHandler = (
  input: SessionListRequest,
) => Promise<IpcResult<SessionListResponse>>

export type SessionUpdateHandler = (
  input: SessionUpdateRequest,
) => Promise<IpcResult<SessionUpdateResponse>>

export type SessionDeleteHandler = (
  input: SessionDeleteRequest,
) => Promise<IpcResult<SessionDeleteResponse>>

// ── Message IPC ───────────────────────────────────────────────

export interface MessageListRequest {
  sessionId: string
  limit?: number
  offset?: number
}

export interface MessageDeleteRequest {
  id: string
}

export type MessageListResponse = { items: ChatMessageDto[] }
export type MessageDeleteResponse = { deleted: boolean }

export type MessageListHandler = (
  input: MessageListRequest,
) => Promise<IpcResult<MessageListResponse>>

export type MessageDeleteHandler = (
  input: MessageDeleteRequest,
) => Promise<IpcResult<MessageDeleteResponse>>

// ── Channel 映射（已有 IpcChannel 枚举，此处标注对应关系）────

/**
 * | IPC Channel              | Handler 签名              |
 * |--------------------------|---------------------------|
 * | agent:session:create     | SessionCreateHandler      |
 * | agent:session:get        | SessionGetHandler         |
 * | agent:session:list       | SessionListHandler        |
 * | agent:session:update     | SessionUpdateHandler      |
 * | agent:session:delete     | SessionDeleteHandler      |
 * | agent:message:list       | MessageListHandler        |
 * | agent:message:delete     | MessageDeleteHandler      |
 * | agent:message:send       | （流式发送，非 CRUD）      |
 */

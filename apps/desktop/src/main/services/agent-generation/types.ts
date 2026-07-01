import type { ChatMessage } from '@toolman/model-gateway'
import type { ContentBlock, Message } from '@toolman/shared'
import type { getAssistantRow } from '../assistant.service'
import type { getProviderConfig } from '../provider.service'
import type { parseAssistantRuntime } from '../agent.service'
import type { DocxWorkingCopy } from '../docx-mcp-task.service'
import type { ExcelWorkingCopy } from '../excel-mcp-task.service'
import type { MessageStreamBuffers } from '../message-stream-buffers'

export type GenerationSendOptions = {
  webSearchEnabled?: boolean
  webSearchProvider?: 'duckduckgo' | 'bing' | 'google'
  memoryEnabled?: boolean
  memoryRetentionDays?: number
  kbEnabled?: boolean
  kbIds?: string[]
  kbTopK?: number
  kbScoreThreshold?: number
  documentOcrEnabled?: boolean
  isHeartbeat?: boolean
  isChannelMessage?: boolean
}

export type RunGenerationOptions = {
  sessionId: string
  assistantMessageId: string
  userMessageId: string
  modelId: string
  assistant: ReturnType<typeof getAssistantRow>
  workspaceId: string
  userText: string
  userContentBlocks: ContentBlock[]
  enableTools: boolean
  mcpServerIds: string[]
  abortControllers: Map<string, AbortController>
  sendOptions?: GenerationSendOptions
}

export type BuildRuntimeSystemHintsOptions = {
  sessionId?: string
  assistant: ReturnType<typeof getAssistantRow>
  runtime: ReturnType<typeof parseAssistantRuntime>
  userText: string
  userContentBlocks?: ContentBlock[]
  enableTools: boolean
  mcpServerIds: string[]
  sendOptions?: GenerationSendOptions
  docxWorkingCopies?: DocxWorkingCopy[]
  excelWorkingCopies?: ExcelWorkingCopy[]
  modelId?: string
}

export type StreamPlainCompletionOptions = {
  sessionId: string
  assistantMessageId: string
  modelId: string
  providerConfig: NonNullable<ReturnType<typeof getProviderConfig>>
  model: string
  chatMessages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  signal: AbortSignal
  onText: (text: string) => void
  onThinking?: (text: string) => void
  onUsage: (usage: Message['tokenUsage']) => void
}

export type ToolUpdatePayload = {
  toolCallId: string
  name: string
  arguments?: string
  result?: string
  status: 'running' | 'done' | 'failed'
}

export type GenerationStreamContext = {
  buffers: MessageStreamBuffers
  appendStatus: (text: string) => void
  appendThinking: (text: string) => void
  appendText: (text: string) => void
  emitToolUpdate: (update: ToolUpdatePayload) => void
  emitThinkingDurationIfNeeded: () => void
  persistBlocks: (immediate?: boolean) => void
}

export const LIST_TOOL_SHORT_NAMES = new Set([
  'fs_list',
  'fs_glob',
  'fs_grep',
  'glob',
  'grep',
  'bash',
  'sql_list_tables',
  'memory_list',
  'agent_task_list',
])

export const TOOL_RESULT_DISPLAY_LIMIT = 800
export const LIST_TOOL_RESULT_DISPLAY_LIMIT = 12000

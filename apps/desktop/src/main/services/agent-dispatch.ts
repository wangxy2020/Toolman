import type { ContentBlock } from '@toolman/shared'

import type { AssistantRow } from '@toolman/db'
import { abortControllers } from './agent-state'
import { runGeneration } from './agent-generation.service'
import { isDocumentOcrEnabled } from './runtime-app-settings.service'
import {
  runChatTaskOrchestration,
  skipExtraAssistantMessages,
} from './task-runtime/chat-task-send.service'
import { shouldEnableTools } from './agent-runtime'

export function dispatchAssistantResponse(options: {
  taskId?: string
  sessionId: string
  assistantMessageIds: string[]
  modelIds: string[]
  userMessageId: string
  userText: string
  userContentBlocks: ContentBlock[]
  assistant: AssistantRow | null
  workspaceId: string
  mcpServerIds: string[]
  sendOptions?: {
    enableTools?: boolean
    webSearchEnabled?: boolean
    webSearchProvider?: 'duckduckgo' | 'bing' | 'google'
    memoryEnabled?: boolean
    memoryRetentionDays?: number
    kbEnabled?: boolean
    kbIds?: string[]
    kbTopK?: number
    kbScoreThreshold?: number
    documentOcrEnabled?: boolean
    taskId?: string
    mcpServerIds?: string[]
  }
}): void {
  const taskId = options.taskId ?? options.sendOptions?.taskId

  if (taskId) {
    skipExtraAssistantMessages({
      sessionId: options.sessionId,
      assistantMessageIds: options.assistantMessageIds.slice(1),
    })

    void runChatTaskOrchestration({
      taskId,
      sessionId: options.sessionId,
      assistantMessageId: options.assistantMessageIds[0]!,
      modelId: options.modelIds[0]!,
      userText: options.userText,
      abortControllers,
    })
    return
  }

  for (let i = 0; i < options.modelIds.length; i++) {
    const assistantMessageId = options.assistantMessageIds[i]!
    const modelId = options.modelIds[i]!

    void runGeneration({
      sessionId: options.sessionId,
      assistantMessageId,
      userMessageId: options.userMessageId,
      modelId,
      assistant: options.assistant,
      workspaceId: options.workspaceId,
      userText: options.userText,
      userContentBlocks: options.userContentBlocks,
      enableTools: shouldEnableTools(
        { enableTools: options.sendOptions?.enableTools },
        options.assistant,
        options.mcpServerIds,
        options.userContentBlocks,
      ),
      mcpServerIds: options.mcpServerIds,
      abortControllers,
      sendOptions: {
        webSearchEnabled: options.sendOptions?.webSearchEnabled,
        webSearchProvider: options.sendOptions?.webSearchProvider,
        memoryEnabled: options.sendOptions?.memoryEnabled,
        memoryRetentionDays: options.sendOptions?.memoryRetentionDays,
        kbEnabled: options.sendOptions?.kbEnabled,
        kbIds: options.sendOptions?.kbIds,
        kbTopK: options.sendOptions?.kbTopK,
        kbScoreThreshold: options.sendOptions?.kbScoreThreshold,
        documentOcrEnabled: options.sendOptions?.documentOcrEnabled ?? isDocumentOcrEnabled(),
      },
    })
  }
}

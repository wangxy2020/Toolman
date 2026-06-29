import type { ChatMessage } from '@toolman/model-gateway'
import { ProviderError } from '@toolman/model-gateway'
import { isGemmaThinkingOllamaModelId } from '@toolman/model-gateway'
import { isOcrVisionModelId, toErrorMessage, type Message } from '@toolman/shared'
import { getMessageRepository } from '../../db/repos'
import { logStructured } from '../structured-log.service'
import { extractMemoriesFromConversation } from '../memory-extractor.service'
import type { getAssistantRow } from '../assistant.service'
import { estimateTokenUsage } from './token-usage'
import { emitStreamEvent } from './emit'
import type { GenerationSendOptions, GenerationStreamContext } from './types'

export function finalizeSuccessfulGeneration(options: {
  sessionId: string
  assistantMessageId: string
  modelId: string
  model: string
  workspaceId: string
  assistant: ReturnType<typeof getAssistantRow>
  chatMessages: ChatMessage[]
  sendOptions?: GenerationSendOptions
  stream: GenerationStreamContext
  usage: Message['tokenUsage']
}): Message['tokenUsage'] {
  let usage = options.usage

  if (
    (isOcrVisionModelId(options.model) || isGemmaThinkingOllamaModelId(options.model)) &&
    options.stream.buffers.promoteThinkingToText()
  ) {
    options.stream.persistBlocks(true)
    emitStreamEvent({
      type: 'message.delta',
      sessionId: options.sessionId,
      messageId: options.assistantMessageId,
      modelId: options.modelId,
      delta: { type: 'text', text: options.stream.buffers.plainText() },
      timestamp: Date.now(),
    })
  }

  if (!usage) {
    const promptText = options.chatMessages.map((m) => m.content).join('\n')
    usage = estimateTokenUsage(promptText, options.stream.buffers.plainText())
  }

  options.stream.emitThinkingDurationIfNeeded()
  options.stream.persistBlocks(true)

  getMessageRepository().update(options.assistantMessageId, {
    status: 'completed',
    tokenUsage: usage,
    contentBlocks: options.stream.buffers.toContentBlocks(),
  })

  emitStreamEvent({
    type: 'message.done',
    sessionId: options.sessionId,
    messageId: options.assistantMessageId,
    tokenUsage: usage,
    contentBlocks: options.stream.buffers.toContentBlocks(),
    timestamp: Date.now(),
  })

  if (
    options.sendOptions?.memoryEnabled &&
    !options.sendOptions.isHeartbeat &&
    !options.sendOptions.isChannelMessage
  ) {
    void extractMemoriesFromConversation({
      workspaceId: options.workspaceId,
      sessionId: options.sessionId,
      assistantId: options.assistant?.id,
      modelId: options.modelId,
    }).catch((error) => {
      logStructured('memory.extractor', 'error', `failed`, { detail: error })
    })
  }

  return usage
}

export function handleGenerationFailure(options: {
  error: unknown
  sessionId: string
  assistantMessageId: string
  startedAt: number
  stream: GenerationStreamContext
}): void {
  const isAbort = options.error instanceof Error && options.error.name === 'AbortError'
  const message = toErrorMessage(options.error, 'Unknown error')
  const ipcError = {
    code: isAbort ? ('ABORTED' as const) : ('PROVIDER_ERROR' as const),
    message,
    retryable: options.error instanceof ProviderError ? options.error.retryable : false,
    details:
      options.error instanceof Error
        ? { name: options.error.name, stack: options.error.stack ?? '' }
        : undefined,
  }

  options.stream.emitThinkingDurationIfNeeded()
  options.stream.persistBlocks(true)

  getMessageRepository().update(options.assistantMessageId, {
    status: isAbort ? 'aborted' : 'failed',
    content: options.stream.buffers.plainText(),
    contentBlocks: options.stream.buffers.toContentBlocks(),
    error: ipcError,
  })

  emitStreamEvent({
    type: 'message.error',
    sessionId: options.sessionId,
    messageId: options.assistantMessageId,
    error: ipcError,
    timestamp: options.startedAt,
  })
}

import { getMessageRepository } from '../../db/repos'
import { MessageStreamBuffers } from '../message-stream-buffers'
import { emitStreamEvent } from './emit'
import type { GenerationStreamContext, ToolUpdatePayload } from './types'

export function createGenerationStreamContext(options: {
  sessionId: string
  assistantMessageId: string
  modelId: string
}): GenerationStreamContext {
  const messages = getMessageRepository()
  const buffers = new MessageStreamBuffers()
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  const persistBlocks = (immediate = false) => {
    const flush = () => {
      persistTimer = null
      messages.updateStreamBlocks(options.assistantMessageId, buffers.toContentBlocks())
    }

    if (immediate) {
      if (persistTimer) {
        clearTimeout(persistTimer)
        persistTimer = null
      }
      flush()
      return
    }

    if (persistTimer) return
    persistTimer = setTimeout(flush, 300)
  }

  const emitThinkingDelta = (text: string) => {
    emitStreamEvent({
      type: 'message.delta',
      sessionId: options.sessionId,
      messageId: options.assistantMessageId,
      modelId: options.modelId,
      delta: { type: 'thinking', text },
      timestamp: Date.now(),
    })
  }

  const appendStatus = (text: string) => {
    buffers.appendStatus(text)
    persistBlocks()
    emitThinkingDelta(text)
  }

  const appendThinking = (text: string) => {
    buffers.appendThinking(text)
    persistBlocks()
    emitThinkingDelta(text)
  }

  const appendText = (text: string) => {
    buffers.appendText(text)
    persistBlocks()

    emitStreamEvent({
      type: 'message.delta',
      sessionId: options.sessionId,
      messageId: options.assistantMessageId,
      modelId: options.modelId,
      delta: { type: 'text', text },
      timestamp: Date.now(),
    })
  }

  const emitToolUpdate = (update: ToolUpdatePayload) => {
    const delta = buffers.upsertTool(update)
    persistBlocks()
    emitStreamEvent({
      type: 'message.delta',
      sessionId: options.sessionId,
      messageId: options.assistantMessageId,
      modelId: options.modelId,
      delta,
      timestamp: Date.now(),
    })
  }

  const emitThinkingDurationIfNeeded = () => {
    buffers.finalizeThinkingDuration()
    const thinkingDurationSeconds = buffers.getThinkingDurationSeconds()
    if (thinkingDurationSeconds === null) return
    emitStreamEvent({
      type: 'message.delta',
      sessionId: options.sessionId,
      messageId: options.assistantMessageId,
      modelId: options.modelId,
      delta: { type: 'thinking', text: '', durationSeconds: thinkingDurationSeconds },
      timestamp: Date.now(),
    })
  }

  return {
    buffers,
    appendStatus,
    appendThinking,
    appendText,
    emitToolUpdate,
    emitThinkingDurationIfNeeded,
    persistBlocks,
  }
}

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

  const emitThinkingDelta = (text: string, durationSeconds?: number | null) => {
    const startedAtMs = buffers.getThinkingStartedAtMs()
    emitStreamEvent({
      type: 'message.delta',
      sessionId: options.sessionId,
      messageId: options.assistantMessageId,
      modelId: options.modelId,
      delta: {
        type: 'thinking',
        text,
        ...(startedAtMs != null ? { startedAtMs } : {}),
        ...(durationSeconds != null ? { durationSeconds } : {}),
      },
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

  const emitThinkingDurationIfNeeded = () => {
    buffers.finalizeThinkingDuration()
    const thinkingDurationSeconds = buffers.getThinkingDurationSeconds()
    if (thinkingDurationSeconds === null) return
    emitThinkingDelta('', thinkingDurationSeconds)
  }

  const appendText = (text: string) => {
    const durationBefore = buffers.getThinkingDurationSeconds()
    buffers.appendText(text)
    persistBlocks()

    // Freeze and publish thinking duration as soon as answer text starts — not only
    // at message.done — so the UI shows wall-clock think time instead of paint time.
    if (durationBefore === null && buffers.getThinkingDurationSeconds() !== null) {
      emitThinkingDurationIfNeeded()
    }

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

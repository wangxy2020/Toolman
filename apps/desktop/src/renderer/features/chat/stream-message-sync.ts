import type { Message, MessageStreamEvent } from '@toolman/shared'
import { applyStreamDelta } from './apply-stream-delta'
import { orderContentBlocks } from './message-utils'

function findStreamTargetIndex(
  messages: Message[],
  messageId: string,
  tempToReal: ReadonlyMap<string, string>,
): number {
  const direct = messages.findIndex((message) => message.id === messageId)
  if (direct >= 0) return direct

  for (const [tempId, realId] of tempToReal) {
    if (realId !== messageId) continue
    const index = messages.findIndex((message) => message.id === tempId)
    if (index >= 0) return index
  }

  return -1
}

export function applyStreamEventToMessages(
  messages: Message[],
  event: MessageStreamEvent,
  tempToReal: ReadonlyMap<string, string>,
): Message[] | null {
  if (event.type === 'message.delta') {
    const index = findStreamTargetIndex(messages, event.messageId, tempToReal)
    if (index < 0) return null

    return messages.map((message, messageIndex) =>
      messageIndex === index
        ? {
            ...message,
            modelId: event.modelId ?? message.modelId,
            contentBlocks: applyStreamDelta(message.contentBlocks, event.delta),
          }
        : message,
    )
  }

  if (event.type === 'message.done') {
    const index = findStreamTargetIndex(messages, event.messageId, tempToReal)
    if (index < 0) return null

    return messages.map((message, messageIndex) =>
      messageIndex === index
        ? {
            ...message,
            status: 'completed',
            tokenUsage: event.tokenUsage,
            contentBlocks: orderContentBlocks(message.contentBlocks),
          }
        : message,
    )
  }

  if (event.type === 'message.error' && event.messageId) {
    const index = findStreamTargetIndex(messages, event.messageId, tempToReal)
    if (index < 0) return null

    return messages.map((message, messageIndex) =>
      messageIndex === index
        ? {
            ...message,
            status: event.error.code === 'ABORTED' ? 'aborted' : 'failed',
            error: event.error,
          }
        : message,
    )
  }

  return null
}

export function flushPendingStreamEvents(
  messages: Message[],
  events: MessageStreamEvent[],
  tempToReal: ReadonlyMap<string, string>,
): Message[] {
  let next = messages
  for (const event of events) {
    const applied = applyStreamEventToMessages(next, event, tempToReal)
    if (applied) next = applied
  }
  return next
}

export function applyStreamEventWithPendingQueue(
  messages: Message[],
  event: MessageStreamEvent,
  tempToReal: ReadonlyMap<string, string>,
  pending: MessageStreamEvent[],
): Message[] {
  const queue = [...pending, event]
  pending.length = 0

  let next = messages
  for (const item of queue) {
    const applied = applyStreamEventToMessages(next, item, tempToReal)
    if (applied) {
      next = applied
      continue
    }
    pending.push(item)
  }

  return next
}

import type { AgentRelayMessage, MessageStreamEvent } from '@toolman/shared'
import { MessageStreamBuffers } from '../../message-stream-buffers'
import { getMessageRepository } from '../../../db/repos'
import { broadcastStreamEvent } from '../../stream-broadcast'
import { activeOwnerRelays, relayStreamBuffers } from './state'

export function remapStreamEventForMember(
  event: MessageStreamEvent,
  mapping: {
    sessionId: string
    messageId: string
  },
): MessageStreamEvent {
  return {
    ...event,
    sessionId: mapping.sessionId,
    messageId: mapping.messageId,
  }
}

export function persistRelayStreamEvent(event: MessageStreamEvent): void {
  if (!event.messageId) return

  const messages = getMessageRepository()

  if (event.type === 'message.done') {
    const blocks =
      event.contentBlocks ?? relayStreamBuffers.get(event.messageId)?.toContentBlocks()
    if (blocks) {
      messages.updateStreamBlocks(event.messageId, blocks)
    }
    relayStreamBuffers.delete(event.messageId)
    messages.update(event.messageId, {
      status: 'completed',
      tokenUsage: event.tokenUsage ?? undefined,
    })
    return
  }

  if (event.type === 'message.error') {
    relayStreamBuffers.delete(event.messageId)
    messages.update(event.messageId, {
      status: 'failed',
      error: event.error,
    })
    return
  }

  if (event.type !== 'message.delta') return

  let buffer = relayStreamBuffers.get(event.messageId)
  if (!buffer) {
    buffer = new MessageStreamBuffers()
    relayStreamBuffers.set(event.messageId, buffer)
  }

  const delta = event.delta
  if (delta.type === 'text') {
    buffer.appendText(delta.text)
  } else if (delta.type === 'thinking') {
    buffer.appendThinking(delta.text)
  } else if (delta.type === 'tool') {
    buffer.upsertTool({
      toolCallId: delta.toolCallId,
      name: delta.name,
      arguments: delta.arguments,
      result: delta.result,
      status: delta.status,
    })
  } else if (delta.type === 'kb_sources') {
    buffer.setKbSources(delta.sources)
  }

  messages.updateStreamBlocks(event.messageId, buffer.toContentBlocks())
}

export function handleMemberStream(message: Extract<AgentRelayMessage, { type: 'stream' }>): void {
  persistRelayStreamEvent(message.event)
  broadcastStreamEvent(message.event)
}

export function clearActiveOwnerRelay(requestId: string): void {
  activeOwnerRelays.get(requestId)?.unsubscribe()
  activeOwnerRelays.delete(requestId)
}

import type { Message } from '@toolman/shared'
import type { MessageTurn, PendingMessageAction } from './message-panel-types'

export function groupMessages(messages: Message[]): MessageTurn[] {
  const turns: MessageTurn[] = []
  let index = 0

  while (index < messages.length) {
    const message = messages[index]
    if (message.role === 'user') {
      turns.push({ type: 'user', message })
      index += 1
      continue
    }

    const parentId = message.parentMessageId
    const group: Message[] = []
    while (
      index < messages.length &&
      messages[index].role === 'assistant' &&
      messages[index].parentMessageId === parentId
    ) {
      group.push(messages[index])
      index += 1
    }
    turns.push({ type: 'assistant-group', messages: group })
  }

  return turns
}

export function isMessageActionPending(
  pending: PendingMessageAction | null | undefined,
  kind: PendingMessageAction['kind'],
  messageId: string,
): boolean {
  return pending?.kind === kind && pending.messageId === messageId
}

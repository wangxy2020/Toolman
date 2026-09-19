import type { ChatMessage } from '@toolman/model-gateway'

/** Keep system prompts and the latest user turn (images stay). Drop older conversation. */
export function compactChatMessagesForContextRetry(messages: ChatMessage[]): ChatMessage[] | null {
  const system = messages.filter((message) => message.role === 'system')
  let lastUserIndex = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      lastUserIndex = index
      break
    }
  }
  if (lastUserIndex < 0) return null
  const compacted = [...system, messages[lastUserIndex]!]
  if (compacted.length >= messages.length) return null
  return compacted
}

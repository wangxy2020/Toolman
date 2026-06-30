import type { Message } from '@toolman/shared'

export const MESSAGE_SCROLL_NEAR_BOTTOM_THRESHOLD_PX = 96

export function isScrollContainerNearBottom(
  element: HTMLElement,
  threshold = MESSAGE_SCROLL_NEAR_BOTTOM_THRESHOLD_PX,
): boolean {
  const distance = element.scrollHeight - element.scrollTop - element.clientHeight
  return distance <= threshold
}

/** Stable key for scroll-on-structure-change (new message / status), not stream deltas. */
export function buildMessagePanelScrollKey(messages: Message[]): string {
  return messages.map((message) => `${message.id}:${message.status}`).join('\n')
}

export function buildStreamScrollKey(messages: Message[]): string {
  const tail = messages[messages.length - 1]
  if (!tail) return ''
  let textLength = 0
  let thinkingLength = 0
  for (const block of tail.contentBlocks) {
    if (block.type === 'text') textLength += block.text.length
    if (block.type === 'thinking') thinkingLength += block.text.length
  }
  return `${tail.id}:${tail.status}:${textLength}:${thinkingLength}`
}

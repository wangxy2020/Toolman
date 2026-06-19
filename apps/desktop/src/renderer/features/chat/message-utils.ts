import type { ContentBlock, Message } from '@toolman/shared'

const CONTENT_BLOCK_ORDER: Record<ContentBlock['type'], number> = {
  thinking: 0,
  kb_sources: 1,
  tool: 2,
  file: 3,
  image: 4,
  text: 5,
}

/** 与 MessageStreamBuffers 一致：思考过程在回答正文之前 */
export function orderContentBlocks(blocks: ContentBlock[]): ContentBlock[] {
  return blocks
    .map((block, index) => ({ block, index }))
    .sort((left, right) => {
      const order =
        CONTENT_BLOCK_ORDER[left.block.type] - CONTENT_BLOCK_ORDER[right.block.type]
      return order !== 0 ? order : left.index - right.index
    })
    .map(({ block }) => block)
}

export function getBlocksText(blocks: ContentBlock[]): string {
  return blocks
    .filter((block) => block.type === 'text')
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('\n')
}

export function getMessageText(message: Message): string {
  return getBlocksText(message.contentBlocks)
}

export function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${month}/${day} ${hours}:${minutes}`
}

export function formatTokenUsage(usage: Message['tokenUsage']): string | null {
  if (!usage) return null
  return `Tokens: ${usage.total} ↑${usage.prompt} ↓${usage.completion}`
}

export function formatUserTokens(message: Message): string {
  if (message.tokenUsage) return `Tokens: ${message.tokenUsage.total}`
  const text = getMessageText(message)
  return `Tokens: ${Math.max(1, Math.ceil(text.length / 4))}`
}

export function formatAssistantTokens(message: Message): string {
  if (message.tokenUsage) {
    return `Tokens: ${message.tokenUsage.total} ↑${message.tokenUsage.prompt} ↓${message.tokenUsage.completion}`
  }
  const text = getMessageText(message)
  const completion = Math.max(1, Math.ceil(text.length / 4))
  return `Tokens: ${completion} ↓${completion}`
}

export async function copyMessageText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

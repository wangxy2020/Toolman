import { EPC_COMMERCIAL_AGENT_CONTEXT_METADATA_KEY, type ContentBlock } from '@toolman/shared'

const CONTEXT_PREFIX = `<!-- ${EPC_COMMERCIAL_AGENT_CONTEXT_METADATA_KEY} -->\n`

export function isEpcAgentContextText(text: string): boolean {
  return text.startsWith(CONTEXT_PREFIX)
}

export function buildEpcUserContentBlocks(
  visibleText: string,
  agentContext: string,
  attachmentBlocks: ContentBlock[] = [],
): ContentBlock[] {
  const blocks: ContentBlock[] = [...attachmentBlocks]
  const trimmedVisible = visibleText.trim()
  if (trimmedVisible) {
    blocks.push({ type: 'text', text: trimmedVisible })
  }
  if (agentContext.trim()) {
    blocks.push({ type: 'text', text: `${CONTEXT_PREFIX}${agentContext.trim()}` })
  }
  return blocks
}

export function getUserVisibleTextBlocks(blocks: ContentBlock[]): ContentBlock[] {
  return blocks.filter(
    (block) => block.type !== 'text' || !isEpcAgentContextText(block.text),
  )
}

import type { ContentBlock, StreamDelta } from '@toolman/shared'
import { orderContentBlocks } from './message-utils'

function findLastTextBlockIndex(blocks: ContentBlock[]): number {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    if (blocks[index]?.type === 'text') return index
  }
  return -1
}

export function applyStreamDelta(blocks: ContentBlock[], delta: StreamDelta): ContentBlock[] {
  const next = [...blocks]

  if (delta.type === 'text') {
    const index = findLastTextBlockIndex(next)
    if (index >= 0) {
      const current = next[index]
      if (current?.type === 'text') {
        next[index] = { type: 'text', text: current.text + delta.text }
        return next
      }
    }
    return [...next, { type: 'text', text: delta.text }]
  }

  if (delta.type === 'thinking') {
    const existingIndex = next.findIndex((block) => block.type === 'thinking')
    let thinkingText = delta.text
    let previousDuration: number | undefined
    if (existingIndex >= 0) {
      const current = next[existingIndex]
      if (current?.type === 'thinking') {
        if (delta.text) {
          thinkingText = current.text + delta.text
        } else {
          thinkingText = current.text
        }
        previousDuration = current.durationSeconds
        next.splice(existingIndex, 1)
      }
    }

    const thinkingBlock = {
      type: 'thinking' as const,
      text: thinkingText,
      ...(delta.durationSeconds !== undefined
        ? { durationSeconds: delta.durationSeconds }
        : previousDuration !== undefined
          ? { durationSeconds: previousDuration }
          : {}),
    }
    const firstTextIndex = next.findIndex((block) => block.type === 'text')
    if (firstTextIndex >= 0) {
      next.splice(firstTextIndex, 0, thinkingBlock)
    } else {
      next.unshift(thinkingBlock)
    }
    return orderContentBlocks(next)
  }

  if (delta.type === 'kb_sources') {
    const index = next.findIndex((block) => block.type === 'kb_sources')
    const kbBlock = { type: 'kb_sources' as const, sources: delta.sources }
    if (index >= 0) {
      next[index] = kbBlock
    } else {
      next.push(kbBlock)
    }
    return next
  }

  const index = next.findIndex(
    (block) => block.type === 'tool' && block.toolCallId === delta.toolCallId,
  )
  const toolBlock = {
    type: 'tool' as const,
    toolCallId: delta.toolCallId,
    name: delta.name,
    arguments: delta.arguments,
    result: delta.result,
    status: delta.status,
  }
  if (index >= 0) {
    next[index] = toolBlock
  } else {
    next.push(toolBlock)
  }
  return next
}

export function hasStructuredBlocks(blocks: ContentBlock[]): boolean {
  return blocks.some(
    (block) =>
      block.type === 'tool' ||
      block.type === 'thinking' ||
      block.type === 'kb_sources' ||
      block.type === 'image' ||
      block.type === 'local_file_links',
  )
}

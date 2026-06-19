import type { NoteBlock } from './notes-storage'

export type NoteOutlineLevel = 1 | 2 | 3 | 4 | 5 | 6

export interface NoteOutlineItem {
  id: string
  level: NoteOutlineLevel
  text: string
  lineIndex: number
  target: 'title' | 'content' | 'block'
  blockId?: string
}

function stripMarkdownInline(text: string): string {
  return text
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim()
}

function extractFromMarkdown(title: string, content: string): NoteOutlineItem[] {
  const items: NoteOutlineItem[] = []
  let index = 0

  if (title.trim()) {
    items.push({
      id: `note-heading-${index++}`,
      level: 1,
      text: title.trim(),
      lineIndex: -1,
      target: 'title',
    })
  }

  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]?.match(/^(#{1,6})\s+(.+)$/)
    if (!match) continue
    items.push({
      id: `note-heading-${index++}`,
      level: Math.min(6, match[1].length) as NoteOutlineLevel,
      text: stripMarkdownInline(match[2] ?? '') || '（空标题）',
      lineIndex: i,
      target: 'content',
    })
  }

  return items
}

function extractFromBlocks(title: string, blocks: NoteBlock[]): NoteOutlineItem[] {
  const items: NoteOutlineItem[] = []
  let index = 0

  if (title.trim()) {
    items.push({
      id: `note-heading-${index++}`,
      level: 1,
      text: title.trim(),
      lineIndex: -1,
      target: 'title',
    })
  }

  for (const block of blocks) {
    if (block.type !== 'h1' && block.type !== 'h2' && block.type !== 'h3') continue
    const level = block.type === 'h1' ? 1 : block.type === 'h2' ? 2 : 3
    items.push({
      id: `note-heading-${index++}`,
      level,
      text: block.text.trim() || '（空标题）',
      lineIndex: -1,
      target: 'block',
      blockId: block.id,
    })
  }

  return items
}

export function extractNoteOutline(
  title: string,
  content: string,
  options?: { blocks?: NoteBlock[]; editorMode?: 'markdown' | 'blocks' },
): NoteOutlineItem[] {
  if (options?.editorMode === 'blocks' && options.blocks && options.blocks.length > 0) {
    return extractFromBlocks(title, options.blocks)
  }
  return extractFromMarkdown(title, content)
}

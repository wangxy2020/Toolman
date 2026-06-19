import { blocksToMarkdown } from './notes-blocks'
import type { NoteItem } from './notes-storage'

export function buildChatWithNoteDraft(note: NoteItem): string {
  const body =
    note.editorMode === 'blocks' && note.blocks?.length
      ? blocksToMarkdown(note.blocks)
      : note.content
  return `请基于以下笔记回答我的问题。\n\n# ${note.title}\n\n${body}\n\n---\n我的问题：`
}

import type { NoteBlock, NoteItem, NotesSearchHit } from './types'
import { getNotesData } from './storage'

export function blocksToMarkdown(blocks: NoteBlock[]): string {
  let orderedIndex = 1
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'h1':
          orderedIndex = 1
          return `# ${block.text}`
        case 'h2':
          orderedIndex = 1
          return `## ${block.text}`
        case 'h3':
          orderedIndex = 1
          return `### ${block.text}`
        case 'bullet':
          orderedIndex = 1
          return `- ${block.text}`
        case 'quote':
          orderedIndex = 1
          return `> ${block.text}`
        case 'ordered': {
          const line = `${orderedIndex}. ${block.text}`
          orderedIndex += 1
          return line
        }
        case 'task':
          orderedIndex = 1
          return `- [${block.checked ? 'x' : ' '}] ${block.text}`
        case 'code':
          orderedIndex = 1
          return `\`\`\`\n${block.text}\n\`\`\``
        case 'divider':
          orderedIndex = 1
          return '---'
        default:
          orderedIndex = 1
          return block.text
      }
    })
    .join('\n')
}

export function noteToMarkdown(note: NoteItem): string {
  const body =
    note.editorMode === 'blocks' && note.blocks?.length
      ? blocksToMarkdown(note.blocks)
      : note.content
  const tags = (note.tags ?? []).length > 0 ? `\n\n标签: ${note.tags.join(', ')}` : ''
  return `# ${note.title}\n\n${body}${tags}`.trim()
}

export function searchNotesData(
  query: string,
  options?: { tag?: string | null; notebookId?: string | null; limit?: number },
): NotesSearchHit[] {
  const data = getNotesData()
  const trimmed = query.trim().toLowerCase()
  const tagFilter = options?.tag?.trim().toLowerCase()
  const notebookFilter = options?.notebookId
  const limit = options?.limit ?? 20

  const filtered = data.notes.filter((note) => {
    if (notebookFilter && note.notebookId !== notebookFilter) return false
    if (tagFilter && !(note.tags ?? []).some((tag) => tag.toLowerCase() === tagFilter)) return false
    return true
  })

  const scored = trimmed
    ? filtered
        .map((note) => {
          const title = note.title.toLowerCase()
          const content = (note.editorMode === 'blocks'
            ? blocksToMarkdown(note.blocks ?? [])
            : note.content
          ).toLowerCase()
          const tags = (note.tags ?? []).join(' ').toLowerCase()
          let score = 0
          if (title.includes(trimmed)) score += title.startsWith(trimmed) ? 12 : 8
          if (content.includes(trimmed)) score += 4
          if (tags.includes(trimmed)) score += 6
          const snippetSource =
            note.editorMode === 'blocks'
              ? blocksToMarkdown(note.blocks ?? [])
              : note.content
          const snippet = snippetSource.replace(/\s+/g, ' ').trim().slice(0, 160)
          return { note, score, snippet }
        })
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score || right.note.title.localeCompare(left.note.title, 'zh-CN'))
    : filtered
        .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
        .map((note) => ({
          note,
          score: 0,
          snippet: (note.editorMode === 'blocks'
            ? blocksToMarkdown(note.blocks ?? [])
            : note.content
          )
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 160),
        }))

  return scored.slice(0, limit).map(({ note, score, snippet }) => ({
    noteId: note.id,
    notebookId: note.notebookId,
    title: note.title,
    tags: note.tags ?? [],
    score,
    snippet,
  }))
}

export function readNoteData(noteId: string): { note: NoteItem; markdown: string } | null {
  const note = getNotesData().notes.find((item) => item.id === noteId)
  if (!note) return null
  return { note, markdown: noteToMarkdown(note) }
}

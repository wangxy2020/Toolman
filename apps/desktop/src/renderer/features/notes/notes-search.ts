import type { NoteItem } from './notes-storage'

export interface NotesSearchResult {
  note: NoteItem
  notebookId: string
  score: number
}

export function searchNotes(
  notes: NoteItem[],
  query: string,
  options?: { tag?: string | null; notebookId?: string | null },
): NotesSearchResult[] {
  const trimmed = query.trim().toLowerCase()
  const tagFilter = options?.tag?.trim().toLowerCase()
  const notebookFilter = options?.notebookId

  const filtered = notes.filter((note) => {
    if (notebookFilter && note.notebookId !== notebookFilter) return false
    if (tagFilter && !(note.tags ?? []).some((tag) => tag.toLowerCase() === tagFilter)) return false
    return true
  })

  if (!trimmed) {
    return filtered
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((note) => ({ note, notebookId: note.notebookId, score: 0 }))
  }

  return filtered
    .map((note) => {
      const title = note.title.toLowerCase()
      const content = note.content.toLowerCase()
      const tags = (note.tags ?? []).join(' ').toLowerCase()
      let score = 0
      if (title.includes(trimmed)) score += title.startsWith(trimmed) ? 12 : 8
      if (content.includes(trimmed)) score += 4
      if (tags.includes(trimmed)) score += 6
      return { note, notebookId: note.notebookId, score }
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || right.note.updatedAt - left.note.updatedAt)
}

export function collectAllTags(notes: NoteItem[]): string[] {
  const set = new Set<string>()
  for (const note of notes) {
    for (const tag of note.tags ?? []) set.add(tag)
  }
  return [...set].sort((left, right) => left.localeCompare(right, 'zh-CN'))
}

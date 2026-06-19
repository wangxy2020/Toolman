import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  NotesDataSyncInputSchema,
  NotesIngestToKbInputSchema,
  NotesIngestToKbOutputSchema,
} from '@toolman/shared'
import { ingestKnowledgeDocuments } from './knowledge-document.service'
import { resolveKnowledgeBaseStoragePath } from './knowledge-kb-storage-path.service'
import { getKnowledgeBaseRepository } from '../db/repos'

interface NoteBlock {
  type: string
  text: string
  checked?: boolean
}

interface NoteItem {
  id: string
  notebookId: string
  title: string
  content: string
  editorMode: 'markdown' | 'blocks'
  blocks: NoteBlock[]
  tags: string[]
  updatedAt?: number
}

interface NotebookItem {
  id: string
  name: string
  isDefault?: boolean
}

interface NotesData {
  notebooks: NotebookItem[]
  notes: NoteItem[]
  syncFolderPath: string | null
}

export interface NotesSearchHit {
  noteId: string
  notebookId: string
  title: string
  tags: string[]
  score: number
  snippet: string
}

const NOTES_DATA_PATH = () => join(app.getPath('userData'), 'notes-data.json')

let cachedData: NotesData = { notebooks: [], notes: [], syncFolderPath: null }

function createEmptyData(): NotesData {
  return { notebooks: [], notes: [], syncFolderPath: null }
}

function loadFromDisk(): NotesData {
  const path = NOTES_DATA_PATH()
  if (!existsSync(path)) return createEmptyData()
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<NotesData>
    return {
      notebooks: Array.isArray(parsed.notebooks) ? parsed.notebooks : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      syncFolderPath: parsed.syncFolderPath ?? null,
    }
  } catch {
    return createEmptyData()
  }
}

export function getNotesData(): NotesData {
  if (cachedData.notes.length === 0 && cachedData.notebooks.length === 0) {
    cachedData = loadFromDisk()
  }
  return cachedData
}

export function getNotesDataJson(): string {
  return JSON.stringify(getNotesData())
}

export function syncNotesData(input: unknown): { synced: boolean } {
  const { dataJson } = NotesDataSyncInputSchema.parse(input)
  try {
    const parsed = JSON.parse(dataJson) as Partial<NotesData>
    cachedData = {
      notebooks: Array.isArray(parsed.notebooks) ? parsed.notebooks : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      syncFolderPath: parsed.syncFolderPath ?? null,
    }
    writeFileSync(NOTES_DATA_PATH(), JSON.stringify(cachedData), 'utf8')
    return { synced: true }
  } catch {
    return { synced: false }
  }
}

function blocksToMarkdown(blocks: NoteBlock[]): string {
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

export function getNoteById(noteId: string): NoteItem | null {
  return getNotesData().notes.find((item) => item.id === noteId) ?? null
}

export function upsertNoteItem(note: NoteItem): void {
  const data = getNotesData()
  const index = data.notes.findIndex((item) => item.id === note.id)
  const nextNotes =
    index >= 0
      ? data.notes.map((item, itemIndex) => (itemIndex === index ? note : item))
      : [note, ...data.notes]

  cachedData = {
    ...data,
    notes: nextNotes,
  }
  writeFileSync(NOTES_DATA_PATH(), JSON.stringify(cachedData), 'utf8')
}

function sanitizeFileName(name: string): string {
  const trimmed = name.trim() || '笔记'
  return trimmed.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 80)
}

export async function ingestNotesToKnowledgeBase(input: unknown) {
  const data = NotesIngestToKbInputSchema.parse(input)
  const kb = getKnowledgeBaseRepository().findRowById(data.kbId, data.workspaceId)
  if (!kb) {
    throw new Error('知识库不存在')
  }

  const notesData = getNotesData()
  let notes = notesData.notes
  if (data.notebookId) {
    notes = notes.filter((item) => item.notebookId === data.notebookId)
  }
  if (data.noteIds?.length) {
    const idSet = new Set(data.noteIds)
    notes = notes.filter((item) => idSet.has(item.id))
  }

  if (notes.length === 0) {
    return NotesIngestToKbOutputSchema.parse({ queued: 0, skipped: 0, noteCount: 0 })
  }

  const storagePath = resolveKnowledgeBaseStoragePath(
    { workspaceId: data.workspaceId, name: kb.name, kind: kb.kind as 'local' | 'network' },
    { ensure: true },
  )
  if (!storagePath) {
    throw new Error('无法解析知识库存储路径')
  }

  const importDir = join(storagePath, 'notes-import')
  if (!existsSync(importDir)) {
    mkdirSync(importDir, { recursive: true })
  }

  const filePaths: string[] = []
  for (const note of notes) {
    const fileName = `${note.id}-${sanitizeFileName(note.title)}.md`
    const filePath = join(importDir, fileName)
    writeFileSync(filePath, noteToMarkdown(note), 'utf8')
    filePaths.push(filePath)
  }

  const result = await ingestKnowledgeDocuments({
    workspaceId: data.workspaceId,
    kbId: data.kbId,
    filePaths,
  })

  return NotesIngestToKbOutputSchema.parse({
    queued: result.queued,
    skipped: result.skipped,
    noteCount: notes.length,
  })
}

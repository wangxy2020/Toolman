import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { NotesIngestToKbInputSchema, NotesIngestToKbOutputSchema } from '@toolman/shared'
import { ingestKnowledgeDocuments } from '../knowledge-document.service'
import { resolveKnowledgeBaseStoragePath } from '../knowledge-kb-storage-path.service'
import { getKnowledgeBaseRepository } from '../../db/repos'
import { getNotesData } from './storage'
import { noteToMarkdown } from './search'

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
    {
      workspaceId: data.workspaceId,
      name: kb.name,
      kind: kb.kind as 'local' | 'network',
      description: kb.description,
    },
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

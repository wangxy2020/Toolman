import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { NotesDataSyncInputSchema } from '@toolman/shared'
import { logStructured } from '../structured-log.service'
import {
  ensureNotebookForNote,
  preserveGroupNotebookId,
  resolveProjectedGroupNoteNotebookId,
} from '../p2p/note-notebook-placement'
import { getSharedResourceRepo, readMetadataNotebookId } from '../p2p/note-sync-utils'
import { reconcileNotesDataGroupPlacement } from './reconcile-group-placement'
import type { NoteItem, NotesData } from './types'

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
  } catch (error) {
    logStructured('notes', 'warn', `notes-data.json parse failed, resetting: ${String(error)}`)
    return createEmptyData()
  }
}

export function getNotesData(): NotesData {
  if (cachedData.notes.length === 0 && cachedData.notebooks.length === 0) {
    cachedData = reconcileNotesDataGroupPlacement(loadFromDisk())
  }
  return cachedData
}

export function getNotesDataJson(): string {
  cachedData = reconcileNotesDataGroupPlacement(getNotesData())
  return JSON.stringify(cachedData)
}

export function syncNotesData(input: unknown): { synced: boolean } {
  const { dataJson } = NotesDataSyncInputSchema.parse(input)
  try {
    const parsed = JSON.parse(dataJson) as Partial<NotesData>
    cachedData = reconcileNotesDataGroupPlacement({
      notebooks: Array.isArray(parsed.notebooks) ? parsed.notebooks : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      syncFolderPath: parsed.syncFolderPath ?? null,
    })
    writeFileSync(NOTES_DATA_PATH(), JSON.stringify(cachedData), 'utf8')
    return { synced: true }
  } catch {
    return { synced: false }
  }
}

function resolveUpsertNotebookId(note: NoteItem, existing?: NoteItem): string {
  const preserved = preserveGroupNotebookId(existing?.notebookId, note.notebookId)
  const sharedRepo = getSharedResourceRepo()
  const resources = sharedRepo.listActiveByLocalResource(note.id, 'Note')
  for (const resource of resources) {
    const ownerNotebookId = readMetadataNotebookId(resource) ?? 'notebook-default'
    const resolved = resolveProjectedGroupNoteNotebookId(
      resource.workspaceId,
      resource.sharedBy,
      ownerNotebookId,
    )
    if (resolved !== preserved) {
      return resolved
    }
  }
  return preserved
}

export function upsertNoteItem(note: NoteItem): void {
  const data = getNotesData()
  const existing = data.notes.find((item) => item.id === note.id)
  const notebookId = resolveUpsertNotebookId(note, existing)
  const nextNote = { ...note, notebookId }
  const index = data.notes.findIndex((item) => item.id === note.id)
  const nextNotes =
    index >= 0
      ? data.notes.map((item, itemIndex) => (itemIndex === index ? nextNote : item))
      : [nextNote, ...data.notes]

  let nextData: NotesData = {
    ...data,
    notebooks: ensureNotebookForNote(data.notebooks, notebookId),
    notes: nextNotes,
  }
  nextData = reconcileNotesDataGroupPlacement(nextData)

  cachedData = nextData
  writeFileSync(NOTES_DATA_PATH(), JSON.stringify(cachedData), 'utf8')
}

export function getNoteById(noteId: string): NoteItem | null {
  return getNotesData().notes.find((item) => item.id === noteId) ?? null
}

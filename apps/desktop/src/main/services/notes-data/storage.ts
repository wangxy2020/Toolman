import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { NotesDataSyncInputSchema } from '@toolman/shared'
import { logStructured } from '../structured-log.service'
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

export function getNoteById(noteId: string): NoteItem | null {
  return getNotesData().notes.find((item) => item.id === noteId) ?? null
}

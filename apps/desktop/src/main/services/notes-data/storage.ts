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
import { isMobileSyncPreferenceEnabled } from '../mobile-sync.config'
import { publishNoteDeleteSyncChange, publishNoteSyncChange } from '../mobile-sync-store'
import { reconcileNotesDataGroupPlacement } from './reconcile-group-placement'
import type { NoteItem, NotesData } from './types'

const NOTES_DATA_PATH = () => join(app.getPath('userData'), 'notes-data.json')

let cachedData: NotesData = { notebooks: [], notes: [], syncFolderPath: null, deletedNotes: [] }

function createEmptyData(): NotesData {
  return { notebooks: [], notes: [], syncFolderPath: null, deletedNotes: [] }
}

function normalizeTombstones(
  value: NotesData['deletedNotes'],
): Array<{ id: string; deletedAt: number }> {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is { id: string; deletedAt: number } =>
      Boolean(item) && typeof item.id === 'string' && typeof item.deletedAt === 'number',
  )
}

function rememberTombstone(
  current: Array<{ id: string; deletedAt: number }>,
  noteId: string,
  deletedAt: number,
): Array<{ id: string; deletedAt: number }> {
  const next = new Map(current.map((item) => [item.id, item.deletedAt]))
  const previous = next.get(noteId) ?? 0
  if (deletedAt >= previous) next.set(noteId, deletedAt)
  return Array.from(next.entries()).map(([id, at]) => ({ id, deletedAt: at }))
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
      deletedNotes: normalizeTombstones(parsed.deletedNotes),
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
    const previous = getNotesData()
    const previousIds = new Set(previous.notes.map((note) => note.id))
    const incomingNotes = Array.isArray(parsed.notes) ? parsed.notes : []
    const tombstones = new Map(
      normalizeTombstones(previous.deletedNotes).map((item) => [item.id, item.deletedAt]),
    )
    const removedAt = Date.now()
    const incomingIds = new Set(incomingNotes.map((note) => note.id))
    for (const id of previousIds) {
      if (incomingIds.has(id)) continue
      tombstones.set(id, removedAt)
      publishNoteDeleteSyncChange(id, removedAt)
    }
    const keptNotes = incomingNotes.filter((note) => {
      const tomb = tombstones.get(note.id)
      if (tomb != null && tomb >= (note.updatedAt ?? 0)) return false
      tombstones.delete(note.id)
      return true
    })
    cachedData = reconcileNotesDataGroupPlacement({
      notebooks: Array.isArray(parsed.notebooks) ? parsed.notebooks : [],
      notes: keptNotes,
      syncFolderPath: parsed.syncFolderPath ?? null,
      deletedNotes: Array.from(tombstones.entries()).map(([id, deletedAt]) => ({ id, deletedAt })),
    })
    writeFileSync(NOTES_DATA_PATH(), JSON.stringify(cachedData), 'utf8')
    publishNotesForMobileSync(cachedData.notes)
    return { synced: true }
  } catch {
    return { synced: false }
  }
}

function publishNotesForMobileSync(notes: NoteItem[]): void {
  if (!isMobileSyncPreferenceEnabled()) return
  for (const note of notes) {
    publishNoteSyncChange({
      id: note.id,
      title: note.title,
      content: note.content,
      updatedAt: note.updatedAt,
    })
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

export function upsertNoteItem(
  note: NoteItem,
  options?: { skipSyncPublish?: boolean },
): void {
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
    deletedNotes: (data.deletedNotes ?? []).filter((item) => item.id !== nextNote.id),
  }
  nextData = reconcileNotesDataGroupPlacement(nextData)

  cachedData = nextData
  writeFileSync(NOTES_DATA_PATH(), JSON.stringify(cachedData), 'utf8')
  if (!options?.skipSyncPublish) {
    publishNotesForMobileSync([nextNote])
  }
}

export function deleteNoteItem(
  noteId: string,
  options?: { skipSyncPublish?: boolean; deletedAt?: number },
): void {
  const data = getNotesData()
  const deletedAt = options?.deletedAt ?? Date.now()
  const nextNotes = data.notes.filter((item) => item.id !== noteId)
  cachedData = {
    ...data,
    notes: nextNotes,
    deletedNotes: rememberTombstone(data.deletedNotes ?? [], noteId, deletedAt),
  }
  writeFileSync(NOTES_DATA_PATH(), JSON.stringify(cachedData), 'utf8')
  if (!options?.skipSyncPublish) {
    publishNoteDeleteSyncChange(noteId, deletedAt)
  }
}

export function getNoteById(noteId: string): NoteItem | null {
  return getNotesData().notes.find((item) => item.id === noteId) ?? null
}

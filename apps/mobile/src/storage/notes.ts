import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const STORE_KEY = 'toolman.mobile.notes.v1'

export const DEFAULT_NOTEBOOK_ID = 'notebook-default'

export type MobileNotebook = {
  id: string
  name: string
  isDefault?: boolean
}

export type MobileNote = {
  id: string
  notebookId: string
  title: string
  body: string
  updatedAt: number
}

export type NoteTombstone = {
  id: string
  deletedAt: number
}

export type NotesStore = {
  notebooks: MobileNotebook[]
  notes: MobileNote[]
  activeNoteId: string | null
  deletedNotes: NoteTombstone[]
}

export function rememberDeletedNotes(
  existing: NoteTombstone[],
  ids: string[],
  deletedAt = Date.now(),
): NoteTombstone[] {
  const next = new Map(existing.map((item) => [item.id, item.deletedAt]))
  for (const id of ids) {
    const previous = next.get(id) ?? 0
    if (deletedAt >= previous) next.set(id, deletedAt)
  }
  return Array.from(next.entries()).map(([id, at]) => ({ id, deletedAt: at }))
}

function createDefaultNotebooks(): MobileNotebook[] {
  return [{ id: DEFAULT_NOTEBOOK_ID, name: '默认笔记本', isDefault: true }]
}

const EMPTY: NotesStore = {
  notebooks: createDefaultNotebooks(),
  notes: [],
  activeNoteId: null,
  deletedNotes: [],
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(key) ?? null
    } catch {
      return null
    }
  }
  try {
    return await SecureStore.getItemAsync(key)
  } catch {
    return null
  }
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(key, value)
    } catch {
      // ignore
    }
    return
  }
  await SecureStore.setItemAsync(key, value)
}

function normalizeNotebook(value: unknown): MobileNotebook | null {
  if (!value || typeof value !== 'object') return null
  const n = value as Partial<MobileNotebook>
  if (typeof n.id !== 'string' || typeof n.name !== 'string') return null
  return {
    id: n.id,
    name: n.name,
    isDefault: Boolean(n.isDefault),
  }
}

function normalizeNote(value: unknown, fallbackNotebookId: string): MobileNote | null {
  if (!value || typeof value !== 'object') return null
  const n = value as Partial<MobileNote>
  if (
    typeof n.id !== 'string' ||
    typeof n.title !== 'string' ||
    typeof n.body !== 'string' ||
    typeof n.updatedAt !== 'number'
  ) {
    return null
  }
  return {
    id: n.id,
    notebookId: typeof n.notebookId === 'string' ? n.notebookId : fallbackNotebookId,
    title: n.title,
    body: n.body,
    updatedAt: n.updatedAt,
  }
}

export function createNotebookId(): string {
  return `notebook-${Date.now().toString(36)}`
}

export function createNoteId(): string {
  return `note-${Date.now().toString(36)}`
}

export function buildNotebookName(existing: MobileNotebook[]): string {
  const used = new Set(existing.map((item) => item.name))
  let index = existing.filter((item) => !item.isDefault).length + 1
  let candidate = index === 1 ? '笔记本' : `笔记本 ${index}`
  while (used.has(candidate)) {
    index += 1
    candidate = `笔记本 ${index}`
  }
  return candidate
}

export function buildNoteTitle(
  notes: MobileNote[],
  notebookId: string,
  date = new Date(),
): string {
  const base = date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
  const inNotebook = notes.filter((item) => item.notebookId === notebookId)
  const used = new Set(inNotebook.map((item) => item.title))
  if (!used.has(base)) return base

  let index = 2
  while (used.has(`${base} (${index})`)) {
    index += 1
  }
  return `${base} (${index})`
}

function ensureDefaultNotebook(notebooks: MobileNotebook[]): MobileNotebook[] {
  if (notebooks.some((item) => item.id === DEFAULT_NOTEBOOK_ID || item.isDefault)) {
    return notebooks
  }
  return [...createDefaultNotebooks(), ...notebooks]
}

function normalizeTombstone(value: unknown): NoteTombstone | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<NoteTombstone>
  if (typeof item.id !== 'string' || typeof item.deletedAt !== 'number') return null
  return { id: item.id, deletedAt: item.deletedAt }
}

export function normalizeNotesStore(parsed: {
  notebooks?: unknown
  notes?: unknown
  activeNoteId?: unknown
  deletedNotes?: unknown
}): NotesStore {
  let notebooks = Array.isArray(parsed.notebooks)
    ? parsed.notebooks.map(normalizeNotebook).filter((n): n is MobileNotebook => Boolean(n))
    : []
  notebooks = ensureDefaultNotebook(notebooks)
  const defaultId =
    notebooks.find((item) => item.isDefault)?.id ?? notebooks[0]?.id ?? DEFAULT_NOTEBOOK_ID
  const notes = Array.isArray(parsed.notes)
    ? parsed.notes
        .map((item) => normalizeNote(item, defaultId))
        .filter((n): n is MobileNote => Boolean(n))
    : []
  notes.sort((a, b) => b.updatedAt - a.updatedAt)

  const notebookIds = new Set(notebooks.map((item) => item.id))
  for (const note of notes) {
    if (!notebookIds.has(note.notebookId)) {
      note.notebookId = defaultId
    }
  }

  const liveIds = new Set(notes.map((note) => note.id))
  const deletedNotes = Array.isArray(parsed.deletedNotes)
    ? parsed.deletedNotes
        .map(normalizeTombstone)
        .filter((item): item is NoteTombstone => item != null && !liveIds.has(item.id))
    : []

  const activeNoteId =
    typeof parsed.activeNoteId === 'string' && notes.some((n) => n.id === parsed.activeNoteId)
      ? parsed.activeNoteId
      : (notes[0]?.id ?? null)
  return { notebooks, notes, activeNoteId, deletedNotes }
}

export function parseNotesBackup(raw: string): NotesStore | null {
  try {
    const parsed = JSON.parse(raw) as {
      notebooks?: unknown
      notes?: unknown
      activeNoteId?: unknown
      deletedNotes?: unknown
    }
    if (!parsed || typeof parsed !== 'object') return null
    const store = normalizeNotesStore(parsed)
    if (store.notes.length === 0 && !Array.isArray((parsed as { notes?: unknown }).notes)) {
      return null
    }
    return store
  } catch {
    return null
  }
}

export function serializeNotesBackup(store: NotesStore): string {
  return JSON.stringify(
    {
      notebooks: store.notebooks,
      notes: store.notes,
      activeNoteId: store.activeNoteId,
      deletedNotes: store.deletedNotes,
    },
    null,
    2,
  )
}

export async function loadNotesStore(): Promise<NotesStore> {
  try {
    const raw = await getItem(STORE_KEY)
    if (!raw) return { ...EMPTY, notebooks: createDefaultNotebooks() }
    const parsed = JSON.parse(raw) as {
      notebooks?: unknown
      notes?: unknown
      activeNoteId?: unknown
      deletedNotes?: unknown
    }
    return normalizeNotesStore(parsed)
  } catch {
    return { ...EMPTY, notebooks: createDefaultNotebooks() }
  }
}

export async function saveNotesStore(store: NotesStore): Promise<void> {
  await setItem(
    STORE_KEY,
    JSON.stringify({
      notebooks: store.notebooks,
      notes: store.notes,
      activeNoteId: store.activeNoteId,
      deletedNotes: store.deletedNotes,
    }),
  )
}

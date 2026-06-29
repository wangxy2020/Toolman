import { IpcChannel } from '@toolman/shared'

export const DEFAULT_NOTEBOOK_ID = 'notebook-default'
export const NOTES_STORAGE_KEY = 'toolman:notes-data'
export const MAX_NOTE_VERSIONS = 30

export type NoteEditorMode = 'markdown' | 'blocks'
export type NoteBlockType =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'ordered'
  | 'quote'
  | 'code'
  | 'task'
  | 'divider'

export interface NoteBlock {
  id: string
  type: NoteBlockType
  text: string
  checked?: boolean
}

export interface NoteVersion {
  id: string
  title: string
  content: string
  createdAt: number
}

export interface NoteAttachment {
  id: string
  name: string
  path: string
  createdAt: number
}

export interface NotebookItem {
  id: string
  name: string
  isDefault?: boolean
}

export interface NoteItem {
  id: string
  notebookId: string
  title: string
  content: string
  editorMode: NoteEditorMode
  blocks: NoteBlock[]
  starred: boolean
  locked: boolean
  /** Group share permission lock — cannot be toggled by the user. */
  groupPermissionLocked?: boolean
  tags: string[]
  versions: NoteVersion[]
  attachments: NoteAttachment[]
  createdAt: number
  updatedAt: number
}

export interface NotesData {
  notebooks: NotebookItem[]
  notes: NoteItem[]
  syncFolderPath: string | null
}

function createDefaultData(): NotesData {
  return {
    notebooks: [{ id: DEFAULT_NOTEBOOK_ID, name: '默认笔记本', isDefault: true }],
    notes: [],
    syncFolderPath: null,
  }
}

export function createNoteBlockId(): string {
  return `block-${crypto.randomUUID()}`
}

export function createVersionId(): string {
  return `version-${crypto.randomUUID()}`
}

export function createAttachmentId(): string {
  return `attachment-${crypto.randomUUID()}`
}

export function createEmptyNote(
  notebookId: string,
  title: string,
  content = '',
): NoteItem {
  const now = Date.now()
  return {
    id: createNoteId(),
    notebookId,
    title,
    content,
    editorMode: 'markdown',
    blocks: [],
    starred: false,
    locked: false,
    tags: [],
    versions: [],
    attachments: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function normalizeNote(item: Partial<NoteItem>, notebookId: string): NoteItem {
  const now = Date.now()
  return {
    id: item.id ?? createNoteId(),
    notebookId: item.notebookId ?? notebookId,
    title: item.title ?? '无标题',
    content: typeof item.content === 'string' ? item.content : '',
    editorMode: item.editorMode === 'blocks' ? 'blocks' : 'markdown',
    blocks: Array.isArray(item.blocks) ? item.blocks : [],
    starred: Boolean(item.starred),
    locked: Boolean(item.locked),
    groupPermissionLocked: Boolean(item.groupPermissionLocked),
    tags: Array.isArray(item.tags) ? item.tags.filter((tag) => typeof tag === 'string') : [],
    versions: Array.isArray(item.versions)
      ? item.versions.map((version) => ({
          id: version.id ?? createVersionId(),
          title: version.title ?? '',
          content: version.content ?? '',
          createdAt: version.createdAt ?? now,
        }))
      : [],
    attachments: Array.isArray(item.attachments)
      ? item.attachments.map((attachment) => ({
          id: attachment.id ?? createAttachmentId(),
          name: attachment.name ?? '附件',
          path: attachment.path ?? '',
          createdAt: attachment.createdAt ?? now,
        }))
      : [],
    createdAt: item.createdAt ?? item.updatedAt ?? now,
    updatedAt: item.updatedAt ?? now,
  }
}

export function normalizeData(raw: Partial<NotesData> | null | undefined): NotesData {
  const fallback = createDefaultData()
  const notebooks = Array.isArray(raw?.notebooks) ? raw.notebooks : fallback.notebooks
  const notes = Array.isArray(raw?.notes) ? raw.notes : []

  const hasDefault = notebooks.some((item) => item.id === DEFAULT_NOTEBOOK_ID)
  const normalizedNotebooks = hasDefault
    ? notebooks
    : [fallback.notebooks[0]!, ...notebooks]

  return {
    notebooks: normalizedNotebooks.map((item) => ({
      id: item.id,
      name: item.name,
      isDefault: item.id === DEFAULT_NOTEBOOK_ID ? true : item.isDefault,
    })),
    notes: notes
      .filter((item) => normalizedNotebooks.some((notebook) => notebook.id === item.notebookId))
      .map((item) => normalizeNote(item, item.notebookId)),
    syncFolderPath: typeof raw?.syncFolderPath === 'string' ? raw.syncFolderPath : null,
  }
}

function pickNewerNote(left: NoteItem, right: NoteItem): NoteItem {
  return left.updatedAt >= right.updatedAt ? left : right
}

export function mergeNotesData(local: NotesData, remote: NotesData): NotesData {
  const notebookMap = new Map<string, NotebookItem>()
  for (const notebook of remote.notebooks) {
    notebookMap.set(notebook.id, notebook)
  }
  for (const notebook of local.notebooks) {
    notebookMap.set(notebook.id, notebook)
  }
  if (!notebookMap.has(DEFAULT_NOTEBOOK_ID)) {
    notebookMap.set(DEFAULT_NOTEBOOK_ID, createDefaultData().notebooks[0]!)
  }

  const noteMap = new Map<string, NoteItem>()
  for (const note of remote.notes) {
    noteMap.set(note.id, note)
  }
  for (const note of local.notes) {
    const existing = noteMap.get(note.id)
    noteMap.set(note.id, existing ? pickNewerNote(note, existing) : note)
  }

  return normalizeData({
    notebooks: [...notebookMap.values()],
    notes: [...noteMap.values()],
    syncFolderPath: local.syncFolderPath ?? remote.syncFolderPath,
  })
}

export function loadNotesData(): NotesData {
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY)
    if (!raw) return createDefaultData()
    return normalizeData(JSON.parse(raw) as Partial<NotesData>)
  } catch {
    return createDefaultData()
  }
}

export function saveNotesData(data: NotesData): void {
  localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(data))
  void syncNotesDataToMain(data)
}

async function syncNotesDataToMain(data: NotesData): Promise<void> {
  try {
    const result = await window.api.invoke(IpcChannel.NotesDataSync, {
      dataJson: JSON.stringify(data),
    })
    if (!result.ok) {
      window.dispatchEvent(
        new CustomEvent('toolman:notes-sync-error', { detail: result.error.message }),
      )
      return
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    window.dispatchEvent(new CustomEvent('toolman:notes-sync-error', { detail: message }))
  }
}

export function createNotebookId(): string {
  return `notebook-${crypto.randomUUID()}`
}

export function createNoteId(): string {
  return `note-${crypto.randomUUID()}`
}

export function buildNotebookName(existing: NotebookItem[]): string {
  const used = new Set(existing.map((item) => item.name))
  let index = existing.filter((item) => !item.isDefault).length + 1
  let candidate = index === 1 ? '笔记本' : `笔记本 ${index}`
  while (used.has(candidate)) {
    index += 1
    candidate = `笔记本 ${index}`
  }
  return candidate
}

export function buildNoteTitle(notes: NoteItem[], notebookId: string, date = new Date()): string {
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

export function normalizeRenameTitle(value: string, fallback: string): string {
  const trimmed = value.trim()
  return trimmed || fallback
}

export function getFirstNoteInNotebook(notes: NoteItem[], notebookId: string): NoteItem | null {
  const inNotebook = notes
    .filter((item) => item.notebookId === notebookId)
    .sort((left, right) => right.updatedAt - left.updatedAt)
  return inNotebook[0] ?? null
}

export function normalizeTag(value: string): string | null {
  const trimmed = value.trim().replace(/^#/, '')
  return trimmed || null
}

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

export interface NoteBlock {
  type: string
  text: string
  checked?: boolean
}

export interface NoteItem {
  id: string
  notebookId: string
  title: string
  content: string
  editorMode: 'markdown' | 'blocks'
  blocks: NoteBlock[]
  tags: string[]
  updatedAt?: number
}

export interface NotebookItem {
  id: string
  name: string
  isDefault?: boolean
}

export interface NotesData {
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

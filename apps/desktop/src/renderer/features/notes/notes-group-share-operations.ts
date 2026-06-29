import { buildGroupNotebookId } from '../group/group-note-utils'
import type { OpenGroupNoteRequest } from '../group/group-note-open'
import {
  createEmptyNote,
  createNoteBlockId,
  DEFAULT_NOTEBOOK_ID,
  normalizeData,
  normalizeNote,
  buildNoteTitle,
  type NoteItem,
  type NotebookItem,
  type NotesData,
} from './notes-storage'
import { blocksToMarkdown, markdownToBlocks } from './notes-blocks'

export function ensureGroupNotebook(
  notebooks: NotebookItem[],
  groupNotebookId: string,
  groupNotebookName: string,
): NotebookItem[] {
  return notebooks.some((item) => item.id === groupNotebookId)
    ? notebooks.map((item) =>
        item.id === groupNotebookId ? { ...item, name: groupNotebookName } : item,
      )
    : [...notebooks, { id: groupNotebookId, name: groupNotebookName }]
}

export function mergeGroupSharedNoteIntoData(
  prev: NotesData,
  request: OpenGroupNoteRequest,
  sourceNote: NoteItem | null,
): NotesData {
  const { noteId, workspaceId, workspaceName, title, editable = false } = request
  const locked = !editable
  const groupPermissionLocked = !editable
  const groupNotebookId = buildGroupNotebookId(workspaceId)
  const groupNotebookName = workspaceName.trim() || '群组笔记'
  const existing = prev.notes.find((item) => item.id === noteId)

  if (existing) {
    return {
      ...prev,
      notebooks: ensureGroupNotebook(prev.notebooks, groupNotebookId, groupNotebookName),
      notes: prev.notes.map((item) =>
        item.id === noteId
          ? {
              ...item,
              notebookId: groupNotebookId,
              locked,
              groupPermissionLocked,
              updatedAt: Date.now(),
            }
          : item,
      ),
    }
  }

  const baseNote =
    sourceNote ??
    normalizeNote(
      {
        id: noteId,
        title: title || '共享笔记',
        content: '',
        locked,
        groupPermissionLocked,
      },
      groupNotebookId,
    )

  const nextNote = normalizeNote(
    {
      ...baseNote,
      id: noteId,
      notebookId: groupNotebookId,
      title: title || baseNote.title,
      locked,
      groupPermissionLocked,
    },
    groupNotebookId,
  )

  const notes = [nextNote, ...prev.notes.filter((item) => item.id !== noteId)]
  return normalizeData({
    ...prev,
    notebooks: ensureGroupNotebook(prev.notebooks, groupNotebookId, groupNotebookName),
    notes,
  })
}

export function buildGroupNoteCopy(
  sourceNote: NoteItem | null,
  existingNotes: NoteItem[],
  title?: string,
): NoteItem {
  const baseTitle = title || sourceNote?.title || '共享笔记'
  let copyTitle = `${baseTitle} 副本`
  if (existingNotes.some((item) => item.title === copyTitle)) {
    copyTitle = buildNoteTitle(existingNotes, DEFAULT_NOTEBOOK_ID)
  }

  const copy = createEmptyNote(DEFAULT_NOTEBOOK_ID, copyTitle, sourceNote?.content ?? '')

  if (sourceNote) {
    copy.editorMode = sourceNote.editorMode
    copy.blocks =
      sourceNote.editorMode === 'blocks' && sourceNote.blocks.length
        ? sourceNote.blocks.map((block) => ({ ...block, id: createNoteBlockId() }))
        : markdownToBlocks(sourceNote.content)
    copy.tags = [...sourceNote.tags]
    if (copy.editorMode === 'blocks') {
      copy.content = blocksToMarkdown(copy.blocks)
    }
  }

  copy.locked = false
  return copy
}

export function applyGroupNoteLock(
  notes: NoteItem[],
  noteId: string,
  locked: boolean,
): NoteItem[] | null {
  const note = notes.find((item) => item.id === noteId)
  const groupPermissionLocked = locked
  if (
    !note ||
    (note.locked === locked && note.groupPermissionLocked === groupPermissionLocked)
  ) {
    return null
  }
  return notes.map((item) =>
    item.id === noteId
      ? { ...item, locked, groupPermissionLocked, updatedAt: Date.now() }
      : item,
  )
}

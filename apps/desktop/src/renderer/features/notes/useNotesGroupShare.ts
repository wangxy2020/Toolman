import { useCallback } from 'react'
import { IpcChannel } from '@toolman/shared'
import { buildGroupKnowledgeNoteId, buildGroupNotebookId } from '../group/group-note-utils'
import type { OpenGroupKnowledgeMarkdownRequest, OpenGroupNoteRequest } from '../group/group-note-open'
import type { SaveGroupNoteAsCopyRequest } from '../group/group-note-open'
import {
  applyGroupNoteLock,
  buildGroupNoteCopy,
  mergeGroupSharedNoteIntoData,
} from './notes-group-share-operations'
import {
  DEFAULT_NOTEBOOK_ID,
  normalizeData,
  normalizeNote,
  type NoteItem,
  type NotesData,
} from './notes-storage'
import type { Dispatch, SetStateAction } from 'react'

type UseNotesGroupShareParams = {
  data: NotesData
  setData: Dispatch<SetStateAction<NotesData>>
  setExpanded: (notebookId: string, open: boolean) => void
  setActiveNoteId: Dispatch<SetStateAction<string | null>>
}

export function useNotesGroupShare({
  data,
  setData,
  setExpanded,
  setActiveNoteId,
}: UseNotesGroupShareParams) {
  const openGroupSharedNote = useCallback(
    async (request: OpenGroupNoteRequest): Promise<boolean> => {
      const { noteId, workspaceId } = request
      const groupNotebookId = buildGroupNotebookId(workspaceId)
      const existing = data.notes.find((item) => item.id === noteId)

      if (existing) {
        setData((prev) => mergeGroupSharedNoteIntoData(prev, request, null))
        setExpanded(groupNotebookId, true)
        setActiveNoteId(noteId)
        return true
      }

      let sourceNote: NoteItem | null = null

      const result = await window.api.invoke(IpcChannel.NotesGetById, { noteId })
      if (result.ok) {
        const payload = result.data as { noteJson: string | null }
        if (payload.noteJson) {
          try {
            sourceNote = normalizeNote(
              JSON.parse(payload.noteJson) as Partial<NoteItem>,
              groupNotebookId,
            )
          } catch {
            sourceNote = null
          }
        }
      }

      setData((prev) => mergeGroupSharedNoteIntoData(prev, request, sourceNote))
      setExpanded(groupNotebookId, true)
      setActiveNoteId(noteId)
      return true
    },
    [data.notes, setActiveNoteId, setData, setExpanded],
  )

  const openGroupKnowledgeMarkdown = useCallback(
    async (request: OpenGroupKnowledgeMarkdownRequest): Promise<boolean> => {
      const { documentId, workspaceId, workspaceName, title, absolutePath } = request
      const noteId = buildGroupKnowledgeNoteId(documentId)
      const notebookId = buildGroupNotebookId(workspaceId)
      const locked = true

      let content = ''
      const readResult = await window.api.invoke(IpcChannel.FileReadForChat, {
        paths: [absolutePath],
      })
      if (readResult.ok) {
        const payload = readResult.data as {
          files: Array<{ content: string }>
        }
        content = payload.files[0]?.content ?? ''
      }

      const existing = data.notes.find((item) => item.id === noteId)
      if (existing) {
        setData((prev) => ({
          ...prev,
          notes: prev.notes.map((item) =>
            item.id === noteId
              ? { ...item, title, content, locked, updatedAt: Date.now() }
              : item,
          ),
        }))
        setExpanded(notebookId, true)
        setActiveNoteId(noteId)
        return true
      }

      const nextNote = normalizeNote(
        {
          id: noteId,
          notebookId,
          title,
          content,
          locked,
          editorMode: 'markdown',
        },
        notebookId,
      )

      setData((prev) => {
        const notebooks = prev.notebooks.some((item) => item.id === notebookId)
          ? prev.notebooks.map((item) =>
              item.id === notebookId ? { ...item, name: workspaceName } : item,
            )
          : [...prev.notebooks, { id: notebookId, name: workspaceName }]

        return normalizeData({
          ...prev,
          notebooks,
          notes: [nextNote, ...prev.notes],
        })
      })

      setExpanded(notebookId, true)
      setActiveNoteId(noteId)
      return true
    },
    [data.notes, setActiveNoteId, setData, setExpanded],
  )

  const saveGroupNoteAsCopy = useCallback(
    async (request: SaveGroupNoteAsCopyRequest): Promise<string | null> => {
      const { noteId, title } = request
      let sourceNote = data.notes.find((item) => item.id === noteId) ?? null

      if (!sourceNote) {
        const result = await window.api.invoke(IpcChannel.NotesGetById, { noteId })
        if (result.ok) {
          const payload = result.data as { noteJson: string | null }
          if (payload.noteJson) {
            try {
              sourceNote = normalizeNote(
                JSON.parse(payload.noteJson) as Partial<NoteItem>,
                DEFAULT_NOTEBOOK_ID,
              )
            } catch {
              sourceNote = null
            }
          }
        }
      }

      const copy = buildGroupNoteCopy(sourceNote, data.notes, title)

      setData((prev) =>
        normalizeData({
          ...prev,
          notes: [copy, ...prev.notes],
        }),
      )
      setExpanded(DEFAULT_NOTEBOOK_ID, true)
      setActiveNoteId(copy.id)
      return copy.id
    },
    [data.notes, setActiveNoteId, setData, setExpanded],
  )

  const syncGroupNoteLock = useCallback(
    (noteId: string, locked: boolean) => {
      setData((prev) => {
        const nextNotes = applyGroupNoteLock(prev.notes, noteId, locked)
        if (!nextNotes) return prev
        return { ...prev, notes: nextNotes }
      })
    },
    [setData],
  )

  return {
    openGroupSharedNote,
    openGroupKnowledgeMarkdown,
    saveGroupNoteAsCopy,
    syncGroupNoteLock,
  }
}

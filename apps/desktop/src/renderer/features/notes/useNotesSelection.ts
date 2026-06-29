import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { markdownToBlocks } from './notes-blocks'
import { importMarkdownFiles } from './notes-import-export'
import { searchNotes } from './notes-search'
import { getNoteTemplate } from './notes-templates'
import {
  buildNoteTitle,
  buildNotebookName,
  createEmptyNote,
  createNotebookId,
  DEFAULT_NOTEBOOK_ID,
  getFirstNoteInNotebook,
  loadNotesData,
  type NoteItem,
  type NotebookItem,
  type NotesData,
} from './notes-storage'
import type { Dispatch, SetStateAction } from 'react'

type UseNotesSelectionParams = {
  data: NotesData
  setData: Dispatch<SetStateAction<NotesData>>
  notes: NoteItem[]
}

export function useNotesSelection({ data, setData, notes }: UseNotesSelectionParams) {
  const [activeNoteId, setActiveNoteId] = useState<string | null>(() => {
    const initial = loadNotesData()
    return getFirstNoteInNotebook(initial.notes, DEFAULT_NOTEBOOK_ID)?.id ?? null
  })
  const [expandedNotebookIds, setExpandedNotebookIds] = useState<Set<string>>(
    () => new Set([DEFAULT_NOTEBOOK_ID]),
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)
  const activeNoteIdRef = useRef(activeNoteId)

  useEffect(() => {
    activeNoteIdRef.current = activeNoteId
  }, [activeNoteId])

  const activeNote = useMemo(
    () => notes.find((item) => item.id === activeNoteId) ?? null,
    [activeNoteId, notes],
  )

  const activeNotebook = useMemo(() => {
    if (activeNote) {
      return data.notebooks.find((item) => item.id === activeNote.notebookId) ?? null
    }
    return null
  }, [activeNote, data.notebooks])

  const notesByNotebook = useMemo(() => {
    const map = new Map<string, NoteItem[]>()
    for (const notebook of data.notebooks) {
      map.set(notebook.id, [])
    }

    const visibleNotes =
      searchQuery.trim() || activeTagFilter
        ? searchNotes(notes, searchQuery, { tag: activeTagFilter }).map((item) => item.note)
        : notes

    for (const note of visibleNotes) {
      const bucket = map.get(note.notebookId)
      if (bucket) bucket.push(note)
    }
    for (const bucket of map.values()) {
      bucket.sort((left, right) => right.updatedAt - left.updatedAt)
    }
    return map
  }, [activeTagFilter, data.notebooks, notes, searchQuery])

  const setExpanded = useCallback((notebookId: string, open: boolean) => {
    setExpandedNotebookIds((prev) => {
      const next = new Set(prev)
      if (open) next.add(notebookId)
      else next.delete(notebookId)
      return next
    })
  }, [])

  const toggleExpanded = useCallback((notebookId: string) => {
    setExpandedNotebookIds((prev) => {
      const next = new Set(prev)
      if (next.has(notebookId)) next.delete(notebookId)
      else next.add(notebookId)
      return next
    })
  }, [])

  const createNotebook = useCallback(() => {
    const notebook: NotebookItem = {
      id: createNotebookId(),
      name: buildNotebookName(data.notebooks),
    }
    setData((prev) => ({
      ...prev,
      notebooks: [...prev.notebooks, notebook],
    }))
    setExpanded(notebook.id, true)
    setActiveNoteId(null)
    return notebook.id
  }, [data.notebooks, setData, setExpanded])

  const createNote = useCallback(
    (notebookId: string, templateId?: string) => {
      const template = templateId ? getNoteTemplate(templateId) : null
      const note = createEmptyNote(
        notebookId,
        template && template.id !== 'blank' && template.title
          ? template.title
          : buildNoteTitle(data.notes, notebookId),
        template?.content ?? '',
      )
      if (template?.tags.length) note.tags = [...template.tags]
      if (template?.content) note.blocks = markdownToBlocks(template.content)

      setData((prev) => ({
        ...prev,
        notes: [note, ...prev.notes],
      }))
      setExpanded(notebookId, true)
      setActiveNoteId(note.id)
      return note.id
    },
    [data.notes, setData, setExpanded],
  )

  const createNoteFromMessage = useCallback(
    (title: string, content: string, notebookId = DEFAULT_NOTEBOOK_ID) => {
      const note = createEmptyNote(
        notebookId,
        title || buildNoteTitle(data.notes, notebookId),
        content,
      )
      setData((prev) => ({
        ...prev,
        notes: [note, ...prev.notes],
      }))
      setExpanded(notebookId, true)
      setActiveNoteId(note.id)
      return note.id
    },
    [data.notes, setData, setExpanded],
  )

  const selectNote = useCallback(
    (noteId: string) => {
      const note = data.notes.find((item) => item.id === noteId)
      if (!note) return
      setActiveNoteId(noteId)
      setExpanded(note.notebookId, true)
    },
    [data.notes, setExpanded],
  )

  const ensureDefaultSelection = useCallback(() => {
    setActiveNoteId((prev) => {
      if (prev && data.notes.some((item) => item.id === prev)) {
        const note = data.notes.find((item) => item.id === prev)
        if (note) {
          setExpanded(note.notebookId, true)
        }
        return prev
      }
      setExpanded(DEFAULT_NOTEBOOK_ID, true)
      return getFirstNoteInNotebook(data.notes, DEFAULT_NOTEBOOK_ID)?.id ?? null
    })
  }, [data.notes, setExpanded])

  const importNotesFromFiles = useCallback(
    async (paths: string[], notebookId = DEFAULT_NOTEBOOK_ID) => {
      const imported = await importMarkdownFiles(paths)
      if (imported.length === 0) return 0
      const newNotes = imported.map((item) =>
        createEmptyNote(notebookId, item.title, item.content),
      )
      setData((prev) => ({
        ...prev,
        notes: [...newNotes, ...prev.notes],
      }))
      setExpanded(notebookId, true)
      setActiveNoteId(newNotes[0]?.id ?? null)
      return newNotes.length
    },
    [setData, setExpanded],
  )

  const deleteNote = useCallback(
    (noteId: string) => {
      setData((prev) => {
        const nextNotes = prev.notes.filter((item) => item.id !== noteId)
        setActiveNoteId((activeId) => {
          if (activeId !== noteId) return activeId
          return getFirstNoteInNotebook(nextNotes, DEFAULT_NOTEBOOK_ID)?.id ?? null
        })
        return { ...prev, notes: nextNotes }
      })
    },
    [setData],
  )

  const deleteNotebook = useCallback(
    (notebookId: string) => {
      setData((prev) => {
        const nextNotes = prev.notes.filter((item) => item.notebookId !== notebookId)
        return {
          ...prev,
          notebooks: prev.notebooks.filter((item) => item.id !== notebookId),
          notes: nextNotes,
        }
      })
      setActiveNoteId((activeId) => {
        if (!activeId) return null
        const stillExists = data.notes.some(
          (item) => item.id === activeId && item.notebookId !== notebookId,
        )
        return stillExists
          ? activeId
          : (getFirstNoteInNotebook(
              data.notes.filter((item) => item.notebookId !== notebookId),
              DEFAULT_NOTEBOOK_ID,
            )?.id ?? null)
      })
    },
    [data.notes, setData],
  )

  useEffect(() => {
    if (!activeNoteId) return
    if (!data.notes.some((item) => item.id === activeNoteId)) {
      setActiveNoteId(getFirstNoteInNotebook(data.notes, DEFAULT_NOTEBOOK_ID)?.id ?? null)
    }
  }, [activeNoteId, data.notes])

  return {
    activeNoteId,
    setActiveNoteId,
    activeNoteIdRef,
    activeNote,
    activeNotebook,
    expandedNotebookIds,
    searchQuery,
    setSearchQuery,
    activeTagFilter,
    setActiveTagFilter,
    notesByNotebook,
    setExpanded,
    toggleExpanded,
    createNotebook,
    createNote,
    createNoteFromMessage,
    selectNote,
    ensureDefaultSelection,
    importNotesFromFiles,
    deleteNote,
    deleteNotebook,
  }
}

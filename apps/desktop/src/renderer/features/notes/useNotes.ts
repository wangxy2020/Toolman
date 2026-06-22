import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IpcChannel, type WorkspaceEvent } from '@toolman/shared'
import { buildGroupKnowledgeNoteId, buildGroupNotebookId } from '../group/group-note-utils'
import type { OpenGroupKnowledgeMarkdownRequest, OpenGroupNoteRequest } from '../group/group-note-open'
import type { SaveGroupNoteAsCopyRequest } from '../group/group-note-open'
import { loadSystemPaths } from '../chat/useSystemPaths'
import { blocksToMarkdown, markdownToBlocks } from './notes-blocks'
import { readNoteUpdatedContent, readNoteUpdatedNoteId } from './p2p-note-events'
import {
  importMarkdownFiles,
  importNotesDataFromJson,
  syncNotesToFolder,
} from './notes-import-export'
import { searchNotes } from './notes-search'
import { getNoteTemplate } from './notes-templates'
import { resolveNotesWorkingDirectory } from './notes-path-utils'
import { appendNoteVersion } from './notes-versions'
import {
  buildNoteTitle,
  buildNotebookName,
  createAttachmentId,
  createEmptyNote,
  createNotebookId,
  createNoteBlockId,
  DEFAULT_NOTEBOOK_ID,
  getFirstNoteInNotebook,
  loadNotesData,
  mergeNotesData,
  normalizeData,
  normalizeNote,
  normalizeTag,
  saveNotesData,
  type NoteItem,
  type NotebookItem,
  type NotesData,
} from './notes-storage'

export function useNotes() {
  const [data, setData] = useState<NotesData>(() => loadNotesData())
  const [activeNoteId, setActiveNoteId] = useState<string | null>(() => {
    const initial = loadNotesData()
    return getFirstNoteInNotebook(initial.notes, DEFAULT_NOTEBOOK_ID)?.id ?? null
  })
  const [expandedNotebookIds, setExpandedNotebookIds] = useState<Set<string>>(
    () => new Set([DEFAULT_NOTEBOOK_ID]),
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const versionTimerRef = useRef<Map<string, number>>(new Map())
  const activeNoteIdRef = useRef(activeNoteId)

  useEffect(() => {
    activeNoteIdRef.current = activeNoteId
  }, [activeNoteId])

  useEffect(() => {
    const handleP2pNoteUpdated = (payload: unknown) => {
      const event = payload as WorkspaceEvent
      if (event.resourceType !== 'Note' || event.eventType !== 'Updated') return

      const noteId = readNoteUpdatedNoteId(event)
      const merged = readNoteUpdatedContent(event)
      if (!noteId || merged == null) return
      if (noteId === activeNoteIdRef.current) return

      setData((prev) => {
        const target = prev.notes.find((item) => item.id === noteId)
        if (!target || target.content === merged) return prev

        return {
          ...prev,
          notes: prev.notes.map((item) => {
            if (item.id !== noteId) return item
            return normalizeNote(
              {
                ...item,
                content: merged,
                blocks: item.editorMode === 'blocks' ? markdownToBlocks(merged) : item.blocks,
                updatedAt: Math.max(item.updatedAt, event.timestamp),
              },
              item.notebookId,
            )
          }),
        }
      })
    }

    const unsubscribeAppended = window.api.subscribe('p2p:event:appended', handleP2pNoteUpdated)
    const unsubscribeSynced = window.api.subscribe('p2p:sync:event-applied', handleP2pNoteUpdated)

    return () => {
      unsubscribeAppended()
      unsubscribeSynced()
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    saveNotesData(data)
    void loadSystemPaths().then((paths) => {
      const folder = resolveNotesWorkingDirectory(data.syncFolderPath, paths)
      if (folder) {
        void syncNotesToFolder(folder, data)
      }
    })
  }, [data, hydrated])

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (hydrated) saveNotesData(data)
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [data, hydrated])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const localData = loadNotesData()
      const loadResult = await window.api.invoke(IpcChannel.NotesDataLoad, {})
      if (cancelled) return

      let nextData = localData
      if (loadResult.ok) {
        const payload = loadResult.data as { dataJson: string }
        try {
          const mainData = normalizeData(JSON.parse(payload.dataJson) as Partial<NotesData>)
          nextData = mergeNotesData(localData, mainData)
        } catch {
          nextData = localData
        }
      }

      setData(nextData)
      setActiveNoteId((prev) => {
        if (prev && nextData.notes.some((item) => item.id === prev)) return prev
        return getFirstNoteInNotebook(nextData.notes, DEFAULT_NOTEBOOK_ID)?.id ?? null
      })
      if (!cancelled) {
        setHydrated(true)
      }
      await window.api.invoke(IpcChannel.NotesDataSync, {
        dataJson: JSON.stringify(nextData),
      })
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const notes = useMemo(
    () => data.notes.map((item) => normalizeNote(item, item.notebookId)),
    [data.notes],
  )

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

  const scheduleVersionSnapshot = useCallback((noteId: string) => {
    const existing = versionTimerRef.current.get(noteId)
    if (existing) window.clearTimeout(existing)
    const timer = window.setTimeout(() => {
      setData((prev) => ({
        ...prev,
        notes: prev.notes.map((item) => {
          if (item.id !== noteId) return item
          return { ...item, versions: appendNoteVersion(item) }
        }),
      }))
      versionTimerRef.current.delete(noteId)
    }, 15000)
    versionTimerRef.current.set(noteId, timer)
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
  }, [data.notebooks, setExpanded])

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
    [data.notes, setExpanded],
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
    [data.notes, setExpanded],
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

  const openGroupSharedNote = useCallback(
    async (request: OpenGroupNoteRequest): Promise<boolean> => {
      const { noteId, workspaceId, workspaceName, title, editable = false } = request
      const locked = !editable
      const existing = data.notes.find((item) => item.id === noteId)

      if (existing) {
        setData((prev) => ({
          ...prev,
          notes: prev.notes.map((item) =>
            item.id === noteId ? { ...item, locked, updatedAt: Date.now() } : item,
          ),
        }))
        setExpanded(existing.notebookId, true)
        setActiveNoteId(noteId)
        return true
      }

      const notebookId = buildGroupNotebookId(workspaceId)
      let sourceNote: NoteItem | null = null

      const result = await window.api.invoke(IpcChannel.NotesGetById, { noteId })
      if (result.ok) {
        const payload = result.data as { noteJson: string | null }
        if (payload.noteJson) {
          try {
            sourceNote = normalizeNote(
              JSON.parse(payload.noteJson) as Partial<NoteItem>,
              notebookId,
            )
          } catch {
            sourceNote = null
          }
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
          },
          notebookId,
        )

      const nextNote = normalizeNote(
        {
          ...baseNote,
          id: noteId,
          notebookId,
          title: title || baseNote.title,
          locked,
        },
        notebookId,
      )

      setData((prev) => {
        const notebooks = prev.notebooks.some((item) => item.id === notebookId)
          ? prev.notebooks.map((item) =>
              item.id === notebookId ? { ...item, name: workspaceName } : item,
            )
          : [...prev.notebooks, { id: notebookId, name: workspaceName }]

        const notes = [nextNote, ...prev.notes.filter((item) => item.id !== noteId)]

        return normalizeData({
          ...prev,
          notebooks,
          notes,
        })
      })

      setExpanded(notebookId, true)
      setActiveNoteId(noteId)
      return true
    },
    [data.notes, setExpanded],
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
    [data.notes, setExpanded],
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

      const baseTitle = title || sourceNote?.title || '共享笔记'
      let copyTitle = `${baseTitle} 副本`
      if (data.notes.some((item) => item.title === copyTitle)) {
        copyTitle = buildNoteTitle(data.notes, DEFAULT_NOTEBOOK_ID)
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
    [data.notes, setExpanded],
  )

  const ensureDefaultSelection = useCallback(() => {
    setExpanded(DEFAULT_NOTEBOOK_ID, true)
    const first = getFirstNoteInNotebook(data.notes, DEFAULT_NOTEBOOK_ID)
    setActiveNoteId(first?.id ?? null)
  }, [data.notes, setExpanded])

  const renameNotebook = useCallback((notebookId: string, name: string) => {
    setData((prev) => ({
      ...prev,
      notebooks: prev.notebooks.map((item) =>
        item.id === notebookId ? { ...item, name } : item,
      ),
    }))
  }, [])

  const renameNote = useCallback((noteId: string, title: string) => {
    setData((prev) => ({
      ...prev,
      notes: prev.notes.map((item) =>
        item.id === noteId ? { ...item, title, updatedAt: Date.now() } : item,
      ),
    }))
  }, [])

  const updateNote = useCallback(
    (noteId: string, patch: Partial<NoteItem>) => {
      setData((prev) => ({
        ...prev,
        notes: prev.notes.map((item) => {
          if (item.id !== noteId) return item
          const next: NoteItem = {
            ...item,
            ...patch,
            updatedAt: Date.now(),
          }
          if (patch.blocks) {
            next.content = blocksToMarkdown(patch.blocks)
          }
          if (patch.content !== undefined && next.editorMode === 'blocks') {
            next.blocks = markdownToBlocks(patch.content)
          }
          return normalizeNote(next, next.notebookId)
        }),
      }))
      scheduleVersionSnapshot(noteId)
    },
    [scheduleVersionSnapshot],
  )

  const toggleNoteStarred = useCallback((noteId: string) => {
    setData((prev) => ({
      ...prev,
      notes: prev.notes.map((item) =>
        item.id === noteId ? { ...item, starred: !item.starred, updatedAt: Date.now() } : item,
      ),
    }))
  }, [])

  const toggleNoteLocked = useCallback((noteId: string) => {
    setData((prev) => ({
      ...prev,
      notes: prev.notes.map((item) =>
        item.id === noteId ? { ...item, locked: !item.locked, updatedAt: Date.now() } : item,
      ),
    }))
  }, [])

  const setNoteTags = useCallback(
    (noteId: string, tags: string[]) => {
      updateNote(noteId, { tags })
    },
    [updateNote],
  )

  const addNoteTag = useCallback(
    (noteId: string, rawTag: string) => {
      const tag = normalizeTag(rawTag)
      if (!tag) return
      const note = data.notes.find((item) => item.id === noteId)
      if (!note || note.tags.includes(tag)) return
      setNoteTags(noteId, [...note.tags, tag])
    },
    [data.notes, setNoteTags],
  )

  const removeNoteTag = useCallback(
    (noteId: string, tag: string) => {
      const note = data.notes.find((item) => item.id === noteId)
      if (!note) return
      setNoteTags(
        noteId,
        note.tags.filter((item) => item !== tag),
      )
    },
    [data.notes, setNoteTags],
  )

  const restoreNoteVersion = useCallback(
    (noteId: string, versionId: string) => {
      const note = data.notes.find((item) => item.id === noteId)
      const version = note?.versions.find((item) => item.id === versionId)
      if (!note || !version) return
      updateNote(noteId, {
        title: version.title,
        content: version.content,
        blocks: markdownToBlocks(version.content),
      })
    },
    [data.notes, updateNote],
  )

  const addNoteAttachment = useCallback(async (noteId: string, sourcePath: string) => {
    const result = await window.api.invoke(IpcChannel.NotesAttachmentImport, {
      noteId,
      sourcePath,
    })
    if (!result.ok) return null
    const payload = result.data as { absolutePath: string; name: string }
    const attachment = {
      id: createAttachmentId(),
      name: payload.name,
      path: payload.absolutePath,
      createdAt: Date.now(),
    }
    setData((prev) => ({
      ...prev,
      notes: prev.notes.map((item) =>
        item.id === noteId
          ? { ...item, attachments: [...item.attachments, attachment], updatedAt: Date.now() }
          : item,
      ),
    }))
    return payload
  }, [])

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
    [setExpanded],
  )

  const importNotesBackup = useCallback((raw: string) => {
    const imported = normalizeData(importNotesDataFromJson(raw))
    setData(imported)
    const first = getFirstNoteInNotebook(imported.notes, DEFAULT_NOTEBOOK_ID)
    setActiveNoteId(first?.id ?? null)
  }, [])

  useEffect(() => {
    const handleRestore = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail
      if (typeof detail === 'string' && detail.trim()) {
        importNotesBackup(detail)
      }
    }
    window.addEventListener('toolman:notes-restore', handleRestore)
    return () => window.removeEventListener('toolman:notes-restore', handleRestore)
  }, [importNotesBackup])

  const exportNotesBackup = useCallback(() => data, [data])

  const setSyncFolder = useCallback((folderPath: string | null) => {
    setData((prev) => ({ ...prev, syncFolderPath: folderPath }))
  }, [])

  const deleteNote = useCallback((noteId: string) => {
    setData((prev) => {
      const nextNotes = prev.notes.filter((item) => item.id !== noteId)
      setActiveNoteId((activeId) => {
        if (activeId !== noteId) return activeId
        return getFirstNoteInNotebook(nextNotes, DEFAULT_NOTEBOOK_ID)?.id ?? null
      })
      return { ...prev, notes: nextNotes }
    })
  }, [])

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
        return stillExists ? activeId : getFirstNoteInNotebook(
          data.notes.filter((item) => item.notebookId !== notebookId),
          DEFAULT_NOTEBOOK_ID,
        )?.id ?? null
      })
    },
    [data.notes],
  )

  useEffect(() => {
    if (!activeNoteId) return
    if (!data.notes.some((item) => item.id === activeNoteId)) {
      setActiveNoteId(getFirstNoteInNotebook(data.notes, DEFAULT_NOTEBOOK_ID)?.id ?? null)
    }
  }, [activeNoteId, data.notes])

  const syncGroupNoteLock = useCallback((noteId: string, locked: boolean) => {
    setData((prev) => {
      const note = prev.notes.find((item) => item.id === noteId)
      if (!note || note.locked === locked) return prev
      return {
        ...prev,
        notes: prev.notes.map((item) =>
          item.id === noteId ? { ...item, locked, updatedAt: Date.now() } : item,
        ),
      }
    })
  }, [])

  return {
    data,
    notebooks: data.notebooks,
    notes,
    notesByNotebook,
    activeNoteId,
    activeNote,
    activeNotebook,
    expandedNotebookIds,
    searchQuery,
    setSearchQuery,
    activeTagFilter,
    setActiveTagFilter,
    toggleExpanded,
    createNotebook,
    createNote,
    createNoteFromMessage,
    selectNote,
    openGroupSharedNote,
    syncGroupNoteLock,
    openGroupKnowledgeMarkdown,
    saveGroupNoteAsCopy,
    ensureDefaultSelection,
    renameNotebook,
    renameNote,
    updateNote,
    toggleNoteStarred,
    toggleNoteLocked,
    setNoteTags,
    addNoteTag,
    removeNoteTag,
    restoreNoteVersion,
    addNoteAttachment,
    importNotesFromFiles,
    importNotesBackup,
    exportNotesBackup,
    setSyncFolder,
    deleteNote,
    deleteNotebook,
  }
}

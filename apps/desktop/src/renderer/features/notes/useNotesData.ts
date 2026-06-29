import { useCallback, useMemo, useRef, useState } from 'react'
import { IpcChannel } from '@toolman/shared'
import { blocksToMarkdown, markdownToBlocks } from './notes-blocks'
import { importNotesDataFromJson } from './notes-import-export'
import { appendNoteVersion } from './notes-versions'
import {
  createAttachmentId,
  DEFAULT_NOTEBOOK_ID,
  getFirstNoteInNotebook,
  loadNotesData,
  normalizeData,
  normalizeNote,
  normalizeTag,
  type NoteItem,
  type NotesData,
} from './notes-storage'

export function useNotesData() {
  const [data, setData] = useState<NotesData>(() => loadNotesData())
  const [hydrated, setHydrated] = useState(false)
  const versionTimerRef = useRef<Map<string, number>>(new Map())

  const notes = useMemo(
    () => data.notes.map((item) => normalizeNote(item, item.notebookId)),
    [data.notes],
  )

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
          if (item.groupPermissionLocked) return item
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
      notes: prev.notes.map((item) => {
        if (item.id !== noteId || item.groupPermissionLocked) return item
        return { ...item, locked: !item.locked, updatedAt: Date.now() }
      }),
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

  const importNotesBackup = useCallback((raw: string) => {
    const imported = normalizeData(importNotesDataFromJson(raw))
    setData(imported)
    return getFirstNoteInNotebook(imported.notes, DEFAULT_NOTEBOOK_ID)?.id ?? null
  }, [])

  const exportNotesBackup = useCallback(() => data, [data])

  const setSyncFolder = useCallback((folderPath: string | null) => {
    setData((prev) => ({ ...prev, syncFolderPath: folderPath }))
  }, [])

  return {
    data,
    setData,
    hydrated,
    setHydrated,
    notes,
    scheduleVersionSnapshot,
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
    importNotesBackup,
    exportNotesBackup,
    setSyncFolder,
  }
}

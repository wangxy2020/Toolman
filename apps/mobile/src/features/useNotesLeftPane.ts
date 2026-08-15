import { useMemo, useState } from 'react'
import { Alert, Platform } from 'react-native'
import { useMobileApp } from '../state/MobileAppContext'
import {
  buildNotebookName,
  buildNoteTitle,
  createNoteId,
  createNotebookId,
  rememberDeletedNotes,
  type MobileNote,
  type MobileNotebook,
} from '../storage/notes'
import {
  applyNotebookRename,
  applyNoteRename,
  deleteNoteConfirmMessage,
  deleteNotebookConfirmMessage,
  findActiveNotebookId,
  groupNotesByNotebook,
  isProtectedNotebook,
  nextActiveNoteIdAfterNoteDelete,
  noteIdsInNotebook,
  notebooksAfterDelete,
  notesAfterDelete,
  notesAfterNotebookDelete,
  seedExpandedNotebookId,
  type NotesRenameTarget,
} from './notesPaneUtils'

export function useNotesLeftPane() {
  const {
    notebooks,
    setNotebooks,
    notes,
    setNotes,
    deletedNotes,
    setDeletedNotes,
    activeNoteId,
    setActiveNoteId,
    setLeftOpen,
  } = useMobileApp()

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    return new Set([seedExpandedNotebookId(notes, activeNoteId, notebooks)])
  })
  const [renameTarget, setRenameTarget] = useState<NotesRenameTarget | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)

  const notesByNotebook = useMemo(() => groupNotesByNotebook(notes), [notes])

  const activeNotebookId = useMemo(
    () => findActiveNotebookId(notes, activeNoteId),
    [notes, activeNoteId],
  )

  const toggleExpanded = (notebookId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(notebookId)) next.delete(notebookId)
      else next.add(notebookId)
      return next
    })
  }

  const createNotebook = () => {
    const id = createNotebookId()
    const name = buildNotebookName(notebooks)
    setNotebooks([...notebooks, { id, name }])
    setExpanded((prev) => new Set(prev).add(id))
    setOpenSwipeId(null)
    setRenameTarget(null)
  }

  const createNote = (notebookId: string) => {
    const id = createNoteId()
    const title = buildNoteTitle(notes, notebookId)
    setNotes([
      { id, notebookId, title, body: '', updatedAt: Date.now() },
      ...notes,
    ])
    setExpanded((prev) => new Set(prev).add(notebookId))
    setActiveNoteId(id)
    setOpenSwipeId(null)
    setRenameTarget(null)
    setLeftOpen(false)
  }

  const notebookIsProtected = (notebookId: string) =>
    isProtectedNotebook(notebooks, notebookId)

  const commitRename = () => {
    if (!renameTarget) return
    const next = draftTitle.trim()
    if (renameTarget.kind === 'notebook') {
      if (next) {
        setNotebooks(applyNotebookRename(notebooks, renameTarget.id, next))
      }
    } else if (next) {
      setNotes(applyNoteRename(notes, renameTarget.id, next))
    }
    setRenameTarget(null)
    setDraftTitle('')
  }

  const deleteNote = (note: MobileNote) => {
    const remaining = notesAfterDelete(notes, note.id)
    setNotes(remaining)
    setDeletedNotes(rememberDeletedNotes(deletedNotes, [note.id]))
    if (activeNoteId === note.id) {
      setActiveNoteId(nextActiveNoteIdAfterNoteDelete(remaining, note))
    }
    if (renameTarget?.kind === 'note' && renameTarget.id === note.id) {
      setRenameTarget(null)
      setDraftTitle('')
    }
    setOpenSwipeId(null)
  }

  const confirmDeleteNote = (note: MobileNote) => {
    const message = deleteNoteConfirmMessage(note.title)
    const doDelete = () => deleteNote(note)

    if (Platform.OS === 'web') {
      if (typeof globalThis.confirm === 'function' && globalThis.confirm(message)) {
        doDelete()
      }
      return
    }

    Alert.alert('删除笔记', message, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: doDelete },
    ])
  }

  const deleteNotebook = (notebookId: string) => {
    if (notebookIsProtected(notebookId)) return
    const remainingNotebooks = notebooksAfterDelete(notebooks, notebookId)
    const remainingNotes = notesAfterNotebookDelete(notes, notebookId)
    const removedIds = noteIdsInNotebook(notes, notebookId)
    setNotebooks(remainingNotebooks)
    setNotes(remainingNotes)
    setDeletedNotes(rememberDeletedNotes(deletedNotes, removedIds))
    if (activeNotebookId === notebookId) {
      setActiveNoteId(remainingNotes[0]?.id ?? null)
    }
    if (renameTarget?.kind === 'notebook' && renameTarget.id === notebookId) {
      setRenameTarget(null)
      setDraftTitle('')
    }
    setExpanded((prev) => {
      const next = new Set(prev)
      next.delete(notebookId)
      return next
    })
    setOpenSwipeId(null)
  }

  const confirmDeleteNotebook = (notebookId: string, name: string) => {
    if (notebookIsProtected(notebookId)) return
    const count = (notesByNotebook.get(notebookId) ?? []).length
    const message = deleteNotebookConfirmMessage(name, count)
    const doDelete = () => deleteNotebook(notebookId)

    if (Platform.OS === 'web') {
      if (typeof globalThis.confirm === 'function' && globalThis.confirm(message)) {
        doDelete()
      }
      return
    }

    Alert.alert('删除笔记本', message, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: doDelete },
    ])
  }

  const onNotebookPress = (notebookId: string) => {
    setOpenSwipeId(null)
    toggleExpanded(notebookId)
  }

  const beginRenameNotebook = (notebook: MobileNotebook) => {
    setOpenSwipeId(null)
    setRenameTarget({ kind: 'notebook', id: notebook.id })
    setDraftTitle(notebook.name)
  }

  const selectNote = (note: MobileNote) => {
    setOpenSwipeId(null)
    setActiveNoteId(note.id)
    setLeftOpen(false)
  }

  const beginRenameNote = (note: MobileNote) => {
    setOpenSwipeId(null)
    setActiveNoteId(note.id)
    setRenameTarget({ kind: 'note', id: note.id })
    setDraftTitle(note.title)
  }

  const setSwipeOpen = (swipeId: string, open: boolean) => {
    setOpenSwipeId(open ? swipeId : null)
  }

  return {
    notebooks,
    notesByNotebook,
    activeNoteId,
    activeNotebookId,
    expanded,
    renameTarget,
    draftTitle,
    setDraftTitle,
    openSwipeId,
    createNotebook,
    createNote,
    commitRename,
    confirmDeleteNote,
    confirmDeleteNotebook,
    isProtectedNotebook: notebookIsProtected,
    onNotebookPress,
    beginRenameNotebook,
    selectNote,
    beginRenameNote,
    setSwipeOpen,
  }
}

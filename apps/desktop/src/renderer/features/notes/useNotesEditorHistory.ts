import { useCallback, useRef, useState } from 'react'
import type { NotesEditorSnapshot } from './notes-editor-types'

type UseNotesEditorHistoryParams = {
  noteTitle: string
  noteContent: string
  locked: boolean
  onUpdate: (patch: Partial<{ title: string; content: string }>) => void
}

export function useNotesEditorHistory({
  noteTitle,
  noteContent,
  locked,
  onUpdate,
}: UseNotesEditorHistoryParams) {
  const [past, setPast] = useState<NotesEditorSnapshot[]>([])
  const [future, setFuture] = useState<NotesEditorSnapshot[]>([])
  const skipHistoryRef = useRef(false)

  const resetHistory = useCallback(() => {
    setPast([])
    setFuture([])
  }, [])

  const pushHistorySnapshot = useCallback(() => {
    setPast((prev) => [...prev.slice(-49), { title: noteTitle, content: noteContent }])
    setFuture([])
  }, [noteContent, noteTitle])

  const applySnapshot = useCallback(
    (snapshot: NotesEditorSnapshot) => {
      skipHistoryRef.current = true
      onUpdate(snapshot)
    },
    [onUpdate],
  )

  const recordChange = useCallback(() => {
    if (!skipHistoryRef.current) {
      pushHistorySnapshot()
    } else {
      skipHistoryRef.current = false
    }
  }, [pushHistorySnapshot])

  const handleTitleChange = useCallback(
    (value: string) => {
      if (locked) return
      recordChange()
      onUpdate({ title: value })
    },
    [locked, onUpdate, recordChange],
  )

  const handleContentChange = useCallback(
    (value: string) => {
      if (locked) return
      recordChange()
      onUpdate({ content: value })
    },
    [locked, onUpdate, recordChange],
  )

  const markSkipHistory = useCallback(() => {
    skipHistoryRef.current = true
  }, [])

  const handleUndo = useCallback(() => {
    const previous = past[past.length - 1]
    if (!previous) return
    setPast((items) => items.slice(0, -1))
    setFuture((items) => [{ title: noteTitle, content: noteContent }, ...items])
    applySnapshot(previous)
    return true
  }, [applySnapshot, noteContent, noteTitle, past])

  const handleRedo = useCallback(() => {
    const next = future[0]
    if (!next) return
    setFuture((items) => items.slice(1))
    setPast((items) => [...items, { title: noteTitle, content: noteContent }])
    applySnapshot(next)
    return true
  }, [applySnapshot, future, noteContent, noteTitle])

  return {
    past,
    future,
    resetHistory,
    handleTitleChange,
    handleContentChange,
    handleUndo,
    handleRedo,
    markSkipHistory,
  }
}

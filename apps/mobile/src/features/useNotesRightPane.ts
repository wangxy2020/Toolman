import { useMemo } from 'react'
import { useWindowDimensions } from 'react-native'
import { useMobileApp } from '../state/MobileAppContext'
import type { MobileNote } from '../storage/notes'
import { useRegisterModulePanelStatus } from './modulePageStatus'
import {
  applyNotePatch,
  buildNotesPanelStatus,
  countNoteChars,
  noteOutline,
  notesEditorLayoutFlags,
  resolveActiveNote,
} from './notesPaneUtils'

export function useNotesRightPane() {
  const { notes, setNotes, syncStatus, modulePrefs, activeNoteId } = useMobileApp()
  const { width } = useWindowDimensions()
  const note = resolveActiveNote(notes, activeNoteId)
  const notesPrefs = modulePrefs.notes
  const charCount = note ? countNoteChars(note.body) : 0
  const outline = noteOutline(note)
  const { showOutline, sideBySide, showEditor, showPreview } = notesEditorLayoutFlags(
    notesPrefs,
    outline.length,
    width,
  )

  const status = useMemo(
    () => buildNotesPanelStatus(note, syncStatus, charCount),
    [charCount, note, syncStatus],
  )

  useRegisterModulePanelStatus('notes-page', status)

  const patchNote = (patch: Partial<MobileNote>) => {
    if (!note) return
    setNotes(applyNotePatch(notes, note.id, patch))
  }

  return {
    note,
    notesPrefs,
    charCount,
    outline,
    showOutline,
    sideBySide,
    showEditor,
    showPreview,
    status,
    patchNote,
  }
}

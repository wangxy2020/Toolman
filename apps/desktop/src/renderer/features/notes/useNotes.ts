import { useCallback } from 'react'
import { useNotesData } from './useNotesData'
import { useNotesGroupShare } from './useNotesGroupShare'
import { useNotesSelection } from './useNotesSelection'
import { useNotesSync } from './useNotesSync'

export function useNotes() {
  const dataApi = useNotesData()
  const { data, setData, hydrated, setHydrated, notes, importNotesBackup: importNotesBackupRaw, ...dataMutations } =
    dataApi

  const selection = useNotesSelection({ data, setData, notes })

  const importNotesBackup = useCallback(
    (raw: string) => {
      const nextActiveId = importNotesBackupRaw(raw)
      selection.setActiveNoteId(nextActiveId)
    },
    [importNotesBackupRaw, selection.setActiveNoteId],
  )

  useNotesSync({
    data,
    setData,
    hydrated,
    setHydrated,
    activeNoteIdRef: selection.activeNoteIdRef,
    setActiveNoteId: selection.setActiveNoteId,
    importNotesBackup,
  })

  const groupShare = useNotesGroupShare({
    data,
    setData,
    setExpanded: selection.setExpanded,
    setActiveNoteId: selection.setActiveNoteId,
  })

  return {
    data,
    notebooks: data.notebooks,
    notes,
    notesByNotebook: selection.notesByNotebook,
    activeNoteId: selection.activeNoteId,
    activeNote: selection.activeNote,
    activeNotebook: selection.activeNotebook,
    expandedNotebookIds: selection.expandedNotebookIds,
    searchQuery: selection.searchQuery,
    setSearchQuery: selection.setSearchQuery,
    activeTagFilter: selection.activeTagFilter,
    setActiveTagFilter: selection.setActiveTagFilter,
    toggleExpanded: selection.toggleExpanded,
    createNotebook: selection.createNotebook,
    createNote: selection.createNote,
    createNoteFromMessage: selection.createNoteFromMessage,
    selectNote: selection.selectNote,
    openGroupSharedNote: groupShare.openGroupSharedNote,
    syncGroupNoteLock: groupShare.syncGroupNoteLock,
    openGroupKnowledgeMarkdown: groupShare.openGroupKnowledgeMarkdown,
    saveGroupNoteAsCopy: groupShare.saveGroupNoteAsCopy,
    ensureDefaultSelection: selection.ensureDefaultSelection,
    renameNotebook: dataMutations.renameNotebook,
    renameNote: dataMutations.renameNote,
    updateNote: dataMutations.updateNote,
    toggleNoteStarred: dataMutations.toggleNoteStarred,
    toggleNoteLocked: dataMutations.toggleNoteLocked,
    setNoteTags: dataMutations.setNoteTags,
    addNoteTag: dataMutations.addNoteTag,
    removeNoteTag: dataMutations.removeNoteTag,
    restoreNoteVersion: dataMutations.restoreNoteVersion,
    addNoteAttachment: dataMutations.addNoteAttachment,
    importNotesFromFiles: selection.importNotesFromFiles,
    importNotesBackup,
    exportNotesBackup: dataMutations.exportNotesBackup,
    setSyncFolder: dataMutations.setSyncFolder,
    deleteNote: selection.deleteNote,
    deleteNotebook: selection.deleteNotebook,
  }
}

import { useState } from 'react'

import { ConfirmDialog } from '../../components/ConfirmDialog'
import { isGroupNotebookId } from '../group/group-note-utils'
import { useI18n } from '../../i18n/useI18n'
import { NotesSidebarContextMenu } from './NotesSidebarContextMenu'
import type { NoteItem, NotebookItem } from './notes-storage'

type RenameTarget =
  | { kind: 'notebook'; id: string }
  | { kind: 'note'; id: string }
  | null

export function useNotesSidebarState() {
  const [renameTarget, setRenameTarget] = useState<RenameTarget>(null)
  const [deleteNoteTarget, setDeleteNoteTarget] = useState<NoteItem | null>(null)
  const [deleteNotebookTarget, setDeleteNotebookTarget] = useState<NotebookItem | null>(null)
  const [ingestNotebookTarget, setIngestNotebookTarget] = useState<NotebookItem | null>(null)
  const [notebookContextMenu, setNotebookContextMenu] = useState<{
    x: number
    y: number
    notebook: NotebookItem
  } | null>(null)
  const [noteContextMenu, setNoteContextMenu] = useState<{
    x: number
    y: number
    note: NoteItem
  } | null>(null)

  return {
    renameTarget,
    setRenameTarget,
    deleteNoteTarget,
    setDeleteNoteTarget,
    deleteNotebookTarget,
    setDeleteNotebookTarget,
    ingestNotebookTarget,
    setIngestNotebookTarget,
    notebookContextMenu,
    setNotebookContextMenu,
    noteContextMenu,
    setNoteContextMenu,
  }
}

export function NotesSidebarDialogs({
  state,
  onDeleteNote,
  onDeleteNotebook,
  onIngestNotebook,
  onIngestNote,
}: {
  state: ReturnType<typeof useNotesSidebarState>
  onDeleteNote: (noteId: string) => void
  onDeleteNotebook: (notebookId: string) => void
  onIngestNotebook?: (notebookId: string, notebookName: string) => void
  onIngestNote?: (noteId: string, noteTitle: string) => void
}) {
  const { t } = useI18n()
  const {
    notebookContextMenu,
    setNotebookContextMenu,
    noteContextMenu,
    setNoteContextMenu,
    ingestNotebookTarget,
    setIngestNotebookTarget,
    deleteNoteTarget,
    setDeleteNoteTarget,
    deleteNotebookTarget,
    setDeleteNotebookTarget,
  } = state

  return (
    <>
      {notebookContextMenu ? (
        <NotesSidebarContextMenu
          x={notebookContextMenu.x}
          y={notebookContextMenu.y}
          canDelete={!notebookContextMenu.notebook.isDefault}
          canIngest={Boolean(onIngestNotebook)}
          deleteLabel={t('sidebar.notes.deleteNotebook')}
          onClose={() => setNotebookContextMenu(null)}
          onIngest={() => setIngestNotebookTarget(notebookContextMenu.notebook)}
          onDelete={() => setDeleteNotebookTarget(notebookContextMenu.notebook)}
        />
      ) : null}

      {noteContextMenu ? (
        <NotesSidebarContextMenu
          x={noteContextMenu.x}
          y={noteContextMenu.y}
          canDelete
          canIngest={Boolean(onIngestNote)}
          deleteLabel={t('sidebar.notes.deleteNote')}
          onClose={() => setNoteContextMenu(null)}
          onIngest={() => onIngestNote?.(noteContextMenu.note.id, noteContextMenu.note.title)}
          onDelete={() => setDeleteNoteTarget(noteContextMenu.note)}
        />
      ) : null}

      {ingestNotebookTarget ? (
        <ConfirmDialog
          title={t('sidebar.notes.addToKnowledge')}
          message={t('sidebar.notes.ingestMessage', { name: ingestNotebookTarget.name })}
          confirmLabel={t('common.add')}
          cancelLabel={t('common.cancel')}
          onCancel={() => setIngestNotebookTarget(null)}
          onConfirm={() => {
            onIngestNotebook?.(ingestNotebookTarget.id, ingestNotebookTarget.name)
            setIngestNotebookTarget(null)
          }}
        />
      ) : null}

      {deleteNoteTarget ? (
        <ConfirmDialog
          title={t('sidebar.notes.deleteNoteTitle')}
          message={t('sidebar.notes.deleteNoteMessage', { title: deleteNoteTarget.title })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          danger
          onCancel={() => setDeleteNoteTarget(null)}
          onConfirm={() => {
            onDeleteNote(deleteNoteTarget.id)
            setDeleteNoteTarget(null)
          }}
        />
      ) : null}

      {deleteNotebookTarget ? (
        <ConfirmDialog
          title={t('sidebar.notes.deleteNotebookTitle')}
          message={
            isGroupNotebookId(deleteNotebookTarget.id)
              ? t('sidebar.notes.deleteNotebookLocalMessage', { name: deleteNotebookTarget.name })
              : t('sidebar.notes.deleteNotebookMessage', { name: deleteNotebookTarget.name })
          }
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          danger
          onCancel={() => setDeleteNotebookTarget(null)}
          onConfirm={() => {
            onDeleteNotebook(deleteNotebookTarget.id)
            setDeleteNotebookTarget(null)
          }}
        />
      ) : null}
    </>
  )
}

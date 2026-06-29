import { NotesPage } from '../notes/NotesPage'
import type { ChatPageState } from './useChatPage'

export type ChatPageNotesViewProps = Pick<
  ChatPageState,
  | 'notes'
  | 'messageSettings'
  | 'handleChatWithNote'
  | 'setNotesIngestTarget'
>

export function ChatPageNotesView({
  notes,
  messageSettings,
  handleChatWithNote,
  setNotesIngestTarget,
}: ChatPageNotesViewProps) {
  return (
    <NotesPage
      notebook={notes.activeNotebook}
      note={notes.activeNote}
      notes={notes.notes}
      syncFolderPath={notes.data.syncFolderPath}
      messageSettings={messageSettings}
      onUpdateNote={notes.updateNote}
      onToggleStarred={notes.toggleNoteStarred}
      onToggleLocked={notes.toggleNoteLocked}
      onAddNoteTag={notes.addNoteTag}
      onRemoveNoteTag={notes.removeNoteTag}
      onExportBackup={() => notes.exportNotesBackup()}
      onImportBackup={notes.importNotesBackup}
      onChatWithNote={handleChatWithNote}
      onIngestNote={(noteId, noteTitle) =>
        setNotesIngestTarget({ noteIds: [noteId], noteTitle })
      }
      onSetSyncFolder={notes.setSyncFolder}
      onSelectNote={notes.selectNote}
      onImportAttachment={notes.addNoteAttachment}
    />
  )
}

import {
  IconAgent,
  IconDownload,
  IconKnowledge,
  IconLock,
  IconPrint,
  IconSliders,
  IconStar,
} from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import { exportNoteAsMarkdown, printNote } from './notes-import-export'
import type { NoteItem } from './notes-storage'

interface Props {
  note: NoteItem
  onToggleStarred: (noteId: string) => void
  onToggleLocked: (noteId: string) => void
  onOpenSettings: () => void
  onChatWithNote?: (noteId: string) => void
  onIngestNote?: (noteId: string, noteTitle: string) => void
}

export function NotesHeaderActions({
  note,
  onToggleStarred,
  onToggleLocked,
  onOpenSettings,
  onChatWithNote,
  onIngestNote,
}: Props) {
  const { t } = useI18n()

  return (
    <div className="tm-chat-header-end">
      {onChatWithNote ? (
        <button
          type="button"
          className="tm-chat-header-settings-btn"
          title={t('notesPage.header.chatWithNote')}
          onClick={() => onChatWithNote(note.id)}
        >
          <IconAgent size={16} />
        </button>
      ) : null}
      {onIngestNote ? (
        <button
          type="button"
          className="tm-chat-header-settings-btn"
          title={t('notesPage.header.addToKnowledge')}
          onClick={() => onIngestNote(note.id, note.title)}
        >
          <IconKnowledge size={16} />
        </button>
      ) : null}
      <button
        type="button"
        className="tm-chat-header-settings-btn"
        title={t('notesPage.header.exportMarkdown')}
        onClick={() => exportNoteAsMarkdown(note)}
      >
        <IconDownload size={16} />
      </button>
      <button
        type="button"
        className="tm-chat-header-settings-btn"
        title={t('notesPage.header.printPdf')}
        onClick={() => printNote(note)}
      >
        <IconPrint size={16} />
      </button>
      <button
        type="button"
        className={[
          'tm-chat-header-settings-btn',
          note.starred ? 'tm-chat-header-settings-btn--active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        title={note.starred ? t('notesPage.header.unstar') : t('notesPage.header.star')}
        onClick={() => onToggleStarred(note.id)}
      >
        <IconStar size={16} filled={note.starred} />
      </button>
      <button
        type="button"
        className={[
          'tm-chat-header-settings-btn',
          note.locked ? 'tm-chat-header-settings-btn--active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        title={note.locked ? t('notesPage.header.unlock') : t('notesPage.header.lock')}
        onClick={() => onToggleLocked(note.id)}
      >
        <IconLock size={16} locked={note.locked} />
      </button>
      <button
        type="button"
        className="tm-chat-header-settings-btn"
        title={t('notesPage.header.noteSettings')}
        onClick={onOpenSettings}
      >
        <IconSliders size={16} />
      </button>
    </div>
  )
}

import {
  IconAgent,
  IconDownload,
  IconKnowledge,
  IconLock,
  IconPrint,
  IconSliders,
  IconStar,
} from '../../components/icons'
import { HeaderIconButton } from '../../components/layout/HeaderIconButton'
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
        <HeaderIconButton
          label={t('notesPage.header.chatWithNote')}
          onClick={() => onChatWithNote(note.id)}
        >
          <IconAgent size={16} />
        </HeaderIconButton>
      ) : null}
      {onIngestNote ? (
        <HeaderIconButton
          label={t('notesPage.header.addToKnowledge')}
          onClick={() => onIngestNote(note.id, note.title)}
        >
          <IconKnowledge size={16} />
        </HeaderIconButton>
      ) : null}
      <HeaderIconButton
        label={t('notesPage.header.exportMarkdown')}
        onClick={() => exportNoteAsMarkdown(note)}
      >
        <IconDownload size={16} />
      </HeaderIconButton>
      <HeaderIconButton label={t('notesPage.header.printPdf')} onClick={() => printNote(note)}>
        <IconPrint size={16} />
      </HeaderIconButton>
      <HeaderIconButton
        label={note.starred ? t('notesPage.header.unstar') : t('notesPage.header.star')}
        active={note.starred}
        onClick={() => onToggleStarred(note.id)}
      >
        <IconStar size={16} filled={note.starred} />
      </HeaderIconButton>
      {note.groupPermissionLocked ? null : (
        <HeaderIconButton
          label={note.locked ? t('notesPage.header.unlock') : t('notesPage.header.lock')}
          active={note.locked}
          onClick={() => onToggleLocked(note.id)}
        >
          <IconLock size={16} locked={note.locked} />
        </HeaderIconButton>
      )}
      <HeaderIconButton label={t('notesPage.header.noteSettings')} onClick={onOpenSettings}>
        <IconSliders size={16} />
      </HeaderIconButton>
    </div>
  )
}

import {
  IconAgent,
  IconDownload,
  IconKnowledge,
  IconLock,
  IconPrint,
  IconSliders,
  IconStar,
} from '../../components/icons'
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
  return (
    <div className="tm-chat-header-end">
      {onChatWithNote ? (
        <button
          type="button"
          className="tm-chat-header-settings-btn"
          title="带着这篇笔记聊天"
          onClick={() => onChatWithNote(note.id)}
        >
          <IconAgent size={16} />
        </button>
      ) : null}
      {onIngestNote ? (
        <button
          type="button"
          className="tm-chat-header-settings-btn"
          title="添加到知识库"
          onClick={() => onIngestNote(note.id, note.title)}
        >
          <IconKnowledge size={16} />
        </button>
      ) : null}
      <button
        type="button"
        className="tm-chat-header-settings-btn"
        title="导出 Markdown"
        onClick={() => exportNoteAsMarkdown(note)}
      >
        <IconDownload size={16} />
      </button>
      <button
        type="button"
        className="tm-chat-header-settings-btn"
        title="打印 / PDF"
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
        title={note.starred ? '取消收藏' : '收藏'}
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
        title={note.locked ? '解锁' : '锁定'}
        onClick={() => onToggleLocked(note.id)}
      >
        <IconLock size={16} locked={note.locked} />
      </button>
      <button
        type="button"
        className="tm-chat-header-settings-btn"
        title="笔记设置"
        onClick={onOpenSettings}
      >
        <IconSliders size={16} />
      </button>
    </div>
  )
}

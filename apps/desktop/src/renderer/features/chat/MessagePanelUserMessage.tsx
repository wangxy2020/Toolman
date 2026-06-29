import type { Message } from '@toolman/shared'
import {
  IconCopy,
  IconEdit,
  IconGitFork,
  IconSaveNote,
  IconTrash,
} from '../../components/icons'
import { formatMessageTime, formatUserTokens } from './message-utils'
import { getUserMessageCopyText, getUserVisibleText } from './chat-attachments'
import type { MessageSettings } from './message-settings'
import { MessageMarkdown } from './MessageMarkdown'
import { UserMessageAttachments } from './UserMessageAttachments'
import { MessagePanelActionButton } from './MessagePanelActionButton'

export function MessagePanelUserMessage({
  message,
  messageSettings,
  displayName,
  avatarInitial,
  onDelete,
  onCopy,
  onEdit,
  onFork,
  onSaveToNote,
  copied,
  deleting,
  forking,
  editing,
  sending,
  isOwn = false,
}: {
  message: Message
  messageSettings: MessageSettings
  displayName: string
  avatarInitial: string
  onDelete: (id: string, anchor: HTMLElement) => void
  onCopy: () => void
  onEdit?: () => void
  onFork?: () => void
  onSaveToNote?: () => void
  copied: boolean
  deleting?: boolean
  forking?: boolean
  editing?: boolean
  sending?: boolean
  isOwn?: boolean
}) {
  const text = getUserVisibleText(message.contentBlocks)
  const copyText = getUserMessageCopyText(message.contentBlocks)

  return (
    <article
      className={[
        'tm-stream-message',
        'tm-stream-message--user',
        isOwn ? 'tm-stream-message--own' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="tm-stream-message-head">
        <div className="tm-stream-avatar tm-stream-avatar--user">{avatarInitial}</div>
        <div className="tm-stream-meta">
          <div className="tm-stream-name">{displayName}</div>
          <div className="tm-stream-time">{formatMessageTime(message.createdAt)}</div>
        </div>
      </div>

      <div className="tm-stream-body">
        <div className="tm-stream-content">
          <UserMessageAttachments blocks={message.contentBlocks} />
          {text ? <MessageMarkdown text={text} settings={messageSettings} /> : null}
        </div>
        <div className="tm-stream-footer tm-stream-footer--user">
          <span className="tm-stream-tokens">{formatUserTokens(message)}</span>
          <div className="tm-stream-hover-actions">
            <MessagePanelActionButton
              title={copied ? '已复制' : '复制'}
              disabled={!copyText.trim()}
              active={copied}
              onClick={onCopy}
            >
              <IconCopy size={15} />
            </MessagePanelActionButton>
            {onEdit ? (
              <MessagePanelActionButton
                title="编辑"
                active={editing}
                disabled={sending}
                onClick={onEdit}
              >
                <IconEdit size={15} />
              </MessagePanelActionButton>
            ) : null}
            {onFork ? (
              <MessagePanelActionButton
                title="从此处分叉"
                loading={forking}
                onClick={onFork}
              >
                <IconGitFork size={15} className={forking ? 'tm-icon-spin' : undefined} />
              </MessagePanelActionButton>
            ) : null}
            {onSaveToNote ? (
              <MessagePanelActionButton
                title="保存到笔记"
                disabled={!copyText.trim()}
                onClick={onSaveToNote}
              >
                <IconSaveNote size={15} />
              </MessagePanelActionButton>
            ) : null}
            <MessagePanelActionButton
              title="删除"
              loading={deleting}
              onClick={(event) => onDelete(message.id, event.currentTarget)}
            >
              <IconTrash size={15} className={deleting ? 'tm-icon-spin' : undefined} />
            </MessagePanelActionButton>
          </div>
        </div>
      </div>
    </article>
  )
}

import type { Message } from '@toolman/shared'
import { getUserMessageCopyText } from './chat-attachments'
import { getMessageText as getAssistantMessageText } from './message-utils'
import type { MessageSettings } from './message-settings'
import { MessagePanelAssistantMessage } from './MessagePanelAssistantMessage'
import { MessagePanelUserMessage } from './MessagePanelUserMessage'
import type { MessageTurn, MessageTranslation, PendingMessageAction } from './message-panel-types'
import { isMessageActionPending } from './message-panel-utils'

export type MessageTurnViewProps = {
  turn: MessageTurn
  messageSettings: MessageSettings
  assistantName: string
  defaultModelId: string | null
  sending?: boolean
  copiedKey: string | null
  onRequestDeleteMessage: (messageId: string, anchor: HTMLElement) => void
  onRegenerateMessage?: (messageId: string) => void
  onEditUserMessage?: (messageId: string) => void
  onForkFromMessage?: (messageId: string) => void
  onSaveToNote?: (messageId: string) => void
  onCopy: (key: string, text: string) => void
  onRegenerate: (message: Message) => void
  onTranslate: (message: Message) => void
  translations: Record<string, MessageTranslation>
  visibleTranslationIds: Set<string>
  translatingIds: Set<string>
  pendingMessageAction?: PendingMessageAction | null
  editingUserMessageId?: string | null
  getUserDisplayName?: (message: Message) => string
  getUserAvatarInitial?: (message: Message) => string
  isOwnUserMessage?: (message: Message) => boolean
}

export function MessagePanelTurnView({
  turn,
  messageSettings,
  assistantName,
  defaultModelId,
  sending,
  copiedKey,
  getUserDisplayName,
  getUserAvatarInitial,
  isOwnUserMessage,
  onRequestDeleteMessage,
  onRegenerateMessage,
  onEditUserMessage,
  onForkFromMessage,
  onSaveToNote,
  onCopy,
  onRegenerate,
  onTranslate,
  translations,
  visibleTranslationIds,
  translatingIds,
  pendingMessageAction,
  editingUserMessageId,
}: MessageTurnViewProps) {
  if (turn.type === 'user') {
    const message = turn.message
    const text = getUserMessageCopyText(message.contentBlocks)
    const copyKey = `user:${message.id}`

    return (
      <MessagePanelUserMessage
        message={message}
        messageSettings={messageSettings}
        displayName={getUserDisplayName?.(message) ?? '用户'}
        avatarInitial={getUserAvatarInitial?.(message) ?? '用'}
        onDelete={onRequestDeleteMessage}
        copied={copiedKey === copyKey}
        onCopy={() => void onCopy(copyKey, text)}
        onEdit={onEditUserMessage ? () => onEditUserMessage(message.id) : undefined}
        onFork={onForkFromMessage ? () => onForkFromMessage(message.id) : undefined}
        onSaveToNote={onSaveToNote ? () => onSaveToNote(message.id) : undefined}
        deleting={isMessageActionPending(pendingMessageAction, 'delete', message.id)}
        forking={isMessageActionPending(pendingMessageAction, 'fork', message.id)}
        editing={editingUserMessageId === message.id}
        sending={sending}
        isOwn={isOwnUserMessage?.(message) ?? false}
      />
    )
  }

  const { messages: group } = turn
  const isMulti = group.length > 1

  const renderAssistant = (msg: Message) => {
    const translationVisible = visibleTranslationIds.has(msg.id)

    return (
      <MessagePanelAssistantMessage
        key={msg.id}
        message={msg}
        assistantName={assistantName}
        defaultModelId={defaultModelId}
        messageSettings={messageSettings}
        sending={sending}
        onDelete={onRequestDeleteMessage}
        copied={copiedKey === `assistant:${msg.id}`}
        onCopy={() => void onCopy(`assistant:${msg.id}`, getAssistantMessageText(msg))}
        onRegenerate={onRegenerateMessage ? () => onRegenerate(msg) : undefined}
        onFork={onForkFromMessage ? () => onForkFromMessage(msg.id) : undefined}
        onSaveToNote={onSaveToNote ? () => onSaveToNote(msg.id) : undefined}
        translation={translationVisible ? translations[msg.id] : undefined}
        translationVisible={translationVisible}
        translating={translatingIds.has(msg.id)}
        onTranslate={() => void onTranslate(msg)}
        deleting={isMessageActionPending(pendingMessageAction, 'delete', msg.id)}
        forking={isMessageActionPending(pendingMessageAction, 'fork', msg.id)}
        regenerating={isMessageActionPending(pendingMessageAction, 'regenerate', msg.id)}
      />
    )
  }

  if (isMulti) {
    return (
      <div
        className={`tm-stream-grid ${group.length >= 2 ? 'tm-stream-grid--2' : ''}`}
      >
        {group.map(renderAssistant)}
      </div>
    )
  }

  return renderAssistant(group[0])
}

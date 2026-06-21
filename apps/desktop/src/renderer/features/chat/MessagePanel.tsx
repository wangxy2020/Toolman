import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import type { Message, TranslationLanguage } from '@toolman/shared'
import {
  IconCopy,
  IconEdit,
  IconGitFork,
  IconRefresh,
  IconSaveNote,
  IconTrash,
  IconTranslate,
} from '../../components/icons'
import { modelNameFromId } from './model-utils'
import {
  formatAssistantTokens,
  formatMessageTime,
  formatUserTokens,
  getMessageText,
} from './message-utils'
import { getUserMessageCopyText, getUserVisibleText } from './chat-attachments'
import { hasMessageError } from './message-error-utils'
import { MessageErrorBanner } from './MessageErrorBanner'
import { useCopyFeedback } from './useCopyFeedback'
import { useTranslate } from './useTranslate'
import {
  normalizeTranslationLanguages,
  translationLanguageLabel,
} from './translation-utils'
import type { MessageSettings, SendShortcut } from './message-settings'
import { sendShortcutPlaceholder } from './message-settings'
import { MessageContent } from './MessageContent'
import { MessageDeleteConfirmPopover } from './MessageDeleteConfirmPopover'
import { MessageMarkdown } from './MessageMarkdown'
import { UserMessageAttachments } from './UserMessageAttachments'
import { MESSAGE_VIRTUAL_SCROLL_THRESHOLD } from './message-panel.constants'

export type PendingMessageAction = {
  kind: 'delete' | 'regenerate' | 'fork'
  messageId: string
}

interface Props {
  messages: Message[]
  loading: boolean
  assistantName: string
  defaultModelId: string | null
  translationLanguages?: [TranslationLanguage, TranslationLanguage]
  messageSettings: MessageSettings
  sending?: boolean
  pendingMessageAction?: PendingMessageAction | null
  onDeleteMessage: (messageId: string) => void
  onRegenerateMessage?: (messageId: string) => void
  onEditUserMessage?: (messageId: string) => void
  onForkFromMessage?: (messageId: string) => void
  editingUserMessageId?: string | null
  onSaveToNote?: (messageId: string) => void
  onError?: (message: string | null) => void
  getUserDisplayName?: (message: Message) => string
  getUserAvatarInitial?: (message: Message) => string
  sendShortcut?: SendShortcut
}

export type MessageTurn =
  | { type: 'user'; message: Message }
  | { type: 'assistant-group'; messages: Message[] }

type MessageTranslation = {
  text: string
  targetLanguage: TranslationLanguage
}

export function groupMessages(messages: Message[]): MessageTurn[] {
  const turns: MessageTurn[] = []
  let index = 0

  while (index < messages.length) {
    const message = messages[index]
    if (message.role === 'user') {
      turns.push({ type: 'user', message })
      index += 1
      continue
    }

    const parentId = message.parentMessageId
    const group: Message[] = []
    while (
      index < messages.length &&
      messages[index].role === 'assistant' &&
      messages[index].parentMessageId === parentId
    ) {
      group.push(messages[index])
      index += 1
    }
    turns.push({ type: 'assistant-group', messages: group })
  }

  return turns
}

function MessageActionButton({
  title,
  onClick,
  disabled,
  active,
  loading,
  children,
}: {
  title: string
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  active?: boolean
  loading?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={[
        'tm-stream-action-btn',
        active ? 'tm-stream-action-btn--active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={loading ? `${title}（处理中…）` : title}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function isMessageActionPending(
  pending: PendingMessageAction | null | undefined,
  kind: PendingMessageAction['kind'],
  messageId: string,
): boolean {
  return pending?.kind === kind && pending.messageId === messageId
}

function UserMessage({
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
}) {
  const text = getUserVisibleText(message.contentBlocks)
  const copyText = getUserMessageCopyText(message.contentBlocks)

  return (
    <article className="tm-stream-message tm-stream-message--user">
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
            <MessageActionButton
              title={copied ? '已复制' : '复制'}
              disabled={!copyText.trim()}
              active={copied}
              onClick={onCopy}
            >
              <IconCopy size={15} />
            </MessageActionButton>
            {onEdit ? (
              <MessageActionButton
                title="编辑"
                active={editing}
                disabled={sending}
                onClick={onEdit}
              >
                <IconEdit size={15} />
              </MessageActionButton>
            ) : null}
            {onFork ? (
              <MessageActionButton
                title="从此处分叉"
                loading={forking}
                onClick={onFork}
              >
                <IconGitFork size={15} className={forking ? 'tm-icon-spin' : undefined} />
              </MessageActionButton>
            ) : null}
            {onSaveToNote ? (
              <MessageActionButton
                title="保存到笔记"
                disabled={!copyText.trim()}
                onClick={onSaveToNote}
              >
                <IconSaveNote size={15} />
              </MessageActionButton>
            ) : null}
            <MessageActionButton
              title="删除"
              loading={deleting}
              onClick={(event) => onDelete(message.id, event.currentTarget)}
            >
              <IconTrash size={15} className={deleting ? 'tm-icon-spin' : undefined} />
            </MessageActionButton>
          </div>
        </div>
      </div>
    </article>
  )
}

function AssistantMessage({
  message,
  assistantName,
  defaultModelId,
  messageSettings,
  sending,
  onDelete,
  onCopy,
  onRegenerate,
  onFork,
  onSaveToNote,
  copied,
  translation,
  translationVisible,
  translating,
  onTranslate,
  deleting,
  forking,
  regenerating,
}: {
  message: Message
  assistantName: string
  defaultModelId: string | null
  messageSettings: MessageSettings
  sending?: boolean
  onDelete: (id: string, anchor: HTMLElement) => void
  onCopy: () => void
  onRegenerate?: () => void
  onFork?: () => void
  onSaveToNote?: () => void
  copied: boolean
  translation?: MessageTranslation
  translationVisible: boolean
  translating: boolean
  onTranslate: () => void
  deleting?: boolean
  forking?: boolean
  regenerating?: boolean
}) {
  const text = getMessageText(message)
  const tokenLabel = formatAssistantTokens(message)
  const modelLabel = message.modelId ? modelNameFromId(message.modelId) : null
  const displayName = modelLabel ? `${assistantName} · ${modelLabel}` : assistantName
  const canTranslate = Boolean(
    text.trim() && (message.modelId ?? defaultModelId) && message.status === 'completed',
  )
  const canRegenerate = Boolean(
    onRegenerate &&
      text.trim() &&
      (message.modelId ?? defaultModelId) &&
      (message.status === 'completed' || message.status === 'failed' || message.status === 'aborted') &&
      !sending &&
      !regenerating,
  )

  return (
    <article className="tm-stream-message tm-stream-message--assistant">
      <div className="tm-stream-message-head">
        <div className="tm-stream-avatar tm-stream-avatar--assistant">A</div>
        <div className="tm-stream-meta">
          <div className="tm-stream-name">{displayName}</div>
          <div className="tm-stream-time">{formatMessageTime(message.createdAt)}</div>
        </div>
      </div>

      <div className="tm-stream-body">
        <div className="tm-stream-content">
          <MessageContent
            contentBlocks={message.contentBlocks}
            streaming={message.status === 'streaming'}
            settings={messageSettings}
          />
        </div>

        {translation && (
          <div className="tm-stream-translation">
            <div className="tm-stream-translation-label">
              译文（{translationLanguageLabel(translation.targetLanguage)}）
            </div>
            <div className="tm-stream-translation-text">
              <MessageMarkdown text={translation.text} settings={messageSettings} />
            </div>
          </div>
        )}

        {message.error && hasMessageError(message.status) && (
          <MessageErrorBanner
            error={message.error}
            modelId={message.modelId ?? defaultModelId}
            messageSettings={messageSettings}
          />
        )}

        {message.status !== 'streaming' && (
          <div className="tm-stream-footer">
            <div className="tm-stream-actions">
              <MessageActionButton
                title={copied ? '已复制' : '复制'}
                disabled={!text.trim()}
                active={copied}
                onClick={onCopy}
              >
                <IconCopy size={15} />
              </MessageActionButton>
              <MessageActionButton
                title={
                  translating ? '翻译中…' : translationVisible ? '隐藏译文' : '翻译'
                }
                disabled={!canTranslate || translating}
                active={translating || translationVisible}
                onClick={onTranslate}
              >
                <IconTranslate size={15} className={translating ? 'tm-icon-spin' : undefined} />
              </MessageActionButton>
              {onRegenerate ? (
                <MessageActionButton
                  title="重新生成"
                  disabled={!canRegenerate}
                  loading={regenerating}
                  onClick={onRegenerate}
                >
                  <IconRefresh size={15} className={regenerating ? 'tm-icon-spin' : undefined} />
                </MessageActionButton>
              ) : null}
              {onFork ? (
                <MessageActionButton title="从此处分叉" loading={forking} onClick={onFork}>
                  <IconGitFork size={15} className={forking ? 'tm-icon-spin' : undefined} />
                </MessageActionButton>
              ) : null}
              {onSaveToNote ? (
                <MessageActionButton
                  title="保存到笔记"
                  disabled={!text.trim()}
                  onClick={onSaveToNote}
                >
                  <IconSaveNote size={15} />
                </MessageActionButton>
              ) : null}
              <MessageActionButton
                title="删除"
                loading={deleting}
                onClick={(event) => onDelete(message.id, event.currentTarget)}
              >
                <IconTrash size={15} className={deleting ? 'tm-icon-spin' : undefined} />
              </MessageActionButton>
            </div>
            <div className="tm-stream-tokens">{tokenLabel}</div>
          </div>
        )}
      </div>
    </article>
  )
}

function MessageTurnView({
  turn,
  messageSettings,
  assistantName,
  defaultModelId,
  sending,
  copiedKey,
  getUserDisplayName,
  getUserAvatarInitial,
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
}: {
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
}) {
  if (turn.type === 'user') {
    const message = turn.message
    const text = getUserMessageCopyText(message.contentBlocks)
    const copyKey = `user:${message.id}`

    return (
      <UserMessage
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
      />
    )
  }

  const { messages: group } = turn
  const isMulti = group.length > 1

  const renderAssistant = (msg: Message) => {
    const translationVisible = visibleTranslationIds.has(msg.id)

    return (
      <AssistantMessage
        key={msg.id}
        message={msg}
        assistantName={assistantName}
        defaultModelId={defaultModelId}
        messageSettings={messageSettings}
        sending={sending}
        onDelete={onRequestDeleteMessage}
        copied={copiedKey === `assistant:${msg.id}`}
        onCopy={() => void onCopy(`assistant:${msg.id}`, getMessageText(msg))}
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

export function MessagePanel({
  messages,
  loading,
  assistantName,
  defaultModelId,
  translationLanguages,
  messageSettings,
  sending = false,
  onDeleteMessage,
  onRegenerateMessage,
  onEditUserMessage,
  onForkFromMessage,
  onSaveToNote,
  onError,
  pendingMessageAction = null,
  editingUserMessageId = null,
  getUserDisplayName,
  getUserAvatarInitial,
  sendShortcut = 'enter',
}: Props) {
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const turns = useMemo(() => groupMessages(messages), [messages])
  const useVirtualScroll = messages.length > MESSAGE_VIRTUAL_SCROLL_THRESHOLD
  const streamScrollKey = useMemo(() => {
    const tail = messages[messages.length - 1]
    if (!tail) return ''
    let textLength = 0
    let thinkingLength = 0
    for (const block of tail.contentBlocks) {
      if (block.type === 'text') textLength += block.text.length
      if (block.type === 'thinking') thinkingLength += block.text.length
    }
    return `${tail.id}:${tail.status}:${textLength}:${thinkingLength}`
  }, [messages])

  const scrollMessagesToBottom = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      if (useVirtualScroll) {
        if (turns.length === 0) return
        virtuosoRef.current?.scrollToIndex({
          index: turns.length - 1,
          align: 'end',
          behavior: behavior === 'instant' ? 'auto' : behavior,
        })
        return
      }

      const container = messagesContainerRef.current
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior })
        return
      }

      bottomRef.current?.scrollIntoView({ behavior })
    },
    [turns.length, useVirtualScroll],
  )
  const languages = useMemo(
    () => normalizeTranslationLanguages(translationLanguages),
    [translationLanguages],
  )
  const { copiedKey, copy } = useCopyFeedback()
  const { translate } = useTranslate()
  const [translations, setTranslations] = useState<Record<string, MessageTranslation>>({})
  const [visibleTranslationIds, setVisibleTranslationIds] = useState<Set<string>>(new Set())
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState<{
    messageId: string
    anchorEl: HTMLElement
  } | null>(null)

  useLayoutEffect(() => {
    if (loading || messages.length === 0) return

    const scroll = () => scrollMessagesToBottom('auto')
    scroll()
    requestAnimationFrame(scroll)
  }, [loading, messages.length, scrollMessagesToBottom])

  useEffect(() => {
    if (loading || messages.length === 0) return
    scrollMessagesToBottom('smooth')
  }, [messages, visibleTranslationIds, loading, scrollMessagesToBottom])

  useEffect(() => {
    if (loading || messages.length === 0) return
    const tail = messages[messages.length - 1]
    if (!tail || tail.status !== 'streaming') return
    scrollMessagesToBottom('smooth')
  }, [streamScrollKey, loading, messages.length, scrollMessagesToBottom])

  const handleTranslateMessage = useCallback(
    async (message: Message) => {
      const text = getMessageText(message)
      const modelId = message.modelId ?? defaultModelId
      if (!text.trim() || !modelId) return

      if (translations[message.id] && visibleTranslationIds.has(message.id)) {
        setVisibleTranslationIds((prev) => {
          const next = new Set(prev)
          next.delete(message.id)
          return next
        })
        return
      }

      if (translations[message.id]) {
        setVisibleTranslationIds((prev) => new Set(prev).add(message.id))
        return
      }

      setTranslatingIds((prev) => new Set(prev).add(message.id))
      onError?.(null)

      try {
        const result = await translate({
          text,
          modelId,
          translationLanguages: languages,
        })
        setTranslations((prev) => ({
          ...prev,
          [message.id]: {
            text: result.text,
            targetLanguage: result.targetLanguage,
          },
        }))
        setVisibleTranslationIds((prev) => new Set(prev).add(message.id))
      } catch (error) {
        onError?.(error instanceof Error ? error.message : '翻译失败')
      } finally {
        setTranslatingIds((prev) => {
          const next = new Set(prev)
          next.delete(message.id)
          return next
        })
      }
    },
    [defaultModelId, languages, onError, translate, translations, visibleTranslationIds],
  )

  const handleRegenerateMessage = useCallback(
    (message: Message) => {
      if (!onRegenerateMessage) return
      if (messageSettings.confirmBeforeRegenerateMessage) {
        const confirmed = window.confirm('确定要重新生成此回复吗？该消息之后的内容将被删除。')
        if (!confirmed) return
      }
      onRegenerateMessage(message.id)
    },
    [messageSettings.confirmBeforeRegenerateMessage, onRegenerateMessage],
  )

  const handleRequestDeleteMessage = useCallback(
    (messageId: string, anchorEl: HTMLElement) => {
      if (!messageSettings.confirmBeforeDeleteMessage) {
        onDeleteMessage(messageId)
        return
      }
      setDeleteConfirm({ messageId, anchorEl })
    },
    [messageSettings.confirmBeforeDeleteMessage, onDeleteMessage],
  )

  const handleConfirmDeleteMessage = useCallback(() => {
    if (!deleteConfirm) return
    onDeleteMessage(deleteConfirm.messageId)
    setDeleteConfirm(null)
  }, [deleteConfirm, onDeleteMessage])

  const deleteConfirmPopover =
    deleteConfirm ? (
      <MessageDeleteConfirmPopover
        anchorEl={deleteConfirm.anchorEl}
        onConfirm={handleConfirmDeleteMessage}
        onCancel={() => setDeleteConfirm(null)}
      />
    ) : null

  const turnViewProps = {
    messageSettings,
    assistantName,
    defaultModelId,
    sending,
    copiedKey,
    getUserDisplayName,
    getUserAvatarInitial,
    onRequestDeleteMessage: handleRequestDeleteMessage,
    onRegenerateMessage,
    onEditUserMessage,
    onForkFromMessage,
    onSaveToNote,
    onCopy: copy,
    onRegenerate: handleRegenerateMessage,
    onTranslate: handleTranslateMessage,
    translations,
    visibleTranslationIds,
    translatingIds,
    pendingMessageAction,
    editingUserMessageId,
  }

  if (loading) {
    return (
      <>
        <div className="tm-messages-center">加载消息…</div>
        {deleteConfirmPopover}
      </>
    )
  }

  if (messages.length === 0) {
    return (
      <>
        <div className="tm-messages-center">
          <div className="tm-messages-empty-title">开始对话</div>
          <div>在这里输入消息，按 {sendShortcutPlaceholder(sendShortcut)} 发送</div>
        </div>
        {deleteConfirmPopover}
      </>
    )
  }

  if (useVirtualScroll) {
    return (
      <>
        <div className="tm-messages tm-messages--virtualized">
          <Virtuoso
            ref={virtuosoRef}
            className="tm-messages-virtuoso"
            data={turns}
            followOutput="auto"
            alignToBottom
            initialTopMostItemIndex={Math.max(0, turns.length - 1)}
            increaseViewportBy={{ top: 600, bottom: 600 }}
            computeItemKey={(_index, turn) =>
              turn.type === 'user'
                ? turn.message.id
                : turn.messages.map((message) => message.id).join('-')
            }
            itemContent={(index, turn) => (
              <div
                className="tm-messages-turn"
                data-first={index === 0 ? 'true' : undefined}
                data-last={index === turns.length - 1 ? 'true' : undefined}
              >
                <MessageTurnView turn={turn} {...turnViewProps} />
              </div>
            )}
          />
        </div>
        {deleteConfirmPopover}
      </>
    )
  }

  return (
    <>
      <div className="tm-messages" ref={messagesContainerRef}>
        {turns.map((turn) => (
          <MessageTurnView
            key={
              turn.type === 'user'
                ? turn.message.id
                : turn.messages.map((message) => message.id).join('-')
            }
            turn={turn}
            {...turnViewProps}
          />
        ))}
        <div ref={bottomRef} />
      </div>
      {deleteConfirmPopover}
    </>
  )
}

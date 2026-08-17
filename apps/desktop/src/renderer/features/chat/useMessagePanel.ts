import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { VirtuosoHandle } from 'react-virtuoso'
import type { Message } from '@toolman/shared'
import { getUserFacingMessageText } from './message-utils'
import { useCopyFeedback } from './useCopyFeedback'
import { useTranslate } from './useTranslate'
import { normalizeTranslationLanguages } from './translation-utils'
import { sendShortcutPlaceholder } from './message-settings'
import { useI18n } from '../../i18n/useI18n'
import { MESSAGE_VIRTUAL_SCROLL_THRESHOLD } from './message-panel.constants'
import type { MessagePanelProps, MessageTranslation } from './message-panel-types'
import { groupMessages } from './message-panel-utils'
import type { MessageTurnViewProps } from './MessagePanelTurnView'
import {
  buildMessagePanelScrollKey,
  buildStreamScrollKey,
  isScrollContainerNearBottom,
} from './message-panel-scroll'

export function useMessagePanel({
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
  isOwnUserMessage,
  userMessageAlign = 'agent',
  sendShortcut = 'enter',
  emptyTitle,
  emptyHint,
  loadingLabel,
  assistantFooterMessageId = null,
  assistantFooter = null,
  speakingMessageId = null,
  ttsPlaybackState = 'idle',
  onSpeakMessage,
  onPauseTts,
  onResumeTts,
  onStopTts,
}: MessagePanelProps) {
  const { t } = useI18n()
  const resolvedEmptyTitle = emptyTitle ?? t('chat.messages.emptyTitle')
  const resolvedEmptyHint =
    emptyHint ??
    t('chat.messages.emptyHint', { shortcut: sendShortcutPlaceholder(sendShortcut) })
  const resolvedLoadingLabel = loadingLabel ?? t('chat.messages.loading')
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const turns = useMemo(() => groupMessages(messages), [messages])
  const useVirtualScroll = messages.length > MESSAGE_VIRTUAL_SCROLL_THRESHOLD
  const messagePanelScrollKey = useMemo(() => buildMessagePanelScrollKey(messages), [messages])
  const streamScrollKey = useMemo(() => buildStreamScrollKey(messages), [messages])

  const getScrollContainer = useCallback((): HTMLElement | null => {
    const root = messagesContainerRef.current
    if (!root) return null
    if (!useVirtualScroll) return root
    return root.querySelector<HTMLElement>('[data-virtuoso-scroller]') ?? root
  }, [useVirtualScroll])

  const scrollMessagesToBottom = useCallback(
    (behavior: ScrollBehavior = 'auto', options?: { onlyIfNearBottom?: boolean }) => {
      if (options?.onlyIfNearBottom) {
        const container = getScrollContainer()
        if (container && !isScrollContainerNearBottom(container)) return
      }

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
        if (behavior === 'auto') {
          container.scrollTop = container.scrollHeight
        } else {
          container.scrollTo({ top: container.scrollHeight, behavior })
        }
        return
      }

      bottomRef.current?.scrollIntoView({ behavior })
    },
    [getScrollContainer, turns.length, useVirtualScroll],
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
  const lastMessageScrollKeyRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (loading || messages.length === 0) return

    const scroll = () => scrollMessagesToBottom('auto')
    scroll()
    requestAnimationFrame(scroll)
  }, [loading, messages.length, scrollMessagesToBottom])

  useEffect(() => {
    if (loading || messages.length === 0) return
    if (lastMessageScrollKeyRef.current === messagePanelScrollKey) return
    lastMessageScrollKeyRef.current = messagePanelScrollKey

    const hasStreaming = messages.some((message) => message.status === 'streaming')
    scrollMessagesToBottom(hasStreaming || sending ? 'auto' : 'smooth')
  }, [messagePanelScrollKey, sending, loading, messages.length, messages, scrollMessagesToBottom])

  useLayoutEffect(() => {
    if (loading || messages.length === 0) return
    const tail = messages[messages.length - 1]
    if (!tail || tail.status !== 'streaming') return

    scrollMessagesToBottom('auto', { onlyIfNearBottom: true })
  }, [streamScrollKey, loading, messages.length, scrollMessagesToBottom])

  const handleTranslateMessage = useCallback(
    async (message: Message) => {
      const text = getUserFacingMessageText(message)
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

  const turnViewProps: Omit<MessageTurnViewProps, 'turn'> = {
    messageSettings,
    assistantName,
    defaultModelId,
    sending,
    copiedKey,
    getUserDisplayName,
    getUserAvatarInitial,
    isOwnUserMessage,
    userMessageAlign,
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
    assistantFooterMessageId,
    assistantFooter,
    speakingMessageId,
    ttsPlaybackState,
    onSpeakMessage,
    onPauseTts,
    onResumeTts,
    onStopTts,
  }

  return {
    resolvedEmptyTitle,
    resolvedEmptyHint,
    resolvedLoadingLabel,
    loading,
    messages,
    turns,
    useVirtualScroll,
    messagesContainerRef,
    bottomRef,
    virtuosoRef,
    deleteConfirm,
    setDeleteConfirm,
    handleConfirmDeleteMessage,
    turnViewProps,
  }
}

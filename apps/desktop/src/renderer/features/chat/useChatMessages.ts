import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type ContentBlock, type Message } from '@toolman/shared'
import { contentBlocksToPendingAttachments, getUserVisibleText } from './chat-attachments'
import type { ChatSendOptions } from './useChatSend'
import type { useSessionManager } from './useSessionManager'
import type { ChatStreamingRefs } from './useChatMessageRefs'
import { subscribeChatMessageStream } from './useChatStreamSubscription'

export type { ChatStreamingRefs } from './useChatMessageRefs'
export { createChatStreamingRefs } from './useChatMessageRefs'

type SessionManager = ReturnType<typeof useSessionManager>

export function useChatMessages(
  session: SessionManager,
  streamingRefs: ChatStreamingRefs,
  deps: {
    setSending: (sending: boolean) => void
    setError: (msg: string | null) => void
    effectiveModelIds: string[]
    buildSendOptions: (contentBlocks?: ContentBlock[]) => ChatSendOptions
    handleSelectSession: (sessionId: string) => Promise<void>
  },
) {
  const { streamingIds, suppressAbortError } = streamingRefs
  const { setSending, setError, effectiveModelIds, buildSendOptions, handleSelectSession } = deps

  const [messages, setMessages] = useState<Message[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [pendingMessageAction, setPendingMessageAction] = useState<{
    kind: 'delete' | 'regenerate' | 'fork'
    messageId: string
  } | null>(null)
  const [editingUserMessageId, setEditingUserMessageId] = useState<string | null>(null)

  const loadMessages = useCallback(async (sessionId: string) => {
    setMessagesLoading(true)
    const result = await window.api.invoke(IpcChannel.MessageList, { sessionId })
    setMessagesLoading(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    const data = result.data as { items: Message[] }
    setMessages(data.items)
    setSending(data.items.some((m) => m.status === 'streaming'))
  }, [setError, setSending])

  const abortSessionStreaming = useCallback(
    async (sessionId: string) => {
      suppressAbortError.current = true
      try {
        await window.api.invoke(IpcChannel.MessageAbortSession, { sessionId })
      } finally {
        suppressAbortError.current = false
      }
      streamingIds.current.clear()
      setSending(false)
    },
    [setSending, streamingIds, suppressAbortError],
  )

  useEffect(() => {
    if (!session.initialized || !session.activeSessionId) return
    void loadMessages(session.activeSessionId)
  }, [session.initialized])

  useEffect(() => {
    setEditingUserMessageId(null)
  }, [session.activeSessionId])

  useEffect(() => {
    const unsubscribe = window.api.subscribe(IpcChannel.MessageSessionReload, (payload) => {
      const event = payload as { sessionId?: string }
      if (!event.sessionId || event.sessionId !== session.activeSessionId) return
      void loadMessages(event.sessionId)
      void session.loadSessions()
    })
    return unsubscribe
  }, [session.activeSessionId, session.loadSessions, loadMessages])

  useEffect(() => {
    return subscribeChatMessageStream(session, streamingRefs, {
      setMessages,
      setSending,
      setError,
    })
  }, [session, streamingRefs, setError, setSending])

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!session.activeSessionId) return
      setPendingMessageAction({ kind: 'delete', messageId })
      try {
        const result = await window.api.invoke(IpcChannel.MessageDelete, {
          sessionId: session.activeSessionId,
          messageId,
        })
        if (!result.ok) {
          setError(result.error.message)
          return
        }
        setMessages((prev) => prev.filter((m) => m.id !== messageId))
      } finally {
        setPendingMessageAction((current) =>
          current?.kind === 'delete' && current.messageId === messageId ? null : current,
        )
      }
    },
    [session.activeSessionId, setError],
  )

  const beginEditUserMessage = useCallback(
    (messageId: string) => {
      const message = messages.find((item) => item.id === messageId && item.role === 'user')
      if (!message) return null

      setEditingUserMessageId(messageId)
      return {
        text: getUserVisibleText(message.contentBlocks),
        attachments: contentBlocksToPendingAttachments(message.contentBlocks),
      }
    },
    [messages],
  )

  const regenerateMessage = useCallback(
    async (messageId: string) => {
      if (!session.activeSessionId) return

      const target = messages.find((m) => m.id === messageId)
      if (!target || target.role !== 'assistant') return

      const modelIds = target.modelId ? [target.modelId] : effectiveModelIds
      if (modelIds.length === 0) return

      setPendingMessageAction({ kind: 'regenerate', messageId })
      setSending(true)
      setError(null)

      const cutoff = target.createdAt
      const userMessage = target.parentMessageId
        ? messages.find((message) => message.id === target.parentMessageId)
        : null
      const sendOptions = buildSendOptions(userMessage?.contentBlocks)

      try {
        const result = await window.api.invoke(IpcChannel.MessageRegenerate, {
          sessionId: session.activeSessionId,
          messageId,
          modelIds,
          options: sendOptions,
        })

        if (!result.ok) {
          setError(result.error.message)
          setSending(false)
          return
        }

        const data = result.data as { userMessageId: string; assistantMessageIds: string[] }

        const assistantMsgs: Message[] = data.assistantMessageIds.map((id, index) => ({
          id,
          sessionId: session.activeSessionId!,
          parentMessageId: data.userMessageId,
          role: 'assistant' as const,
          modelId: modelIds[index] ?? modelIds[0] ?? null,
          status: 'streaming' as const,
          contentBlocks: [{ type: 'text', text: '' }],
          error: null,
          tokenUsage: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }))

        for (const id of data.assistantMessageIds) {
          streamingIds.current.add(id)
        }

        setMessages((prev) => [
          ...prev.filter((m) => m.createdAt < cutoff),
          ...assistantMsgs,
        ])
        void session.loadSessions()
      } finally {
        setPendingMessageAction((current) =>
          current?.kind === 'regenerate' && current.messageId === messageId ? null : current,
        )
      }
    },
    [
      session,
      messages,
      effectiveModelIds,
      buildSendOptions,
      setError,
      setSending,
      streamingIds,
    ],
  )

  const forkFromMessage = useCallback(
    async (messageId: string) => {
      if (!session.activeSessionId) return

      setPendingMessageAction({ kind: 'fork', messageId })
      try {
        await abortSessionStreaming(session.activeSessionId)

        const result = await window.api.invoke(IpcChannel.SessionFork, {
          sessionId: session.activeSessionId,
          forkMessageId: messageId,
        })

        if (!result.ok) {
          setError(result.error.message)
          return
        }

        const data = result.data as { session: { id: string } }
        await session.loadSessions()
        await handleSelectSession(data.session.id)
      } finally {
        setPendingMessageAction((current) =>
          current?.kind === 'fork' && current.messageId === messageId ? null : current,
        )
      }
    },
    [session, abortSessionStreaming, handleSelectSession, setError],
  )

  const clearSessionMessages = useCallback(async () => {
    if (!session.activeSessionId) return

    await abortSessionStreaming(session.activeSessionId)

    const result = await window.api.invoke(IpcChannel.SessionClearMessages, {
      sessionId: session.activeSessionId,
    })
    if (!result.ok) {
      setError(result.error.message)
      return
    }

    setMessages([])
    await session.loadSessions()
  }, [abortSessionStreaming, session, setError])

  return {
    messages,
    setMessages,
    messagesLoading,
    loadMessages,
    pendingMessageAction,
    editingUserMessageId,
    setEditingUserMessageId,
    abortSessionStreaming,
    deleteMessage,
    beginEditUserMessage,
    regenerateMessage,
    forkFromMessage,
    clearSessionMessages,
  }
}

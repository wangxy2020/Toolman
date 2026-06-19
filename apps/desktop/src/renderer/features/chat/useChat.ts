import { useCallback, useEffect, useRef, useState } from 'react'
import { IpcChannel, type Assistant, type ContentBlock, type Message, type MessageStreamEvent, type Provider } from '@toolman/shared'
import { contentBlocksHaveAttachments } from './chat-attachments'
import { getBlocksText } from './message-utils'
import { applyStreamEventWithPendingQueue, flushPendingStreamEvents } from './stream-message-sync'
import { getDefaultMcpServerIds } from './agent-settings-constants'
import { useSessionManager } from './useSessionManager'
import { normalizeModelIds } from './model-utils'
import type { AppSettings } from '../settings/app-settings'

export function useChat(workspaceId: string | null, appSettings?: AppSettings) {
  const session = useSessionManager(workspaceId, {
    restoreLastSession: appSettings?.restoreLastSession,
  })

  const [messages, setMessages] = useState<Message[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingMessageAction, setPendingMessageAction] = useState<{
    kind: 'delete' | 'regenerate' | 'fork'
    messageId: string
  } | null>(null)
  const streamingIds = useRef(new Set<string>())
  const suppressAbortError = useRef(false)
  const tempToRealIdRef = useRef(new Map<string, string>())
  const pendingStreamEventsRef = useRef<MessageStreamEvent[]>([])

  const abortSessionStreaming = useCallback(async (sessionId: string) => {
    suppressAbortError.current = true
    try {
      await window.api.invoke(IpcChannel.MessageAbortSession, { sessionId })
    } finally {
      suppressAbortError.current = false
    }
    streamingIds.current.clear()
    setSending(false)
  }, [])

  const loadProviders = useCallback(async () => {
    if (!workspaceId) return
    const result = await window.api.invoke(IpcChannel.ProviderList, { workspaceId })
    if (!result.ok) {
      setError(result.error.message)
      return
    }

    let items = (result.data as Provider[]).filter((p) => p.isEnabled)

    for (const provider of items) {
      if (provider.type !== 'ollama' || !provider.isEnabled) continue
      const fetched = await window.api.invoke(IpcChannel.ProviderFetchModels, { id: provider.id })
      if (fetched.ok) {
        const data = fetched.data as { models: Provider['models'] }
        items = items.map((p) =>
          p.id === provider.id ? { ...p, models: data.models, hasApiKey: true } : p,
        )
      }
    }

    setProviders(items)
  }, [workspaceId])

  const loadAssistants = useCallback(async () => {
    if (!workspaceId) return
    const result = await window.api.invoke(IpcChannel.AssistantList, { workspaceId })
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    const items = result.data as Assistant[]
    setAssistants(items)
  }, [workspaceId])

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
  }, [])

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      const prev = session.activeSessionId
      if (prev && prev !== sessionId) {
        await abortSessionStreaming(prev)
      }
      session.selectSession(sessionId)
      setError(null)
      await loadMessages(sessionId)
    },
    [session, loadMessages, abortSessionStreaming],
  )

  const handleCreateSession = useCallback(
    async (assistantId?: string) => {
      const prev = session.activeSessionId
      if (prev) await abortSessionStreaming(prev)

      const created = await session.createSession(assistantId)
      if (created) {
        setMessages([])
        setSending(false)
        setError(null)
      }
    },
    [session, abortSessionStreaming],
  )

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      await abortSessionStreaming(sessionId)

      const result = await session.deleteSession(sessionId)
      if (!result) return

      if (result.nextSessionId) {
        await loadMessages(result.nextSessionId)
      } else {
        setMessages([])
        setSending(false)
      }
    },
    [session, loadMessages, abortSessionStreaming],
  )

  const deleteAssistant = useCallback(
    async (assistantId: string) => {
      const sessionsToDelete = session.sessions
        .filter((item) => item.assistantId === assistantId)
        .map((item) => item.id)
      const activeWillDelete =
        session.activeSessionId !== null && sessionsToDelete.includes(session.activeSessionId)

      for (const sessionId of sessionsToDelete) {
        await abortSessionStreaming(sessionId)
      }

      const result = await window.api.invoke(IpcChannel.AssistantDelete, { id: assistantId })
      if (!result.ok) {
        setError(result.error.message)
        session.setError(result.error.message)
        return false
      }

      await loadAssistants()
      const remaining = await session.loadSessions()

      if (activeWillDelete) {
        if (remaining.length > 0) {
          await handleSelectSession(remaining[0]!.id)
        } else {
          await handleCreateSession()
        }
      }

      setError(null)
      session.setError(null)
      return true
    },
    [
      session,
      abortSessionStreaming,
      loadAssistants,
      handleSelectSession,
      handleCreateSession,
    ],
  )

  const sendMessage = useCallback(
    async (contentBlocks: ContentBlock[], options?: { enableTools?: boolean }) => {
      const text = getBlocksText(contentBlocks)
      const hasImages = contentBlocks.some((block) => block.type === 'image')
      const hasFiles = contentBlocks.some((block) => block.type === 'file')
      if (!session.activeSessionId || (!text.trim() && !hasImages && !hasFiles) || selectedModelIds.length === 0) {
        return
      }
      setSending(true)
      setError(null)

      const activeAssistant = (() => {
        const assistantId = session.activeSession?.assistantId
        if (assistantId) {
          return assistants.find((assistant) => assistant.id === assistantId) ?? null
        }
        return assistants.find((assistant) => assistant.isPinned) ?? assistants[0] ?? null
      })()

      const mcpServerIds = activeAssistant?.parameters.mcpServerIds?.length
        ? activeAssistant.parameters.mcpServerIds
        : getDefaultMcpServerIds()

      const hasAttachments = contentBlocksHaveAttachments(contentBlocks)
      const enableTools =
        options?.enableTools ?? (mcpServerIds.length > 0 && !hasAttachments)

      const tempUserId = crypto.randomUUID() as Message['id']
      const tempAssistantIds = selectedModelIds.map(
        () => crypto.randomUUID() as Message['id'],
      )
      const tempAssistantIdSet = new Set<Message['id']>(tempAssistantIds)
      const now = Date.now()

      tempToRealIdRef.current.clear()
      pendingStreamEventsRef.current = []

      const optimisticUserMsg: Message = {
        id: tempUserId,
        sessionId: session.activeSessionId,
        parentMessageId: null,
        role: 'user',
        modelId: null,
        status: 'completed',
        contentBlocks,
        error: null,
        tokenUsage: null,
        createdAt: now,
        updatedAt: now,
      }

      const optimisticAssistantMsgs: Message[] = tempAssistantIds.map((id, index) => ({
        id,
        sessionId: session.activeSessionId!,
        parentMessageId: tempUserId,
        role: 'assistant' as const,
        modelId: selectedModelIds[index] ?? selectedModelIds[0] ?? null,
        status: 'streaming' as const,
        contentBlocks: [{ type: 'text', text: '' }],
        error: null,
        tokenUsage: null,
        createdAt: now,
        updatedAt: now,
      }))

      for (const id of tempAssistantIds) {
        streamingIds.current.add(id)
      }
      setMessages((prev) => [...prev, optimisticUserMsg, ...optimisticAssistantMsgs])

      try {
        const result = await window.api.invoke(IpcChannel.MessageSend, {
          sessionId: session.activeSessionId,
          contentBlocks,
          modelIds: selectedModelIds,
          options: {
            enableTools,
            webSearchEnabled: appSettings?.webSearchEnabled,
            webSearchProvider: appSettings?.webSearchProvider,
            kbEnabled: appSettings?.kbEnabled,
            kbIds: activeAssistant?.parameters.kbIds,
            memoryEnabled: appSettings?.memoryEnabled,
            memoryRetentionDays: appSettings?.memoryRetentionDays,
            documentOcrEnabled: appSettings?.documentOcrEnabled,
            mcpServerIds,
          },
        })

        if (!result.ok) {
          for (const id of tempAssistantIds) {
            streamingIds.current.delete(id)
          }
          setMessages((prev) =>
            prev.filter((m) => m.id !== tempUserId && !tempAssistantIdSet.has(m.id)),
          )
          setError(result.error.message)
          setSending(false)
          return
        }

        const data = result.data as {
          userMessageId: string
          assistantMessageIds: string[]
          userContentBlocks?: ContentBlock[]
        }

        for (const id of tempAssistantIds) {
          streamingIds.current.delete(id)
        }
        for (const id of data.assistantMessageIds) {
          streamingIds.current.add(id)
        }

        tempToRealIdRef.current = new Map([
          [tempUserId, data.userMessageId],
          ...tempAssistantIds.map(
            (tempId, index) => [tempId, data.assistantMessageIds[index]!] as const,
          ),
        ])

        const bufferedEvents = pendingStreamEventsRef.current.splice(0)

        setMessages((prev) => {
          const remapped = prev.map((message) => {
            if (message.id === tempUserId) {
              return {
                ...message,
                id: data.userMessageId,
                contentBlocks: data.userContentBlocks ?? contentBlocks,
              }
            }
            const assistantIndex = tempAssistantIdSet.has(message.id)
              ? tempAssistantIds.indexOf(message.id)
              : -1
            if (assistantIndex >= 0) {
              return {
                ...message,
                id: data.assistantMessageIds[assistantIndex]!,
                parentMessageId: data.userMessageId,
              }
            }
            return message
          })

          const tempToReal = tempToRealIdRef.current
          return flushPendingStreamEvents(remapped, bufferedEvents, tempToReal)
        })
        void session.loadSessions()
      } catch (error) {
        for (const id of tempAssistantIds) {
          streamingIds.current.delete(id)
        }
        setMessages((prev) =>
          prev.filter((m) => m.id !== tempUserId && !tempAssistantIdSet.has(m.id)),
        )
        setError(error instanceof Error ? error.message : '发送失败')
        setSending(false)
      }
    },
    [session, selectedModelIds, assistants, appSettings],
  )

  const abortStreaming = useCallback(async () => {
    if (!session.activeSessionId) return

    streamingIds.current.clear()
    setSending(false)

    await window.api.invoke(IpcChannel.MessageAbortSession, {
      sessionId: session.activeSessionId,
    })
  }, [session.activeSessionId])

  useEffect(() => {
    if (!workspaceId) return
    void Promise.all([loadProviders(), loadAssistants()])
  }, [workspaceId, loadProviders, loadAssistants])

  useEffect(() => {
    if (providers.length === 0 && assistants.length === 0) return
    setSelectedModelIds((prev) => normalizeModelIds(prev, providers, assistants))
  }, [providers, assistants])

  useEffect(() => {
    if (!session.initialized || !session.activeSessionId) return
    void loadMessages(session.activeSessionId)
  }, [session.initialized])

  useEffect(() => {
    const unsubscribe = window.api.subscribe(IpcChannel.MessageStream, (payload) => {
      const event = payload as MessageStreamEvent
      if (session.activeSessionId && event.sessionId !== session.activeSessionId) return

      if (event.type === 'message.delta') {
        setMessages((prev) =>
          applyStreamEventWithPendingQueue(
            prev,
            event,
            tempToRealIdRef.current,
            pendingStreamEventsRef.current,
          ),
        )
      }

      if (event.type === 'message.done') {
        setMessages((prev) =>
          applyStreamEventWithPendingQueue(
            prev,
            event,
            tempToRealIdRef.current,
            pendingStreamEventsRef.current,
          ),
        )
        streamingIds.current.delete(event.messageId)
        if (streamingIds.current.size === 0) setSending(false)
        void session.loadSessions()
      }

      if (event.type === 'message.error') {
        if (event.messageId) streamingIds.current.delete(event.messageId)
        setMessages((prev) => {
          if (!event.messageId) return prev
          return applyStreamEventWithPendingQueue(
            prev,
            event,
            tempToRealIdRef.current,
            pendingStreamEventsRef.current,
          )
        })
        if (!(suppressAbortError.current && event.error.code === 'ABORTED') && !event.messageId) {
          setError(event.error.message)
        }
        if (streamingIds.current.size === 0) setSending(false)
      }
    })

    return unsubscribe
  }, [session.activeSessionId, session.loadSessions])

  const defaultAssistant = assistants[0] ?? null

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
    [session.activeSessionId],
  )

  const buildSendOptions = useCallback(
    (contentBlocks?: ContentBlock[]) => {
      const activeAssistant = (() => {
        const assistantId = session.activeSession?.assistantId
        if (assistantId) {
          return assistants.find((assistant) => assistant.id === assistantId) ?? null
        }
        return assistants.find((assistant) => assistant.isPinned) ?? assistants[0] ?? null
      })()

      const mcpServerIds = activeAssistant?.parameters.mcpServerIds?.length
        ? activeAssistant.parameters.mcpServerIds
        : getDefaultMcpServerIds()

      const hasAttachments = contentBlocks ? contentBlocksHaveAttachments(contentBlocks) : false

      return {
        enableTools: mcpServerIds.length > 0 && !hasAttachments,
        webSearchEnabled: appSettings?.webSearchEnabled,
        webSearchProvider: appSettings?.webSearchProvider,
        kbEnabled: appSettings?.kbEnabled,
        kbIds: activeAssistant?.parameters.kbIds,
        kbTopK: activeAssistant?.parameters.kbTopK,
        kbScoreThreshold: activeAssistant?.parameters.kbScoreThreshold,
        memoryEnabled: appSettings?.memoryEnabled,
        memoryRetentionDays: appSettings?.memoryRetentionDays,
        mcpServerIds,
      }
    },
    [session.activeSession?.assistantId, assistants, appSettings],
  )

  const regenerateMessage = useCallback(
    async (messageId: string) => {
      if (!session.activeSessionId) return

      const target = messages.find((m) => m.id === messageId)
      if (!target || target.role !== 'assistant') return

      const modelIds = target.modelId ? [target.modelId] : selectedModelIds
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
    [session, messages, selectedModelIds, buildSendOptions],
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
    [session, abortSessionStreaming, handleSelectSession],
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
  }, [abortSessionStreaming, session])

  const hasConfiguredProvider = providers.some(
    (p) => p.isEnabled && (p.hasApiKey || p.type === 'ollama'),
  )
  const combinedError = error ?? session.error

  return {
    sessions: session.sessions,
    activeSession: session.activeSession,
    activeSessionId: session.activeSessionId,
    messages,
    assistants,
    providers,
    selectedModelIds,
    setSelectedModelIds,
    loading: messagesLoading,
    sessionsLoading: session.loading,
    sending,
    error: combinedError,
    pendingMessageAction,
    setError: (msg: string | null) => {
      setError(msg)
      session.setError(msg)
    },
    createSession: handleCreateSession,
    selectSession: handleSelectSession,
    renameSession: session.renameSession,
    deleteSession: handleDeleteSession,
    deleteAssistant,
    sendMessage,
    abortStreaming,
    deleteMessage,
    regenerateMessage,
    forkFromMessage,
    clearSessionMessages,
    loadSessions: session.loadSessions,
    loadProviders,
    loadAssistants,
    hasConfiguredProvider,
    defaultAssistant,
  }
}

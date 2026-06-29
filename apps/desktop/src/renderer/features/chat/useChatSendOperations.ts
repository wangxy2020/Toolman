import {
  IpcChannel,
  type ContentBlock,
  type Message,
} from '@toolman/shared'
import { flushPendingStreamEvents } from './stream-message-sync'
import type { ChatSendOptions } from './useChatSend'
import type { ChatStreamingRefs } from './useChatMessageRefs'
import type { useSessionManager } from './useSessionManager'

type SessionManager = ReturnType<typeof useSessionManager>

export type ChatSendContext = {
  session: SessionManager
  streamingRefs: ChatStreamingRefs
  effectiveModelIds: string[]
  messages: Message[]
  setMessages: (updater: (prev: Message[]) => Message[]) => void
  setSending: (sending: boolean) => void
  setError: (msg: string | null) => void
  loadMessages: (sessionId: string) => Promise<void>
  setEditingUserMessageId: (id: string | null) => void
  buildSendOptions: (contentBlocks?: ContentBlock[]) => ChatSendOptions
}

export async function sendEditedUserMessage(
  ctx: ChatSendContext,
  editingMessageId: string,
  contentBlocks: ContentBlock[],
): Promise<void> {
  const {
    session,
    streamingRefs,
    effectiveModelIds,
    messages,
    setMessages,
    setSending,
    setError,
    loadMessages,
    setEditingUserMessageId,
    buildSendOptions,
  } = ctx
  const { streamingIds, tempToRealIdRef, pendingStreamEventsRef } = streamingRefs

  const target = messages.find((message) => message.id === editingMessageId)
  if (!target || target.role !== 'user') {
    setEditingUserMessageId(null)
    return
  }

  setSending(true)
  setError(null)

  const sendOptions = buildSendOptions(contentBlocks)
  const cutoff = target.createdAt
  const now = Date.now()
  const tempAssistantIds = effectiveModelIds.map(() => crypto.randomUUID() as Message['id'])

  tempToRealIdRef.current.clear()
  pendingStreamEventsRef.current = []

  const optimisticAssistantMsgs: Message[] = tempAssistantIds.map((id, index) => ({
    id,
    sessionId: session.activeSessionId!,
    parentMessageId: editingMessageId,
    role: 'assistant' as const,
    modelId: effectiveModelIds[index] ?? effectiveModelIds[0] ?? null,
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

  setMessages((prev) => [
    ...prev
      .filter((message) => message.createdAt < cutoff || message.id === editingMessageId)
      .map((message) =>
        message.id === editingMessageId
          ? { ...message, contentBlocks, updatedAt: now }
          : message,
      ),
    ...optimisticAssistantMsgs,
  ])

  try {
    const result = await window.api.invoke(IpcChannel.MessageEditUser, {
      sessionId: session.activeSessionId,
      messageId: editingMessageId,
      contentBlocks,
      modelIds: effectiveModelIds,
      options: sendOptions,
    })

    setEditingUserMessageId(null)

    if (!result.ok) {
      for (const id of tempAssistantIds) {
        streamingIds.current.delete(id)
      }
      setError(result.error.message)
      setSending(false)
      void loadMessages(session.activeSessionId!)
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

    tempToRealIdRef.current = new Map(
      tempAssistantIds.map(
        (tempId, index) => [tempId, data.assistantMessageIds[index]!] as const,
      ),
    )

    const bufferedEvents = pendingStreamEventsRef.current.splice(0)

    setMessages((prev) => {
      const remapped = prev.map((message) => {
        if (message.id === editingMessageId) {
          return {
            ...message,
            contentBlocks: data.userContentBlocks ?? contentBlocks,
          }
        }
        const assistantIndex = tempAssistantIds.indexOf(message.id)
        if (assistantIndex >= 0) {
          return {
            ...message,
            id: data.assistantMessageIds[assistantIndex]!,
            parentMessageId: data.userMessageId,
          }
        }
        return message
      })

      return flushPendingStreamEvents(remapped, bufferedEvents, tempToRealIdRef.current)
    })
    void session.loadSessions()
  } catch (error) {
    for (const id of tempAssistantIds) {
      streamingIds.current.delete(id)
    }
    setEditingUserMessageId(null)
    setError(error instanceof Error ? error.message : '编辑发送失败')
    setSending(false)
    void loadMessages(session.activeSessionId!)
  }
}

export async function sendNewUserMessage(
  ctx: ChatSendContext,
  contentBlocks: ContentBlock[],
  sendOptions: ChatSendOptions,
): Promise<void> {
  const { session, streamingRefs, effectiveModelIds, setMessages, setSending, setError } = ctx
  const { streamingIds, tempToRealIdRef, pendingStreamEventsRef } = streamingRefs

  const tempUserId = crypto.randomUUID() as Message['id']
  const tempAssistantIds = effectiveModelIds.map(() => crypto.randomUUID() as Message['id'])
  const tempAssistantIdSet = new Set<Message['id']>(tempAssistantIds)
  const now = Date.now()

  tempToRealIdRef.current.clear()
  pendingStreamEventsRef.current = []

  const optimisticUserMsg: Message = {
    id: tempUserId,
    sessionId: session.activeSessionId!,
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
    modelId: effectiveModelIds[index] ?? effectiveModelIds[0] ?? null,
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
      modelIds: effectiveModelIds,
      options: sendOptions,
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

      return flushPendingStreamEvents(remapped, bufferedEvents, tempToRealIdRef.current)
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
}

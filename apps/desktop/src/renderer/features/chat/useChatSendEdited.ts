import {
  IpcChannel,
  type ContentBlock,
  type Message,
} from '@toolman/shared'
import { flushPendingStreamEvents } from './stream-message-sync'
import type { ChatSendOptions } from './useChatSend'
import type { ChatSendContext } from './useChatSendOperations'

export async function sendEditedUserMessage(
  ctx: ChatSendContext,
  editingMessageId: string,
  contentBlocks: ContentBlock[],
  sendOptionsOverride?: ChatSendOptions,
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

  const sendOptions = sendOptionsOverride ?? buildSendOptions(contentBlocks)
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

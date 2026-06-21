import { useCallback, useEffect, useState } from 'react'
import {
  IpcChannel,
  type ContentBlock,
  type Message,
  type P2pGroupChatMessage,
} from '@toolman/shared'

function toPanelMessage(message: P2pGroupChatMessage): Message {
  return {
    id: message.id,
    sessionId: message.workspaceId,
    parentMessageId: null,
    role: 'user',
    modelId: null,
    status: 'completed',
    contentBlocks: message.contentBlocks,
    error: null,
    tokenUsage: null,
    createdAt: message.createdAt,
    updatedAt: message.createdAt,
  }
}

function memberInitial(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?'
}

export function useGroupChat(workspaceId: string | null, selfMemberId: string | null) {
  const [messages, setMessages] = useState<Message[]>([])
  const [senderNames, setSenderNames] = useState<Record<string, string>>({})
  const [senderMemberIds, setSenderMemberIds] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const applyChatMessages = useCallback((items: P2pGroupChatMessage[]) => {
    setMessages(items.map(toPanelMessage))
    setSenderNames(
      Object.fromEntries(items.map((item) => [item.id, item.senderName])),
    )
    setSenderMemberIds(
      Object.fromEntries(items.map((item) => [item.id, item.senderMemberId])),
    )
  }, [])

  const loadMessages = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    const result = await window.api.invoke(IpcChannel.P2pGroupChatList, {
      workspaceId,
      limit: 200,
    })
    setLoading(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    const data = result.data as { items: P2pGroupChatMessage[] }
    applyChatMessages(data.items)
  }, [applyChatMessages, workspaceId])

  useEffect(() => {
    void loadMessages()
  }, [loadMessages])

  useEffect(() => {
    if (!workspaceId) return

    const unsubscribe = window.api.subscribe('p2p:group-chat:message', (payload) => {
      const message = payload as P2pGroupChatMessage
      if (message.workspaceId !== workspaceId) return
      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) {
          return current
        }
        return [...current, toPanelMessage(message)]
      })
      setSenderNames((current) => ({ ...current, [message.id]: message.senderName }))
      setSenderMemberIds((current) => ({
        ...current,
        [message.id]: message.senderMemberId,
      }))
    })

    return unsubscribe
  }, [workspaceId])

  const sendMessage = useCallback(
    async (contentBlocks: ContentBlock[]) => {
      if (!workspaceId) return
      setSending(true)
      setError(null)
      const result = await window.api.invoke(IpcChannel.P2pGroupChatSend, {
        workspaceId,
        contentBlocks,
      })
      setSending(false)
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      const data = result.data as { message: P2pGroupChatMessage }
      setMessages((current) => {
        if (current.some((item) => item.id === data.message.id)) {
          return current
        }
        return [...current, toPanelMessage(data.message)]
      })
      setSenderNames((current) => ({
        ...current,
        [data.message.id]: data.message.senderName,
      }))
      setSenderMemberIds((current) => ({
        ...current,
        [data.message.id]: data.message.senderMemberId,
      }))
    },
    [workspaceId],
  )

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!workspaceId) return
      const result = await window.api.invoke(IpcChannel.P2pGroupChatDelete, {
        workspaceId,
        messageId,
      })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setMessages((current) => current.filter((item) => item.id !== messageId))
      setSenderNames((current) => {
        const next = { ...current }
        delete next[messageId]
        return next
      })
      setSenderMemberIds((current) => {
        const next = { ...current }
        delete next[messageId]
        return next
      })
    },
    [workspaceId],
  )

  const getUserDisplayName = useCallback(
    (message: Message) => senderNames[message.id] ?? '成员',
    [senderNames],
  )

  const getUserAvatarInitial = useCallback(
    (message: Message) => memberInitial(senderNames[message.id] ?? '成员'),
    [senderNames],
  )

  const isOwnUserMessage = useCallback(
    (message: Message) => {
      if (!selfMemberId) return false
      return senderMemberIds[message.id] === selfMemberId
    },
    [selfMemberId, senderMemberIds],
  )

  return {
    messages,
    loading,
    sending,
    error,
    setError,
    sendMessage,
    deleteMessage,
    getUserDisplayName,
    getUserAvatarInitial,
    isOwnUserMessage,
    selfMemberId,
  }
}

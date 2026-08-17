import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  IpcChannel,
  isOwnGroupChatSender,
  resolveLivePeerMemberDisplayName,
  type ContentBlock,
  type Message,
  type P2pGroupChatMessage,
  type P2pMember,
  type PersonSelfRef,
} from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'

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
    metadata: {
      senderMemberId: message.senderMemberId,
      senderName: message.senderName,
    },
    createdAt: message.createdAt,
    updatedAt: message.createdAt,
  }
}

function metadataString(message: Message, key: string): string | undefined {
  const value = message.metadata?.[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function senderMemberIdOf(message: Message, senderMemberIds: Record<string, string>): string | undefined {
  return senderMemberIds[message.id] ?? metadataString(message, 'senderMemberId')
}

function senderNameOf(
  message: Message,
  senderNames: Record<string, string>,
  members: P2pMember[],
  senderMemberIds: Record<string, string>,
): string {
  return resolveLivePeerMemberDisplayName(
    members,
    senderMemberIdOf(message, senderMemberIds),
    senderNames[message.id] ?? metadataString(message, 'senderName'),
  )
}

function memberInitial(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?'
}

export function useGroupChat(
  workspaceId: string | null,
  selfMemberId: string | null,
  members: P2pMember[] = [],
  selfIdentityId?: string | null,
  selfDeviceId?: string | null,
) {
  const { t } = useI18n()
  const [messages, setMessages] = useState<Message[]>([])
  const [senderNames, setSenderNames] = useState<Record<string, string>>({})
  const [senderMemberIds, setSenderMemberIds] = useState<Record<string, string>>({})
  const [listSelfMemberId, setListSelfMemberId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rememberSender = useCallback((message: P2pGroupChatMessage) => {
    setSenderNames((current) => ({ ...current, [message.id]: message.senderName }))
    setSenderMemberIds((current) => ({ ...current, [message.id]: message.senderMemberId }))
  }, [])

  const applyChatMessages = useCallback((items: P2pGroupChatMessage[]) => {
    setMessages(items.map(toPanelMessage))
    setSenderNames(Object.fromEntries(items.map((item) => [item.id, item.senderName])))
    setSenderMemberIds(Object.fromEntries(items.map((item) => [item.id, item.senderMemberId])))
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
    const data = result.data as { items: P2pGroupChatMessage[]; selfMemberId?: string }
    applyChatMessages(data.items)
    if (data.selfMemberId) setListSelfMemberId(data.selfMemberId)
  }, [applyChatMessages, workspaceId])

  useEffect(() => {
    void loadMessages()
  }, [loadMessages])

  useEffect(() => {
    setListSelfMemberId(null)
  }, [workspaceId])

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
      rememberSender(message)
    })

    return unsubscribe
  }, [rememberSender, workspaceId])

  useEffect(() => {
    if (!workspaceId) return

    const unsubscribe = window.api.subscribe('p2p:group-chat:cleared', (payload) => {
      const data = payload as { workspaceId: string }
      if (data.workspaceId !== workspaceId) return
      setMessages([])
      setSenderNames({})
      setSenderMemberIds({})
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
      setListSelfMemberId((current) => current ?? data.message.senderMemberId)
      setMessages((current) => {
        if (current.some((item) => item.id === data.message.id)) {
          return current
        }
        return [...current, toPanelMessage(data.message)]
      })
      rememberSender(data.message)
    },
    [rememberSender, workspaceId],
  )

  const clearMessages = useCallback(async () => {
    if (!workspaceId) return
    const result = await window.api.invoke(IpcChannel.P2pGroupChatClear, {
      workspaceId,
    })
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setMessages([])
    setSenderNames({})
    setSenderMemberIds({})
  }, [workspaceId])

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

  const resolvedSelfMemberId = selfMemberId ?? listSelfMemberId
  const selfRef: PersonSelfRef = useMemo(
    () => ({
      memberId: resolvedSelfMemberId,
      identityId: selfIdentityId,
      deviceId: selfDeviceId,
    }),
    [resolvedSelfMemberId, selfDeviceId, selfIdentityId],
  )

  const isOwnUserMessage = useCallback(
    (message: Message) =>
      isOwnGroupChatSender(senderMemberIdOf(message, senderMemberIds), members, selfRef),
    [members, selfRef, senderMemberIds],
  )

  const getUserDisplayName = useCallback(
    (message: Message) =>
      isOwnUserMessage(message)
        ? t('groupPage.messages.mine')
        : senderNameOf(message, senderNames, members, senderMemberIds),
    [isOwnUserMessage, members, senderMemberIds, senderNames, t],
  )

  const getUserAvatarInitial = useCallback(
    (message: Message) =>
      memberInitial(
        isOwnUserMessage(message)
          ? t('groupPage.messages.mineInitial')
          : senderNameOf(message, senderNames, members, senderMemberIds),
      ),
    [isOwnUserMessage, members, senderMemberIds, senderNames, t],
  )

  return {
    messages,
    loading,
    sending,
    error,
    setError,
    sendMessage,
    clearMessages,
    deleteMessage,
    getUserDisplayName,
    getUserAvatarInitial,
    isOwnUserMessage,
    selfMemberId: resolvedSelfMemberId,
  }
}

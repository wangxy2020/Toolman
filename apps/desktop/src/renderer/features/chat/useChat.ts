import { useCallback, useMemo, useRef } from 'react'
import { IpcChannel } from '@toolman/shared'
import { useSessionManager } from './useSessionManager'
import type { AppSettings } from '../settings/app-settings'
import { useChatProviders } from './useChatProviders'
import {
  createChatStreamingRefs,
  useChatMessages,
} from './useChatMessages'
import { useChatSend } from './useChatSend'

export function useChat(workspaceId: string | null, appSettings?: AppSettings) {
  const session = useSessionManager(workspaceId, {
    restoreLastSession: appSettings?.restoreLastSession,
  })

  const providersState = useChatProviders(workspaceId, appSettings)
  const streamingRefs = useRef(createChatStreamingRefs()).current

  const setCombinedError = useCallback(
    (msg: string | null) => {
      providersState.setError(msg)
      session.setError(msg)
    },
    [providersState.setError, session.setError],
  )

  const sendStateRef = useRef<{
    setSending: (sending: boolean) => void
    buildSendOptionsForSession: ReturnType<typeof useChatSend>['buildSendOptionsForSession']
    effectiveModelIds: string[]
  } | null>(null)

  const handleSelectSessionRef = useRef<(sessionId: string) => Promise<void>>(async () => {})

  const messagesState = useChatMessages(session, streamingRefs, {
    setSending: (sending) => sendStateRef.current?.setSending(sending),
    setError: setCombinedError,
    effectiveModelIds: sendStateRef.current?.effectiveModelIds ?? providersState.selectedModelIds,
    buildSendOptions: (contentBlocks) =>
      sendStateRef.current?.buildSendOptionsForSession(contentBlocks) ?? {
        enableTools: false,
        mcpServerIds: [],
      },
    handleSelectSession: (sessionId) => handleSelectSessionRef.current(sessionId),
  })

  const sendState = useChatSend(session, streamingRefs, {
    assistants: providersState.assistants,
    selectedModelIds: providersState.selectedModelIds,
    appSettings,
    messages: messagesState.messages,
    setMessages: messagesState.setMessages,
    loadMessages: messagesState.loadMessages,
    editingUserMessageId: messagesState.editingUserMessageId,
    setEditingUserMessageId: messagesState.setEditingUserMessageId,
    setError: setCombinedError,
  })

  sendStateRef.current = {
    setSending: sendState.setSending,
    buildSendOptionsForSession: sendState.buildSendOptionsForSession,
    effectiveModelIds: sendState.effectiveModelIds,
  }

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      const prev = session.activeSessionId
      if (prev && prev !== sessionId) {
        await messagesState.abortSessionStreaming(prev)
      }
      session.selectSession(sessionId)
      setCombinedError(null)
      await messagesState.loadMessages(sessionId)
    },
    [session, messagesState, setCombinedError],
  )

  handleSelectSessionRef.current = handleSelectSession

  const handleCreateSession = useCallback(
    async (assistantId?: string) => {
      const prev = session.activeSessionId
      if (prev) await messagesState.abortSessionStreaming(prev)

      const created = await session.createSession(assistantId)
      if (created) {
        messagesState.setMessages([])
        sendState.setSending(false)
        setCombinedError(null)
      }
    },
    [session, messagesState, sendState, setCombinedError],
  )

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      await messagesState.abortSessionStreaming(sessionId)

      const result = await session.deleteSession(sessionId)
      if (!result) return

      if (result.nextSessionId) {
        await messagesState.loadMessages(result.nextSessionId)
      } else {
        messagesState.setMessages([])
        sendState.setSending(false)
      }
    },
    [session, messagesState, sendState],
  )

  const deleteAssistant = useCallback(
    async (assistantId: string) => {
      const sessionsToDelete = session.sessions
        .filter((item) => item.assistantId === assistantId)
        .map((item) => item.id)
      const activeWillDelete =
        session.activeSessionId !== null && sessionsToDelete.includes(session.activeSessionId)

      for (const sessionId of sessionsToDelete) {
        await messagesState.abortSessionStreaming(sessionId)
      }

      const result = await window.api.invoke(IpcChannel.AssistantDelete, { id: assistantId })
      if (!result.ok) {
        setCombinedError(result.error.message)
        return false
      }

      await providersState.loadAssistants()
      const remaining = await session.loadSessions()

      if (activeWillDelete) {
        if (remaining.length > 0) {
          await handleSelectSession(remaining[0]!.id)
        } else {
          await handleCreateSession()
        }
      }

      setCombinedError(null)
      return true
    },
    [
      session,
      messagesState,
      providersState.loadAssistants,
      handleSelectSession,
      handleCreateSession,
      setCombinedError,
    ],
  )

  const combinedError = useMemo(
    () => providersState.error ?? session.error,
    [providersState.error, session.error],
  )

  return {
    sessions: session.sessions,
    activeSession: session.activeSession,
    activeSessionId: session.activeSessionId,
    messages: messagesState.messages,
    assistants: providersState.assistants,
    providers: providersState.providers,
    selectedModelIds: providersState.selectedModelIds,
    effectiveModelIds: sendState.effectiveModelIds,
    setSelectedModelIds: providersState.setSelectedModelIds,
    loading: messagesState.messagesLoading,
    sessionsLoading: session.loading,
    sending: sendState.sending,
    error: combinedError,
    pendingMessageAction: messagesState.pendingMessageAction,
    editingUserMessageId: messagesState.editingUserMessageId,
    setError: setCombinedError,
    createSession: handleCreateSession,
    selectSession: handleSelectSession,
    renameSession: session.renameSession,
    deleteSession: handleDeleteSession,
    deleteAssistant,
    sendMessage: sendState.sendMessage,
    abortStreaming: sendState.abortStreaming,
    deleteMessage: messagesState.deleteMessage,
    regenerateMessage: messagesState.regenerateMessage,
    beginEditUserMessage: messagesState.beginEditUserMessage,
    forkFromMessage: messagesState.forkFromMessage,
    clearSessionMessages: messagesState.clearSessionMessages,
    loadSessions: session.loadSessions,
    loadProviders: providersState.loadProviders,
    loadAssistants: providersState.loadAssistants,
    hasConfiguredProvider: providersState.hasConfiguredProvider,
    defaultAssistant: providersState.defaultAssistant,
  }
}

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  IpcChannel,
  type Assistant,
  type ContentBlock,
  type Message,
} from '@toolman/shared'
import { getBlocksText } from './message-utils'
import {
  isGroupProxySession,
  resolveGroupProxyAssistantModelId,
} from '../group/group-agent-utils'
import type { AppSettings } from '../settings/app-settings'
import type { useSessionManager } from './useSessionManager'
import {
  getAssistantMcpServerIds,
  getAssistantSkillIds,
  resolveChatEnableTools,
} from './useChat-utils'
import type { ChatStreamingRefs } from './useChatMessageRefs'
import {
  sendEditedUserMessage,
  sendNewUserMessage,
  type ChatSendContext,
} from './useChatSendOperations'

type SessionManager = ReturnType<typeof useSessionManager>

export type ChatSendOptions = {
  enableTools: boolean
  webSearchEnabled?: boolean
  webSearchProvider?: AppSettings['webSearchProvider']
  kbEnabled?: boolean
  kbIds?: string[]
  kbTopK?: number
  kbScoreThreshold?: number
  memoryEnabled?: boolean
  memoryRetentionDays?: number
  mcpServerIds: string[]
  documentOcrEnabled?: boolean
}

export function buildSendOptions(
  session: SessionManager,
  assistants: Assistant[],
  appSettings: AppSettings | undefined,
  contentBlocks?: ContentBlock[],
): ChatSendOptions {
  const activeAssistant = (() => {
    const assistantId = session.activeSession?.assistantId
    if (assistantId) {
      return assistants.find((assistant) => assistant.id === assistantId) ?? null
    }
    return assistants.find((assistant) => assistant.isPinned) ?? assistants[0] ?? null
  })()

  const mcpServerIds = getAssistantMcpServerIds(activeAssistant)
  const skillIds = getAssistantSkillIds(activeAssistant)

  return {
    enableTools: resolveChatEnableTools(mcpServerIds, skillIds, contentBlocks ?? []),
    webSearchEnabled: appSettings?.webSearchEnabled,
    webSearchProvider: appSettings?.webSearchProvider,
    kbEnabled: appSettings?.kbEnabled,
    kbIds: activeAssistant?.parameters.kbIds,
    kbTopK: activeAssistant?.parameters.kbTopK,
    kbScoreThreshold: activeAssistant?.parameters.kbScoreThreshold,
    memoryEnabled: appSettings?.memoryEnabled,
    memoryRetentionDays: appSettings?.memoryRetentionDays,
    mcpServerIds,
    documentOcrEnabled: appSettings?.documentOcrEnabled,
  }
}

export function useChatSend(
  session: SessionManager,
  streamingRefs: ChatStreamingRefs,
  deps: {
    assistants: Assistant[]
    selectedModelIds: string[]
    appSettings?: AppSettings
    messages: Message[]
    setMessages: Dispatch<SetStateAction<Message[]>>
    loadMessages: (sessionId: string) => Promise<void>
    editingUserMessageId: string | null
    setEditingUserMessageId: (id: string | null) => void
    setError: (msg: string | null) => void
  },
) {
  const {
    assistants,
    selectedModelIds,
    appSettings,
    messages,
    setMessages,
    loadMessages,
    editingUserMessageId,
    setEditingUserMessageId,
    setError,
  } = deps

  const [sending, setSending] = useState(false)
  const { streamingIds } = streamingRefs

  const activeAssistant = useMemo(() => {
    const assistantId = session.activeSession?.assistantId
    if (assistantId) {
      return assistants.find((assistant) => assistant.id === assistantId) ?? null
    }
    return assistants.find((assistant) => assistant.isPinned) ?? assistants[0] ?? null
  }, [assistants, session.activeSession?.assistantId])

  const groupProxyMode = useMemo(
    () => isGroupProxySession(session.activeSession),
    [session.activeSession],
  )

  const effectiveModelIds = useMemo(() => {
    if (groupProxyMode && activeAssistant) {
      const modelId = resolveGroupProxyAssistantModelId(activeAssistant, session.activeSession)
      return modelId ? [modelId] : selectedModelIds
    }
    return selectedModelIds
  }, [activeAssistant, groupProxyMode, selectedModelIds, session.activeSession])

  const buildSendOptionsForSession = useCallback(
    (contentBlocks?: ContentBlock[]) =>
      buildSendOptions(session, assistants, appSettings, contentBlocks),
    [session, assistants, appSettings],
  )

  const sendMessage = useCallback(
    async (contentBlocks: ContentBlock[], options?: { enableTools?: boolean }) => {
      const text = getBlocksText(contentBlocks)
      const hasImages = contentBlocks.some((block) => block.type === 'image')
      const hasFiles = contentBlocks.some((block) => block.type === 'file')
      if (
        !session.activeSessionId ||
        (!text.trim() && !hasImages && !hasFiles) ||
        effectiveModelIds.length === 0
      ) {
        return
      }

      const ctx: ChatSendContext = {
        session,
        streamingRefs,
        effectiveModelIds,
        messages,
        setMessages,
        setSending,
        setError,
        loadMessages,
        setEditingUserMessageId,
        buildSendOptions: buildSendOptionsForSession,
      }

      if (editingUserMessageId) {
        await sendEditedUserMessage(ctx, editingUserMessageId, contentBlocks)
        return
      }

      setSending(true)
      setError(null)

      const sendAssistant = (() => {
        const assistantId = session.activeSession?.assistantId
        if (assistantId) {
          return assistants.find((assistant) => assistant.id === assistantId) ?? null
        }
        return assistants.find((assistant) => assistant.isPinned) ?? assistants[0] ?? null
      })()

      const mcpServerIds = getAssistantMcpServerIds(sendAssistant)
      const skillIds = getAssistantSkillIds(sendAssistant)
      const enableTools = resolveChatEnableTools(
        mcpServerIds,
        skillIds,
        contentBlocks,
        options?.enableTools,
      )

      const baseOptions = buildSendOptionsForSession(contentBlocks)
      await sendNewUserMessage(ctx, contentBlocks, {
        ...baseOptions,
        enableTools,
        kbIds: sendAssistant?.parameters.kbIds ?? baseOptions.kbIds,
      })
    },
    [
      session,
      effectiveModelIds,
      assistants,
      messages,
      buildSendOptionsForSession,
      loadMessages,
      editingUserMessageId,
      setEditingUserMessageId,
      setError,
      setMessages,
      streamingRefs,
    ],
  )

  const abortStreaming = useCallback(async () => {
    if (!session.activeSessionId) return

    streamingIds.current.clear()
    setSending(false)

    await window.api.invoke(IpcChannel.MessageAbortSession, {
      sessionId: session.activeSessionId,
    })
  }, [session.activeSessionId, streamingIds])

  return {
    sending,
    setSending,
    sendMessage,
    abortStreaming,
    buildSendOptionsForSession,
    activeAssistant,
    groupProxyMode,
    effectiveModelIds,
  }
}

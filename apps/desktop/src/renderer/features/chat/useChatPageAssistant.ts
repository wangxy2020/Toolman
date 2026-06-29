import { useCallback, useEffect, useMemo, type CSSProperties } from 'react'
import type { Assistant } from '@toolman/shared'
import { messageFontSizePx } from './message-settings'
import {
  isGroupProxyReadOnlySession,
  isGroupProxySession,
  isGroupSharedMirrorAssistant,
  resolveGroupProxyAssistantModelId,
} from '../group/group-agent-utils'
import type { MessageSettings } from './message-settings'
import type { useChat } from './useChat'
import { updateAssistantModel } from './chat-page-handlers'

type ChatApi = ReturnType<typeof useChat>

export function useChatPageAssistant(
  chat: ChatApi,
  messageSettings: MessageSettings,
) {
  const activeAssistant = useMemo(() => {
    const assistantId = chat.activeSession?.assistantId
    if (assistantId) {
      return chat.assistants.find((a) => a.id === assistantId) ?? null
    }
    return chat.assistants.find((a) => a.isPinned) ?? chat.assistants[0] ?? null
  }, [chat.activeSession, chat.assistants])

  const sidebarAssistants = useMemo(
    () => chat.assistants.filter((assistant) => !isGroupSharedMirrorAssistant(assistant)),
    [chat.assistants],
  )

  const groupProxyMode = useMemo(
    () => isGroupProxySession(chat.activeSession),
    [chat.activeSession],
  )

  const groupProxyReadOnly = useMemo(
    () => isGroupProxyReadOnlySession(chat.activeSession),
    [chat.activeSession],
  )

  const activeAssistantModelId = useMemo(() => {
    if (!activeAssistant) return null
    return resolveGroupProxyAssistantModelId(activeAssistant, chat.activeSession)
  }, [activeAssistant, chat.activeSession])

  const headerModelIds = useMemo(() => {
    if (groupProxyMode && activeAssistantModelId) {
      return [activeAssistantModelId]
    }
    return chat.selectedModelIds
  }, [activeAssistantModelId, chat.selectedModelIds, groupProxyMode])

  const defaultModelId = groupProxyMode
    ? activeAssistantModelId
    : (chat.selectedModelIds[0] ?? activeAssistantModelId ?? null)

  const translationLanguages = activeAssistant?.parameters.translationLanguages

  const messagePanelStyle: CSSProperties = {
    '--tm-message-font-size': `${messageFontSizePx(messageSettings.messageFontSize)}px`,
  } as CSSProperties

  const handleModelChange = useCallback(
    (modelIds: string[]) => {
      if (groupProxyMode) return
      chat.setSelectedModelIds(modelIds)
      const primaryModelId = modelIds[0]
      if (!activeAssistant || !primaryModelId || activeAssistant.modelId === primaryModelId) {
        return
      }
      void (async () => {
        const result = await updateAssistantModel(activeAssistant, primaryModelId)
        if (!result.ok) {
          chat.setError(result.error)
          return
        }
        await chat.loadAssistants()
      })()
    },
    [activeAssistant, chat, groupProxyMode],
  )

  useEffect(() => {
    if (!activeAssistantModelId) return
    chat.setSelectedModelIds((prev) => {
      if (prev.length === 1 && prev[0] === activeAssistantModelId) return prev
      return [activeAssistantModelId]
    })
  }, [activeAssistant?.id, activeAssistantModelId, chat.setSelectedModelIds])

  const handleAssistantCreated = useCallback(
    async (assistant: Assistant) => {
      await chat.loadAssistants()
      chat.setSelectedModelIds([assistant.modelId])
      await chat.createSession(assistant.id)
    },
    [chat],
  )

  const handleDeleteAssistant = useCallback(
    async (assistantId: string) => {
      await chat.deleteAssistant(assistantId)
    },
    [chat],
  )

  return {
    activeAssistant,
    sidebarAssistants,
    groupProxyMode,
    groupProxyReadOnly,
    headerModelIds,
    defaultModelId,
    translationLanguages,
    messagePanelStyle,
    handleModelChange,
    handleAssistantCreated,
    handleDeleteAssistant,
  }
}

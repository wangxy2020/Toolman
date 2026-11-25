import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from 'react'
import {
  isAssistantLibAssistantName,
  isLegacyPerCourseTeachingAssistant,
  resolveCanonicalAssistantLibAssistant,
  type Assistant,
} from '@toolman/shared'
import { messageFontSizePx } from './message-settings'
import {
  isGroupProxyReadOnlySession,
  isGroupProxySession,
  isGroupSharedMirrorAssistant,
} from '../group/group-agent-utils'
import type { MessageSettings } from './message-settings'
import type { AppSettings } from '../settings/app-settings'
import type { useChat } from './useChat'
import { updateAssistantModel } from './chat-page-handlers'
import {
  isModelIdAvailable,
  isUnconfiguredModelId,
  pickDefaultModelId,
  resolveHeaderChatModelIds,
} from './model-utils'

type ChatApi = ReturnType<typeof useChat>

export function useChatPageAssistant(
  chat: ChatApi,
  messageSettings: MessageSettings,
  appSettings?: AppSettings,
) {
  const canonicalClassroom = useMemo(
    () => resolveCanonicalAssistantLibAssistant(chat.assistants, chat.sessions),
    [chat.assistants, chat.sessions],
  )

  const activeAssistant = useMemo(() => {
    const assistantId = chat.activeSession?.assistantId
    if (assistantId) {
      const matched = chat.assistants.find((a) => a.id === assistantId) ?? null
      // Course topics under duplicate「课堂」agents still resolve to the canonical one
      // so the breadcrumb / settings model stay consistent with the classroom module.
      if (matched && isAssistantLibAssistantName(matched.name) && canonicalClassroom) {
        return canonicalClassroom
      }
      return matched
    }
    return chat.assistants.find((a) => a.isPinned) ?? chat.assistants[0] ?? null
  }, [canonicalClassroom, chat.activeSession, chat.assistants])

  const sidebarAssistants = useMemo(() => {
    const classroomId = canonicalClassroom?.id
    return chat.assistants.filter((assistant) => {
      if (isGroupSharedMirrorAssistant(assistant)) return false
      if (isLegacyPerCourseTeachingAssistant(assistant)) return false
      if (!isAssistantLibAssistantName(assistant.name)) return true
      return Boolean(classroomId && assistant.id === classroomId)
    })
  }, [canonicalClassroom?.id, chat.assistants])

  const groupProxyMode = useMemo(
    () => isGroupProxySession(chat.activeSession),
    [chat.activeSession],
  )

  const groupProxyReadOnly = useMemo(
    () => isGroupProxyReadOnlySession(chat.activeSession),
    [chat.activeSession],
  )

  // Breadcrumb follows each agent's settings model when switching agents.
  const headerModelIds = useMemo(
    () =>
      resolveHeaderChatModelIds({
        activeSession: chat.activeSession,
        activeAssistant,
        selectedModelIds: chat.selectedModelIds,
        groupProxyMode,
      }),
    [activeAssistant, chat.activeSession, chat.selectedModelIds, groupProxyMode],
  )

  const defaultModelId = headerModelIds[0] ?? null

  const translationLanguages = activeAssistant?.parameters.translationLanguages

  const messagePanelStyle = useMemo(
    () =>
      ({
        '--tm-message-font-size': `${messageFontSizePx(messageSettings.messageFontSize)}px`,
      }) as CSSProperties,
    [messageSettings.messageFontSize],
  )

  const handleModelChange = useCallback(
    (modelIds: string[]) => {
      if (groupProxyMode) return
      chat.setSelectedModelIds(modelIds)
      const primaryModelId = modelIds[0]
      if (!primaryModelId || !activeAssistant) return
      // Agent-page path edits the active agent's settings model.
      if (activeAssistant.modelId === primaryModelId) return
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

  // Seed placeholder `…:unconfigured` is not a real model — heal it once providers
  // are ready so the breadcrumb stops inheriting other agents' selections.
  const healingUnconfiguredRef = useRef<string | null>(null)
  useEffect(() => {
    const assistant = activeAssistant
    const modelId = assistant?.modelId?.trim()
    if (!assistant || !modelId) return

    if (isUnconfiguredModelId(modelId)) {
      // Do not inherit another agent's model via resolvePrimaryAssistant —
      // only app default + available providers. Prefer local Ollama so the
      // seed `unconfigured` heal does not silently lock onto DeepSeek.
      const fallback = pickDefaultModelId(
        [],
        chat.providers,
        undefined,
        appSettings?.defaultChatModelId,
        { preferLocal: true },
      )
      if (!fallback) {
        chat.setSelectedModelIds((prev) => (prev.length === 0 ? prev : []))
        return
      }
      chat.setSelectedModelIds((prev) =>
        prev.length === 1 && prev[0] === fallback ? prev : [fallback],
      )
      if (healingUnconfiguredRef.current === assistant.id) return
      healingUnconfiguredRef.current = assistant.id
      void (async () => {
        const result = await updateAssistantModel(assistant, fallback)
        if (!result.ok) {
          healingUnconfiguredRef.current = null
          chat.setError(result.error)
          return
        }
        await chat.loadAssistants()
      })()
      return
    }

    healingUnconfiguredRef.current = null
    // Always snap to the current agent's settings model — never keep the previous agent.
    chat.setSelectedModelIds((prev) => {
      if (prev.length === 1 && prev[0] === modelId) return prev
      return [modelId]
    })
  }, [
    activeAssistant,
    appSettings?.defaultChatModelId,
    chat.loadAssistants,
    chat.providers,
    chat.setError,
    chat.setSelectedModelIds,
  ])

  const handleAssistantCreated = useCallback(
    async (assistant: Assistant) => {
      await chat.loadAssistants()
      if (isModelIdAvailable(assistant.modelId, chat.providers)) {
        chat.setSelectedModelIds([assistant.modelId])
      }
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

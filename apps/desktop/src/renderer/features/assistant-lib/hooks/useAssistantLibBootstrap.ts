import { useCallback, useState } from 'react'
import {
  ASSISTANT_LIB_PRESETS,
  assistantLibSessionMetadataPatch,
  getAssistantLibPreset,
  IpcChannel,
  isAssistantLibAssistantName,
  type Assistant,
  type Session,
} from '@toolman/shared'
import {
  ensureAssistantLibAssistant,
  ensureAssistantLibClassroom,
} from './assistant-lib-bootstrap-ensure'

export function useAssistantLibBootstrap(options: {
  workspaceId: string | null
  defaultModelId: string | null
  assistants: Assistant[]
  sessions: Session[]
  onReady?: () => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { workspaceId, defaultModelId, assistants, sessions, onReady } = options

  const ensureClassroom = useCallback(async (): Promise<{
    assistant: Assistant
    session: Session | null
    removedDefaultIds: string[]
  } | null> => {
    if (!workspaceId) {
      setError('请先配置工作区')
      return null
    }
    const modelId =
      defaultModelId ||
      assistants.find((item) => isAssistantLibAssistantName(item.name))?.modelId ||
      assistants.find((item) => item.modelId)?.modelId ||
      null
    if (!modelId) {
      setError('请先配置工作区与模型')
      return null
    }
    try {
      setError(null)
      return await ensureAssistantLibClassroom({
        workspaceId,
        modelId,
        assistants,
        sessions,
        onReady,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return null
    }
  }, [workspaceId, defaultModelId, assistants, sessions, onReady])

  const startCourse = useCallback(
    async (input: {
      presetId: string
      kbIds?: string[]
      textbookLocalPath?: string
      customName?: string
      customPrompt?: string
    }): Promise<{ assistant: Assistant; session: Session } | null> => {
      if (!workspaceId || !defaultModelId) {
        setError('请先配置工作区与模型')
        return null
      }
      setBusy(true)
      setError(null)
      try {
        const assistant = await ensureAssistantLibAssistant({
          workspaceId,
          modelId: defaultModelId,
          assistants,
          onReady,
        })

        const preset = getAssistantLibPreset(input.presetId)
        const courseName =
          input.customName?.trim() || preset?.name || '学习课程'
        const customSystemPrompt = input.customPrompt?.trim() || undefined
        const teachingMode = preset?.teachingMode ?? 'open'
        const refereeEnabled = preset?.refereeEnabled ?? false
        const roleplayId = preset?.roleplayId

        const createSession = await window.api.invoke(IpcChannel.SessionCreate, {
          workspaceId,
          assistantId: assistant.id,
          title: courseName,
          metadata: assistantLibSessionMetadataPatch(null, {
            presetId: input.presetId,
            roleplayId,
            learningLabel: '学习',
            teachingMode,
            refereeEnabled,
            kbIds: input.kbIds,
            customSystemPrompt,
            courseName,
            textbookLocalPath: input.textbookLocalPath,
            autoSpeak: true,
            ttsEngine: 'edge',
          }),
        })
        if (!createSession.ok) {
          throw new Error(createSession.error.message || '创建课程话题失败')
        }
        const session = createSession.data as Session
        await onReady?.()
        return { assistant, session }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        return null
      } finally {
        setBusy(false)
      }
    },
    [workspaceId, defaultModelId, assistants, onReady],
  )

  return {
    busy,
    error,
    startCourse,
    ensureClassroom,
    presets: ASSISTANT_LIB_PRESETS,
  }
}

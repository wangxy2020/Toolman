import { useCallback, useState } from 'react'
import {
  ASSISTANT_LIB_ASSISTANT_MARKER,
  ASSISTANT_LIB_ASSISTANT_NAME,
  ASSISTANT_LIB_DEFAULT_CLASSROOM_PRESET_ID,
  ASSISTANT_LIB_DEFAULT_CLASSROOM_TITLE,
  ASSISTANT_LIB_PRESETS,
  assistantLibSessionMetadataPatch,
  buildAssistantLibAssistantSystemPrompt,
  findAssistantLibDefaultClassroomSession,
  getAssistantLibPreset,
  IpcChannel,
  type Assistant,
  type Session,
} from '@toolman/shared'

const ensureAssistantInFlight = new Map<string, Promise<Assistant>>()
const ensureClassroomInFlight = new Map<string, Promise<{ assistant: Assistant; session: Session }>>()

async function ensureAssistantLibAssistant(options: {
  workspaceId: string
  modelId: string
  assistants: Assistant[]
  onReady?: () => void | Promise<void>
}): Promise<Assistant> {
  const inflightKey = options.workspaceId
  const inflight = ensureAssistantInFlight.get(inflightKey)
  if (inflight) return inflight

  const promise = (async () => {
    const desiredSystemPrompt = buildAssistantLibAssistantSystemPrompt()
    const existing = options.assistants.find(
      (item) => item.name.trim() === ASSISTANT_LIB_ASSISTANT_NAME,
    )
    if (existing) {
      const needsPrompt = existing.systemPrompt !== desiredSystemPrompt
      const needsParams =
        existing.parameters.teachingMode !== 'socratic' ||
        existing.parameters.assistantLibPresetId !== ASSISTANT_LIB_ASSISTANT_MARKER
      if (!needsPrompt && !needsParams) return existing

      const updated = await window.api.invoke(IpcChannel.AssistantUpdate, {
        id: existing.id,
        ...(needsPrompt ? { systemPrompt: desiredSystemPrompt } : {}),
        ...(needsParams
          ? {
              parameters: {
                ...existing.parameters,
                temperature: existing.parameters.temperature ?? 0.7,
                teachingMode: 'socratic' as const,
                assistantLibPresetId: ASSISTANT_LIB_ASSISTANT_MARKER,
                refereeEnabled: true,
              },
            }
          : {}),
      })
      if (!updated.ok) return existing
      await options.onReady?.()
      return (updated.data as Assistant) ?? existing
    }

    const created = await window.api.invoke(IpcChannel.AssistantCreate, {
      workspaceId: options.workspaceId,
      name: ASSISTANT_LIB_ASSISTANT_NAME,
      description: '助手库学习智能体：课程以话题形式挂载',
      systemPrompt: desiredSystemPrompt,
      modelId: options.modelId,
      parameters: {
        temperature: 0.7,
        teachingMode: 'socratic',
        assistantLibPresetId: ASSISTANT_LIB_ASSISTANT_MARKER,
        refereeEnabled: true,
      },
      isPinned: true,
    })
    if (!created.ok) {
      throw new Error(created.error.message || '创建助手库智能体失败')
    }
    await options.onReady?.()
    return created.data as Assistant
  })().finally(() => {
    ensureAssistantInFlight.delete(inflightKey)
  })

  ensureAssistantInFlight.set(inflightKey, promise)
  return promise
}

async function loadAssistantSessions(workspaceId: string, assistantId: string): Promise<Session[]> {
  const items: Session[] = []
  let cursor: string | undefined
  for (;;) {
    const result = await window.api.invoke(IpcChannel.SessionList, {
      workspaceId,
      assistantId,
      pagination: { limit: 100, cursor },
    })
    if (!result.ok) break
    const data = result.data as { items: Session[]; nextCursor?: string }
    items.push(...data.items)
    if (!data.nextCursor) break
    cursor = data.nextCursor
  }
  return items
}

async function ensureDefaultClassroomSession(options: {
  workspaceId: string
  modelId: string
  assistants: Assistant[]
  sessions: Session[]
  onReady?: () => void | Promise<void>
}): Promise<{ assistant: Assistant; session: Session }> {
  const inflightKey = options.workspaceId
  const inflight = ensureClassroomInFlight.get(inflightKey)
  if (inflight) return inflight

  const promise = (async () => {
    const assistant = await ensureAssistantLibAssistant({
      workspaceId: options.workspaceId,
      modelId: options.modelId,
      assistants: options.assistants,
      onReady: options.onReady,
    })

    const cached = findAssistantLibDefaultClassroomSession(options.sessions, assistant.id)
    if (cached) {
      return { assistant, session: cached }
    }

    const loaded = await loadAssistantSessions(options.workspaceId, assistant.id)
    const existing = findAssistantLibDefaultClassroomSession(loaded, assistant.id)
    if (existing) {
      await options.onReady?.()
      return { assistant, session: existing }
    }

    const preset = getAssistantLibPreset(ASSISTANT_LIB_DEFAULT_CLASSROOM_PRESET_ID)
    const created = await window.api.invoke(IpcChannel.SessionCreate, {
      workspaceId: options.workspaceId,
      assistantId: assistant.id,
      title: ASSISTANT_LIB_DEFAULT_CLASSROOM_TITLE,
      metadata: assistantLibSessionMetadataPatch(null, {
        presetId: ASSISTANT_LIB_DEFAULT_CLASSROOM_PRESET_ID,
        roleplayId: preset?.roleplayId,
        learningLabel: '学习',
        teachingMode: preset?.teachingMode ?? 'socratic',
        refereeEnabled: preset?.refereeEnabled ?? true,
        courseName: ASSISTANT_LIB_DEFAULT_CLASSROOM_TITLE,
        isDefaultClassroom: true,
        autoSpeak: true,
        ttsEngine: 'edge',
      }),
    })
    if (!created.ok) {
      throw new Error(created.error.message || '创建默认课堂话题失败')
    }
    await options.onReady?.()
    return { assistant, session: created.data as Session }
  })().finally(() => {
    ensureClassroomInFlight.delete(inflightKey)
  })

  ensureClassroomInFlight.set(inflightKey, promise)
  return promise
}

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

  const ensureDefaultClassroom = useCallback(async (): Promise<{
    assistant: Assistant
    session: Session
  } | null> => {
    if (!workspaceId || !defaultModelId) {
      setError('请先配置工作区与模型')
      return null
    }
    try {
      setError(null)
      return await ensureDefaultClassroomSession({
        workspaceId,
        modelId: defaultModelId,
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
    ensureDefaultClassroom,
    presets: ASSISTANT_LIB_PRESETS,
  }
}

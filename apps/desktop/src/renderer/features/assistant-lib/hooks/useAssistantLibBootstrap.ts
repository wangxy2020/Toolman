import { useCallback, useState } from 'react'
import {
  ASSISTANT_LIB_ASSISTANT_MARKER,
  ASSISTANT_LIB_ASSISTANT_NAME,
  ASSISTANT_LIB_GUIDE_COURSE_PRESET_ID,
  ASSISTANT_LIB_GUIDE_COURSE_TITLE,
  ASSISTANT_LIB_PRESETS,
  assistantLibSessionMetadataPatch,
  buildAssistantLibAssistantSystemPrompt,
  buildAssistantLibGuideCourseSyllabus,
  buildAssistantLibGuideCourseSystemPrompt,
  findAssistantLibGuideCourseSession,
  formatSyllabusMarkdown,
  getAssistantLibPreset,
  isAssistantLibAssistantName,
  listAssistantLibDefaultClassroomIds,
  listDuplicateAssistantLibGuideCourseIds,
  parseAssistantLibSessionMeta,
  IpcChannel,
  type Assistant,
  type Session,
} from '@toolman/shared'

const ensureAssistantInFlight = new Map<string, Promise<Assistant>>()
const ensureClassroomInFlight = new Map<
  string,
  Promise<{ assistant: Assistant; session: Session | null; removedDefaultIds: string[] }>
>()

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
    const existing = options.assistants.find((item) => isAssistantLibAssistantName(item.name))
    if (existing) {
      const needsRename = existing.name.trim() !== ASSISTANT_LIB_ASSISTANT_NAME
      const needsPrompt = existing.systemPrompt !== desiredSystemPrompt
      const needsParams =
        existing.parameters.teachingMode !== 'socratic' ||
        existing.parameters.assistantLibPresetId !== ASSISTANT_LIB_ASSISTANT_MARKER
      if (!needsRename && !needsPrompt && !needsParams) return existing

      const updated = await window.api.invoke(IpcChannel.AssistantUpdate, {
        id: existing.id,
        ...(needsRename ? { name: ASSISTANT_LIB_ASSISTANT_NAME } : {}),
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
      description: '课堂学习智能体：课程以话题形式挂载',
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
      throw new Error(created.error.message || '创建课堂智能体失败')
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

async function deleteDefaultClassroomSessions(
  sessions: Session[],
  assistantId: string,
): Promise<string[]> {
  const ids = listAssistantLibDefaultClassroomIds(sessions, assistantId)
  for (const id of ids) {
    await window.api.invoke(IpcChannel.SessionDelete, { id })
  }
  return ids
}

async function deleteDuplicateGuideCourses(
  sessions: Session[],
  assistantId: string,
  onReady?: () => void | Promise<void>,
): Promise<boolean> {
  const duplicateIds = listDuplicateAssistantLibGuideCourseIds(sessions, assistantId)
  if (duplicateIds.length === 0) return false
  for (const id of duplicateIds) {
    await window.api.invoke(IpcChannel.SessionDelete, { id })
  }
  await onReady?.()
  return true
}

function guideCourseMetadataPatch(metadata: Record<string, unknown> | null | undefined) {
  const previous = parseAssistantLibSessionMeta(metadata)
  const preset = getAssistantLibPreset(ASSISTANT_LIB_GUIDE_COURSE_PRESET_ID)
  const syllabus =
    previous?.syllabus?.chapters.length ? previous.syllabus : buildAssistantLibGuideCourseSyllabus()
  const customSystemPrompt =
    previous?.customSystemPrompt?.trim() || buildAssistantLibGuideCourseSystemPrompt()
  return assistantLibSessionMetadataPatch(metadata, {
    presetId: previous?.presetId || ASSISTANT_LIB_GUIDE_COURSE_PRESET_ID,
    roleplayId: previous?.roleplayId ?? preset?.roleplayId,
    learningLabel: previous?.learningLabel ?? '学习',
    teachingMode: previous?.teachingMode ?? preset?.teachingMode ?? 'open',
    refereeEnabled: previous?.refereeEnabled ?? preset?.refereeEnabled ?? false,
    kbIds: previous?.kbIds,
    customSystemPrompt,
    courseName: previous?.courseName?.trim() || ASSISTANT_LIB_GUIDE_COURSE_TITLE,
    isGuideClassroom: true,
    syllabus,
    lessonPlan: previous?.lessonPlan?.trim() || formatSyllabusMarkdown(syllabus),
    autoSpeak: previous?.autoSpeak ?? true,
    ttsEngine: previous?.ttsEngine ?? 'edge',
  })
}

async function ensureGuideClassroomSession(options: {
  workspaceId: string
  assistant: Assistant
  sessions: Session[]
  onReady?: () => void | Promise<void>
}): Promise<Session | null> {
  const cached = findAssistantLibGuideCourseSession(options.sessions, options.assistant.id)
  const source = cached
    ? options.sessions
    : await loadAssistantSessions(options.workspaceId, options.assistant.id)
  const existing = cached ?? findAssistantLibGuideCourseSession(source, options.assistant.id)
  if (existing) {
    await deleteDuplicateGuideCourses(source, options.assistant.id, options.onReady)
    const meta = parseAssistantLibSessionMeta(existing.metadata)
    const needsSeed =
      !meta?.isGuideClassroom ||
      !meta.syllabus?.chapters.length ||
      !meta.customSystemPrompt?.trim()
    if (!needsSeed) return existing
    const updated = await window.api.invoke(IpcChannel.SessionUpdate, {
      id: existing.id,
      title: existing.title || ASSISTANT_LIB_GUIDE_COURSE_TITLE,
      metadata: guideCourseMetadataPatch(existing.metadata),
    })
    if (updated.ok) {
      await options.onReady?.()
      return (updated.data as Session) ?? existing
    }
    return existing
  }

  if (options.assistant.parameters.assistantLibGuideDismissed) return null

  const created = await window.api.invoke(IpcChannel.SessionCreate, {
    workspaceId: options.workspaceId,
    assistantId: options.assistant.id,
    title: ASSISTANT_LIB_GUIDE_COURSE_TITLE,
    metadata: guideCourseMetadataPatch(null),
  })
  if (!created.ok) {
    throw new Error(created.error.message || '创建 Toolman 使用说明课程失败')
  }
  await options.onReady?.()
  return created.data as Session
}

async function ensureAssistantLibClassroom(options: {
  workspaceId: string
  modelId: string
  assistants: Assistant[]
  sessions: Session[]
  onReady?: () => void | Promise<void>
}): Promise<{ assistant: Assistant; session: Session | null; removedDefaultIds: string[] }> {
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

    const loaded = await loadAssistantSessions(options.workspaceId, assistant.id)
    const merged = new Map<string, Session>()
    for (const session of [...options.sessions, ...loaded]) {
      if (session.assistantId === assistant.id) merged.set(session.id, session)
    }
    let sessions = [...merged.values()]

    const removedDefaultIds = await deleteDefaultClassroomSessions(sessions, assistant.id)
    if (removedDefaultIds.length > 0) {
      sessions = sessions.filter((session) => !removedDefaultIds.includes(session.id))
      await options.onReady?.()
    }

    const guide = await ensureGuideClassroomSession({
      workspaceId: options.workspaceId,
      assistant,
      sessions,
      onReady: options.onReady,
    })
    return {
      assistant,
      session: guide ?? sessions[0] ?? null,
      removedDefaultIds,
    }
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

  const ensureClassroom = useCallback(async (): Promise<{
    assistant: Assistant
    session: Session | null
    removedDefaultIds: string[]
  } | null> => {
    if (!workspaceId || !defaultModelId) {
      setError('请先配置工作区与模型')
      return null
    }
    try {
      setError(null)
      return await ensureAssistantLibClassroom({
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
    ensureClassroom,
    presets: ASSISTANT_LIB_PRESETS,
  }
}

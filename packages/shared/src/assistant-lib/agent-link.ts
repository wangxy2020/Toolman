import { getAssistantLibPreset } from './socratic-prompts.js'
import {
  isAssistantLibDefaultClassroomSession,
  isTeachingAssistantParameters,
  parseAssistantLibSessionMeta,
  parseTeachingMode,
} from './teaching-detect.js'
import type { TeachingMode } from './teaching-types.js'

/** Single pinned agent on the agent page; courses are sessions/topics under it. */
export const ASSISTANT_LIB_ASSISTANT_NAME = '课堂'

/** Previous display names; still recognized so existing installs keep working. */
export const ASSISTANT_LIB_ASSISTANT_NAME_LEGACY = ['助手课堂', '助手库'] as const

export const ASSISTANT_LIB_ASSISTANT_MARKER = 'assistant-lib'

/** Default classroom topic title under the shared assistant-lib agent. */
export const ASSISTANT_LIB_DEFAULT_CLASSROOM_TITLE = '默认课堂'

/** Preset used by the built-in default classroom topic. */
export const ASSISTANT_LIB_DEFAULT_CLASSROOM_PRESET_ID = 'socratic-tutor' as const

export function isAssistantLibAssistantName(name: string | null | undefined): boolean {
  const trimmed = (name ?? '').trim()
  if (trimmed === ASSISTANT_LIB_ASSISTANT_NAME) return true
  return (ASSISTANT_LIB_ASSISTANT_NAME_LEGACY as readonly string[]).includes(trimmed)
}

/** Legacy per-course teaching agents (pre shared「课堂」agent). */
export function isLegacyPerCourseTeachingAssistant(assistant: {
  name: string
  parameters: { teachingMode?: unknown; assistantLibPresetId?: unknown }
}): boolean {
  return (
    isTeachingAssistantParameters(assistant.parameters) &&
    !isAssistantLibAssistantName(assistant.name)
  )
}

export function buildAssistantLibAssistantSystemPrompt(): string {
  return [
    '你是 Toolman「课堂」学习助手。',
    '具体课程角色、苏格拉底规则与教材约束见运行时「当前课程」提示。',
    '若与通用作答习惯冲突，以当前课程规则为准。',
  ].join('\n')
}

/** True for the built-in default course (flag and/or legacy title/courseName). */
export function looksLikeAssistantLibDefaultClassroom(session: {
  title?: string
  metadata?: Record<string, unknown> | null
}): boolean {
  if (isAssistantLibDefaultClassroomSession(session.metadata)) return true
  const meta = parseAssistantLibSessionMeta(session.metadata)
  const courseName = meta?.courseName?.trim() ?? ''
  const title = session.title?.trim() ?? ''
  return (
    title === ASSISTANT_LIB_DEFAULT_CLASSROOM_TITLE ||
    courseName === ASSISTANT_LIB_DEFAULT_CLASSROOM_TITLE ||
    courseName === '默认课程'
  )
}

export type AssistantLibTeachingRuntime = {
  teachingMode: TeachingMode | null
  refereeEnabled: boolean
  roleplayId?: string
  presetId?: string
  kbIds?: string[]
  courseSystemPrompt?: string
  courseName?: string
  textbookLocalPath?: string
}

export function resolveAssistantLibTeachingRuntime(options: {
  sessionMetadata?: Record<string, unknown> | null
  assistantParameters?: Record<string, unknown> | null
}): AssistantLibTeachingRuntime {
  const meta = parseAssistantLibSessionMeta(options.sessionMetadata)
  const params = options.assistantParameters ?? {}

  const teachingMode =
    parseTeachingMode(meta?.teachingMode) ?? parseTeachingMode(params.teachingMode)

  const preset = meta?.presetId ? getAssistantLibPreset(meta.presetId) : undefined
  const roleplayId =
    meta?.roleplayId ??
    (typeof params.roleplayId === 'string' ? params.roleplayId : undefined) ??
    preset?.roleplayId

  const refereeEnabled =
    meta?.refereeEnabled ??
    (typeof params.refereeEnabled === 'boolean' ? params.refereeEnabled : undefined) ??
    preset?.refereeEnabled ??
    teachingMode === 'socratic'

  const kbIds =
    meta?.kbIds && meta.kbIds.length > 0
      ? meta.kbIds
      : Array.isArray(params.kbIds)
        ? (params.kbIds as string[])
        : undefined

  const courseSystemPrompt =
    meta?.customSystemPrompt?.trim() || preset?.systemPrompt || undefined

  const courseName = meta?.courseName?.trim() || preset?.name || undefined
  const textbookLocalPath = meta?.textbookLocalPath?.trim() || undefined

  return {
    teachingMode,
    refereeEnabled: Boolean(refereeEnabled),
    roleplayId,
    presetId: meta?.presetId ?? (typeof params.assistantLibPresetId === 'string'
      ? params.assistantLibPresetId
      : undefined),
    kbIds,
    courseSystemPrompt,
    courseName,
    textbookLocalPath,
  }
}

export function buildAssistantLibCourseRuntimeHint(
  runtime: AssistantLibTeachingRuntime,
): string | null {
  if (!runtime.courseSystemPrompt && !runtime.courseName && !runtime.textbookLocalPath) {
    return null
  }
  return [
    '## 当前课程',
    runtime.courseName ? `课程：${runtime.courseName}` : '',
    runtime.textbookLocalPath ? `教材本地目录：${runtime.textbookLocalPath}` : '',
    runtime.courseSystemPrompt ?? '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function findAssistantLibDefaultClassroomSession<
  T extends {
    id?: string
    assistantId: string | null
    title: string
    createdAt?: number
    metadata: Record<string, unknown>
  },
>(sessions: readonly T[], assistantId: string): T | null {
  const candidates = sessions
    .filter(
      (session) =>
        session.assistantId === assistantId && looksLikeAssistantLibDefaultClassroom(session),
    )
    .sort((left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0))

  const flagged = candidates.find((session) =>
    isAssistantLibDefaultClassroomSession(session.metadata),
  )
  return flagged ?? candidates[0] ?? null
}

/** Extra default-course sessions that should be removed (keep the oldest flagged one). */
export function listDuplicateAssistantLibDefaultClassroomIds<
  T extends {
    id: string
    assistantId: string | null
    title: string
    createdAt?: number
    metadata: Record<string, unknown>
  },
>(sessions: readonly T[], assistantId: string): string[] {
  const keeper = findAssistantLibDefaultClassroomSession(sessions, assistantId)
  if (!keeper) return []
  return sessions
    .filter(
      (session) =>
        session.assistantId === assistantId &&
        session.id !== keeper.id &&
        looksLikeAssistantLibDefaultClassroom(session),
    )
    .map((session) => session.id)
}

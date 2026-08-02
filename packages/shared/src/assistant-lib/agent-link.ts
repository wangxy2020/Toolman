import { getAssistantLibPreset } from './socratic-prompts.js'
import {
  isAssistantLibDefaultClassroomSession,
  isTeachingAssistantParameters,
  parseAssistantLibSessionMeta,
  parseTeachingMode,
} from './teaching-detect.js'
import type { TeachingMode } from './teaching-types.js'

/** Single pinned agent on the agent page; courses are sessions/topics under it. */
export const ASSISTANT_LIB_ASSISTANT_NAME = '助手库'

export const ASSISTANT_LIB_ASSISTANT_MARKER = 'assistant-lib'

/** Default classroom topic title under the shared assistant-lib agent. */
export const ASSISTANT_LIB_DEFAULT_CLASSROOM_TITLE = '默认课堂'

/** Preset used by the built-in default classroom topic. */
export const ASSISTANT_LIB_DEFAULT_CLASSROOM_PRESET_ID = 'socratic-tutor' as const

export function isAssistantLibAssistantName(name: string | null | undefined): boolean {
  return (name ?? '').trim() === ASSISTANT_LIB_ASSISTANT_NAME
}

/** Legacy per-course teaching agents (pre shared「助手库」agent). */
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
    '你是 Toolman「助手库」学习助手。',
    '具体课程角色、苏格拉底规则与教材约束见运行时「当前课程」提示。',
    '若与通用作答习惯冲突，以当前课程规则为准。',
  ].join('\n')
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
  T extends { assistantId: string | null; title: string; metadata: Record<string, unknown> },
>(sessions: readonly T[], assistantId: string): T | null {
  const byFlag = sessions.find(
    (session) =>
      session.assistantId === assistantId && isAssistantLibDefaultClassroomSession(session.metadata),
  )
  if (byFlag) return byFlag

  // Legacy / renamed-title fallback
  return (
    sessions.find(
      (session) =>
        session.assistantId === assistantId &&
        session.title.trim() === ASSISTANT_LIB_DEFAULT_CLASSROOM_TITLE,
    ) ?? null
  )
}

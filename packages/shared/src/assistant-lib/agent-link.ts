import { ASSISTANT_LIB_GUIDE_COURSE_TITLE } from './guide-course.js'
import { getAssistantLibPreset } from './socratic-prompts.js'
import {
  isAssistantLibDefaultClassroomSession,
  isAssistantLibGuideCourseSession,
  isTeachingAssistantParameters,
  parseAssistantLibSessionMeta,
  parseTeachingMode,
} from './teaching-detect.js'
import type { ClassroomStudyRecord, CourseSyllabus, TeachingMode } from './teaching-types.js'
import { currentSyllabusChapter, currentSyllabusChapterIndex } from './syllabus.js'

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

/** True for the built-in Toolman usage-guide course. */
export function looksLikeAssistantLibGuideCourse(session: {
  title?: string
  metadata?: Record<string, unknown> | null
}): boolean {
  if (isAssistantLibGuideCourseSession(session.metadata)) return true
  const meta = parseAssistantLibSessionMeta(session.metadata)
  const courseName = meta?.courseName?.trim() ?? ''
  const title = session.title?.trim() ?? ''
  return title === ASSISTANT_LIB_GUIDE_COURSE_TITLE || courseName === ASSISTANT_LIB_GUIDE_COURSE_TITLE
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
  syllabus?: CourseSyllabus
  studyRecords?: ClassroomStudyRecord[]
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
    syllabus: meta?.syllabus,
    studyRecords: meta?.studyRecords,
  }
}

export function buildAssistantLibCourseRuntimeHint(
  runtime: AssistantLibTeachingRuntime,
): string | null {
  const chapter = runtime.syllabus ? currentSyllabusChapter(runtime.syllabus) : null
  const chapterIndex = runtime.syllabus ? currentSyllabusChapterIndex(runtime.syllabus) : 0
  const total = runtime.syllabus?.chapters.length ?? 0
  if (!runtime.courseSystemPrompt && !runtime.courseName && !runtime.textbookLocalPath && !chapter) {
    return null
  }

  const chapterLines = chapter
    ? [
        '## 学习进度（必须按目录从上到下）',
        `当前章节：第 ${chapterIndex + 1}/${total} 章「${chapter.title}」`,
        chapter.hours ? `本章课时：${chapter.hours}` : '',
        '未完成本章验收前，禁止进入下一章；不要提前讲解未解锁章节。',
        chapter.lessonPlan?.trim() ? `### 本章教案\n${chapter.lessonPlan.trim()}` : '',
        chapter.assessmentQuestions.length > 0
          ? [
              '### 本章验收问题（用户需逐题展现理解）',
              ...chapter.assessmentQuestions.map(
                (question, index) => `${index + 1}. ${question}`,
              ),
              '当且仅当本章验收合格时，在 socratic-state 中设置 `"chapterPassed": true`，并将 pathIndex 设为下一章；否则 `"chapterPassed": false` 且 pathIndex 保持当前章。',
            ].join('\n')
          : '',
      ]
    : []

  const records = runtime.studyRecords ?? []
  const recordLines =
    records.length > 0
      ? [
          '## 本课课堂记录（仅当前课程）',
          ...records.slice(-5).map((item, index) => {
            const title = item.chapterTitle?.trim() || '未指定章节'
            const mastered = item.mastered.length > 0 ? `；掌握：${item.mastered.join('、')}` : ''
            return `${index + 1}. ${title}${mastered}`
          }),
        ]
      : ['## 本课课堂记录', '尚无学习记录。请从当前未通过章节开场。']

  return [
    '## 当前课程',
    runtime.courseName ? `课程：${runtime.courseName}` : '',
    runtime.textbookLocalPath ? `教材本地目录：${runtime.textbookLocalPath}` : '',
    runtime.courseSystemPrompt ?? '',
    ...chapterLines,
    ...recordLines,
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

/** All built-in default-course sessions — used when retiring that menu entry. */
export function listAssistantLibDefaultClassroomIds<
  T extends {
    id: string
    assistantId: string | null
    title: string
    metadata: Record<string, unknown>
  },
>(sessions: readonly T[], assistantId: string): string[] {
  return sessions
    .filter(
      (session) =>
        session.assistantId === assistantId && looksLikeAssistantLibDefaultClassroom(session),
    )
    .map((session) => session.id)
}

export function findAssistantLibGuideCourseSession<
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
        session.assistantId === assistantId && looksLikeAssistantLibGuideCourse(session),
    )
    .sort((left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0))

  const flagged = candidates.find((session) => isAssistantLibGuideCourseSession(session.metadata))
  return flagged ?? candidates[0] ?? null
}

/** Extra usage-guide sessions that should be removed (keep the oldest flagged one). */
export function listDuplicateAssistantLibGuideCourseIds<
  T extends {
    id: string
    assistantId: string | null
    title: string
    createdAt?: number
    metadata: Record<string, unknown>
  },
>(sessions: readonly T[], assistantId: string): string[] {
  const keeper = findAssistantLibGuideCourseSession(sessions, assistantId)
  if (!keeper) return []
  return sessions
    .filter(
      (session) =>
        session.assistantId === assistantId &&
        session.id !== keeper.id &&
        looksLikeAssistantLibGuideCourse(session),
    )
    .map((session) => session.id)
}

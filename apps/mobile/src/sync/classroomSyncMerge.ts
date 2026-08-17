import type {
  ClassroomStudyRecord,
  CourseSyllabus,
  SocraticState,
  SyncChange,
  TeachingMode,
} from '@toolman/shared'

export type MobileClassroomCourse = {
  id: string
  title: string
  updatedAt: number
  courseName: string
  presetId: string
  teachingMode: TeachingMode | null
  refereeEnabled: boolean
  customSystemPrompt: string
  lessonPlan: string
  syllabus: CourseSyllabus | null
  studyRecords: ClassroomStudyRecord[]
  socraticState: SocraticState | null
  isGuideClassroom: boolean
  isDefaultClassroom: boolean
  kbIds?: string[]
  /** Local display labels for bound textbook KBs (not synced). */
  kbLabels?: string[]
  autoSpeak?: boolean
  ttsEngine?: 'edge' | 'web-speech'
  ttsVoice?: string
  /** Chat model from program settings (`providerId:modelName`). */
  modelId?: string
}

export function mergeClassroomCoursesFromSyncChanges(
  courses: MobileClassroomCourse[],
  changes: SyncChange[],
): MobileClassroomCourse[] {
  const byId = new Map(courses.map((course) => [course.id, course]))
  for (const change of changes) {
    if (change.entityKind !== 'classroom_session') continue
    if (change.op === 'delete') {
      const existing = byId.get(change.entityId)
      if (existing && existing.updatedAt > change.updatedAt) continue
      byId.delete(change.entityId)
      continue
    }
    const existing = byId.get(change.entityId)
    if (existing && existing.updatedAt > change.updatedAt) continue
    const next = courseFromPayload(change.entityId, change.updatedAt, change.payload, existing)
    if (next) byId.set(change.entityId, next)
  }
  return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Upsert classroom courses into chat sessions and drop leftover classroom topics. */
export function applyClassroomCoursesToSessions<
  T extends { id: string; title: string; updatedAt: number; agentScope: string },
>(
  sessions: T[],
  _prevCourseIds: string[],
  nextCourses: MobileClassroomCourse[],
  createSession: (course: MobileClassroomCourse) => T,
): T[] {
  const courseIds = new Set(nextCourses.map((course) => course.id))
  const byId = new Map(
    sessions
      .filter((session) => session.agentScope !== 'classroom' || courseIds.has(session.id))
      .map((session) => [session.id, session]),
  )
  for (const course of nextCourses) {
    const existing = byId.get(course.id)
    if (existing) {
      byId.set(course.id, {
        ...existing,
        title: course.courseName || course.title,
        updatedAt: Math.max(existing.updatedAt, course.updatedAt),
        agentScope: 'classroom',
      })
    } else {
      byId.set(course.id, createSession(course))
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function courseFromPayload(
  id: string,
  updatedAt: number,
  payload: unknown,
  existing?: MobileClassroomCourse,
): MobileClassroomCourse | null {
  const rec = asRecord(payload)
  if (!rec) return existing ?? null
  const meta = asRecord(rec.meta) ?? rec
  const title =
    (typeof rec.title === 'string' && rec.title.trim()) ||
    (typeof meta.courseName === 'string' && meta.courseName.trim()) ||
    existing?.title ||
    '未命名课程'
  const teachingMode =
    meta.teachingMode === 'socratic' || meta.teachingMode === 'open' || meta.teachingMode === 'off'
      ? meta.teachingMode
      : (existing?.teachingMode ?? null)
  const syllabus = (meta.syllabus as CourseSyllabus | undefined) ?? existing?.syllabus ?? null
  const studyRecords = Array.isArray(meta.studyRecords)
    ? (meta.studyRecords as ClassroomStudyRecord[])
    : (existing?.studyRecords ?? [])
  const socraticState = (rec.socraticState as SocraticState | undefined) ?? existing?.socraticState ?? null
  return {
    id,
    title,
    updatedAt,
    courseName:
      (typeof meta.courseName === 'string' && meta.courseName.trim()) || title,
    presetId: typeof meta.presetId === 'string' ? meta.presetId : existing?.presetId ?? '',
    teachingMode,
    refereeEnabled:
      typeof meta.refereeEnabled === 'boolean'
        ? meta.refereeEnabled
        : (existing?.refereeEnabled ?? false),
    customSystemPrompt:
      typeof meta.customSystemPrompt === 'string'
        ? meta.customSystemPrompt
        : (existing?.customSystemPrompt ?? ''),
    lessonPlan:
      typeof meta.lessonPlan === 'string' ? meta.lessonPlan : (existing?.lessonPlan ?? ''),
    syllabus,
    studyRecords,
    socraticState,
    isGuideClassroom: meta.isGuideClassroom === true || existing?.isGuideClassroom === true,
    isDefaultClassroom: meta.isDefaultClassroom === true || existing?.isDefaultClassroom === true,
    kbIds: Array.isArray(meta.kbIds)
      ? meta.kbIds.filter((id): id is string => typeof id === 'string')
      : (existing?.kbIds ?? []),
    kbLabels: existing?.kbLabels,
    autoSpeak: typeof meta.autoSpeak === 'boolean' ? meta.autoSpeak : existing?.autoSpeak,
    ttsEngine: meta.ttsEngine === 'web-speech' || meta.ttsEngine === 'edge' ? meta.ttsEngine : existing?.ttsEngine,
    ttsVoice: typeof meta.ttsVoice === 'string' ? meta.ttsVoice : existing?.ttsVoice,
    modelId:
      typeof meta.modelId === 'string' && meta.modelId.trim()
        ? meta.modelId.trim()
        : existing?.modelId,
  }
}

import {
  ClassroomSessionSyncPayloadSchema,
  type SyncChange,
} from '@toolman/shared'
import type { MobileClassroomCourse } from './classroomSyncMerge'
import type { MobileSyncState } from './syncState'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function courseToChange(course: MobileClassroomCourse): SyncChange | null {
  const kbIds = (course.kbIds ?? []).filter((id) => UUID_RE.test(id))
  const parsed = ClassroomSessionSyncPayloadSchema.safeParse({
    title: course.courseName.trim() || course.title.trim() || '未命名课程',
    meta: {
      enabled: true,
      presetId: course.presetId.trim() || 'socratic-tutor',
      learningLabel: '学习',
      teachingMode: course.teachingMode ?? undefined,
      refereeEnabled: course.refereeEnabled,
      kbIds: kbIds.length > 0 ? kbIds : undefined,
      customSystemPrompt: course.customSystemPrompt || undefined,
      lessonPlan: course.lessonPlan || undefined,
      syllabus: course.syllabus ?? undefined,
      courseName: course.courseName || undefined,
      isDefaultClassroom: course.isDefaultClassroom || undefined,
      isGuideClassroom: course.isGuideClassroom || undefined,
      autoSpeak: course.autoSpeak,
      ttsEngine: course.ttsEngine,
      ttsVoice: course.ttsVoice,
      studyRecords: course.studyRecords,
    },
    socraticState: course.socraticState ?? undefined,
  })
  if (!parsed.success) return null
  return {
    entityKind: 'classroom_session',
    entityId: course.id,
    op: 'upsert',
    updatedAt: course.updatedAt,
    payload: parsed.data,
  }
}

export function selectDirtyClassroomChanges(
  courses: MobileClassroomCourse[],
  state: Pick<MobileSyncState, 'classroomStamps'>,
): SyncChange[] {
  const changes: SyncChange[] = []
  const live = new Set(courses.map((course) => course.id))
  for (const course of courses) {
    if (state.classroomStamps[course.id] === course.updatedAt) continue
    const change = courseToChange(course)
    if (change) changes.push(change)
  }
  for (const [id, updatedAt] of Object.entries(state.classroomStamps)) {
    if (live.has(id)) continue
    changes.push({
      entityKind: 'classroom_session',
      entityId: id,
      op: 'delete',
      updatedAt: Math.max(updatedAt, Date.now()),
      payload: {},
    })
  }
  return changes
}

export function applyClassroomPushStamps(
  state: MobileSyncState,
  courses: MobileClassroomCourse[],
  pushed: SyncChange[],
): MobileSyncState {
  if (pushed.length === 0) return state
  const classroomStamps = { ...state.classroomStamps }
  const live = new Set(courses.map((course) => course.id))
  for (const change of pushed) {
    if (change.op === 'delete') delete classroomStamps[change.entityId]
    else classroomStamps[change.entityId] = change.updatedAt
  }
  for (const id of Object.keys(classroomStamps)) {
    if (!live.has(id) && !pushed.some((change) => change.entityId === id && change.op === 'delete')) {
      delete classroomStamps[id]
    }
  }
  return { ...state, classroomStamps }
}

export function stampClassroomCourses(
  state: MobileSyncState,
  courses: MobileClassroomCourse[],
): MobileSyncState {
  const classroomStamps: Record<string, number> = {}
  for (const course of courses) classroomStamps[course.id] = course.updatedAt
  return { ...state, classroomStamps }
}

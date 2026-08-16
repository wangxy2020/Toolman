import {
  applySocraticStateFromAssistantText,
  applySyllabusLearningProgress,
  formatSyllabusMarkdown,
  touchLatestClassroomStudyRecord,
  type SocraticState,
} from '@toolman/shared'
import type { MobileClassroomCourse } from '../sync/classroomSyncMerge'

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/**
 * Mirror desktop AssistantLibChatPanel: parse socratic-state from the reply,
 * advance syllabus chapters, and patch the open study record.
 */
export function applyClassroomProgressFromAssistantReply(input: {
  course: MobileClassroomCourse
  assistantText: string
  userMessageCount: number
}): MobileClassroomCourse | null {
  const { course, assistantText, userMessageCount } = input
  const understanding: SocraticState | undefined = course.socraticState ?? undefined
  const nextState = applySocraticStateFromAssistantText(understanding, assistantText)
  const progressed = applySyllabusLearningProgress(course.syllabus ?? undefined, nextState)
  const nextSyllabus = progressed.syllabus
  const nextStudyRecords = touchLatestClassroomStudyRecord(course.studyRecords, {
    mastered: progressed.state.mastered,
    stuckPoints: progressed.state.stuckPoints,
    qaCount: userMessageCount,
  })

  const stateChanged = !sameJson(course.socraticState, progressed.state)
  const syllabusChanged = !sameJson(course.syllabus, nextSyllabus)
  const recordsChanged = !sameJson(course.studyRecords, nextStudyRecords)
  if (!stateChanged && !syllabusChanged && !recordsChanged) return null

  const lessonPlan =
    formatSyllabusMarkdown(nextSyllabus).trim() || course.lessonPlan

  return {
    ...course,
    updatedAt: Date.now(),
    socraticState: progressed.state,
    syllabus: nextSyllabus,
    studyRecords: nextStudyRecords,
    lessonPlan,
  }
}

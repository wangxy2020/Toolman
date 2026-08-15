import {
  appendClassroomStudyRecord,
  buildStartClassUserMessage,
  currentSyllabusChapter,
  EMPTY_SOCRATIC_STATE,
  endOpenClassroomStudyRecords,
  isClassroomLive,
} from '@toolman/shared'
import type { MobileClassroomCourse } from '../sync/classroomSyncMerge'

export function classroomCourseIsLive(course: MobileClassroomCourse | null | undefined): boolean {
  return isClassroomLive(course?.studyRecords)
}

export function withUpdatedStudyRecords(
  courses: MobileClassroomCourse[],
  courseId: string,
  studyRecords: MobileClassroomCourse['studyRecords'],
): MobileClassroomCourse[] {
  return courses.map((course) =>
    course.id === courseId ? { ...course, studyRecords, updatedAt: Date.now() } : course,
  )
}

export function startClassroomSession(course: MobileClassroomCourse): {
  studyRecords: MobileClassroomCourse['studyRecords']
  userMessage: string
} {
  const chapter = course.syllabus ? currentSyllabusChapter(course.syllabus) : null
  const studyRecords = appendClassroomStudyRecord(course.studyRecords, {
    id: `study-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    chapterId: chapter?.id,
    chapterTitle: chapter?.title,
  })
  return {
    studyRecords,
    userMessage: buildStartClassUserMessage({
      courseName: course.courseName?.trim() || course.title,
      syllabus: course.syllabus ?? undefined,
      records: studyRecords,
      state: course.socraticState ?? EMPTY_SOCRATIC_STATE,
    }),
  }
}

export function stopClassroomSession(
  course: MobileClassroomCourse,
): MobileClassroomCourse['studyRecords'] {
  return endOpenClassroomStudyRecords(course.studyRecords)
}

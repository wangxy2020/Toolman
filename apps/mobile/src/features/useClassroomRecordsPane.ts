import { useMobileApp } from '../state/MobileAppContext'
import { classroomCourseLabel, resolveClassroomSettingsCourse } from './classroomSidebar'
import {
  classroomRecordStatCards,
  collectSocraticTags,
} from './classroomRecordsUtils'

export function useClassroomRecordsPane() {
  const { classroomCourses, sessions, activeSessionId } = useMobileApp()
  const course = resolveClassroomSettingsCourse(classroomCourses, null, activeSessionId)
  const session = sessions.find((item) => item.id === course?.id) ?? null
  const chapters = course?.syllabus?.chapters ?? []
  const studyRecords = [...(course?.studyRecords ?? [])].reverse()
  const courseTitle = course ? classroomCourseLabel(course) : '课程'
  const passedChapters = chapters.filter((item) => item.status === 'passed').length
  const liveTags = collectSocraticTags(course?.socraticState)
  const statCards = classroomRecordStatCards({
    studyRecordCount: studyRecords.length,
    passedChapters,
    chapterCount: chapters.length,
    qaCount: session?.messages.length ?? 0,
  })

  return {
    course,
    chapters,
    studyRecords,
    courseTitle,
    liveTags,
    statCards,
  }
}

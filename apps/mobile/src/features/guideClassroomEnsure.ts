import {
  ASSISTANT_LIB_GUIDE_COURSE_CLIENT_ID,
  ASSISTANT_LIB_GUIDE_COURSE_PRESET_ID,
  ASSISTANT_LIB_GUIDE_COURSE_TITLE,
  buildAssistantLibGuideCourseSessionFields,
  isAssistantLibGuideCourseLike,
} from '@toolman/shared'
import type { MobileClassroomCourse } from '../sync/classroomSyncMerge'

export function buildMobileGuideClassroomCourse(
  existing?: MobileClassroomCourse | null,
): MobileClassroomCourse {
  const fields = buildAssistantLibGuideCourseSessionFields(
    existing
      ? {
          enabled: true,
          presetId: existing.presetId || ASSISTANT_LIB_GUIDE_COURSE_PRESET_ID,
          learningLabel: '学习',
          teachingMode: existing.teachingMode ?? 'open',
          refereeEnabled: existing.refereeEnabled,
          customSystemPrompt: existing.customSystemPrompt,
          lessonPlan: existing.lessonPlan,
          syllabus: existing.syllabus ?? undefined,
          courseName: existing.courseName,
          isGuideClassroom: true,
          autoSpeak: existing.autoSpeak,
          ttsEngine: existing.ttsEngine,
          studyRecords: existing.studyRecords,
        }
      : null,
  )
  return {
    id: existing?.id || ASSISTANT_LIB_GUIDE_COURSE_CLIENT_ID,
    title: fields.courseName,
    updatedAt: existing?.updatedAt ?? 0,
    courseName: fields.courseName,
    presetId: fields.presetId,
    teachingMode: fields.teachingMode,
    refereeEnabled: fields.refereeEnabled,
    customSystemPrompt: fields.customSystemPrompt,
    lessonPlan: fields.lessonPlan,
    syllabus: fields.syllabus,
    studyRecords: existing?.studyRecords ?? [],
    socraticState: existing?.socraticState ?? null,
    isGuideClassroom: true,
    isDefaultClassroom: false,
    kbIds: existing?.kbIds,
    kbLabels: existing?.kbLabels,
    autoSpeak: fields.autoSpeak,
    ttsEngine: fields.ttsEngine,
    ttsVoice: existing?.ttsVoice,
    modelId: existing?.modelId,
  }
}

export function ensureMobileGuideClassroomCourses(
  courses: MobileClassroomCourse[],
  dismissed = false,
): MobileClassroomCourse[] {
  const flagged = courses.map((course) =>
    isAssistantLibGuideCourseLike(course) ? { ...course, isGuideClassroom: true } : course,
  )
  const guides = flagged.filter((course) => course.isGuideClassroom)
  const others = flagged.filter((course) => !course.isGuideClassroom)
  if (dismissed) return others
  if (guides.length === 0) return [buildMobileGuideClassroomCourse(), ...others]
  const keeper =
    guides.find((course) => course.id !== ASSISTANT_LIB_GUIDE_COURSE_CLIENT_ID) ?? guides[0]
  return [buildMobileGuideClassroomCourse(keeper), ...others]
}

import { isSyllabusChapterLocked } from '@toolman/shared'
import type { MobileClassroomCourse } from '../sync/classroomSyncMerge'

export const CLASSROOM_PRESET_LABELS: Record<string, string> = {
  'socratic-tutor': '苏格拉底导师',
  detective: '解密侦探',
  'engineering-auditor': '工程审核官',
  'blank-learner': '空白学习助手',
  'toolman-guide': 'Toolman使用说明',
}

export const CLASSROOM_PRESET_DESCS: Record<string, string> = {
  'socratic-tutor': '将经典提问式导师，通过反问链引导你自己想清楚。',
  detective: '探案式提问，把线索拼成推理。',
  'engineering-auditor': '工程/合约审核式追问。',
  'blank-learner': '开放占位，可自定义提示词与知识库。',
  'toolman-guide': '内置课程：讲解 Toolman 各模块怎么用。',
}

export type ClassroomSidebarChapter = {
  id: string
  title: string
  status?: string
  locked: boolean
}

export type ClassroomSidebarEntry = {
  id: string
  label: string
  isGuide: boolean
  isDefault: boolean
  course: MobileClassroomCourse | null
  chapters: ClassroomSidebarChapter[]
}

export function classroomCourseLabel(course: {
  isGuideClassroom?: boolean
  isDefaultClassroom?: boolean
  courseName?: string
  title?: string
}): string {
  if (course.isDefaultClassroom) return '默认课程'
  const custom = course.courseName?.trim() || course.title?.trim()
  if (course.isGuideClassroom) return custom || 'Toolman使用说明'
  return custom || '未命名课程'
}

/** Guide course first; hide the built-in default classroom row — same as desktop. */
export function orderClassroomCourses<
  T extends { id: string; isGuideClassroom?: boolean; isDefaultClassroom?: boolean },
>(courses: T[]): T[] {
  const visible = courses.filter((course) => !course.isDefaultClassroom)
  const guide = visible.find((course) => course.isGuideClassroom) ?? null
  const others = visible.filter(
    (course) => course.id !== guide?.id && !course.isGuideClassroom,
  )
  return [...(guide ? [guide] : []), ...others]
}

export function classroomChaptersForCourse(
  course: MobileClassroomCourse | null | undefined,
): ClassroomSidebarChapter[] {
  const syllabus = course?.syllabus
  if (!syllabus || syllabus.chapters.length === 0) return []
  return syllabus.chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    status: chapter.status,
    locked: isSyllabusChapterLocked(syllabus, chapter.id),
  }))
}

export function classroomSidebarEntries(
  courses: MobileClassroomCourse[],
): ClassroomSidebarEntry[] {
  return orderClassroomCourses(courses).map((course) => ({
    id: course.id,
    label: classroomCourseLabel(course),
    isGuide: course.isGuideClassroom,
    isDefault: course.isDefaultClassroom,
    course,
    chapters: classroomChaptersForCourse(course),
  }))
}

/** Settings bind to the selected course only — never fall back to the guide course. */
export function resolveClassroomSettingsCourse(
  courses: MobileClassroomCourse[],
  preferredId: string | null | undefined,
  activeId: string | null | undefined,
): MobileClassroomCourse | null {
  const id = preferredId || activeId
  if (!id) return null
  return courses.find((course) => course.id === id) ?? null
}

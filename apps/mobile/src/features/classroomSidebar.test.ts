import { describe, expect, it } from 'vitest'
import type { MobileClassroomCourse } from '../sync/classroomSyncMerge'
import {
  classroomCourseLabel,
  classroomSidebarEntries,
  orderClassroomCourses,
  resolveClassroomLearningChapterId,
  resolveClassroomSettingsCourse,
  resolveClassroomSidebarFocus,
} from './classroomSidebar'

function course(
  patch: Partial<MobileClassroomCourse> & Pick<MobileClassroomCourse, 'id'>,
): MobileClassroomCourse {
  return {
    title: patch.title ?? patch.courseName ?? patch.id,
    updatedAt: 1,
    courseName: patch.courseName ?? patch.title ?? patch.id,
    presetId: 'socratic-tutor',
    teachingMode: 'socratic',
    refereeEnabled: true,
    customSystemPrompt: '',
    lessonPlan: '',
    syllabus: null,
    studyRecords: [],
    socraticState: null,
    isGuideClassroom: false,
    isDefaultClassroom: false,
    ...patch,
  }
}

describe('classroom sidebar', () => {
  it('pins the guide course and hides the default classroom', () => {
    const ordered = orderClassroomCourses([
      course({ id: 'rust', courseName: 'Rust' }),
      course({ id: 'guide', courseName: 'Toolman使用说明', isGuideClassroom: true }),
      course({ id: 'default', courseName: '默认课程', isDefaultClassroom: true }),
    ])
    expect(ordered.map((item) => item.id)).toEqual(['guide', 'rust'])
  })

  it('labels the guide course like desktop', () => {
    expect(classroomCourseLabel({ isGuideClassroom: true })).toBe('Toolman使用说明')
    expect(classroomCourseLabel({ isDefaultClassroom: true, courseName: 'X' })).toBe('默认课程')
    expect(classroomCourseLabel({ courseName: 'Rust 入门' })).toBe('Rust 入门')
  })

  it('lists courses with syllabus chapters and ignores leftover classroom topics', () => {
    const entries = classroomSidebarEntries([
      course({
        id: 'rust',
        courseName: 'Rust 入门',
        syllabus: {
          generation: 'ready',
          generatedCount: 2,
          chapters: [
            { id: 'c1', title: '所有权', assessmentQuestions: [], status: 'passed' },
            { id: 'c2', title: '生命周期', assessmentQuestions: [], status: 'ready' },
            { id: 'c3', title: '并发', assessmentQuestions: [], status: 'pending' },
          ],
        },
      }),
    ])
    expect(entries.map((item) => item.id)).toEqual(['rust'])
    expect(entries[0]?.chapters.map((chapter) => chapter.title)).toEqual([
      '所有权',
      '生命周期',
      '并发',
    ])
    expect(entries[0]?.chapters[1]?.locked).toBe(false)
    expect(entries[0]?.chapters[2]?.locked).toBe(true)
  })

  it('defaults sidebar focus to the live course chapter', () => {
    const courses = [
      course({
        id: 'guide',
        courseName: 'Toolman使用说明',
        isGuideClassroom: true,
        syllabus: {
          generation: 'ready',
          generatedCount: 1,
          chapters: [{ id: 'g1', title: '介绍', assessmentQuestions: [], status: 'ready' }],
        },
      }),
      course({
        id: 'rust',
        courseName: 'Rust 入门',
        studyRecords: [
          {
            id: 'r1',
            startedAt: 10,
            chapterId: 'c2',
            chapterTitle: '生命周期',
            mastered: [],
            stuckPoints: [],
            qaCount: 0,
          },
        ],
        syllabus: {
          generation: 'ready',
          generatedCount: 2,
          chapters: [
            { id: 'c1', title: '所有权', assessmentQuestions: [], status: 'passed' },
            { id: 'c2', title: '生命周期', assessmentQuestions: [], status: 'in_progress' },
          ],
        },
      }),
    ]
    expect(resolveClassroomSidebarFocus(courses, 'guide')).toEqual({
      courseId: 'rust',
      chapterId: 'c2',
    })
    expect(resolveClassroomLearningChapterId(courses[1])).toBe('c2')
  })

  it('binds course settings to the selected course instead of the guide', () => {
    const courses = [
      course({ id: 'guide', courseName: 'Toolman使用说明', isGuideClassroom: true }),
      course({ id: 'rust', courseName: 'Rust 入门' }),
    ]
    expect(resolveClassroomSettingsCourse(courses, null, 'rust')?.id).toBe('rust')
    expect(resolveClassroomSettingsCourse(courses, 'rust', 'guide')?.id).toBe('rust')
    expect(resolveClassroomSettingsCourse(courses, 'missing', 'guide')).toBeNull()
    expect(resolveClassroomSettingsCourse(courses, null, 'sess-topic')).toBeNull()
  })
})

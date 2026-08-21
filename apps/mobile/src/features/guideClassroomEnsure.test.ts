import { describe, expect, it } from 'vitest'
import { ASSISTANT_LIB_GUIDE_COURSE_CLIENT_ID, ASSISTANT_LIB_GUIDE_COURSE_TITLE } from '@toolman/shared'
import type { MobileClassroomCourse } from '../sync/classroomSyncMerge'
import {
  buildMobileGuideClassroomCourse,
  ensureMobileGuideClassroomCourses,
} from './guideClassroomEnsure'

function course(patch: Partial<MobileClassroomCourse> & Pick<MobileClassroomCourse, 'id'>): MobileClassroomCourse {
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

describe('ensureMobileGuideClassroomCourses', () => {
  it('seeds the builtin usage-guide course when the list is empty', () => {
    const next = ensureMobileGuideClassroomCourses([])
    expect(next).toHaveLength(1)
    expect(next[0]?.id).toBe(ASSISTANT_LIB_GUIDE_COURSE_CLIENT_ID)
    expect(next[0]?.courseName).toBe(ASSISTANT_LIB_GUIDE_COURSE_TITLE)
    expect(next[0]?.isGuideClassroom).toBe(true)
    expect(next[0]?.syllabus?.chapters.length).toBeGreaterThanOrEqual(5)
  })

  it('does not duplicate when a desktop-synced guide already exists', () => {
    const desktop = course({
      id: '55159b48-e081-4c16-a095-2513dd487c14',
      courseName: 'Toolman使用说明',
      isGuideClassroom: true,
    })
    const next = ensureMobileGuideClassroomCourses([
      desktop,
      buildMobileGuideClassroomCourse(),
      course({ id: 'novel', courseName: '小说写作教程' }),
    ])
    expect(next.map((item) => item.id)).toEqual([desktop.id, 'novel'])
    expect(next[0]?.isGuideClassroom).toBe(true)
  })

  it('omits the guide after the user deletes it', () => {
    expect(
      ensureMobileGuideClassroomCourses(
        [course({ id: 'guide', courseName: 'Toolman使用说明', isGuideClassroom: true })],
        true,
      ),
    ).toEqual([])
  })
})

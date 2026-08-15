import { describe, expect, it } from 'vitest'
import type { MobileClassroomCourse } from '../sync/classroomSyncMerge'
import {
  classroomCourseIsLive,
  startClassroomSession,
  stopClassroomSession,
} from './classroomClassSession'

function course(patch: Partial<MobileClassroomCourse> = {}): MobileClassroomCourse {
  return {
    id: 'rust',
    title: 'Rust',
    updatedAt: 1,
    courseName: 'Rust 入门',
    presetId: 'socratic-tutor',
    teachingMode: 'socratic',
    refereeEnabled: true,
    customSystemPrompt: '',
    lessonPlan: '',
    syllabus: {
      generation: 'ready',
      generatedCount: 1,
      chapters: [{ id: 'c1', title: '所有权', assessmentQuestions: [], status: 'ready' }],
    },
    studyRecords: [],
    socraticState: null,
    isGuideClassroom: false,
    isDefaultClassroom: false,
    ...patch,
  }
}

describe('classroomClassSession', () => {
  it('starts a live class and builds the same user prompt as desktop', () => {
    const started = startClassroomSession(course())
    expect(classroomCourseIsLive({ ...course(), studyRecords: started.studyRecords })).toBe(true)
    expect(started.userMessage).toContain('开始上课')
    expect(started.userMessage).toContain('Rust 入门')
    expect(started.userMessage).toContain('所有权')
  })

  it('stops the open study record', () => {
    const started = startClassroomSession(course())
    const stopped = stopClassroomSession({ ...course(), studyRecords: started.studyRecords })
    expect(classroomCourseIsLive({ ...course(), studyRecords: stopped })).toBe(false)
    expect(stopped.at(-1)?.endedAt).toBeTypeOf('number')
  })
})

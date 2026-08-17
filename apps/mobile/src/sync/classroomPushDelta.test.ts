import { describe, expect, it } from 'vitest'
import type { MobileClassroomCourse } from './classroomSyncMerge'
import {
  applyClassroomPushStamps,
  selectDirtyClassroomChanges,
  stampClassroomCourses,
} from './classroomPushDelta'

function course(patch: Partial<MobileClassroomCourse> = {}): MobileClassroomCourse {
  return {
    id: 'c1',
    title: 'Rust',
    updatedAt: 10,
    courseName: 'Rust',
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

describe('classroom push delta', () => {
  it('pushes only courses that changed since the last stamp', () => {
    const changes = selectDirtyClassroomChanges(
      [course(), course({ id: 'c2', updatedAt: 20, title: 'Go', courseName: 'Go' })],
      { classroomStamps: { c1: 10 } },
    )
    expect(changes.map((item) => item.entityId)).toEqual(['c2'])
    expect(changes[0]?.payload).toMatchObject({ title: 'Go' })
  })

  it('emits deletes for stamped courses that disappeared', () => {
    const changes = selectDirtyClassroomChanges([], { classroomStamps: { c1: 10 } })
    expect(changes).toEqual([
      expect.objectContaining({ entityId: 'c1', op: 'delete' }),
    ])
  })

  it('includes study records so mobile start/stop can reach desktop', () => {
    const started = course({
      updatedAt: 30,
      studyRecords: [{ id: 'r1', startedAt: 20, mastered: [], stuckPoints: [], qaCount: 0 }],
    })
    const [change] = selectDirtyClassroomChanges([started], { classroomStamps: { c1: 10 } })
    expect(change?.payload).toMatchObject({
      meta: { studyRecords: [expect.objectContaining({ id: 'r1', startedAt: 20 })] },
    })
  })

  it('includes the course model id in the sync payload', () => {
    const [change] = selectDirtyClassroomChanges(
      [course({ updatedAt: 30, modelId: 'deepseek:deepseek-v4-flash' })],
      { classroomStamps: { c1: 10 } },
    )
    expect(change?.payload).toMatchObject({
      meta: { modelId: 'deepseek:deepseek-v4-flash' },
    })
  })

  it('stamps after a successful push', () => {
    const next = applyClassroomPushStamps(
      { cursor: null, noteStamps: {}, deletedStamps: {}, knowledgeSince: 0, classroomStamps: {} },
      [course()],
      selectDirtyClassroomChanges([course()], { classroomStamps: {} }),
    )
    expect(next.classroomStamps.c1).toBe(10)
    expect(selectDirtyClassroomChanges([course()], next)).toEqual([])
  })

  it('replaces stamps after a pull', () => {
    const stamped = stampClassroomCourses(
      { cursor: null, noteStamps: {}, deletedStamps: {}, knowledgeSince: 0, classroomStamps: { gone: 1 } },
      [course({ updatedAt: 40 })],
    )
    expect(stamped.classroomStamps).toEqual({ c1: 40 })
  })
})

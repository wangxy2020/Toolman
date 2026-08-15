import { describe, expect, it } from 'vitest'
import {
  appendClassroomStudyRecord,
  buildStartClassUserMessage,
  endOpenClassroomStudyRecords,
  isClassroomLive,
  resolveOngoingClassroomFocus,
  touchLatestClassroomStudyRecord,
} from './classroom-study'
import { EMPTY_SOCRATIC_STATE } from './teaching-types'

describe('appendClassroomStudyRecord', () => {
  it('closes the previous open record and appends a new one', () => {
    const first = appendClassroomStudyRecord([], {
      id: 'a',
      startedAt: 1,
      chapterTitle: '第一章',
    })
    const next = appendClassroomStudyRecord(first, {
      id: 'b',
      startedAt: 2,
      chapterTitle: '第二章',
    })
    expect(next).toHaveLength(2)
    expect(next[0]?.endedAt).toBeGreaterThanOrEqual(1)
    expect(next[1]?.chapterTitle).toBe('第二章')
    expect(next[1]?.endedAt).toBeUndefined()
  })
})

describe('isClassroomLive', () => {
  it('is live only while the latest record is open', () => {
    const open = appendClassroomStudyRecord([], { id: 'a', startedAt: 1, chapterTitle: '第一章' })
    expect(isClassroomLive(open)).toBe(true)
    expect(isClassroomLive(endOpenClassroomStudyRecords(open))).toBe(false)
  })
})

describe('resolveOngoingClassroomFocus', () => {
  it('prefers the live course and its open chapter', () => {
    const focus = resolveOngoingClassroomFocus(
      [
        {
          id: 'guide',
          syllabus: {
            generation: 'ready',
            generatedCount: 1,
            chapters: [{ id: 'g1', title: '介绍', assessmentQuestions: [], status: 'ready' }],
          },
        },
        {
          id: 'rust',
          studyRecords: [
            { id: 'r1', startedAt: 10, chapterId: 'c2', chapterTitle: '生命周期', mastered: [], stuckPoints: [], qaCount: 0 },
          ],
          syllabus: {
            generation: 'ready',
            generatedCount: 2,
            chapters: [
              { id: 'c1', title: '所有权', assessmentQuestions: [], status: 'passed' },
              { id: 'c2', title: '生命周期', assessmentQuestions: [], status: 'in_progress' },
            ],
          },
        },
      ],
      'guide',
    )
    expect(focus).toEqual({ courseId: 'rust', chapterId: 'c2' })
  })

  it('falls back to the in-progress syllabus, then fallbackId', () => {
    expect(
      resolveOngoingClassroomFocus([
        {
          id: 'guide',
          syllabus: {
            generation: 'ready',
            generatedCount: 1,
            chapters: [{ id: 'g1', title: '介绍', assessmentQuestions: [], status: 'ready' }],
          },
        },
        {
          id: 'rust',
          syllabus: {
            generation: 'ready',
            generatedCount: 1,
            chapters: [{ id: 'c1', title: '所有权', assessmentQuestions: [], status: 'in_progress' }],
          },
        },
      ])?.courseId,
    ).toBe('rust')
    expect(resolveOngoingClassroomFocus([{ id: 'a' }, { id: 'b' }], 'b')?.courseId).toBe('b')
  })
})

describe('touchLatestClassroomStudyRecord', () => {
  it('updates only the open latest record', () => {
    const records = appendClassroomStudyRecord([], {
      id: 'a',
      startedAt: 1,
      chapterTitle: '第一章',
    })
    const updated = touchLatestClassroomStudyRecord(records, {
      mastered: ['冲突'],
      qaCount: 4,
    })
    expect(updated[0]?.mastered).toEqual(['冲突'])
    expect(updated[0]?.qaCount).toBe(4)
  })
})

describe('buildStartClassUserMessage', () => {
  it('asks the model to start from the first chapter when there are no records', () => {
    const text = buildStartClassUserMessage({
      courseName: '小说课',
      state: EMPTY_SOCRATIC_STATE,
    })
    expect(text).toContain('开始上课')
    expect(text).toContain('小说课')
    expect(text).toContain('本课尚无课堂记录')
  })
})

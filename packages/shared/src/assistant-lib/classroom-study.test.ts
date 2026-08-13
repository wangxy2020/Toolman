import { describe, expect, it } from 'vitest'
import {
  appendClassroomStudyRecord,
  buildStartClassUserMessage,
  endOpenClassroomStudyRecords,
  isClassroomLive,
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

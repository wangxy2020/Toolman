import { describe, expect, it } from 'vitest'
import {
  chapterStatusLabel,
  collectSocraticTags,
  formatClassroomRecordDuration,
  studyRecordTags,
} from './classroomRecordsUtils'

describe('classroomRecordsUtils', () => {
  it('formats durations and chapter labels', () => {
    expect(formatClassroomRecordDuration(0, 30_000)).toBe('1 分钟')
    expect(formatClassroomRecordDuration(0, 3_600_000)).toBe('1 小时')
    expect(formatClassroomRecordDuration(0, 3_900_000)).toBe('1 小时 5 分钟')
    expect(chapterStatusLabel('passed')).toBe('已通过')
    expect(chapterStatusLabel('in_progress')).toBe('学习中')
  })

  it('collects socratic tags and prefers record tags', () => {
    const live = collectSocraticTags({
      mastered: ['a'],
      confirmedClaims: ['b'],
      openAssumptions: [],
      misconceptions: [],
      stuckPoints: ['c'],
      pathNodes: [],
    })
    expect(live.map((item) => item.key)).toEqual(['m:a', 'c:b', 's:c'])
    expect(
      studyRecordTags(
        {
          id: '1',
          startedAt: 1,
          qaCount: 1,
          mastered: ['x'],
          stuckPoints: [],
        } as never,
        live,
      ).map((item) => item.key),
    ).toEqual(['m:x'])
  })
})

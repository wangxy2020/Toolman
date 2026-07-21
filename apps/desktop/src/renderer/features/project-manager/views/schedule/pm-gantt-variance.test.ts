import { describe, expect, it } from 'vitest'

import type { PmWorkItem } from '@toolman/shared'

import {
  ACTUAL_FINISH_META_KEY,
  ACTUAL_START_META_KEY,
  SHOULD_PERCENT_META_KEY,
} from './pm-gantt-prefs'
import {
  computeScheduleVarianceDays,
  formatScheduleVarianceDays,
} from './pm-gantt-utils'

function item(partial: Partial<PmWorkItem> & Pick<PmWorkItem, 'id'>): PmWorkItem {
  return {
    workspaceId: 'ws',
    projectId: 'p',
    parentId: null,
    type: 'task',
    title: partial.id,
    status: 'todo',
    priority: 'medium',
    sortOrder: 0,
    startDate: Date.parse('2026-08-01'),
    dueDate: Date.parse('2026-08-20'),
    percentComplete: 0,
    progressPercent: 0,
    assignee: null,
    metadata: {},
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  } as PmWorkItem
}

describe('computeScheduleVarianceDays', () => {
  it('uses finish dates when actual start and finish exist', () => {
    const result = computeScheduleVarianceDays(
      item({
        id: 'a',
        metadata: {
          [ACTUAL_START_META_KEY]: Date.parse('2026-08-01'),
          [ACTUAL_FINISH_META_KEY]: Date.parse('2026-08-15'),
        },
      }),
    )
    // Planned finish Aug 20, actual Aug 15 → ahead 5 days
    expect(result?.source).toBe('finish')
    expect(result?.days).toBe(5)
  })

  it('converts percent gap to days after baseline should%', () => {
    // Duration Aug1–Aug20 inclusive = 20 days; actual 50%, should 30% → +4 days
    const result = computeScheduleVarianceDays(
      item({
        id: 'b',
        progressPercent: 50,
        metadata: { [SHOULD_PERCENT_META_KEY]: 30 },
      }),
    )
    expect(result?.source).toBe('progress')
    expect(result?.days).toBe(4)
  })

  it('returns null without baseline should% or actual finish pair', () => {
    expect(
      computeScheduleVarianceDays(item({ id: 'c', progressPercent: 40 })),
    ).toBeNull()
  })
})

describe('formatScheduleVarianceDays', () => {
  it('formats signed day labels', () => {
    expect(formatScheduleVarianceDays(0, '天')).toBe('0天')
    expect(formatScheduleVarianceDays(3, '天')).toBe('+3天')
    expect(formatScheduleVarianceDays(-2, '天')).toBe('-2天')
  })
})

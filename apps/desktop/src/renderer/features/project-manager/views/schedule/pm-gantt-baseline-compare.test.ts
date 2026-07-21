import { describe, expect, it } from 'vitest'

import {
  computeProgressLineStubs,
  nextUserBaselineName,
  plannedProgressAtDate,
  suggestBaselineAsOfDate,
} from './pm-gantt-baseline-compare'
import { GANTT_ROW_HEIGHT } from './pm-gantt-utils'
import type { PmWorkItem } from '@toolman/shared'

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
    startDate: Date.parse('2026-01-01'),
    dueDate: Date.parse('2026-01-20'),
    percentComplete: 0,
    progressPercent: 0,
    assignee: null,
    metadata: {},
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  } as PmWorkItem
}

describe('plannedProgressAtDate', () => {
  it('returns 0 before start and 100 after finish', () => {
    const start = Date.parse('2026-01-01')
    const finish = Date.parse('2026-01-10')
    expect(plannedProgressAtDate(start, finish, Date.parse('2025-12-31'))).toBe(0)
    expect(plannedProgressAtDate(start, finish, Date.parse('2026-01-10'))).toBe(100)
  })
})

describe('nextUserBaselineName', () => {
  it('starts at 基线1 with as-of date and skips used numbers', () => {
    expect(nextUserBaselineName([], '2026-09-15')).toBe('基线1 (2026-09-15)')
    expect(
      nextUserBaselineName([{ name: '基线1 (2026-08-01)' }, { name: '基线3' }], '2026-09-15'),
    ).toBe('基线2 (2026-09-15)')
    expect(
      nextUserBaselineName([{ name: '基线1' }, { name: '基线2 (2026-07-01)' }], '2026-09-15'),
    ).toBe('基线3 (2026-09-15)')
  })
})

describe('suggestBaselineAsOfDate', () => {
  it('uses today when inside the plan window', () => {
    const items = [
      { startDate: Date.parse('2026-08-01'), dueDate: Date.parse('2026-12-01') },
    ]
    const today = Date.parse('2026-09-15')
    expect(suggestBaselineAsOfDate(items, today)).toBe(
      new Date(2026, 8, 15).getTime(),
    )
  })

  it('suggests inside the schedule when today is before start', () => {
    const items = [
      { startDate: Date.parse('2026-08-01'), dueDate: Date.parse('2026-10-30') },
    ]
    const today = Date.parse('2026-07-21')
    const suggested = suggestBaselineAsOfDate(items, today)
    expect(suggested).toBeGreaterThan(Date.parse('2026-08-01'))
    expect(suggested).toBeLessThan(Date.parse('2026-10-30'))
  })
})

describe('computeProgressLineStubs', () => {
  it('builds horizontal stubs from status date with variance', () => {
    const rows = [
      { item: item({ id: 'a', progressPercent: 50 }), hasChildren: false },
      { item: item({ id: 'summary' }), hasChildren: true },
      {
        item: item({
          id: 'b',
          startDate: Date.parse('2026-01-11'),
          dueDate: Date.parse('2026-01-20'),
          progressPercent: 0,
        }),
        hasChildren: false,
      },
    ]
    const rangeStart = Date.parse('2026-01-01')
    const rangeEnd = Date.parse('2026-01-31')
    const statusDateMs = Date.parse('2026-01-10')
    const { stubs, statusLeftPercent } = computeProgressLineStubs({
      rows,
      baselineByItemId: new Map([
        ['a', { startDate: Date.parse('2026-01-01'), dueDate: Date.parse('2026-01-20') }],
        ['b', { startDate: Date.parse('2026-01-11'), dueDate: Date.parse('2026-01-20') }],
      ]),
      statusDateMs,
      rangeStart,
      rangeEnd,
    })
    expect(stubs).toHaveLength(2)
    expect(stubs[0]?.y).toBe(GANTT_ROW_HEIGHT / 2)
    expect(stubs[1]?.y).toBe(2 * GANTT_ROW_HEIGHT + GANTT_ROW_HEIGHT / 2)
    expect(statusLeftPercent).toBeGreaterThan(0)
    expect(statusLeftPercent).toBeLessThan(100)
    // Task a: ~47% planned by Jan 10 on Jan1–20; actual 50 → slightly ahead
    expect(stubs[0]!.variancePct).toBeGreaterThan(0)
    expect(stubs[0]!.tipLeftPercent).toBeGreaterThan(statusLeftPercent - 1)
    // Task b not started (tip at start Jan 11); status Jan 10 → tip right of status, variance 0
    expect(stubs[1]!.variancePct).toBe(0)
    expect(stubs[1]!.tipLeftPercent).toBeGreaterThan(statusLeftPercent)
  })
})

import { describe, expect, it } from 'vitest'

import type { PmWorkItem } from '@toolman/shared'

import {
  buildProgressPercentById,
  collectProgressRollupUpdates,
} from './pm-gantt-progress-rollup'

function item(
  partial: Partial<PmWorkItem> & Pick<PmWorkItem, 'id' | 'title'>,
): PmWorkItem {
  return {
    workspaceId: 'ws',
    projectId: 'p',
    parentId: null,
    type: 'task',
    status: 'todo',
    priority: 'medium',
    sortOrder: 0,
    startDate: Date.parse('2026-08-01'),
    dueDate: Date.parse('2026-08-10'),
    percentComplete: 0,
    progressPercent: 0,
    assignee: null,
    metadata: {},
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  } as PmWorkItem
}

describe('buildProgressPercentById', () => {
  it('rolls up duration-weighted progress to parents', () => {
    const items = [
      item({ id: 'sum', title: 'summary', dueDate: Date.parse('2026-08-20') }),
      item({
        id: 'a',
        title: 'a',
        parentId: 'sum',
        progressPercent: 100,
        startDate: Date.parse('2026-08-01'),
        dueDate: Date.parse('2026-08-10'), // 10 days
      }),
      item({
        id: 'b',
        title: 'b',
        parentId: 'sum',
        progressPercent: 0,
        startDate: Date.parse('2026-08-11'),
        dueDate: Date.parse('2026-08-20'), // 10 days
      }),
    ]
    const byId = buildProgressPercentById(items)
    expect(byId.get('a')).toBe(100)
    expect(byId.get('b')).toBe(0)
    expect(byId.get('sum')).toBe(50)
  })
})

describe('collectProgressRollupUpdates', () => {
  it('only emits parent rows that need a write', () => {
    const items = [
      item({ id: 'sum', title: 'summary', progressPercent: 0 }),
      item({ id: 'a', title: 'a', parentId: 'sum', progressPercent: 50 }),
      item({ id: 'b', title: 'b', parentId: 'sum', progressPercent: 50 }),
    ]
    const updates = collectProgressRollupUpdates(items)
    expect(updates).toEqual([{ id: 'sum', progressPercent: 50 }])
  })
})

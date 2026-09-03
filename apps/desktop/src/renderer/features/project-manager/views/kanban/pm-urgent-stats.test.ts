import { describe, expect, it } from 'vitest'
import type { PmProject, PmWorkItem } from '@toolman/shared'
import {
  buildUrgentTodoStats,
  importantWorkItemScore,
  isOverduePmWorkItem,
  pickImportantWorkItems,
  toUrgentItemCard,
} from './pm-urgent-stats'

const now = Date.parse('2026-08-24T00:00:00.000Z')

function item(patch: Partial<PmWorkItem> & Pick<PmWorkItem, 'id' | 'title'>): PmWorkItem {
  return {
    projectId: '11111111-1111-4111-8111-111111111111',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    type: 'task',
    status: 'todo',
    priority: 'normal',
    domain: 'urgent_tasks',
    progressPercent: 40,
    sortOrder: 0,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...patch,
  }
}

const project: PmProject = {
  id: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  code: 'EPC-2401',
  name: '滨海 LNG',
  status: 'active',
  domain: 'progress_management',
  metadata: {},
  createdAt: now,
  updatedAt: now,
}

describe('pm urgent stats', () => {
  it('counts open, overdue, blocked, and health', () => {
    const items = [
      item({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        title: 'open',
        status: 'in_progress',
        progressPercent: 50,
      }),
      item({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
        title: 'overdue',
        status: 'todo',
        priority: 'high',
        dueDate: now - 86_400_000,
      }),
      item({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
        title: 'blocked',
        status: 'blocked',
        priority: 'urgent',
      }),
      item({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
        title: 'done',
        status: 'done',
        progressPercent: 100,
      }),
    ]
    const stats = buildUrgentTodoStats(items, [project], now)
    expect(stats).toMatchObject({
      openCount: 3,
      urgentCount: 2,
      overdueCount: 1,
      blockedCount: 1,
      inProgressCount: 1,
      projectCount: 1,
      healthPercent: 33,
    })
    expect(isOverduePmWorkItem(items[1]!, now)).toBe(true)
  })

  it('picks the six most important open items', () => {
    const items = Array.from({ length: 8 }, (_, index) =>
      item({
        id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa${index + 10}`,
        title: `item-${index}`,
        priority: index === 0 ? 'urgent' : 'normal',
        dueDate: index === 1 ? now - 1 : now + index * 86_400_000,
        progressPercent: 10 * index,
      }),
    )
    const picked = pickImportantWorkItems(items, 6, now)
    expect(picked).toHaveLength(6)
    expect(picked[0]?.title).toBe('item-1')
    expect(importantWorkItemScore(picked[0]!, now)).toBeGreaterThan(
      importantWorkItemScore(picked[5]!, now),
    )
    expect(toUrgentItemCard(picked[0]!, [project], now)).toMatchObject({
      projectName: '滨海 LNG',
      overdue: true,
    })
  })
})

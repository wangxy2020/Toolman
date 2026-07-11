import { describe, expect, it } from 'vitest'

import {
  buildPmWorkItemForest,
  flattenPmWorkItemForest,
  wouldCreatePmWorkItemCycle,
} from './pm-work-item-tree.js'
import type { PmWorkItem } from './pm-types.js'

function item(partial: Partial<PmWorkItem> & Pick<PmWorkItem, 'id' | 'title'>): PmWorkItem {
  return {
    projectId: '550e8400-e29b-41d4-a716-446655440001',
    workspaceId: '00000000-0000-0000-0000-000000000002',
    type: 'task',
    status: 'todo',
    priority: 'normal',
    domain: 'progress_management',
    progressPercent: 0,
    sortOrder: 0,
    metadata: {},
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  }
}

describe('pm work item tree', () => {
  it('builds a forest and flattens with depth', () => {
    const items = [
      item({ id: 'a', title: 'Root', sortOrder: 0 }),
      item({ id: 'b', title: 'Child', parentId: 'a', sortOrder: 1 }),
    ]
    const rows = flattenPmWorkItemForest(buildPmWorkItemForest(items))
    expect(rows).toHaveLength(2)
    expect(rows[1]?.depth).toBe(1)
  })

  it('detects parent cycles', () => {
    const items = [
      item({ id: 'a', title: 'A', parentId: 'b' }),
      item({ id: 'b', title: 'B', parentId: 'a' }),
    ]
    expect(wouldCreatePmWorkItemCycle(items, 'a', 'b')).toBe(true)
  })
})

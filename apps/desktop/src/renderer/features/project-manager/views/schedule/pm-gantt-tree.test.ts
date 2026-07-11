import { describe, expect, it } from 'vitest'

import type { PmWorkItem, PmWorkItemTreeNode } from '@toolman/shared'

import {
  buildStableRowNumberById,
  findDemoteParentId,
  flattenPmWorkItemForestCollapsed,
  resolveGanttTaskKind,
} from './pm-gantt-tree'

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

function node(itemValue: PmWorkItem, children: PmWorkItemTreeNode[] = []): PmWorkItemTreeNode {
  return { item: itemValue, children }
}

describe('stable gantt row numbers', () => {
  it('keeps 序号 after collapse', () => {
    const forest = [
      node(item({ id: 'p', title: 'Parent' }), [
        node(item({ id: 'c1', title: 'Child 1' })),
        node(item({ id: 'c2', title: 'Child 2' })),
      ]),
      node(item({ id: 's', title: 'Sibling' })),
    ]
    const rowNumberById = buildStableRowNumberById(forest)
    expect(rowNumberById.get('p')).toBe(1)
    expect(rowNumberById.get('c1')).toBe(2)
    expect(rowNumberById.get('c2')).toBe(3)
    expect(rowNumberById.get('s')).toBe(4)

    const collapsed = flattenPmWorkItemForestCollapsed(forest, new Set(['p']), rowNumberById)
    expect(collapsed.map((row) => [row.item.id, row.rowNumber])).toEqual([
      ['p', 1],
      ['s', 4],
    ])
  })

  it('skips display-only project root when numbering', () => {
    const forest = [
      node(item({ id: '__pm_gantt_project_root__', title: 'Project' }), [
        node(item({ id: 'a', title: 'A' })),
        node(item({ id: 'b', title: 'B' }), [node(item({ id: 'c', title: 'C' }))]),
      ]),
    ]
    const rowNumberById = buildStableRowNumberById(forest, {
      skipIds: new Set(['__pm_gantt_project_root__']),
    })
    expect(rowNumberById.get('__pm_gantt_project_root__')).toBe(0)
    expect(rowNumberById.get('a')).toBe(1)
    expect(rowNumberById.get('b')).toBe(2)
    expect(rowNumberById.get('c')).toBe(3)
  })
})

describe('findDemoteParentId', () => {
  it('demotes under same-level previous sibling, not deeper previous row', () => {
    const rows = [
      { item: { id: 'a', parentId: null }, depth: 0 },
      { item: { id: 'b', parentId: 'a' }, depth: 1 },
      { item: { id: 'c', parentId: null }, depth: 0 },
    ]
    expect(findDemoteParentId(rows, 2)).toBe('a')
  })

  it('demotes a same-level sibling under the previous sibling', () => {
    const rows = [
      { item: { id: 'a', parentId: null }, depth: 0 },
      { item: { id: 'b', parentId: 'a' }, depth: 1 },
      { item: { id: 'c', parentId: 'a' }, depth: 1 },
    ]
    expect(findDemoteParentId(rows, 2)).toBe('b')
  })

  it('blocks demote beyond 5 levels', () => {
    const rows = [
      { item: { id: 'a', parentId: null }, depth: 0 },
      { item: { id: 'b', parentId: 'a' }, depth: 1 },
      { item: { id: 'c', parentId: 'b' }, depth: 2 },
      { item: { id: 'd', parentId: 'c' }, depth: 3 },
      { item: { id: 'e', parentId: 'd' }, depth: 4 },
      { item: { id: 'f', parentId: 'd' }, depth: 4 },
    ]
    expect(findDemoteParentId(rows, 5)).toBeNull()
  })
})

describe('resolveGanttTaskKind', () => {
  it('classifies summary / milestone / task / critical', () => {
    expect(resolveGanttTaskKind({ type: 'task' }, true)).toBe('summary')
    expect(resolveGanttTaskKind({ type: 'milestone' }, false)).toBe('milestone')
    expect(resolveGanttTaskKind({ type: 'task' }, false)).toBe('task')
    expect(resolveGanttTaskKind({ type: 'task' }, false, true)).toBe('critical')
    // Critical path overrides milestone so CP milestones show as 关键任务
    expect(resolveGanttTaskKind({ type: 'milestone' }, false, true)).toBe('critical')
  })
})

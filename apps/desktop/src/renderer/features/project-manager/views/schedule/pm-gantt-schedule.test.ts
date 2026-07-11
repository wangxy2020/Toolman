import { describe, expect, it } from 'vitest'

import type { PmWorkItem, PmWorkItemRelation } from '@toolman/shared'

import {
  collectScheduleUpdates,
  computeCriticalTaskIds,
  constrainStartByRelation,
  scheduleWorkItems,
  startOfLocalDay,
} from './pm-gantt-schedule'
import { buildScheduleTimeline, pickGanttScale } from './pm-gantt-utils'

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

describe('constrainStartByRelation', () => {
  it('schedules FS lag 0 to the next day after finish', () => {
    const predFinish = startOfLocalDay(Date.parse('2026-01-10'))
    const predStart = startOfLocalDay(Date.parse('2026-01-01'))
    const next = constrainStartByRelation('FS', 0, predStart, predFinish, 5)
    expect(next.startMs).toBe(startOfLocalDay(Date.parse('2026-01-11')))
  })

  it('applies positive lag on FS', () => {
    const predFinish = startOfLocalDay(Date.parse('2026-01-10'))
    const predStart = startOfLocalDay(Date.parse('2026-01-01'))
    const next = constrainStartByRelation('FS', 2, predStart, predFinish, 5)
    expect(next.startMs).toBe(startOfLocalDay(Date.parse('2026-01-13')))
  })
})

describe('scheduleWorkItems', () => {
  it('moves successor after predecessor for FS', () => {
    const items = [
      item({
        id: 'a',
        title: 'A',
        startDate: Date.parse('2026-01-01'),
        dueDate: Date.parse('2026-01-10'),
      }),
      item({
        id: 'b',
        title: 'B',
        startDate: Date.parse('2026-01-01'),
        dueDate: Date.parse('2026-01-05'),
      }),
    ]
    const relations: PmWorkItemRelation[] = [
      {
        id: 'r1',
        projectId: items[0]!.projectId,
        workspaceId: items[0]!.workspaceId,
        fromWorkItemId: 'a',
        toWorkItemId: 'b',
        type: 'FS',
        lagDays: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ]
    const scheduled = scheduleWorkItems(items, relations)
    expect(scheduled.get('b')?.startMs).toBe(startOfLocalDay(Date.parse('2026-01-11')))
    expect(scheduled.get('b')?.autoScheduled).toBe(true)
  })

  it('rolls parent dates to children envelope', () => {
    const items = [
      item({ id: 'p', title: 'Parent', startDate: Date.parse('2026-01-01'), dueDate: Date.parse('2026-01-02') }),
      item({
        id: 'c1',
        title: 'Child1',
        parentId: 'p',
        startDate: Date.parse('2026-02-01'),
        dueDate: Date.parse('2026-02-10'),
      }),
      item({
        id: 'c2',
        title: 'Child2',
        parentId: 'p',
        startDate: Date.parse('2026-02-05'),
        dueDate: Date.parse('2026-02-20'),
      }),
    ]
    const scheduled = scheduleWorkItems(items, [])
    expect(scheduled.get('p')?.startMs).toBe(startOfLocalDay(Date.parse('2026-02-01')))
    expect(scheduled.get('p')?.finishMs).toBe(startOfLocalDay(Date.parse('2026-02-20')))
  })

  it('does not keep shifting dates after indent under FS predecessor', () => {
    // 降级: B becomes child of A while A→B FS remains (common after demote).
    const relations: PmWorkItemRelation[] = [
      {
        id: 'r1',
        projectId: '550e8400-e29b-41d4-a716-446655440001',
        workspaceId: '00000000-0000-0000-0000-000000000002',
        fromWorkItemId: 'a',
        toWorkItemId: 'b',
        type: 'FS',
        lagDays: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ]
    let items = [
      item({
        id: 'a',
        title: 'A',
        startDate: Date.parse('2026-01-01'),
        dueDate: Date.parse('2026-01-10'),
      }),
      item({
        id: 'b',
        title: 'B',
        parentId: 'a',
        startDate: Date.parse('2026-01-11'),
        dueDate: Date.parse('2026-01-15'),
      }),
    ]

    const pass1 = scheduleWorkItems(items, relations)
    const updates1 = collectScheduleUpdates(items, pass1)
    items = items.map((entry) => {
      const update = updates1.find((row) => row.id === entry.id)
      if (!update) return entry
      return { ...entry, startDate: update.startDate, dueDate: update.dueDate }
    })

    const pass2 = scheduleWorkItems(items, relations)
    expect(collectScheduleUpdates(items, pass2)).toEqual([])
    expect(pass2.get('b')?.startMs).toBe(startOfLocalDay(Date.parse('2026-01-11')))
    expect(pass2.get('a')?.startMs).toBe(startOfLocalDay(Date.parse('2026-01-11')))
    expect(pass2.get('a')?.finishMs).toBe(startOfLocalDay(Date.parse('2026-01-15')))
  })

  it('collects updates only when dates change', () => {
    const items = [
      item({
        id: 'a',
        title: 'A',
        startDate: Date.parse('2026-01-01'),
        dueDate: Date.parse('2026-01-10'),
      }),
      item({
        id: 'b',
        title: 'B',
        startDate: Date.parse('2026-01-01'),
        dueDate: Date.parse('2026-01-05'),
      }),
    ]
    const relations: PmWorkItemRelation[] = [
      {
        id: 'r1',
        projectId: items[0]!.projectId,
        workspaceId: items[0]!.workspaceId,
        fromWorkItemId: 'a',
        toWorkItemId: 'b',
        type: 'FS',
        lagDays: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ]
    const scheduled = scheduleWorkItems(items, relations)
    const updates = collectScheduleUpdates(items, scheduled)
    expect(updates.some((entry) => entry.id === 'b')).toBe(true)
  })
})

describe('adaptive timeline scale', () => {
  it('always uses day columns', () => {
    expect(pickGanttScale(10)).toBe('day')
    expect(pickGanttScale(40)).toBe('day')
    expect(pickGanttScale(200)).toBe('day')
  })

  it('builds bars from start/due dates with year/month/day headers', () => {
    const start = Date.parse('2026-01-01')
    const end = Date.parse('2026-01-11')
    const timeline = buildScheduleTimeline([
      item({ id: 'a', title: 'Task A', startDate: start, dueDate: end }),
    ])
    expect(timeline.bars).toHaveLength(1)
    expect(timeline.headers.length).toBeGreaterThan(0)
    expect(timeline.scale).toBe('day')
    expect(timeline.yearBands[0]?.label).toMatch(/^\d{4}$/)
    expect(timeline.monthBands[0]?.label).toBeTruthy()
    expect(timeline.headers[0]?.labelBottom).toMatch(/^\d+$/)
    expect(timeline.bars[0]?.leftPercent).toBeGreaterThanOrEqual(0)
    expect(timeline.bars[0]?.widthPercent).toBeGreaterThan(0)
  })
})

describe('computeCriticalTaskIds', () => {
  it('marks the longest FS chain as critical', () => {
    const items = [
      item({
        id: 'a',
        title: 'A',
        startDate: Date.parse('2026-01-01'),
        dueDate: Date.parse('2026-01-10'),
      }),
      item({
        id: 'b',
        title: 'B',
        startDate: Date.parse('2026-01-01'),
        dueDate: Date.parse('2026-01-05'),
      }),
      item({
        id: 'c',
        title: 'C',
        startDate: Date.parse('2026-01-01'),
        dueDate: Date.parse('2026-01-03'),
      }),
    ]
    const relations: PmWorkItemRelation[] = [
      {
        id: 'r1',
        projectId: items[0]!.projectId,
        workspaceId: items[0]!.workspaceId,
        fromWorkItemId: 'a',
        toWorkItemId: 'b',
        type: 'FS',
        lagDays: 0,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'r2',
        projectId: items[0]!.projectId,
        workspaceId: items[0]!.workspaceId,
        fromWorkItemId: 'b',
        toWorkItemId: 'c',
        type: 'FS',
        lagDays: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ]
    const scheduled = scheduleWorkItems(items, relations)
    const critical = computeCriticalTaskIds(items, relations, scheduled)
    expect(critical.has('a')).toBe(true)
    expect(critical.has('b')).toBe(true)
    expect(critical.has('c')).toBe(true)
  })

  it('includes milestones and driving parents on the critical path', () => {
    const items = [
      item({
        id: 'wbs',
        title: 'WBS',
        type: 'wbs_node',
        startDate: Date.parse('2026-07-01'),
        dueDate: Date.parse('2026-07-02'),
      }),
      item({
        id: 't2',
        parentId: 'wbs',
        title: 'Phase',
        startDate: Date.parse('2026-07-01'),
        dueDate: Date.parse('2026-07-08'),
      }),
      item({
        id: 't3',
        parentId: 'wbs',
        title: 'Review',
        startDate: Date.parse('2026-07-09'),
        dueDate: Date.parse('2026-07-09'),
      }),
      item({
        id: 't4',
        parentId: 'wbs',
        title: 'Analysis',
        startDate: Date.parse('2026-07-10'),
        dueDate: Date.parse('2026-07-16'),
      }),
      item({
        id: 't5',
        parentId: 'wbs',
        type: 'milestone',
        title: 'Acceptance',
        startDate: Date.parse('2026-07-17'),
        dueDate: Date.parse('2026-07-17'),
      }),
      item({
        id: 't6',
        parentId: 'wbs',
        title: 'New1',
        startDate: Date.parse('2026-07-18'),
        dueDate: Date.parse('2026-07-25'),
      }),
      item({
        id: 'orphan',
        parentId: 'wbs',
        title: 'Orphan',
        startDate: Date.parse('2026-07-10'),
        dueDate: Date.parse('2026-07-17'),
      }),
    ]
    const relations: PmWorkItemRelation[] = [
      {
        id: 'r0',
        projectId: items[0]!.projectId,
        workspaceId: items[0]!.workspaceId,
        fromWorkItemId: 't2',
        toWorkItemId: 't3',
        type: 'FS',
        lagDays: 0,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'r1',
        projectId: items[0]!.projectId,
        workspaceId: items[0]!.workspaceId,
        fromWorkItemId: 't3',
        toWorkItemId: 't4',
        type: 'FS',
        lagDays: 0,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'r2',
        projectId: items[0]!.projectId,
        workspaceId: items[0]!.workspaceId,
        fromWorkItemId: 't4',
        toWorkItemId: 't5',
        type: 'FS',
        lagDays: 0,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'r3',
        projectId: items[0]!.projectId,
        workspaceId: items[0]!.workspaceId,
        fromWorkItemId: 't5',
        toWorkItemId: 't6',
        type: 'FS',
        lagDays: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ]
    const scheduled = scheduleWorkItems(items, relations)
    const critical = computeCriticalTaskIds(items, relations, scheduled)
    expect(critical.has('t2')).toBe(true)
    expect(critical.has('t3')).toBe(true)
    expect(critical.has('t4')).toBe(true)
    expect(critical.has('t5')).toBe(true)
    expect(critical.has('t6')).toBe(true)
    expect(critical.has('wbs')).toBe(true)
    expect(critical.has('orphan')).toBe(false)
  })

  it('marks summary ancestors even when only a descendant is critical', () => {
    const items = [
      item({
        id: 'wbs',
        title: 'WBS',
        type: 'wbs_node',
        startDate: Date.parse('2026-07-01'),
        dueDate: Date.parse('2026-07-02'),
      }),
      item({
        id: 'early',
        parentId: 'wbs',
        title: 'Early',
        startDate: Date.parse('2026-07-01'),
        dueDate: Date.parse('2026-07-05'),
      }),
      item({
        id: 'late',
        parentId: 'wbs',
        title: 'Late',
        startDate: Date.parse('2026-07-10'),
        dueDate: Date.parse('2026-07-20'),
      }),
    ]
    const scheduled = scheduleWorkItems(items, [])
    const critical = computeCriticalTaskIds(items, [], scheduled)
    expect(critical.has('late')).toBe(true)
    expect(critical.has('wbs')).toBe(true)
    expect(critical.has('early')).toBe(false)
  })

  it('marks critical work in each dependency component when phases are disconnected', () => {
    // Early chain 1→2 ends before a dangling mid-start chain 3→4 that finishes the project.
    const items = [
      item({
        id: 'a',
        title: 'Structure A',
        startDate: Date.parse('2026-08-01'),
        dueDate: Date.parse('2026-08-20'),
      }),
      item({
        id: 'b',
        title: 'Structure B',
        startDate: Date.parse('2026-08-21'),
        dueDate: Date.parse('2026-09-10'),
      }),
      item({
        id: 'c',
        title: 'Finishing C',
        startDate: Date.parse('2026-09-11'),
        dueDate: Date.parse('2026-10-10'),
      }),
      item({
        id: 'd',
        title: 'Handover D',
        startDate: Date.parse('2026-10-11'),
        dueDate: Date.parse('2026-10-31'),
      }),
    ]
    const rel = (
      id: string,
      fromWorkItemId: string,
      toWorkItemId: string,
    ): PmWorkItemRelation => ({
      id,
      projectId: items[0]!.projectId,
      workspaceId: items[0]!.workspaceId,
      fromWorkItemId,
      toWorkItemId,
      type: 'FS',
      lagDays: 0,
      createdAt: 1,
      updatedAt: 1,
    })
    // Missing B→C link (agent omission): two components.
    const relations = [rel('r1', 'a', 'b'), rel('r2', 'c', 'd')]
    const scheduled = scheduleWorkItems(items, relations)
    const critical = computeCriticalTaskIds(items, relations, scheduled)

    // Late component still drives project finish.
    expect(critical.has('c')).toBe(true)
    expect(critical.has('d')).toBe(true)
    // Early component must remain critical against its own finish (not washed out by global end).
    expect(critical.has('a')).toBe(true)
    expect(critical.has('b')).toBe(true)
  })
})

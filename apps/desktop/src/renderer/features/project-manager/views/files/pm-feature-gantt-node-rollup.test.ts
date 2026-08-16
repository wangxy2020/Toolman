import { describe, expect, it } from 'vitest'

import type { PmWorkItem } from '@toolman/shared'

import {
  buildLiveNodeFeatureRows,
  collectGanttNodeSeeds,
  computeFeatureNodeRollups,
  plannedPercentAlongSchedule,
} from './pm-feature-gantt-rollup'
import { makeItem } from './pm-feature-gantt-rollup-test-utils'

describe('pm-feature-gantt-rollup node', () => {
  it('builds node rows from Gantt milestones with a project name row first', () => {
    const day = new Date(2026, 5, 15).getTime()
    const later = new Date(2026, 6, 1).getTime()
    const items: PmWorkItem[] = [
      { ...makeItem('t1', later, later, []), type: 'milestone', title: '基础完工', sortOrder: 2 },
      { ...makeItem('t2', day, day, []), type: 'task', title: '普通任务', sortOrder: 0 },
      { ...makeItem('t3', day, day, []), type: 'milestone', title: '开工', sortOrder: 1 },
    ]
    const seeds = collectGanttNodeSeeds(items)
    expect(seeds.map((seed) => seed.name)).toEqual(['开工', '基础完工'])

    const live = buildLiveNodeFeatureRows(seeds, { name: '示范工程', code: 'P-01' })
    expect(live.map((row) => ({ id: row.id, name: row.name, type: row.type, parentId: row.parentId }))).toEqual([
      { id: 'gantt-node:__project__', name: 'P-01 · 示范工程', type: 'node', parentId: null },
      { id: 'gantt-node:t3', name: '开工', type: 'node', parentId: 'gantt-node:__project__' },
      { id: 'gantt-node:t1', name: '基础完工', type: 'node', parentId: 'gantt-node:__project__' },
    ])

    const rollups = computeFeatureNodeRollups(seeds, live, items)
    expect(rollups.get('gantt-node:t3')).toMatchObject({
      durationDays: 0,
      finishDate: day,
      plannedPercent: 0,
    })
    expect(rollups.get('gantt-node:t1')?.plannedPercent).toBe(100)
    expect(rollups.get('gantt-node:__project__')?.finishDate).toBe(later)
    expect(rollups.get('gantt-node:__project__')?.durationDays).toBeGreaterThan(0)
    expect(rollups.get('gantt-node:__project__')?.plannedPercent).toBe(100)
  })

  it('uses full Gantt schedule envelope for project-row duration, not milestones only', () => {
    const early = new Date(2026, 2, 1).getTime()
    const mid = new Date(2026, 2, 15).getTime()
    const late = new Date(2026, 2, 31).getTime()
    const items: PmWorkItem[] = [
      { ...makeItem('m1', mid, mid, []), type: 'milestone', title: '节点A', sortOrder: 1 },
      { ...makeItem('t1', early, late, []), type: 'task', title: '长周期任务', sortOrder: 0 },
    ]
    const seeds = collectGanttNodeSeeds(items)
    const live = buildLiveNodeFeatureRows(seeds, { name: '示范工程', code: 'P-01' })
    const rollups = computeFeatureNodeRollups(seeds, live, items)
    const project = rollups.get('gantt-node:__project__')
    expect(project?.startDate).toBe(early)
    expect(project?.finishDate).toBe(late)
    // Inclusive calendar days: Mar 1 → Mar 31 = 31 days (same as Gantt root).
    expect(project?.durationDays).toBe(31)
  })

  it('computes planned percent along the project schedule envelope', () => {
    const start = new Date(2026, 0, 1).getTime()
    const mid = new Date(2026, 0, 16).getTime()
    const end = new Date(2026, 0, 31).getTime()
    expect(plannedPercentAlongSchedule(start, start, end)).toBe(0)
    expect(plannedPercentAlongSchedule(end, start, end)).toBe(100)
    expect(plannedPercentAlongSchedule(mid, start, end)).toBe(50)
    expect(plannedPercentAlongSchedule(null, start, end)).toBeNull()
  })
})

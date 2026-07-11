import { describe, expect, it } from 'vitest'

import {
  applySparseDayLabels,
  buildAdaptiveTimelineHeaders,
  buildMonthBands,
  buildScheduleTimeline,
  buildYearBands,
  GANTT_PROJECT_ROOT_ID,
  pickGanttScale,
  resolveGanttDayTickStep,
  withGanttProjectRootItems,
} from './pm-gantt-utils'
import type { PmWorkItem } from '@toolman/shared'

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

describe('buildScheduleTimeline', () => {
  it('computes bar positions from start and due dates', () => {
    const start = Date.parse('2026-01-01')
    const end = Date.parse('2026-01-11')
    const timeline = buildScheduleTimeline([
      item({ id: 'a', title: 'Task A', startDate: start, dueDate: end }),
    ])
    expect(timeline.bars).toHaveLength(1)
    expect(timeline.bars[0]?.widthPercent).toBeGreaterThan(0)
    expect(timeline.scale).toBe('day')
    expect(timeline.dayWidth).toBe(28)
    expect(timeline.canvasWidth).toBe(timeline.dayCount * timeline.dayWidth)
    expect(timeline.headers[0]?.labelBottom).toBeTruthy()
    expect(timeline.yearBands.length).toBeGreaterThan(0)
    expect(timeline.monthBands.length).toBeGreaterThan(0)
  })

  it('pads several blank days before the earliest task', () => {
    const start = Date.parse('2026-03-10T00:00:00')
    const timeline = buildScheduleTimeline([
      item({ id: 'a', title: 'Task A', startDate: start, dueDate: Date.parse('2026-03-15T00:00:00') }),
    ])
    expect(timeline.rangeStart).toBe(Date.parse('2026-03-03T00:00:00'))
    expect(timeline.bars[0]?.leftPercent).toBeGreaterThan(0)
    // End pad matches start pad (exclusive end day + trailing pad).
    const dueExclusive = Date.parse('2026-03-16T00:00:00')
    expect(timeline.rangeEnd).toBe(dueExclusive + 7 * 24 * 60 * 60 * 1000)
  })

  it('accepts custom day width', () => {
    const timeline = buildScheduleTimeline(
      [item({ id: 'a', title: 'A', startDate: Date.parse('2026-01-01'), dueDate: Date.parse('2026-01-05') })],
      { dayWidth: 40 },
    )
    expect(timeline.dayWidth).toBe(40)
    expect(timeline.canvasWidth).toBe(timeline.dayCount * 40)
  })
})

describe('adaptive timeline headers', () => {
  it('always uses day scale', () => {
    expect(pickGanttScale(10)).toBe('day')
    expect(pickGanttScale(40)).toBe('day')
    expect(pickGanttScale(200)).toBe('day')
  })

  it('picks 1/5/7 day tick steps from span and pane width', () => {
    // No pane: fixed thresholds (~60 / ~180).
    expect(resolveGanttDayTickStep(30)).toBe(1)
    expect(resolveGanttDayTickStep(60)).toBe(1)
    expect(resolveGanttDayTickStep(61)).toBe(5)
    expect(resolveGanttDayTickStep(180)).toBe(5)
    expect(resolveGanttDayTickStep(181)).toBe(7)

    // Pane-aware: ~14px min cell → 800px fits ~57 daily ticks.
    expect(resolveGanttDayTickStep(40, 800)).toBe(1)
    expect(resolveGanttDayTickStep(90, 800)).toBe(5)
    expect(resolveGanttDayTickStep(500, 800)).toBe(7)
  })

  it('uses day-of-month ticks without repeating year on each day', () => {
    const start = Date.parse('2026-03-01')
    const end = Date.parse('2026-03-04')
    const headers = buildAdaptiveTimelineHeaders(start, end)
    expect(headers[0]?.labelBottom).toBe('1')
    expect(headers[1]?.labelBottom).toBe('2')
  })

  it('builds 5-day tick cells when step is 5', () => {
    const start = new Date(2026, 5, 1).getTime()
    const end = new Date(2026, 5, 21).getTime()
    const headers = buildAdaptiveTimelineHeaders(start, end, 5)
    expect(headers.length).toBe(4)
    expect(headers[0]?.labelBottom).toBe('1')
    expect(headers[1]?.labelBottom).toBe('6')
    expect(headers[0]?.endMs - headers[0]!.startMs).toBe(5 * 24 * 60 * 60 * 1000)
  })

  it('keeps multi-day ticks inside month boundaries', () => {
    const start = new Date(2026, 5, 1).getTime()
    const end = new Date(2026, 7, 1).getTime()
    const headers = buildAdaptiveTimelineHeaders(start, end, 5)
    const months = buildMonthBands(start, end)

    for (const header of headers) {
      const startDate = new Date(header.startMs)
      const lastIncluded = new Date(header.endMs - 1)
      expect(startDate.getMonth()).toBe(lastIncluded.getMonth())
      expect(startDate.getFullYear()).toBe(lastIncluded.getFullYear())
    }

    // Month band edges coincide with a day-tick edge.
    for (const month of months) {
      const aligned =
        headers.some((h) => h.startMs === month.startMs) ||
        headers.some((h) => h.endMs === month.endMs) ||
        headers.some((h) => h.startMs === month.endMs)
      expect(aligned).toBe(true)
    }

    // June ends at 30 → last June cell ends on July 1 (month boundary).
    const juneLast = [...headers].reverse().find((h) => new Date(h.startMs).getMonth() === 5)
    expect(juneLast?.endMs).toBe(new Date(2026, 6, 1).getTime())
    expect(juneLast?.labelBottom).toBe('26')

    // July (31 days): fold day 31 into 26–31 — no lonely 1-day cell (MS Project style).
    const julyHeaders = headers.filter((h) => new Date(h.startMs).getMonth() === 6)
    expect(julyHeaders.map((h) => h.labelBottom)).toEqual(['1', '6', '11', '16', '21', '26'])
    const julyLast = julyHeaders[julyHeaders.length - 1]
    expect(julyLast?.endMs).toBe(new Date(2026, 7, 1).getTime())
    expect(julyLast?.endMs - julyLast!.startMs).toBe(6 * 24 * 60 * 60 * 1000)
  })

  it('restarts day ticks at each month start for step 7', () => {
    const start = new Date(2026, 5, 1).getTime()
    const end = new Date(2026, 7, 1).getTime()
    const headers = buildAdaptiveTimelineHeaders(start, end, 7)
    const julyStart = headers.find((h) => h.startMs === new Date(2026, 6, 1).getTime())
    expect(julyStart?.labelBottom).toBe('1')
    expect(julyStart?.endMs).toBe(new Date(2026, 6, 8).getTime())
    // July 31 absorbed into last cell (22–31), not a separate tick.
    const julyHeaders = headers.filter((h) => new Date(h.startMs).getMonth() === 6)
    expect(julyHeaders.map((h) => h.labelBottom)).toEqual(['1', '8', '15', '22'])
    expect(julyHeaders[julyHeaders.length - 1]?.endMs).toBe(new Date(2026, 7, 1).getTime())
  })

  it('spans one year band and one month band across days', () => {
    const start = Date.parse('2026-03-01')
    const end = Date.parse('2026-03-10')
    const years = buildYearBands(start, end)
    const months = buildMonthBands(start, end)
    expect(years).toHaveLength(1)
    expect(years[0]?.label).toBe('2026')
    expect(months).toHaveLength(1)
    expect(months[0]?.label).toBe('3')
  })

  it('thins day labels to month anchors when columns are very narrow', () => {
    const start = Date.parse('2026-06-09')
    const end = Date.parse('2026-08-01')
    const headers = buildAdaptiveTimelineHeaders(start, end)
    // Extremely tight: force month-anchor path (step would exceed 5).
    const sparse = applySparseDayLabels(headers, 2, Math.min(80, headers.length * 2))
    const labeled = sparse.filter((h) => h.labelBottom).map((h) => h.labelBottom)
    expect(labeled.length).toBeGreaterThan(0)
    expect(labeled.length).toBeLessThan(headers.length)
    // Anchors that fit the gap budget should appear.
    expect(labeled.some((d) => ['9', '15', '20', '25', '30'].includes(d))).toBe(true)
  })

  it('shows every day label when the window is wide enough', () => {
    const start = Date.parse('2026-06-01')
    const end = Date.parse('2026-06-15')
    const headers = buildAdaptiveTimelineHeaders(start, end)
    const dayWidth = 20
    const canvasWidth = headers.length * dayWidth
    const sparse = applySparseDayLabels(headers, dayWidth, canvasWidth)
    const labeledCount = sparse.filter((h) => h.labelBottom).length
    expect(labeledCount).toBe(headers.length)
  })

  it('uses stepped labels when medium width cannot fit every day', () => {
    const start = Date.parse('2026-06-01')
    const end = Date.parse('2026-09-01')
    const headers = buildAdaptiveTimelineHeaders(start, end)
    const canvasWidth = 600
    const dayWidth = canvasWidth / headers.length
    const sparse = applySparseDayLabels(headers, dayWidth, canvasWidth)
    const labeledCount = sparse.filter((h) => h.labelBottom).length
    expect(labeledCount).toBeGreaterThan(0)
    expect(labeledCount).toBeLessThan(headers.length)
  })

  it('uses multi-day ticks for long projects in buildScheduleTimeline', () => {
    const timeline = buildScheduleTimeline(
      [
        item({
          id: '550e8400-e29b-41d4-a716-446655440010',
          title: 'long',
          startDate: Date.parse('2026-01-01'),
          dueDate: Date.parse('2026-06-30'),
        }),
      ],
      { paneWidthPx: 800 },
    )
    expect(timeline.dayTickStep).toBeGreaterThanOrEqual(5)
    expect(timeline.headers.length).toBeLessThan(timeline.dayCount)
  })
})

describe('withGanttProjectRootItems', () => {
  it('prepends a project summary spanning all task dates', () => {
    const project = {
      id: '550e8400-e29b-41d4-a716-446655440099',
      workspaceId: '00000000-0000-0000-0000-000000000002',
      code: 'EPC-1',
      name: 'Demo',
      status: 'active' as const,
      domain: 'progress_management' as const,
      metadata: {},
      createdAt: 1,
      updatedAt: 1,
    }
    const tasks = [
      item({
        id: '550e8400-e29b-41d4-a716-446655440011',
        title: 'A',
        startDate: Date.parse('2026-01-01T00:00:00'),
        dueDate: Date.parse('2026-01-10T00:00:00'),
        progressPercent: 50,
      }),
      item({
        id: '550e8400-e29b-41d4-a716-446655440012',
        title: 'B',
        startDate: Date.parse('2026-01-05T00:00:00'),
        dueDate: Date.parse('2026-01-20T00:00:00'),
        progressPercent: 0,
      }),
    ]
    const view = withGanttProjectRootItems(project, tasks)
    expect(view[0]?.id).toBe(GANTT_PROJECT_ROOT_ID)
    expect(view[0]?.title).toBe('EPC-1 · Demo')
    expect(view[0]?.startDate).toBe(Date.parse('2026-01-01T00:00:00'))
    expect(view[0]?.dueDate).toBe(Date.parse('2026-01-20T00:00:00'))
    expect(view[0]?.progressPercent).toBe(25)
    expect(view.slice(1).every((entry) => entry.parentId === GANTT_PROJECT_ROOT_ID)).toBe(true)
  })
})

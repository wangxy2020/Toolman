import { describe, expect, it } from 'vitest'

import { PmScheduleBaselineSnapshotSchema } from './pm-schedule-types.js'

describe('PmScheduleBaselineSnapshotSchema', () => {
  const workItemId = '550e8400-e29b-41d4-a716-446655440001'
  const fromId = '550e8400-e29b-41d4-a716-446655440002'
  const toId = '550e8400-e29b-41d4-a716-446655440003'

  it('accepts legacy snapshots without relations', () => {
    const parsed = PmScheduleBaselineSnapshotSchema.parse({
      capturedAt: 1000,
      workItems: [
        {
          workItemId,
          title: 'Task A',
          startDate: 1000,
          dueDate: 2000,
          progressPercent: 0,
        },
      ],
    })
    expect(parsed.relations).toBeUndefined()
  })

  it('accepts version snapshots with relations', () => {
    const parsed = PmScheduleBaselineSnapshotSchema.parse({
      capturedAt: 1000,
      workItems: [
        {
          workItemId: fromId,
          title: 'A',
          startDate: 1000,
          dueDate: 2000,
          progressPercent: 0,
        },
        {
          workItemId: toId,
          title: 'B',
          startDate: 3000,
          dueDate: 4000,
          progressPercent: 0,
        },
      ],
      relations: [
        {
          fromWorkItemId: fromId,
          toWorkItemId: toId,
          type: 'FS',
          lagDays: 0,
        },
      ],
    })
    expect(parsed.relations).toHaveLength(1)
    expect(parsed.relations?.[0]?.type).toBe('FS')
  })
})

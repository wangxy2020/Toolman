import { describe, expect, it } from 'vitest'

import {
  baselineItemHasAssignmentSnapshot,
  mergeAssignmentSnapshotIntoMetadata,
  pickAssignmentSnapshotFromMetadata,
  PmScheduleBaselineSnapshotSchema,
} from './pm-schedule-types.js'

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
    expect(parsed.workItems[0]?.resourceAssignments).toBeUndefined()
    expect(parsed.workItems[0]?.costAssignments).toBeUndefined()
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

  it('accepts snapshots with resource and cost assignments', () => {
    const parsed = PmScheduleBaselineSnapshotSchema.parse({
      capturedAt: 1000,
      workItems: [
        {
          workItemId,
          title: 'Task A',
          progressPercent: 0,
          resourceAssignments: [
            { resourceId: 'r1', type: 'labor', name: '普通工', quantity: 3, note: '' },
          ],
          costAssignments: [
            { costId: 'c1', type: 'material', name: '水泥', amount: 1200 },
          ],
        },
      ],
    })
    expect(parsed.workItems[0]?.resourceAssignments).toHaveLength(1)
    expect(parsed.workItems[0]?.costAssignments).toHaveLength(1)
    expect(baselineItemHasAssignmentSnapshot(parsed.workItems[0]!)).toBe(true)
  })

  it('accepts empty assignment arrays as captured state', () => {
    const parsed = PmScheduleBaselineSnapshotSchema.parse({
      capturedAt: 1000,
      workItems: [
        {
          workItemId,
          title: 'Task A',
          progressPercent: 0,
          resourceAssignments: [],
          costAssignments: [],
        },
      ],
    })
    expect(baselineItemHasAssignmentSnapshot(parsed.workItems[0]!)).toBe(true)
  })
})

describe('assignment snapshot helpers', () => {
  it('picks assignment arrays from live metadata', () => {
    expect(
      pickAssignmentSnapshotFromMetadata({
        resourceAssignments: [{ resourceId: 'r1', name: '工', quantity: 1 }],
        costAssignments: [{ name: '费', amount: 2 }],
        shouldPercentComplete: 40,
      }),
    ).toEqual({
      resourceAssignments: [{ resourceId: 'r1', name: '工', quantity: 1 }],
      costAssignments: [{ name: '费', amount: 2 }],
    })

    expect(pickAssignmentSnapshotFromMetadata({})).toEqual({
      resourceAssignments: [],
      costAssignments: [],
    })
  })

  it('merges snapshot assignments into metadata and clears when empty', () => {
    const merged = mergeAssignmentSnapshotIntoMetadata(
      {
        shouldPercentComplete: 50,
        resourceAssignments: [{ name: '旧' }],
      },
      {
        resourceAssignments: [
          { resourceId: 'r2', type: 'labor', name: '新', quantity: 2, note: '' },
        ],
        costAssignments: [],
      },
    )
    expect(merged).toEqual({
      shouldPercentComplete: 50,
      resourceAssignments: [
        { resourceId: 'r2', type: 'labor', name: '新', quantity: 2, note: '' },
      ],
      costAssignments: null,
      resourceAssignment: null,
    })
  })

  it('returns null for legacy snapshot items without assignment fields', () => {
    expect(
      mergeAssignmentSnapshotIntoMetadata({ resourceAssignments: [{ name: 'x' }] }, {}),
    ).toBeNull()
  })
})

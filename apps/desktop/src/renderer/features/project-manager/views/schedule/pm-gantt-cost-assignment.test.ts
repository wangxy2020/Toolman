import { describe, expect, it } from 'vitest'

import {
  formatCostAssignmentInput,
  formatCostAssignmentsInput,
  parseCostAssignmentInput,
  parseCostAssignmentsInput,
  replaceTaskCostAssignmentsMetadata,
  readTaskCostAssignments,
  TASK_COST_ASSIGNMENTS_KEY,
} from './pm-gantt-cost-assignment'

describe('pm-gantt-cost-assignment', () => {
  it('formats and parses cost input text', () => {
    expect(
      formatCostAssignmentInput({ name: '材料费', amount: 1200 }),
    ).toBe('材料费，1200')

    expect(
      formatCostAssignmentsInput([
        { name: '材料费', amount: 1200 },
        { name: '机械费', amount: 800 },
      ]),
    ).toBe('材料费，1200；机械费，800')

    expect(parseCostAssignmentInput('材料费，1200')).toEqual({
      name: '材料费',
      amount: 1200,
    })

    expect(
      parseCostAssignmentsInput('材料费，1200；机械费，800；'),
    ).toEqual([
      { name: '材料费', amount: 1200 },
      { name: '机械费', amount: 800 },
    ])
  })

  it('replaces cost assignment metadata', () => {
    const meta = replaceTaskCostAssignmentsMetadata({}, [
      { name: '材料费', amount: 100 },
    ])
    expect(meta[TASK_COST_ASSIGNMENTS_KEY]).toEqual([{ name: '材料费', amount: 100 }])
    expect(readTaskCostAssignments(meta)).toHaveLength(1)

    const cleared = replaceTaskCostAssignmentsMetadata(meta, [])
    expect(cleared[TASK_COST_ASSIGNMENTS_KEY]).toBeNull()
  })
})

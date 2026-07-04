import { describe, expect, it } from 'vitest'

import { taskPlanStepToTaskStepRecord, taskPlanToStepRecords } from './plan-to-steps'

describe('plan-to-steps', () => {
  it('converts tool steps to executable records', () => {
    const [step] = taskPlanToStepRecords({
      goal: 'test',
      steps: [
        {
          kind: 'tool',
          title: 'Read file',
          tool: { toolName: 'fs_read', argsJson: '{"path":"a.txt"}' },
        },
      ],
    })

    expect(step?.kind).toBe('tool')
    expect(step?.status).toBe('pending')
    expect(step?.input).toMatchObject({ toolName: 'fs_read' })
  })

  it('keeps non-tool kinds as pending planning steps', () => {
    const step = taskPlanStepToTaskStepRecord({
      kind: 'scan',
      title: 'Scan workspace',
      description: 'List files first',
    })

    expect(step.kind).toBe('scan')
    expect(step.input).toMatchObject({ plannedKind: 'scan' })
  })
})

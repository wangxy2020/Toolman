import { describe, expect, it } from 'vitest'

import { isTaskToolStepRecord, parseTaskToolStepInput } from './executor-step.js'

describe('executor-step', () => {
  it('parses tool step input', () => {
    const payload = parseTaskToolStepInput({
      toolName: 'fs_read',
      argsJson: '{"path":"a.txt"}',
    })
    expect(payload.toolName).toBe('fs_read')
  })

  it('detects tool step records', () => {
    expect(
      isTaskToolStepRecord({
        kind: 'tool',
        input: { toolName: 'bash', argsJson: '{}' },
      }),
    ).toBe(true)
    expect(isTaskToolStepRecord({ kind: 'read', input: {} })).toBe(false)
  })
})

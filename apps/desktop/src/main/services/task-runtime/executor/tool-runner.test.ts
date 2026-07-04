import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../tool-executor.service', () => ({
  executeToolCall: vi.fn(),
}))

vi.mock('../task-event.service', () => ({
  emitTaskToolStarted: vi.fn(),
  emitTaskToolFinished: vi.fn(),
  emitTaskRetry: vi.fn(),
  emitTaskCheckpoint: vi.fn(),
}))

vi.mock('./checkpoint', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./checkpoint')>()
  return {
    ...actual,
    createTaskToolCheckpoint: vi.fn(actual.createTaskToolCheckpoint),
    rollbackTaskToolCheckpoint: vi.fn(actual.rollbackTaskToolCheckpoint),
    cleanupTaskToolCheckpoint: vi.fn(actual.cleanupTaskToolCheckpoint),
  }
})

import { executeToolCall } from '../../tool-executor.service'
import { runTaskTool } from './tool-runner'

describe('runTaskTool', () => {
  beforeEach(() => {
    vi.mocked(executeToolCall).mockReset()
  })

  it('returns output on first success', async () => {
    vi.mocked(executeToolCall).mockResolvedValueOnce('ok')

    const result = await runTaskTool('fs_read', '{}', {})
    expect(result.output).toBe('ok')
    expect(result.attempts).toBe(1)
    expect(result.policy.category).toBe('readonly')
  })

  it('retries transient failures for bash', async () => {
    vi.mocked(executeToolCall)
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce('done')

    const result = await runTaskTool('bash', '{}', {})
    expect(result.output).toBe('done')
    expect(result.attempts).toBe(2)
    expect(executeToolCall).toHaveBeenCalledTimes(2)
  })
})

import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { AgentTask } from '@toolman/shared'

vi.mock('../orchestrator/orchestrator.service', () => ({
  runTaskOrchestrator: vi.fn(),
}))

import { runTaskOrchestrator } from '../orchestrator/orchestrator.service'
import {
  abortTaskWorkerRun,
  executeTaskWorkerRun,
  getTaskWorkerSnapshot,
  isTaskWorkerRunning,
  TaskWorkerAbortedError,
} from './task-worker.service'

const baseTask = (): AgentTask => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  workspaceId: '00000000-0000-0000-0000-000000000002',
  title: 'Worker test',
  status: 'executing',
  retryCount: 0,
  history: [],
  budget: {
    preset: 'network',
    maxPlannerTokens: 8000,
    maxExecutorTokensPerStep: 4000,
    maxReflectionTokens: 4000,
    maxTotalTokens: 120_000,
    maxSteps: 30,
    used: { planner: 0, executor: 0, reflection: 0, total: 0 },
  },
  metadata: {},
  createdAt: Date.now(),
  updatedAt: Date.now(),
})

describe('executeTaskWorkerRun', () => {
  beforeEach(() => {
    vi.mocked(runTaskOrchestrator).mockReset()
  })

  it('runs orchestrator with a worker-managed abort signal', async () => {
    vi.mocked(runTaskOrchestrator).mockResolvedValueOnce({ ...baseTask(), status: 'completed' })

    const result = await executeTaskWorkerRun(baseTask().id)

    expect(result.status).toBe('completed')
    expect(runTaskOrchestrator).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: baseTask().id }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(isTaskWorkerRunning(baseTask().id)).toBe(false)
  })

  it('aborts an active run', async () => {
    vi.mocked(runTaskOrchestrator).mockImplementation(
      (_input, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'))
          })
        }),
    )

    const runPromise = executeTaskWorkerRun(baseTask().id)
    expect(isTaskWorkerRunning(baseTask().id)).toBe(true)
    expect(abortTaskWorkerRun(baseTask().id)).toBe(true)

    await expect(runPromise).rejects.toBeInstanceOf(TaskWorkerAbortedError)
    expect(getTaskWorkerSnapshot().activeTaskId).toBeNull()
  })
})

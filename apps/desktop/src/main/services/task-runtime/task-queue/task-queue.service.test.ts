import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { AgentTask } from '@toolman/shared'

const { executeTaskWorkerRun } = vi.hoisted(() => ({
  executeTaskWorkerRun: vi.fn(),
}))

vi.mock('./task-worker.service', () => ({
  executeTaskWorkerRun,
  getTaskWorkerSnapshot: vi.fn(() => ({
    workerId: 'worker-test',
    activeTaskId: null,
    activeTaskIds: [],
  })),
  TaskWorkerAbortedError: class TaskWorkerAbortedError extends Error {
    name = 'TaskWorkerAbortedError'
    constructor(message = '任务执行已中断') {
      super(message)
    }
  },
}))

import { cancelScheduledTaskRun, scheduleTaskRun } from './task-queue.service'
import { TaskWorkerAbortedError } from './task-worker.service'

const baseTask = (): AgentTask => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  workspaceId: '00000000-0000-0000-0000-000000000002',
  title: 'Queue test',
  status: 'completed',
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

describe('scheduleTaskRun', () => {
  beforeEach(() => {
    executeTaskWorkerRun.mockReset()
  })

  it('deduplicates concurrent runs for the same task', async () => {
    let resolveRun!: (task: AgentTask) => void
    executeTaskWorkerRun.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRun = resolve
        }),
    )

    const first = scheduleTaskRun(baseTask().id)
    const second = scheduleTaskRun(baseTask().id)

    expect(first).toBe(second)
    expect(executeTaskWorkerRun).toHaveBeenCalledTimes(1)

    resolveRun(baseTask())
    await expect(first).resolves.toMatchObject({ status: 'completed' })
  })
})

describe('cancelScheduledTaskRun', () => {
  it('returns false when task is not queued', () => {
    expect(cancelScheduledTaskRun('550e8400-e29b-41d4-a716-446655440099')).toBe(false)
  })
})

describe('TaskWorkerAbortedError', () => {
  it('has a default message', () => {
    expect(new TaskWorkerAbortedError().message).toBe('任务执行已中断')
  })
})

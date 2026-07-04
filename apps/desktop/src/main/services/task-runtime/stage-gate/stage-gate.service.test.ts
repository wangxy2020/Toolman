import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { AgentTask } from '@toolman/shared'

vi.mock('../reflection/reflection.service', () => ({
  performTaskReflection: vi.fn(),
}))

vi.mock('../task-event.service', () => ({
  emitTaskFinished: vi.fn(),
  emitTaskRetry: vi.fn(),
}))

vi.mock('../store', () => ({
  updateAgentTaskRecord: vi.fn(),
}))

import { performTaskReflection } from '../reflection/reflection.service'
import { updateAgentTaskRecord } from '../store'
import { runStageGateAfterStep, scheduleStepRetry } from './stage-gate.service'

const baseTask = (): AgentTask => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  workspaceId: '00000000-0000-0000-0000-000000000002',
  title: 'Stage gate test',
  status: 'executing',
  retryCount: 0,
  history: [
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      kind: 'tool',
      title: 'Read file',
      status: 'completed',
      input: { toolName: 'fs_read', argsJson: '{}' },
      retryCount: 0,
    },
  ],
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

function cloneTask(task: AgentTask): AgentTask {
  return {
    ...task,
    history: task.history.map((step) => ({ ...step })),
    budget: { ...task.budget, used: { ...task.budget.used } },
    metadata: { ...task.metadata },
  }
}

describe('runStageGateAfterStep', () => {
  beforeEach(() => {
    vi.mocked(performTaskReflection).mockReset()
    vi.mocked(updateAgentTaskRecord).mockReset()
  })

  it('fails when token budget is exhausted', async () => {
    const task = cloneTask(baseTask())
    task.budget.used.total = task.budget.maxTotalTokens

    vi.mocked(updateAgentTaskRecord).mockImplementation((_taskId, patch) => ({
      ...task,
      ...patch,
    }) as AgentTask)

    const result = await runStageGateAfterStep(task, {
      stepId: '550e8400-e29b-41d4-a716-446655440001',
    })

    expect(result.terminal).toBe(true)
    expect(result.task.status).toBe('failed')
    expect(performTaskReflection).not.toHaveBeenCalled()
  })

  it('runs reflection and returns verdict', async () => {
    const task = cloneTask(baseTask())
    const pendingTask = { ...task, status: 'pending' as const }

    vi.mocked(performTaskReflection).mockResolvedValueOnce({
      task: pendingTask,
      reflection: { verdict: 'continue', reason: 'ok' },
      verdict: 'pass',
    })

    const result = await runStageGateAfterStep(task, {
      stepId: '550e8400-e29b-41d4-a716-446655440001',
    })

    expect(result.terminal).toBe(false)
    expect(result.verdict).toBe('pass')
    expect(result.task.status).toBe('pending')
  })

  it('soft-continues when reflection throws', async () => {
    const task = cloneTask(baseTask())
    vi.mocked(performTaskReflection).mockRejectedValueOnce(new Error('parse failed'))
    vi.mocked(updateAgentTaskRecord).mockImplementation((_taskId, patch) => ({
      ...task,
      ...patch,
    }) as AgentTask)

    const result = await runStageGateAfterStep(task, {
      stepId: '550e8400-e29b-41d4-a716-446655440001',
    })

    expect(result.terminal).toBe(false)
    expect(result.task.status).toBe('executing')
  })
})

describe('scheduleStepRetry', () => {
  beforeEach(() => {
    vi.mocked(updateAgentTaskRecord).mockReset()
  })

  it('rolls back step and increments retry count when under limit', () => {
    let task = cloneTask(baseTask())
    task = {
      ...task,
      history: [
        {
          id: '550e8400-e29b-41d4-a716-446655440002',
          kind: 'tool',
          title: 'Bash',
          status: 'running',
          input: { toolName: 'bash', argsJson: '{}' },
          retryCount: 0,
        },
      ],
    }

    vi.mocked(updateAgentTaskRecord).mockImplementation((_taskId, patch) => {
      task = {
        ...task,
        ...patch,
        history: patch.history ?? task.history,
      } as AgentTask
      return cloneTask(task)
    })

    const result = scheduleStepRetry(task, task.history[0]!, 'tool boom')

    expect(result.terminal).toBe(false)
    expect(result.task.status).toBe('retrying')
    expect(result.task.retryCount).toBe(1)
    expect(result.task.history[0]?.status).toBe('pending')
  })

  it('fails task when retry limit is reached', () => {
    let task = cloneTask(baseTask())
    task.retryCount = 2
    task = {
      ...task,
      history: [
        {
          id: '550e8400-e29b-41d4-a716-446655440002',
          kind: 'tool',
          title: 'Bash',
          status: 'running',
          input: { toolName: 'bash', argsJson: '{}' },
          retryCount: 0,
        },
      ],
    }

    vi.mocked(updateAgentTaskRecord).mockImplementation((_taskId, patch) => {
      task = {
        ...task,
        ...patch,
        history: patch.history ?? task.history,
      } as AgentTask
      return cloneTask(task)
    })

    const result = scheduleStepRetry(task, task.history[0]!, 'tool boom')

    expect(result.terminal).toBe(true)
    expect(result.task.status).toBe('failed')
    expect(result.task.retryCount).toBe(3)
  })
})

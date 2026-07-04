import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { AgentTask } from '@toolman/shared'

vi.mock('../planner/planner.service', () => ({
  runTaskPlanner: vi.fn(),
}))

vi.mock('../executor/executor.service', () => ({
  runTaskExecutor: vi.fn(),
  ExecutorError: class ExecutorError extends Error {
    name = 'ExecutorError'
    constructor(message: string, readonly code: string) {
      super(message)
    }
  },
}))

vi.mock('../store', () => ({
  getAgentTask: vi.fn(),
  updateAgentTaskRecord: vi.fn(),
  repairTaskWorkspaceRecord: vi.fn((task: AgentTask) => task),
}))

vi.mock('../task-event.service', () => ({
  emitTaskFinished: vi.fn(),
}))

vi.mock('../task-runtime-tool-context', () => ({
  prepareTaskToolRuntime: vi.fn(async () => ({
    mcpServerIds: [],
    toolNames: ['bash'],
    skillsHint: null,
    workingDirectory: '/tmp',
  })),
}))

import { runTaskExecutor } from '../executor/executor.service'
import { runTaskPlanner } from '../planner/planner.service'
import { getAgentTask } from '../store'
import {
  hasPendingToolSteps,
  needsTaskPlanning,
  runTaskOrchestrator,
  shouldRunTaskExecution,
} from './orchestrator.service'

const baseTask = (): AgentTask => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  workspaceId: '00000000-0000-0000-0000-000000000002',
  title: 'Orchestrator test',
  status: 'pending',
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

function cloneTask(task: AgentTask): AgentTask {
  return {
    ...task,
    history: task.history.map((step) => ({ ...step })),
    budget: { ...task.budget, used: { ...task.budget.used } },
    metadata: { ...task.metadata },
  }
}

describe('orchestrator helpers', () => {
  it('detects pending tool steps', () => {
    const task = baseTask()
    expect(hasPendingToolSteps(task)).toBe(false)

    task.history = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        kind: 'tool',
        title: 'Read',
        status: 'pending',
        retryCount: 0,
      },
    ]
    expect(hasPendingToolSteps(task)).toBe(true)
  })

  it('plans only fresh pending tasks without steps', () => {
    expect(needsTaskPlanning(baseTask())).toBe(true)
    expect(needsTaskPlanning({ ...baseTask(), history: [{ id: '1', kind: 'tool', title: 'x', status: 'pending', retryCount: 0 }] })).toBe(false)
    expect(needsTaskPlanning(baseTask(), true)).toBe(false)
  })

  it('executes when pending tool steps or retrying', () => {
    const task = baseTask()
    expect(shouldRunTaskExecution(task)).toBe(false)

    task.history = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        kind: 'tool',
        title: 'Read',
        status: 'pending',
        retryCount: 0,
      },
    ]
    expect(shouldRunTaskExecution(task)).toBe(true)

    const retrying = { ...baseTask(), status: 'retrying' as const }
    expect(shouldRunTaskExecution(retrying)).toBe(true)
  })
})

describe('runTaskOrchestrator', () => {
  beforeEach(() => {
    vi.mocked(runTaskPlanner).mockReset()
    vi.mocked(runTaskExecutor).mockReset()
    vi.mocked(getAgentTask).mockReset()
  })

  it('plans then executes a fresh task', async () => {
    let task = baseTask()
    vi.mocked(getAgentTask).mockImplementation(() => cloneTask(task))

    vi.mocked(runTaskPlanner).mockImplementationOnce(async () => {
      task = {
        ...task,
        status: 'pending',
        history: [
          {
            id: '550e8400-e29b-41d4-a716-446655440001',
            kind: 'tool',
            title: 'Write',
            status: 'pending',
            input: { toolName: 'fs_write', argsJson: '{}' },
            retryCount: 0,
          },
        ],
      }
      return cloneTask(task)
    })

    vi.mocked(runTaskExecutor).mockImplementationOnce(async () => {
      task = { ...task, status: 'completed', currentStepId: undefined }
      return cloneTask(task)
    })

    const result = await runTaskOrchestrator({ taskId: task.id })

    expect(result.status).toBe('completed')
    expect(runTaskPlanner).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: task.id, execute: false }),
      expect.any(Object),
    )
    expect(runTaskExecutor).toHaveBeenCalledTimes(1)
  })

  it('executes only when steps already exist', async () => {
    let task = {
      ...baseTask(),
      history: [
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          kind: 'tool' as const,
          title: 'Read',
          status: 'pending' as const,
          input: { toolName: 'fs_read', argsJson: '{}' },
          retryCount: 0,
        },
      ],
    }
    vi.mocked(getAgentTask).mockImplementation(() => cloneTask(task))

    vi.mocked(runTaskExecutor).mockImplementationOnce(async () => {
      task = { ...task, status: 'completed' }
      return cloneTask(task)
    })

    const result = await runTaskOrchestrator({ taskId: task.id })

    expect(result.status).toBe('completed')
    expect(runTaskPlanner).not.toHaveBeenCalled()
    expect(runTaskExecutor).toHaveBeenCalledTimes(1)
  })

  it('returns paused task without planning or executing', async () => {
    const task = { ...baseTask(), status: 'paused' as const }
    vi.mocked(getAgentTask).mockReturnValue(cloneTask(task))

    await expect(runTaskOrchestrator({ taskId: task.id })).rejects.toThrow('任务已暂停')
  })
})

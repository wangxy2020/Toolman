import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { AgentTask } from '@toolman/shared'

vi.mock('./tool-runner', () => ({
  runTaskTool: vi.fn(),
}))

vi.mock('../../assistant.service', () => ({
  getAssistantRow: vi.fn(() => null),
}))

vi.mock('../agent-runtime', () => ({
  parseAssistantRuntime: vi.fn(() => ({
    mcpServerIds: [],
    toolContext: { environmentVariables: undefined },
  })),
}))

vi.mock('../task-workspace.service', () => ({
  resolveTaskToolWorkingDirectory: vi.fn(() => '/tmp/task-workdir'),
}))

vi.mock('../stage-gate/stage-gate.service', () => ({
  runStageGateAfterStep: vi.fn(async (task: AgentTask) => ({ task, terminal: false })),
  scheduleStepRetry: vi.fn(),
}))

vi.mock('../task-event.service', () => ({
  emitTaskFinished: vi.fn(),
  emitTaskStepStarted: vi.fn(),
}))

vi.mock('../store', () => ({
  getAgentTask: vi.fn(),
  updateAgentTaskRecord: vi.fn(),
  appendTaskToolSteps: vi.fn(),
  tryAcquireAgentTaskLock: vi.fn(),
  releaseAgentTaskLock: vi.fn(),
}))

import { runTaskTool } from './tool-runner'
import { runTaskExecutor, ExecutorError } from './executor.service'
import { scheduleStepRetry } from '../stage-gate/stage-gate.service'
import {
  appendTaskToolSteps,
  getAgentTask,
  releaseAgentTaskLock,
  tryAcquireAgentTaskLock,
  updateAgentTaskRecord,
} from '../store'

const baseTask = (): AgentTask => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  workspaceId: '00000000-0000-0000-0000-000000000002',
  title: 'Executor test',
  status: 'pending',
  retryCount: 0,
  history: [],
  budget: {
    preset: 'local',
    maxPlannerTokens: 32_000,
    maxExecutorTokensPerStep: 16_000,
    maxReflectionTokens: 8_000,
    maxTotalTokens: 500_000,
    maxSteps: 50,
    used: { planner: 0, executor: 0, reflection: 0, total: 0 },
  },
  metadata: {},
  createdAt: Date.now(),
  updatedAt: Date.now(),
  workspaceRoot: '/tmp/task-root',
})

function cloneTask(task: AgentTask): AgentTask {
  return {
    ...task,
    history: task.history.map((step) => ({ ...step })),
    budget: { ...task.budget, used: { ...task.budget.used } },
    metadata: { ...task.metadata },
  }
}

describe('runTaskExecutor', () => {
  beforeEach(() => {
    vi.mocked(runTaskTool).mockReset()
    vi.mocked(getAgentTask).mockReset()
    vi.mocked(updateAgentTaskRecord).mockReset()
    vi.mocked(appendTaskToolSteps).mockReset()
    vi.mocked(tryAcquireAgentTaskLock).mockReset()
    vi.mocked(releaseAgentTaskLock).mockReset()
    vi.mocked(scheduleStepRetry).mockReset()
    vi.mocked(tryAcquireAgentTaskLock).mockReturnValue(true)
    vi.mocked(runTaskTool).mockResolvedValue({
      output: 'ok',
      attempts: 1,
      elapsedMs: 1,
      policy: {
        category: 'readonly',
        timeoutMs: 60_000,
        maxRetries: 1,
        rollbackEligible: false,
      },
    })
  })

  it('executes pending tool steps and completes task', async () => {
    let task: AgentTask = {
      ...baseTask(),
      history: [
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          kind: 'tool' as const,
          title: 'Read file',
          status: 'pending' as const,
          input: { toolName: 'fs_read', argsJson: '{"path":"a.txt"}' },
          retryCount: 0,
        },
      ],
    }
    vi.mocked(getAgentTask).mockImplementation(() => cloneTask(task))
    vi.mocked(updateAgentTaskRecord).mockImplementation((_taskId, patch) => {
      task = {
        ...task,
        ...patch,
        history: patch.history ?? task.history,
        notes: patch.notes === null ? undefined : patch.notes ?? task.notes,
      } as AgentTask
      return cloneTask(task)
    })

    const result = await runTaskExecutor({ taskId: task.id }, { reflectAfterStep: false })

    expect(result.status).toBe('completed')
    expect(runTaskTool).toHaveBeenCalledTimes(1)
    expect(releaseAgentTaskLock).toHaveBeenCalledWith(task.id)
  })

  it('fails when there are no pending steps and no completed tool work', async () => {
    let task: AgentTask = baseTask()
    vi.mocked(getAgentTask).mockImplementation(() => cloneTask(task))
    vi.mocked(updateAgentTaskRecord).mockImplementation((_taskId, patch) => {
      task = {
        ...task,
        ...patch,
        history: patch.history ?? task.history,
      } as AgentTask
      return cloneTask(task)
    })

    const result = await runTaskExecutor({ taskId: task.id })

    expect(result.status).toBe('failed')
    expect(runTaskTool).not.toHaveBeenCalled()
  })

  it('fails when all non-tool steps are skipped', async () => {
    let task: AgentTask = {
      ...baseTask(),
      history: [
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          kind: 'report' as const,
          title: 'Summarize',
          status: 'pending' as const,
          retryCount: 0,
        },
      ],
    }
    vi.mocked(getAgentTask).mockImplementation(() => cloneTask(task))
    vi.mocked(updateAgentTaskRecord).mockImplementation((_taskId, patch) => {
      task = {
        ...task,
        ...patch,
        history: patch.history ?? task.history,
      } as AgentTask
      return cloneTask(task)
    })

    const result = await runTaskExecutor({ taskId: task.id })

    expect(result.status).toBe('failed')
    expect(runTaskTool).not.toHaveBeenCalled()
  })

  it('retries failed steps until retry limit', async () => {
    let task: AgentTask = {
      ...baseTask(),
      history: [
        {
          id: '550e8400-e29b-41d4-a716-446655440002',
          kind: 'tool' as const,
          title: 'Bash',
          status: 'pending' as const,
          input: { toolName: 'bash', argsJson: '{}' },
          retryCount: 0,
        },
      ],
    }
    vi.mocked(getAgentTask).mockImplementation(() => cloneTask(task))
    vi.mocked(updateAgentTaskRecord).mockImplementation((_taskId, patch) => {
      task = {
        ...task,
        ...patch,
        history: patch.history ?? task.history,
      } as AgentTask
      return cloneTask(task)
    })

    vi.mocked(runTaskTool)
      .mockRejectedValueOnce(new Error('tool boom'))
      .mockResolvedValueOnce({
        output: 'ok',
        attempts: 1,
        elapsedMs: 1,
        policy: {
          category: 'readonly',
          timeoutMs: 60_000,
          maxRetries: 1,
          rollbackEligible: false,
        },
      })

    vi.mocked(scheduleStepRetry).mockImplementation((currentTask, step, error) => {
      task = {
        ...currentTask,
        status: 'retrying',
        retryCount: (currentTask.retryCount ?? 0) + 1,
        history: currentTask.history.map((item) =>
          item.id === step.id
            ? { ...item, status: 'pending' as const, error, retryCount: (item.retryCount ?? 0) + 1 }
            : item,
        ),
      } as AgentTask
      return { task: cloneTask(task), terminal: false }
    })

    const result = await runTaskExecutor({ taskId: task.id }, { reflectAfterStep: false })

    expect(result.status).toBe('completed')
    expect(runTaskTool).toHaveBeenCalledTimes(2)
    expect(scheduleStepRetry).toHaveBeenCalledTimes(1)
  })

  it('marks task failed when retry limit is reached', async () => {
    let task: AgentTask = {
      ...baseTask(),
      history: [
        {
          id: '550e8400-e29b-41d4-a716-446655440002',
          kind: 'tool' as const,
          title: 'Bash',
          status: 'pending' as const,
          input: { toolName: 'bash', argsJson: '{}' },
          retryCount: 0,
        },
      ],
    }
    vi.mocked(getAgentTask).mockImplementation(() => cloneTask(task))
    vi.mocked(updateAgentTaskRecord).mockImplementation((_taskId, patch) => {
      task = {
        ...task,
        ...patch,
        history: patch.history ?? task.history,
      } as AgentTask
      return cloneTask(task)
    })
    vi.mocked(runTaskTool).mockRejectedValue(new Error('tool boom'))
    vi.mocked(scheduleStepRetry).mockImplementation((currentTask) => {
      task = { ...currentTask, status: 'failed', retryCount: 3 } as AgentTask
      return { task: cloneTask(task), terminal: true }
    })

    await expect(
      runTaskExecutor({ taskId: task.id }, { reflectAfterStep: false }),
    ).rejects.toThrow('tool boom')

    expect(task.status).toBe('failed')
  })

  it('rejects when global lock is held', async () => {
    const task = baseTask()
    vi.mocked(getAgentTask).mockReturnValue(cloneTask(task))
    vi.mocked(tryAcquireAgentTaskLock).mockReturnValue(false)

    await expect(runTaskExecutor({ taskId: task.id })).rejects.toBeInstanceOf(ExecutorError)
  })
})

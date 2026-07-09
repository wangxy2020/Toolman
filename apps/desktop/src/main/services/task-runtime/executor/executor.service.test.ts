import { describe, expect, it, vi, beforeEach } from 'vitest'

import {
  createInMemoryAgentTaskRepository,
  type InMemoryAgentTaskRepository,
} from '../testing/in-memory-agent-task.repository'

const TASK_ID = '550e8400-e29b-41d4-a716-446655440000'

const harness = vi.hoisted(() => ({
  repo: null as InMemoryAgentTaskRepository | null,
  runTaskTool: vi.fn(),
}))

vi.mock('@toolman/db', () => ({
  AgentTaskRepository: class {
    constructor() {
      if (!harness.repo) {
        throw new Error('in-memory task repository not initialized')
      }
      return harness.repo
    }
  },
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/toolman-executor-test',
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}))

vi.mock('../../../bootstrap/database', () => ({
  getDatabase: () => ({}),
}))

vi.mock('./tool-runner', () => ({
  runTaskTool: harness.runTaskTool,
}))

vi.mock('../../assistant.service', () => ({
  getAssistantRow: vi.fn(() => null),
}))

vi.mock('../../workspace.service', () => ({
  getWorkspace: vi.fn(() => null),
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

vi.mock('../task-event.service', () => ({
  emitTaskFinished: vi.fn(),
  emitTaskStepStarted: vi.fn(),
  emitTaskRetry: vi.fn(),
  emitTaskToolStarted: vi.fn(),
  emitTaskToolFinished: vi.fn(),
  emitTaskCheckpoint: vi.fn(),
  emitTaskEvent: vi.fn(),
  publishTaskEvent: vi.fn(),
}))

vi.mock('../snapshot', () => ({
  syncTaskSnapshotFromDb: vi.fn(),
}))

const defaultToolResult = {
  output: 'ok',
  attempts: 1,
  elapsedMs: 1,
  policy: {
    category: 'readonly' as const,
    timeoutMs: 60_000,
    maxRetries: 1,
    rollbackEligible: false,
  },
}

function seedTask(): void {
  harness.repo!.importLegacyTask({
    id: TASK_ID,
    workspaceId: '00000000-0000-0000-0000-000000000002',
    title: 'Executor test',
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
}

describe('runTaskExecutor', () => {
  beforeEach(() => {
    harness.repo = createInMemoryAgentTaskRepository()
    seedTask()
    vi.clearAllMocks()
    harness.runTaskTool.mockResolvedValue(defaultToolResult)
  })

  it('executes pending tool steps and completes task', async () => {
    const { runTaskExecutor } = await import('./executor.service')

    harness.repo!.update(TASK_ID, {
      history: [
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          kind: 'tool',
          title: 'Read file',
          status: 'pending',
          input: { toolName: 'fs_read', argsJson: '{"path":"a.txt"}' },
          retryCount: 0,
        },
      ],
    })

    const result = await runTaskExecutor({ taskId: TASK_ID }, { reflectAfterStep: false })

    expect(result.status).toBe('completed')
    expect(harness.runTaskTool).toHaveBeenCalledTimes(1)
  })

  it('fails when there are no pending steps and no completed tool work', async () => {
    const { runTaskExecutor } = await import('./executor.service')

    const result = await runTaskExecutor({ taskId: TASK_ID })

    expect(result.status).toBe('failed')
    expect(harness.runTaskTool).not.toHaveBeenCalled()
  })

  it('fails when all non-tool steps are skipped', async () => {
    const { runTaskExecutor } = await import('./executor.service')

    harness.repo!.update(TASK_ID, {
      history: [
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          kind: 'report',
          title: 'Summarize',
          status: 'pending',
          retryCount: 0,
        },
      ],
    })

    const result = await runTaskExecutor({ taskId: TASK_ID })

    expect(result.status).toBe('failed')
    expect(harness.runTaskTool).not.toHaveBeenCalled()
  })

  it('retries failed steps until retry limit', async () => {
    const { runTaskExecutor } = await import('./executor.service')
    const { getAgentTask } = await import('../store')

    harness.repo!.update(TASK_ID, {
      history: [
        {
          id: '550e8400-e29b-41d4-a716-446655440002',
          kind: 'tool',
          title: 'Bash',
          status: 'pending',
          input: { toolName: 'bash', argsJson: '{}' },
          retryCount: 0,
        },
      ],
    })

    harness.runTaskTool
      .mockRejectedValueOnce(new Error('tool boom'))
      .mockResolvedValueOnce(defaultToolResult)

    const result = await runTaskExecutor({ taskId: TASK_ID }, { reflectAfterStep: false })

    expect(result.status).toBe('completed')
    expect(harness.runTaskTool).toHaveBeenCalledTimes(2)
    expect(getAgentTask(TASK_ID)?.retryCount).toBeGreaterThanOrEqual(1)
  })

  it('marks task failed when retry limit is reached', async () => {
    const { runTaskExecutor } = await import('./executor.service')
    const { getAgentTask } = await import('../store')

    harness.repo!.update(TASK_ID, {
      retryCount: 2,
      history: [
        {
          id: '550e8400-e29b-41d4-a716-446655440002',
          kind: 'tool',
          title: 'Bash',
          status: 'pending',
          input: { toolName: 'bash', argsJson: '{}' },
          retryCount: 0,
        },
      ],
    })
    harness.runTaskTool.mockRejectedValue(new Error('tool boom'))

    await expect(
      runTaskExecutor({ taskId: TASK_ID }, { reflectAfterStep: false }),
    ).rejects.toThrow('tool boom')

    expect(getAgentTask(TASK_ID)?.status).toBe('failed')
  })

  it('rejects when global lock is held', async () => {
    const { ExecutorError, runTaskExecutor } = await import('./executor.service')

    harness.repo!.importLegacyTask({
      id: '00000000-0000-0000-0000-000000000099',
      workspaceId: '00000000-0000-0000-0000-000000000002',
      title: 'Other task',
      status: 'executing',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    harness.repo!.tryAcquireGlobalLock('00000000-0000-0000-0000-000000000099', 'other-worker')

    await expect(runTaskExecutor({ taskId: TASK_ID })).rejects.toBeInstanceOf(ExecutorError)
  })
})

import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { AgentTask } from '@toolman/shared'

vi.mock('./task-queue.service', () => ({
  enqueueTaskRun: vi.fn(),
}))

vi.mock('../store', () => ({
  getAgentTask: vi.fn(),
  getGlobalAgentTaskLock: vi.fn(),
  listAgentTasksByWorkspace: vi.fn(),
  releaseAgentTaskLock: vi.fn(),
  updateAgentTaskRecord: vi.fn(),
}))

import {
  getAgentTask,
  getGlobalAgentTaskLock,
  listAgentTasksByWorkspace,
  releaseAgentTaskLock,
  updateAgentTaskRecord,
} from '../store'
import { enqueueTaskRun } from './task-queue.service'
import {
  isTaskResumable,
  listResumableTasks,
  normalizeInterruptedTask,
  releaseStaleTaskLockOnStartup,
  resumeTaskIfNeeded,
} from './task-resume.service'

const baseTask = (): AgentTask => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  workspaceId: '00000000-0000-0000-0000-000000000002',
  title: 'Resume test',
  status: 'executing',
  retryCount: 0,
  history: [
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      kind: 'tool',
      title: 'Run',
      status: 'running',
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

describe('isTaskResumable', () => {
  it('accepts active and pending runnable tasks', () => {
    expect(isTaskResumable(baseTask())).toBe(true)
    expect(isTaskResumable({ ...baseTask(), status: 'completed' })).toBe(false)
    expect(isTaskResumable({ ...baseTask(), status: 'paused' })).toBe(false)
  })
})

describe('normalizeInterruptedTask', () => {
  beforeEach(() => {
    vi.mocked(updateAgentTaskRecord).mockReset()
  })

  it('resets running steps back to pending', () => {
    let task = baseTask()
    vi.mocked(updateAgentTaskRecord).mockImplementation((_taskId, patch) => {
      task = {
        ...task,
        ...patch,
        history: patch.history ?? task.history,
      } as AgentTask
      return task
    })

    const result = normalizeInterruptedTask(task)

    expect(result.status).toBe('pending')
    expect(result.history[0]?.status).toBe('pending')
  })
})

describe('releaseStaleTaskLockOnStartup', () => {
  beforeEach(() => {
    vi.mocked(getGlobalAgentTaskLock).mockReset()
    vi.mocked(getAgentTask).mockReset()
    vi.mocked(releaseAgentTaskLock).mockReset()
  })

  it('releases lock when holder is no longer active', () => {
    vi.mocked(getGlobalAgentTaskLock).mockReturnValue({
      taskId: baseTask().id,
      workerId: 'dead-worker',
      acquiredAt: Date.now(),
    })
    vi.mocked(getAgentTask).mockReturnValue({ ...baseTask(), status: 'completed' })

    releaseStaleTaskLockOnStartup()

    expect(releaseAgentTaskLock).toHaveBeenCalledWith(baseTask().id)
  })
})

describe('resumeTaskIfNeeded', () => {
  beforeEach(() => {
    vi.mocked(getAgentTask).mockReset()
    vi.mocked(updateAgentTaskRecord).mockReset()
    vi.mocked(enqueueTaskRun).mockReset()
  })

  it('enqueues resumable tasks', () => {
    const task = baseTask()
    vi.mocked(getAgentTask).mockReturnValue(task)
    vi.mocked(updateAgentTaskRecord).mockImplementation((_taskId, patch) => ({
      ...task,
      ...patch,
      history: patch.history ?? task.history,
    }) as AgentTask)

    expect(resumeTaskIfNeeded(task.id)).toBe(true)
    expect(enqueueTaskRun).toHaveBeenCalled()
  })

  it('skips terminal tasks', () => {
    vi.mocked(getAgentTask).mockReturnValue({ ...baseTask(), status: 'completed' })
    expect(resumeTaskIfNeeded(baseTask().id)).toBe(false)
    expect(enqueueTaskRun).not.toHaveBeenCalled()
  })
})

describe('listResumableTasks', () => {
  it('filters workspace tasks', () => {
    vi.mocked(listAgentTasksByWorkspace).mockReturnValue([
      baseTask(),
      { ...baseTask(), id: '550e8400-e29b-41d4-a716-446655440099', status: 'completed' },
    ])

    const items = listResumableTasks('00000000-0000-0000-0000-000000000002')
    expect(items).toHaveLength(1)
  })
})

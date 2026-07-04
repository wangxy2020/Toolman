import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { AgentTask } from '@toolman/shared'

vi.mock('../session-bind', () => ({
  bindTaskToSession: vi.fn(),
}))

vi.mock('../store', () => ({
  createAgentTaskRecord: vi.fn(),
  getAgentTask: vi.fn(),
  getGlobalAgentTaskLock: vi.fn(),
  listAgentTasksByAssistant: vi.fn(),
  updateAgentTaskRecord: vi.fn(),
}))

vi.mock('../task-event.service', () => ({
  emitTaskStarted: vi.fn(),
}))

vi.mock('./task-queue.service', () => ({
  enqueueTaskRun: vi.fn(),
}))

vi.mock('./task-resume.service', () => ({
  isTaskResumable: vi.fn(),
}))

import { bindTaskToSession } from '../session-bind'
import {
  createAgentTaskRecord,
  getAgentTask,
  getGlobalAgentTaskLock,
  listAgentTasksByAssistant,
  updateAgentTaskRecord,
} from '../store'
import { enqueueTaskRun } from './task-queue.service'
import { isTaskResumable } from './task-resume.service'
import { enqueuePeriodicHeartbeatTask } from './periodic-heartbeat-task'

const baseTask = (): AgentTask => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  workspaceId: '00000000-0000-0000-0000-000000000002',
  assistantId: '00000000-0000-0000-0000-000000000003',
  title: '系统心跳任务',
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
  metadata: { heartbeatPeriodic: true },
  createdAt: Date.now(),
  updatedAt: Date.now(),
})

describe('enqueuePeriodicHeartbeatTask', () => {
  beforeEach(() => {
    vi.mocked(listAgentTasksByAssistant).mockReset()
    vi.mocked(getGlobalAgentTaskLock).mockReset()
    vi.mocked(getAgentTask).mockReset()
    vi.mocked(createAgentTaskRecord).mockReset()
    vi.mocked(updateAgentTaskRecord).mockReset()
    vi.mocked(enqueueTaskRun).mockReset()
    vi.mocked(isTaskResumable).mockReturnValue(false)
  })

  it('creates and enqueues a periodic heartbeat task when idle', () => {
    const task = baseTask()
    vi.mocked(listAgentTasksByAssistant).mockReturnValue([])
    vi.mocked(getGlobalAgentTaskLock).mockReturnValue(null)
    vi.mocked(createAgentTaskRecord).mockReturnValue(task)
    vi.mocked(updateAgentTaskRecord).mockImplementation((_taskId, patch) => ({
      ...task,
      ...patch,
      metadata: patch.metadata ?? task.metadata,
    }) as AgentTask)

    expect(
      enqueuePeriodicHeartbeatTask({
        workspaceId: task.workspaceId,
        assistantId: task.assistantId!,
        sessionId: '00000000-0000-0000-0000-000000000004',
      }),
    ).toBe(true)

    expect(bindTaskToSession).toHaveBeenCalled()
    expect(enqueueTaskRun).toHaveBeenCalledWith(task.id, expect.any(Object))
  })

  it('skips when assistant already has resumable work', () => {
    const task = baseTask()
    vi.mocked(listAgentTasksByAssistant).mockReturnValue([task])
    vi.mocked(isTaskResumable).mockReturnValue(true)

    expect(
      enqueuePeriodicHeartbeatTask({
        workspaceId: task.workspaceId,
        assistantId: task.assistantId!,
        sessionId: '00000000-0000-0000-0000-000000000004',
      }),
    ).toBe(false)
  })

  it('skips when assistant holds the global lock', () => {
    const task = baseTask()
    vi.mocked(listAgentTasksByAssistant).mockReturnValue([])
    vi.mocked(getGlobalAgentTaskLock).mockReturnValue({
      taskId: task.id,
      workerId: 'worker',
      acquiredAt: Date.now(),
    })
    vi.mocked(getAgentTask).mockReturnValue(task)

    expect(
      enqueuePeriodicHeartbeatTask({
        workspaceId: task.workspaceId,
        assistantId: task.assistantId!,
        sessionId: '00000000-0000-0000-0000-000000000004',
      }),
    ).toBe(false)
  })
})

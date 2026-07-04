import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { AgentTask } from '@toolman/shared'

vi.mock('./task-queue.service', () => ({
  enqueueTaskRun: vi.fn(),
}))

vi.mock('./task-resume.service', () => ({
  isTaskResumable: vi.fn(),
  normalizeInterruptedTask: vi.fn((task: AgentTask) => task),
  resumeTaskIfNeeded: vi.fn(),
}))

vi.mock('../store', () => ({
  getAgentTask: vi.fn(),
  listAgentTasksByAssistant: vi.fn(),
  updateAgentTaskRecord: vi.fn(),
}))

vi.mock('../task-event.service', () => ({
  emitTaskResumed: vi.fn(),
}))

import { getAgentTask, listAgentTasksByAssistant, updateAgentTaskRecord } from '../store'
import { enqueueTaskRun } from './task-queue.service'
import { isTaskResumable, resumeTaskIfNeeded } from './task-resume.service'
import {
  resumePausedTaskAndSchedule,
  runTaskSchedulerTick,
  scheduleTaskIfNeeded,
} from './task-scheduler.service'

const baseTask = (): AgentTask => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  workspaceId: '00000000-0000-0000-0000-000000000002',
  assistantId: '00000000-0000-0000-0000-000000000003',
  title: 'Scheduler test',
  status: 'paused',
  retryCount: 0,
  history: [
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      kind: 'tool',
      title: 'Read',
      status: 'pending',
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
  metadata: { pausedFromStatus: 'executing' },
  createdAt: Date.now(),
  updatedAt: Date.now(),
})

describe('resumePausedTaskAndSchedule', () => {
  beforeEach(() => {
    vi.mocked(getAgentTask).mockReset()
    vi.mocked(updateAgentTaskRecord).mockReset()
    vi.mocked(isTaskResumable).mockReset()
    vi.mocked(enqueueTaskRun).mockReset()
  })

  it('resumes paused tasks and enqueues worker run', () => {
    const task = baseTask()
    vi.mocked(getAgentTask).mockReturnValue(task)
    vi.mocked(updateAgentTaskRecord).mockImplementation((_taskId, patch) => ({
      ...task,
      ...patch,
      metadata: patch.metadata ?? task.metadata,
    }) as AgentTask)
    vi.mocked(isTaskResumable).mockReturnValue(true)

    expect(resumePausedTaskAndSchedule(task.id)).toBe(true)
    expect(enqueueTaskRun).toHaveBeenCalled()
  })
})

describe('scheduleTaskIfNeeded', () => {
  beforeEach(() => {
    vi.mocked(getAgentTask).mockReset()
    vi.mocked(resumeTaskIfNeeded).mockReset()
  })

  it('delegates resumable active tasks to resumeTaskIfNeeded', () => {
    const task = { ...baseTask(), status: 'executing' as const }
    vi.mocked(getAgentTask).mockReturnValue(task)
    vi.mocked(resumeTaskIfNeeded).mockReturnValue(true)

    expect(scheduleTaskIfNeeded(task.id)).toBe(true)
    expect(resumeTaskIfNeeded).toHaveBeenCalledWith(task.id)
  })
})

describe('runTaskSchedulerTick', () => {
  beforeEach(() => {
    vi.mocked(getAgentTask).mockReset()
    vi.mocked(listAgentTasksByAssistant).mockReset()
    vi.mocked(resumeTaskIfNeeded).mockReset()
    vi.mocked(updateAgentTaskRecord).mockReset()
    vi.mocked(isTaskResumable).mockReturnValue(true)
  })

  it('schedules session-bound active tasks first', () => {
    const task = { ...baseTask(), status: 'executing' as const }
    vi.mocked(getAgentTask).mockReturnValue(task)
    vi.mocked(resumeTaskIfNeeded).mockReturnValue(true)

    const result = runTaskSchedulerTick({
      assistantId: task.assistantId!,
      sessionMetadata: { activeTaskId: task.id },
    })

    expect(result).toBe('scheduled')
    expect(resumeTaskIfNeeded).toHaveBeenCalledWith(task.id)
  })

  it('returns idle when no tasks need scheduling', () => {
    vi.mocked(getAgentTask).mockReturnValue(null)
    vi.mocked(listAgentTasksByAssistant).mockReturnValue([])

    expect(
      runTaskSchedulerTick({
        assistantId: '00000000-0000-0000-0000-000000000003',
      }),
    ).toBe('idle')
  })
})

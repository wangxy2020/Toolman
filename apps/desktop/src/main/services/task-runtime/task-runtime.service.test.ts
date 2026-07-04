import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AgentTask } from '@toolman/shared'

const harness = vi.hoisted(() => ({
  createdTask: null as AgentTask | null,
}))

vi.mock('./store', () => ({
  createAgentTaskRecord: vi.fn((input: Record<string, unknown>) => {
    const task: AgentTask = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      workspaceId: String(input.workspaceId),
      assistantId: input.assistantId as string | undefined,
      sessionId: input.sessionId as string | undefined,
      title: String(input.title),
      goal: String(input.goal ?? input.title),
      status: 'pending',
      plannerModelId: String(input.plannerModelId),
      executorModelId: String(input.executorModelId),
      retryCount: 0,
      history: [],
      budget: input.budget as AgentTask['budget'],
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    harness.createdTask = task
    return task
  }),
  updateAgentTaskRecord: vi.fn((taskId: string, patch: { metadata?: Record<string, unknown> }) => {
    if (!harness.createdTask || harness.createdTask.id !== taskId) {
      throw new Error('task not found')
    }
    harness.createdTask = {
      ...harness.createdTask,
      ...patch,
      metadata: { ...harness.createdTask.metadata, ...patch.metadata },
    }
    return harness.createdTask
  }),
  getAgentTask: vi.fn(),
  listAgentTasksByAssistant: vi.fn(),
  listAgentTasksBySession: vi.fn(),
  listAgentTasksByWorkspace: vi.fn(),
  cancelAgentTask: vi.fn(),
  releaseAgentTaskLock: vi.fn(),
}))

vi.mock('./session-bind', () => ({
  bindTaskToSession: vi.fn(),
  clearStaleTerminalSessionBinding: vi.fn(),
  unbindTaskFromSession: vi.fn(),
}))

vi.mock('./task-event.service', () => ({
  emitTaskStarted: vi.fn(),
  emitTaskFinished: vi.fn(),
  emitTaskPaused: vi.fn(),
  emitTaskResumed: vi.fn(),
}))

vi.mock('../assistant.service', () => ({
  getAssistantRow: vi.fn((assistantId: string) => ({
    id: assistantId,
    workspaceId: '00000000-0000-0000-0000-000000000002',
    parametersJson: JSON.stringify({ workingDirectory: '/tmp/toolman-project' }),
  })),
}))

vi.mock('../../db/repos', () => ({
  getSessionRepository: vi.fn(() => ({
    findRowById: vi.fn(() => ({
      id: 'session-1',
      workspaceId: '00000000-0000-0000-0000-000000000002',
    })),
  })),
}))

vi.mock('./task-workspace.service', () => ({
  buildTaskWorkingDirectoryMetadata: vi.fn(() => ({
    resolvedWorkingDirectory: '/tmp/toolman-project',
  })),
  TASK_RESOLVED_WORKING_DIRECTORY_KEY: 'resolvedWorkingDirectory',
  TASK_WORKING_DIRECTORY_WARNING_KEY: 'taskWorkingDirectoryWarning',
}))

import { createTask } from './task-runtime.service'
import { updateAgentTaskRecord } from './store'
import {
  buildTaskWorkingDirectoryMetadata,
  TASK_RESOLVED_WORKING_DIRECTORY_KEY,
} from './task-workspace.service'

describe('task-runtime.service', () => {
  beforeEach(() => {
    harness.createdTask = null
    vi.mocked(buildTaskWorkingDirectoryMetadata).mockClear()
    vi.mocked(updateAgentTaskRecord).mockClear()
  })

  it('stores resolved working directory metadata when creating a task', () => {
    const task = createTask({
      workspaceId: '00000000-0000-0000-0000-000000000002',
      assistantId: '00000000-0000-0000-0000-000000000003',
      sessionId: '00000000-0000-0000-0000-000000000010',
      title: 'Metadata test',
      goal: 'Verify working directory metadata',
    })

    expect(buildTaskWorkingDirectoryMetadata).toHaveBeenCalled()
    expect(task.metadata[TASK_RESOLVED_WORKING_DIRECTORY_KEY]).toBe('/tmp/toolman-project')
  })
})

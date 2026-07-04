import { mkdtempSync, readFileSync, rmSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { AgentTask } from '@toolman/shared'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/toolman-electron-test',
  },
}))

vi.mock('./task-stream-broadcast', () => ({
  broadcastTaskEvent: vi.fn(),
}))

vi.mock('../stream-broadcast', () => ({
  broadcastSessionMessagesReload: vi.fn(),
}))

vi.mock('./session-bind', () => ({
  unbindTaskFromSession: vi.fn(),
}))

vi.mock('../../db/repos', () => ({
  getSessionRepository: vi.fn(),
}))

import { broadcastSessionMessagesReload } from '../stream-broadcast'
import { unbindTaskFromSession } from './session-bind'
import { emitTaskFinished, emitTaskStarted, readTaskEventsFromLog } from './task-event.service'
import { ensureTaskWorkspaceLayout } from './task-workspace.service'

describe('task-event.service', () => {
  beforeEach(() => {
    vi.mocked(unbindTaskFromSession).mockReset()
    vi.mocked(broadcastSessionMessagesReload).mockReset()
  })

  it('unbinds session when task finishes', () => {
    const sessionId = '00000000-0000-0000-0000-000000000001'
    const task: AgentTask = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      workspaceId: '00000000-0000-0000-0000-000000000002',
      sessionId,
      title: 'Finished task',
      status: 'failed',
      retryCount: 0,
      history: [],
      budget: {
        preset: 'local',
        maxPlannerTokens: 32000,
        maxExecutorTokensPerStep: 16000,
        maxReflectionTokens: 8000,
        maxTotalTokens: 500000,
        maxSteps: 50,
        used: { planner: 0, executor: 0, reflection: 0, total: 0 },
      },
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    vi.mocked(unbindTaskFromSession).mockReturnValue(true)

    emitTaskFinished(task, 'failed')

    expect(unbindTaskFromSession).toHaveBeenCalledWith(sessionId, task.id)
    expect(broadcastSessionMessagesReload).not.toHaveBeenCalled()
  })

  it('appends and lists task events from jsonl log', () => {
    const dir = mkdtempSync(join(tmpdir(), 'toolman-task-event-'))
    const task: AgentTask = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      workspaceId: '00000000-0000-0000-0000-000000000002',
      title: 'Event task',
      status: 'pending',
      retryCount: 0,
      history: [],
      budget: {
        preset: 'local',
        maxPlannerTokens: 32000,
        maxExecutorTokensPerStep: 16000,
        maxReflectionTokens: 8000,
        maxTotalTokens: 500000,
        maxSteps: 50,
        used: { planner: 0, executor: 0, reflection: 0, total: 0 },
      },
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
      workspaceRoot: join(dir, 'task-root'),
    }

    try {
      ensureTaskWorkspaceLayout(task.workspaceRoot!)
      emitTaskStarted(task)

      const logPath = join(task.workspaceRoot!, 'logs', 'events.jsonl')
      expect(readFileSync(logPath, 'utf8')).toContain('task.started')

      const listed = readTaskEventsFromLog(task, 10)
      expect(listed).toHaveLength(1)
      expect(listed[0]?.type).toBe('task.started')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('filters events by task id when log contains mixed entries', () => {
    const dir = mkdtempSync(join(tmpdir(), 'toolman-task-event-mixed-'))
    const taskA: AgentTask = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      workspaceId: '00000000-0000-0000-0000-000000000002',
      title: 'Scan folder',
      status: 'failed',
      retryCount: 0,
      history: [],
      budget: {
        preset: 'local',
        maxPlannerTokens: 32000,
        maxExecutorTokensPerStep: 16000,
        maxReflectionTokens: 8000,
        maxTotalTokens: 500000,
        maxSteps: 50,
        used: { planner: 0, executor: 0, reflection: 0, total: 0 },
      },
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
      workspaceRoot: join(dir, 'task-root'),
    }
    const taskBId = '550e8400-e29b-41d4-a716-446655440002'

    try {
      ensureTaskWorkspaceLayout(taskA.workspaceRoot!)
      emitTaskStarted({
        ...taskA,
        title: 'How to test agent',
      })
      const logPath = join(taskA.workspaceRoot!, 'logs', 'events.jsonl')
      const foreignEvent = {
        type: 'task.started',
        taskId: taskBId,
        workspaceId: taskA.workspaceId,
        timestamp: Date.now(),
        title: 'Foreign task',
        status: 'pending',
      }
      appendFileSync(logPath, `${JSON.stringify(foreignEvent)}\n`, 'utf8')

      const listed = readTaskEventsFromLog(taskA, 10)
      expect(listed).toHaveLength(1)
      expect(listed[0]?.taskId).toBe(taskA.id)
      expect(listed[0]).toMatchObject({ title: 'How to test agent' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

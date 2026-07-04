import { describe, expect, it } from 'vitest'

import type { AgentTask } from '@toolman/shared'

import {
  filterTasksByTab,
  filterTasksForActiveTab,
  formatTaskEventTime,
  buildTaskTimelineEvents,
  getTaskDisplayProgress,
  getTaskEventCssModifier,
  getTaskEventNodeTone,
  getTaskStepProgress,
  getTaskWorkingDirectoryWarning,
  getTaskResolvedWorkingDirectory,
  pickPreferredTaskId,
  resolveEffectiveSessionActiveTaskId,
  resolveLatestMessageTaskId,
  sortTasksForDisplay,
} from './task-panel-utils'

const task = (patch: Partial<AgentTask>): AgentTask => ({
  id: patch.id ?? '550e8400-e29b-41d4-a716-446655440000',
  workspaceId: '00000000-0000-0000-0000-000000000002',
  title: patch.title ?? 'Task',
  status: patch.status ?? 'pending',
  retryCount: 0,
  history: patch.history ?? [],
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
  createdAt: 1,
  updatedAt: patch.updatedAt ?? 1,
  ...patch,
})

describe('task-panel-utils', () => {
  it('filters active and done tasks', () => {
    const tasks = [
      task({ id: '550e8400-e29b-41d4-a716-446655440001', status: 'executing' }),
      task({ id: '550e8400-e29b-41d4-a716-446655440002', status: 'completed' }),
      task({ id: '550e8400-e29b-41d4-a716-446655440003', status: 'cancelled' }),
    ]

    expect(filterTasksByTab(tasks, 'active')).toHaveLength(1)
    expect(filterTasksByTab(tasks, 'done')).toHaveLength(2)
  })

  it('shows latest ended task on active tab when nothing is running', () => {
    const tasks = [
      task({ id: '550e8400-e29b-41d4-a716-446655440001', status: 'failed', updatedAt: 10 }),
      task({ id: '550e8400-e29b-41d4-a716-446655440002', status: 'completed', updatedAt: 20 }),
    ]

    const activeTab = filterTasksByTab(tasks, 'active')
    expect(activeTab).toHaveLength(1)
    expect(activeTab[0]?.id).toBe('550e8400-e29b-41d4-a716-446655440002')
  })

  it('shows focused task on active tab when nothing is running', () => {
    const tasks = [
      task({ id: '550e8400-e29b-41d4-a716-446655440001', status: 'failed', updatedAt: 10 }),
      task({ id: '550e8400-e29b-41d4-a716-446655440002', status: 'failed', updatedAt: 20 }),
    ]

    const activeTab = filterTasksForActiveTab(tasks, '550e8400-e29b-41d4-a716-446655440001')
    expect(activeTab).toHaveLength(1)
    expect(activeTab[0]?.id).toBe('550e8400-e29b-41d4-a716-446655440001')
  })

  it('prefers non-terminal session binding over stale terminal tasks', () => {
    const tasks = [
      task({
        id: '550e8400-e29b-41d4-a716-446655440001',
        status: 'failed',
        updatedAt: 100,
      }),
      task({
        id: '550e8400-e29b-41d4-a716-446655440002',
        status: 'executing',
        updatedAt: 10,
      }),
    ]

    expect(
      pickPreferredTaskId(tasks, {
        sessionActiveTaskId: '550e8400-e29b-41d4-a716-446655440002',
      }),
    ).toBe('550e8400-e29b-41d4-a716-446655440002')
    expect(
      pickPreferredTaskId(tasks, {
        sessionActiveTaskId: '550e8400-e29b-41d4-a716-446655440001',
      }),
    ).toBe('550e8400-e29b-41d4-a716-446655440002')
  })

  it('prefers latest message task id over stale terminal tasks', () => {
    const tasks = [
      task({
        id: '550e8400-e29b-41d4-a716-446655440001',
        status: 'failed',
        updatedAt: 100,
      }),
      task({
        id: '550e8400-e29b-41d4-a716-446655440003',
        status: 'executing',
        updatedAt: 5,
      }),
    ]

    expect(
      pickPreferredTaskId(tasks, {
        latestMessageTaskId: '550e8400-e29b-41d4-a716-446655440003',
      }),
    ).toBe('550e8400-e29b-41d4-a716-446655440003')
    expect(
      pickPreferredTaskId(tasks, {
        latestMessageTaskId: '550e8400-e29b-41d4-a716-446655440003',
        sessionActiveTaskId: '550e8400-e29b-41d4-a716-446655440001',
      }),
    ).toBe('550e8400-e29b-41d4-a716-446655440003')
  })

  it('reads latest task id from session messages', () => {
    expect(
      resolveLatestMessageTaskId([
        { role: 'user', metadata: { taskId: '550e8400-e29b-41d4-a716-446655440001' } },
        { role: 'assistant', metadata: null },
        { role: 'user', metadata: { taskId: '550e8400-e29b-41d4-a716-446655440002' } },
      ]),
    ).toBe('550e8400-e29b-41d4-a716-446655440002')
  })

  it('ignores stale task ids after regular chat messages', () => {
    expect(
      resolveLatestMessageTaskId([
        { role: 'user', metadata: { taskId: '550e8400-e29b-41d4-a716-446655440001' } },
        { role: 'assistant', metadata: null },
        { role: 'user', metadata: null },
        { role: 'assistant', metadata: null },
      ]),
    ).toBeNull()
  })

  it('ignores terminal session binding for badge resolution', () => {
    const tasks = [
      task({ id: '550e8400-e29b-41d4-a716-446655440001', status: 'failed' }),
    ]

    expect(
      resolveEffectiveSessionActiveTaskId('550e8400-e29b-41d4-a716-446655440001', tasks),
    ).toBeNull()
  })

  it('sorts active tasks before completed tasks', () => {
    const tasks = [
      task({ id: '550e8400-e29b-41d4-a716-446655440001', status: 'completed', updatedAt: 10 }),
      task({ id: '550e8400-e29b-41d4-a716-446655440002', status: 'executing', updatedAt: 1 }),
    ]

    const sorted = sortTasksForDisplay(tasks)
    expect(sorted[0]?.status).toBe('executing')
  })

  it('computes tool step progress', () => {
    const progress = getTaskStepProgress(
      task({
        history: [
          {
            id: '550e8400-e29b-41d4-a716-446655440010',
            kind: 'tool',
            title: 'A',
            status: 'completed',
            retryCount: 0,
          },
          {
            id: '550e8400-e29b-41d4-a716-446655440011',
            kind: 'tool',
            title: 'B',
            status: 'pending',
            retryCount: 0,
          },
        ],
      }),
    )

    expect(progress).toEqual({ completed: 1, total: 2 })
  })

  it('computes display progress from full history', () => {
    const progress = getTaskDisplayProgress(
      task({
        history: [
          {
            id: '550e8400-e29b-41d4-a716-446655440010',
            kind: 'read',
            title: 'Plan',
            status: 'completed',
            retryCount: 0,
          },
          {
            id: '550e8400-e29b-41d4-a716-446655440011',
            kind: 'tool',
            title: 'B',
            status: 'completed',
            retryCount: 0,
          },
          {
            id: '550e8400-e29b-41d4-a716-446655440012',
            kind: 'tool',
            title: 'C',
            status: 'pending',
            retryCount: 0,
          },
        ],
      }),
    )

    expect(progress).toEqual({ completed: 2, total: 3 })
  })

  it('maps event types to timeline node tones', () => {
    expect(
      getTaskEventNodeTone({
        type: 'task.tool.finished',
        taskId: 't',
        workspaceId: 'w',
        timestamp: 1,
        toolName: 'fs_read',
        success: false,
      }),
    ).toBe('failure')
    expect(
      getTaskEventNodeTone({
        type: 'task.retry',
        taskId: 't',
        workspaceId: 'w',
        timestamp: 1,
        retryCount: 2,
      }),
    ).toBe('warning')
  })

  it('formats event timestamps and css modifiers', () => {
    expect(getTaskEventCssModifier('task.tool.started')).toBe('task-tool-started')
    expect(formatTaskEventTime(Date.UTC(2026, 0, 1, 8, 30, 45))).toMatch(/\d/)
  })

  it('builds timeline from task history when event log is sparse', () => {
    const sampleTask = task({
      status: 'failed',
      history: [
        {
          id: 'step-1',
          kind: 'tool',
          title: 'fs_write',
          status: 'completed',
          retryCount: 0,
          startedAt: 10,
          finishedAt: 20,
        },
      ],
    })

    const events = buildTaskTimelineEvents(
      [
        {
          type: 'task.started',
          taskId: sampleTask.id,
          workspaceId: sampleTask.workspaceId,
          timestamp: 1,
          title: sampleTask.title,
          status: 'pending',
        },
        {
          type: 'task.finished',
          taskId: sampleTask.id,
          workspaceId: sampleTask.workspaceId,
          timestamp: 30,
          status: 'failed',
        },
      ],
      sampleTask,
    )

    expect(events.some((event) => event.type === 'task.step.started')).toBe(true)
    expect(events.some((event) => event.type === 'task.tool.finished')).toBe(true)
  })

  it('reads working directory metadata from task', () => {
    const withDirectory = task({
      metadata: {
        resolvedWorkingDirectory: '/Users/demo/project',
        taskWorkingDirectoryWarning: '未设置工作目录',
      },
    })

    expect(getTaskResolvedWorkingDirectory(withDirectory)).toBe('/Users/demo/project')
    expect(getTaskWorkingDirectoryWarning(withDirectory)).toBe('未设置工作目录')
  })
})

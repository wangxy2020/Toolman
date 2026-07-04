import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { AgentTask } from '@toolman/shared'

const { chatComplete } = vi.hoisted(() => ({
  chatComplete: vi.fn(),
}))

vi.mock('@toolman/model-gateway', () => ({
  createModelGateway: () => ({ chatComplete }),
  ProviderError: class ProviderError extends Error {
    name = 'ProviderError'
  },
}))

vi.mock('../../provider.service', () => ({
  getProviderConfig: vi.fn(() => ({ type: 'openai', baseUrl: 'http://localhost', apiKey: 'test' })),
  parseModelId: vi.fn(() => ({ providerId: 'openai', model: 'gpt-test' })),
}))

vi.mock('../artifact.service', () => ({
  listTaskArtifacts: vi.fn(() => ({ items: [] })),
}))

vi.mock('../store', () => ({
  getAgentTask: vi.fn(),
  updateAgentTaskRecord: vi.fn(),
  replaceTaskPendingSteps: vi.fn(),
  tryAcquireAgentTaskLock: vi.fn(),
  releaseAgentTaskLock: vi.fn(),
}))

vi.mock('../task-event.service', () => ({
  emitTaskReflection: vi.fn(),
  emitTaskFinished: vi.fn(),
}))

import { getAgentTask, tryAcquireAgentTaskLock, updateAgentTaskRecord } from '../store'
import { emitTaskFinished } from '../task-event.service'
import { runTaskReflection } from './reflection.service'

const baseTask = (): AgentTask => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  workspaceId: '00000000-0000-0000-0000-000000000002',
  title: 'Reflection test',
  goal: '完成示例任务',
  status: 'executing',
  plannerModelId: 'openai:gpt-test',
  retryCount: 0,
  history: [
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      kind: 'tool',
      title: 'Write file',
      status: 'completed',
      input: { toolName: 'fs_write', argsJson: '{"path":"hello.txt","content":"hi"}' },
      output: { text: '已写入文件: hello.txt\n文件包含 2 字节有效内容。' },
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

describe('runTaskReflection', () => {
  beforeEach(() => {
    chatComplete.mockReset()
    vi.mocked(getAgentTask).mockReset()
    vi.mocked(updateAgentTaskRecord).mockReset()
    vi.mocked(tryAcquireAgentTaskLock).mockReturnValue(true)
    vi.mocked(emitTaskFinished).mockReset()
  })

  it('marks task completed on pass verdict', async () => {
    let task = baseTask()
    vi.mocked(getAgentTask).mockImplementation(() => ({ ...task, history: [...task.history] }))
    vi.mocked(updateAgentTaskRecord).mockImplementation((_id, patch) => {
      task = { ...task, ...patch, history: patch.history ?? task.history } as AgentTask
      return { ...task }
    })

    chatComplete.mockResolvedValueOnce({
      content: JSON.stringify({ verdict: 'pass', reason: '目标已完成', summary: 'done' }),
      usage: { total: 80 },
    })

    const result = await runTaskReflection({ taskId: task.id })

    expect(result.verdict).toBe('pass')
    expect(result.task.status).toBe('completed')
    expect(emitTaskFinished).toHaveBeenCalled()
  })

  it('completes task on continue verdict when no pending steps remain', async () => {
    let task = baseTask()
    vi.mocked(getAgentTask).mockImplementation(() => ({ ...task, history: [...task.history] }))
    vi.mocked(updateAgentTaskRecord).mockImplementation((_id, patch) => {
      task = { ...task, ...patch, history: patch.history ?? task.history } as AgentTask
      return { ...task }
    })

    chatComplete.mockResolvedValueOnce({
      content: JSON.stringify({ verdict: 'continue', reason: '还需后续步骤' }),
    })

    const result = await runTaskReflection({ taskId: task.id })

    expect(result.verdict).toBe('pass')
    expect(result.task.status).toBe('completed')
    expect(emitTaskFinished).toHaveBeenCalled()
  })

  it('keeps task pending on continue verdict when pending tool steps remain', async () => {
    let task = baseTask()
    task.history.push({
      id: '550e8400-e29b-41d4-a716-446655440002',
      kind: 'tool',
      title: 'Next step',
      status: 'pending',
      input: { toolName: 'fs_write', argsJson: '{}' },
      retryCount: 0,
    })
    vi.mocked(getAgentTask).mockImplementation(() => ({ ...task, history: [...task.history] }))
    vi.mocked(updateAgentTaskRecord).mockImplementation((_id, patch) => {
      task = { ...task, ...patch, history: patch.history ?? task.history } as AgentTask
      return { ...task }
    })

    chatComplete.mockResolvedValueOnce({
      content: JSON.stringify({ verdict: 'continue', reason: '还需后续步骤' }),
    })

    const result = await runTaskReflection({ taskId: task.id })

    expect(result.verdict).toBe('pass')
    expect(result.task.status).toBe('pending')
    expect(emitTaskFinished).not.toHaveBeenCalled()
  })

  it('falls back to fail when reflection JSON is invalid and output is not verifiable', async () => {
    let task = baseTask()
    task.history = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        kind: 'tool',
        title: 'Write file',
        status: 'completed',
        input: { toolName: 'fs_write', argsJson: '{}' },
        output: { text: 'ok' },
        retryCount: 0,
      },
    ]
    vi.mocked(getAgentTask).mockImplementation(() => ({ ...task, history: [...task.history] }))
    vi.mocked(updateAgentTaskRecord).mockImplementation((_id, patch) => {
      task = { ...task, ...patch, history: patch.history ?? task.history } as AgentTask
      return { ...task }
    })

    chatComplete.mockResolvedValueOnce({
      content: 'not valid json',
      usage: { total: 40 },
    })

    const result = await runTaskReflection({ taskId: task.id })

    expect(result.verdict).toBe('fail')
    expect(result.task.status).toBe('failed')
  })

  it('falls back to pass when reflection JSON is invalid but tool output is verifiable', async () => {
    let task = baseTask()
    vi.mocked(getAgentTask).mockImplementation(() => ({ ...task, history: [...task.history] }))
    vi.mocked(updateAgentTaskRecord).mockImplementation((_id, patch) => {
      task = { ...task, ...patch, history: patch.history ?? task.history } as AgentTask
      return { ...task }
    })

    chatComplete.mockResolvedValueOnce({
      content: 'not valid json',
      usage: { total: 40 },
    })

    const result = await runTaskReflection({ taskId: task.id })

    expect(result.verdict).toBe('pass')
    expect(result.task.status).toBe('completed')
  })
})

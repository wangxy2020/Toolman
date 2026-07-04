import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { AgentTask, TaskPlan } from '@toolman/shared'

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

vi.mock('../store', () => ({
  getAgentTask: vi.fn(),
  updateAgentTaskRecord: vi.fn(),
  replaceTaskPendingSteps: vi.fn(),
  tryAcquireAgentTaskLock: vi.fn(),
  releaseAgentTaskLock: vi.fn(),
}))

vi.mock('../executor/executor.service', () => ({
  runTaskExecutor: vi.fn(),
}))

vi.mock('../task-event.service', () => ({
  emitTaskFinished: vi.fn(),
}))

vi.mock('./planner-tool-utils', () => ({
  buildPlannerAvailableToolsHint: vi.fn(() => ''),
  normalizePlannerToolName: (name: string) => name,
  normalizePlannerToolArgs: (_toolName: string, args: Record<string, unknown>) => args,
  normalizePlannerToolStep: (toolName: string, argsJson: string) => ({ toolName, argsJson }),
  isUnsupportedPlannerTool: () => false,
}))

import { getAgentTask, replaceTaskPendingSteps, tryAcquireAgentTaskLock, updateAgentTaskRecord } from '../store'
import { runTaskExecutor } from '../executor/executor.service'
import { runTaskPlanner } from './planner.service'

const samplePlan: TaskPlan = {
  goal: '写入 hello.txt',
  summary: '创建示例文件',
  steps: [
    {
      kind: 'tool',
      title: '写入文件',
      tool: {
        toolName: 'fs_write',
        argsJson: JSON.stringify({ path: 'hello.txt', content: 'hi' }),
      },
    },
  ],
}

const baseTask = (): AgentTask => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  workspaceId: '00000000-0000-0000-0000-000000000002',
  assistantId: '00000000-0000-0000-0000-000000000003',
  title: 'Planner test',
  goal: '写入 hello.txt',
  status: 'pending',
  plannerModelId: 'openai:gpt-test',
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

describe('runTaskPlanner', () => {
  beforeEach(() => {
    chatComplete.mockReset()
    vi.mocked(getAgentTask).mockReset()
    vi.mocked(updateAgentTaskRecord).mockReset()
    vi.mocked(replaceTaskPendingSteps).mockReset()
    vi.mocked(tryAcquireAgentTaskLock).mockReturnValue(true)
    vi.mocked(runTaskExecutor).mockReset()
  })

  it('parses LLM output and persists pending steps', async () => {
    let task = baseTask()
    vi.mocked(getAgentTask).mockImplementation(() => ({ ...task, history: [...task.history] }))
    vi.mocked(updateAgentTaskRecord).mockImplementation((_id, patch) => {
      task = { ...task, ...patch, history: patch.history ?? task.history } as AgentTask
      return { ...task }
    })
    vi.mocked(replaceTaskPendingSteps).mockImplementation((_id, steps) => {
      task = { ...task, history: steps }
      return { ...task }
    })

    chatComplete.mockResolvedValueOnce({
      content: JSON.stringify(samplePlan),
      usage: { total: 120 },
    })

    const result = await runTaskPlanner({ taskId: task.id })

    expect(result.status).toBe('pending')
    expect(result.history).toHaveLength(1)
    expect(chatComplete).toHaveBeenCalledTimes(1)
    expect(replaceTaskPendingSteps).toHaveBeenCalledTimes(1)
    const persistedSteps = vi.mocked(replaceTaskPendingSteps).mock.calls[0]?.[1]
    expect(persistedSteps?.[0]?.kind).toBe('tool')
    expect(persistedSteps?.[0]?.input).toMatchObject({ toolName: 'fs_write' })
  })

  it('can chain executor when execute=true', async () => {
    const task = baseTask()
    vi.mocked(getAgentTask).mockReturnValue({ ...task })
    vi.mocked(updateAgentTaskRecord).mockImplementation((_id, patch) => ({ ...task, ...patch, history: patch.history ?? task.history }) as AgentTask)
    vi.mocked(replaceTaskPendingSteps).mockImplementation((_id, steps) => ({ ...task, history: steps }))
    vi.mocked(runTaskExecutor).mockResolvedValueOnce({ ...task, status: 'completed' })

    chatComplete.mockResolvedValueOnce({ content: JSON.stringify(samplePlan), usage: { total: 50 } })

    const result = await runTaskPlanner({ taskId: task.id, execute: true })

    expect(runTaskExecutor).toHaveBeenCalledWith({ taskId: task.id, workerId: expect.any(String) }, expect.any(Object))
    expect(result.status).toBe('completed')
  })
})

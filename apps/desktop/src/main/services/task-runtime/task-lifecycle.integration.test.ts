import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createInMemoryAgentTaskRepository,
  type InMemoryAgentTaskRepository,
} from './testing/in-memory-agent-task.repository'

const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002'
const DEFAULT_ASSISTANT_ID = '00000000-0000-0000-0000-000000000003'

const harness = vi.hoisted(() => ({
  tempUserData: '',
  repo: null as InMemoryAgentTaskRepository | null,
  chatCompleteResponses: [] as string[],
  toolCallCount: 0,
}))

const { chatComplete } = vi.hoisted(() => ({
  chatComplete: vi.fn(async () => {
    const next = harness.chatCompleteResponses.shift()
    if (!next) {
      throw new Error('integration test: no chatComplete mock response queued')
    }
    return { content: next, usage: { total: 12, prompt: 8, completion: 4 } }
  }),
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return harness.tempUserData
      return join(harness.tempUserData, name)
    },
    getVersion: () => '0.2.0-test',
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
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

vi.mock('../../bootstrap/database', () => ({
  getDatabase: () => ({}),
}))

vi.mock('@toolman/model-gateway', () => ({
  createModelGateway: () => ({ chatComplete }),
  ProviderError: class ProviderError extends Error {
    name = 'ProviderError'
  },
}))

vi.mock('../provider.service', () => ({
  getProviderConfig: vi.fn(() => ({
    type: 'openai',
    baseUrl: 'http://localhost',
    apiKey: 'test',
  })),
  parseModelId: vi.fn(() => ({
    providerId: '00000000-0000-0000-0000-000000000004',
    model: 'gemma4:latest',
  })),
}))

vi.mock('../assistant.service', () => ({
  getAssistantRow: vi.fn((assistantId: string) => ({
    id: assistantId,
    workspaceId: DEFAULT_WORKSPACE_ID,
    modelId: '00000000-0000-0000-0000-000000000004:gemma4:latest',
    parametersJson: JSON.stringify({ workingDirectory: harness.tempUserData }),
  })),
}))

vi.mock('../mcp-server-config.service', () => ({
  getMcpServer: vi.fn((serverId: string) => ({
    id: serverId,
    enabled: true,
    type: 'builtin',
    builtinId: serverId,
  })),
  filterEnabledMcpServerIds: vi.fn((ids: string[]) => ids),
}))

vi.mock('../mcp-client-manager.service', () => ({
  getMcpClientState: vi.fn(() => null),
  ensureMcpServersConnected: vi.fn(async () => undefined),
}))

vi.mock('../workspace.service', () => ({
  getWorkspace: vi.fn(() => null),
}))

vi.mock('./task-workspace.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./task-workspace.service')>()
  return {
    ...actual,
    buildTaskWorkspacePatch: vi.fn((task: { id: string }) => ({
      workspaceRoot: join(harness.tempUserData, 'toolman', 'tasks', task.id),
      metadata: {},
    })),
  }
})

vi.mock('./artifact.service', () => ({
  listTaskArtifacts: vi.fn(() => ({ items: [] })),
}))

vi.mock('./task-event.service', () => ({
  emitTaskStarted: vi.fn(),
  emitTaskFinished: vi.fn(),
  emitTaskPaused: vi.fn(),
  emitTaskResumed: vi.fn(),
  emitTaskRetry: vi.fn(),
  emitTaskReflection: vi.fn(),
  emitTaskStepStarted: vi.fn(),
  emitTaskEvent: vi.fn(),
}))

vi.mock('./snapshot', () => ({
  syncTaskSnapshotFromDb: vi.fn(),
}))

vi.mock('./executor/tool-runner', () => ({
  runTaskTool: vi.fn(async () => {
    harness.toolCallCount += 1
    if (harness.toolCallCount === 1) {
      throw new Error('simulated tool failure')
    }
    return { output: 'tool ok' }
  }),
}))

function queuePlannerPlan(): void {
  harness.chatCompleteResponses.push(
    JSON.stringify({
      goal: 'Integration lifecycle',
      summary: 'Three-step plan',
      steps: [
        {
          kind: 'tool',
          title: 'Write step 1',
          tool: {
            toolName: 'fs_write',
            argsJson: JSON.stringify({ path: 'step1.txt', content: 'one' }),
          },
        },
        {
          kind: 'tool',
          title: 'Write step 2',
          tool: {
            toolName: 'fs_write',
            argsJson: JSON.stringify({ path: 'step2.txt', content: 'two' }),
          },
        },
        {
          kind: 'tool',
          title: 'Write step 3',
          tool: {
            toolName: 'fs_write',
            argsJson: JSON.stringify({ path: 'step3.txt', content: 'three' }),
          },
        },
      ],
    }),
  )
}

function queueReflectionResponses(): void {
  harness.chatCompleteResponses.push(
    JSON.stringify({
      verdict: 'pass',
      reason: 'All required steps completed.',
      summary: 'task complete',
    }),
  )
}

describe('task lifecycle integration', () => {
  beforeEach(() => {
    harness.repo = createInMemoryAgentTaskRepository()
    harness.tempUserData = mkdtempSync(join(tmpdir(), 'toolman-task-lifecycle-'))
    harness.chatCompleteResponses = []
    harness.toolCallCount = 0
    chatComplete.mockClear()
  })

  afterEach(() => {
    rmSync(harness.tempUserData, { recursive: true, force: true })
    harness.repo = null
  })

  it('runs plan → tool failure/retry → reflection on last step → complete', async () => {
    queuePlannerPlan()
    queueReflectionResponses()

    const { createAgentTaskRecord } = await import('./store')
    const { runTaskOrchestrator } = await import('./orchestrator/orchestrator.service')
    const { runTaskTool } = await import('./executor/tool-runner')

    const task = createAgentTaskRecord({
      workspaceId: DEFAULT_WORKSPACE_ID,
      assistantId: DEFAULT_ASSISTANT_ID,
      title: 'Integration lifecycle task',
      goal: 'Exercise plan, retry, replan, and completion',
      plannerModelId: '00000000-0000-0000-0000-000000000004:gemma4:latest',
      executorModelId: '00000000-0000-0000-0000-000000000004:gemma4:latest',
    })

    const result = await runTaskOrchestrator({ taskId: task.id, workerId: 'integration-worker' })

    expect(result.status).toBe('completed')
    expect(result.retryCount).toBeGreaterThanOrEqual(1)
    expect(result.history.filter((step) => step.status === 'completed').length).toBeGreaterThanOrEqual(3)
    expect(harness.toolCallCount).toBeGreaterThanOrEqual(4)
    expect(vi.mocked(runTaskTool).mock.calls.length).toBeGreaterThanOrEqual(4)
    expect(chatComplete).toHaveBeenCalled()
  })
})

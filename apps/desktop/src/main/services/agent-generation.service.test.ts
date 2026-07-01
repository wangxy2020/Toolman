import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContentBlock } from '@toolman/shared'

const {
  chatStream,
  messagesUpdate,
  messagesUpdateStreamBlocks,
  broadcastStreamEvent,
} = vi.hoisted(() => ({
  chatStream: vi.fn(),
  messagesUpdate: vi.fn(),
  messagesUpdateStreamBlocks: vi.fn(),
  broadcastStreamEvent: vi.fn(),
}))

vi.mock('@toolman/model-gateway', () => ({
  createModelGateway: () => ({ chatStream }),
  ProviderError: class ProviderError extends Error {
    retryable = false
  },
  providerSupportsOpenAiVision: () => true,
  isGemmaThinkingOllamaModelId: () => false,
}))

vi.mock('./provider.service', () => ({
  getProviderConfig: () => ({
    type: 'openai',
    apiKey: 'test-key',
    baseUrl: 'http://localhost:9999',
  }),
  parseModelId: () => ({ providerId: 'openai', model: 'gpt-4o-mini' }),
}))

vi.mock('../db/repos', () => ({
  getMessageRepository: () => ({
    listCompletedRows: () => [],
    update: messagesUpdate,
    updateStreamBlocks: messagesUpdateStreamBlocks,
  }),
}))

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/toolman-test-userdata' },
}))

vi.mock('./agent-runtime.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./agent-runtime.service')>()
  return {
    ...actual,
    loadSoulMd: () => '',
    buildMemorySystemHint: async () => '',
    buildSkillsSystemHint: () => '',
    buildWebSearchSystemHint: () => '',
    buildKnowledgeSystemHint: async () => '',
  }
})

vi.mock('./memory.service', () => ({
  listRelevantMemories: async () => [],
}))

vi.mock('./skills-facade.service', () => ({
  getDefaultSkillIds: () => [],
}))

vi.mock('./workspace.service', () => ({
  getWorkspace: ({ id }: { id: string }) => ({
    id,
    settings: { folderPath: '/tmp/toolman-test-workspace' },
  }),
}))

vi.mock('./stream-broadcast', () => ({
  broadcastStreamEvent,
}))

vi.mock('./session.service', () => ({
  getSession: () => null,
}))

import { runGeneration } from './agent-generation.service'

const assistant = {
  id: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000010',
  name: 'Test',
  systemPrompt: 'You are helpful.',
  parametersJson: JSON.stringify({
    permissionMode: 'normal',
    temperature: 0.2,
    maxTokens: 256,
  }),
  createdAt: new Date(),
  updatedAt: new Date(),
} as ReturnType<typeof import('./assistant.service').getAssistantRow>

describe('runGeneration smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    chatStream.mockImplementation(async function* () {
      yield { type: 'text-delta', text: 'Hello' }
      yield {
        type: 'done',
        usage: { prompt: 4, completion: 2, total: 6 },
      }
    })
  })

  it('streams a plain completion and marks the assistant message completed', async () => {
    const userContentBlocks: ContentBlock[] = [{ type: 'text', text: 'Hi' }]
    const abortControllers = new Map<string, AbortController>()

    await runGeneration({
      sessionId: 'session-1',
      assistantMessageId: 'msg-asst',
      userMessageId: 'msg-user',
      modelId: 'openai/gpt-4o-mini',
      assistant,
      workspaceId: '00000000-0000-4000-8000-000000000010',
      userText: 'Hi',
      userContentBlocks,
      enableTools: false,
      mcpServerIds: [],
      abortControllers,
    })

    expect(chatStream).toHaveBeenCalledTimes(1)
    expect(messagesUpdate).toHaveBeenCalledWith(
      'msg-asst',
      expect.objectContaining({ status: 'completed' }),
    )
    expect(broadcastStreamEvent).toHaveBeenCalled()
    const doneEvent = broadcastStreamEvent.mock.calls.find(
      ([event]) => event.type === 'message.done',
    )
    expect(doneEvent).toBeTruthy()
  })
})

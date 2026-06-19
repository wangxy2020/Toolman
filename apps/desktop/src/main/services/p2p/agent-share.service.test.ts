import { describe, expect, it } from 'vitest'
import { AgentPackageSchema, type Assistant } from '@toolman/shared'
import { buildAgentPackageFromAssistant } from './agent-share.service'

describe('buildAgentPackageFromAssistant', () => {
  const assistant: Assistant = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    workspaceId: '660e8400-e29b-41d4-a716-446655440001',
    name: '测试智能体',
    description: '用于共享',
    systemPrompt: '你是一个助手',
    modelId: 'openai/gpt-4o-mini',
    parameters: {
      temperature: 0.5,
      mcpServerIds: ['mcp-1'],
      skillIds: ['skill-1'],
      kbIds: ['kb-1'],
      toolStates: { 'builtin-search': true },
    },
    isBuiltin: false,
    isPinned: true,
  }

  it('serializes assistant fields into agent package v1', () => {
    const agentPackage = buildAgentPackageFromAssistant(assistant)
    expect(agentPackage.version).toBe(1)
    expect(agentPackage.assistant.name).toBe('测试智能体')
    expect(agentPackage.assistant.systemPrompt).toBe('你是一个助手')
    expect(agentPackage.assistant.modelId).toBe('openai/gpt-4o-mini')
    expect(agentPackage.assistant.mcpServers).toEqual(['mcp-1'])
    expect(agentPackage.assistant.knowledgeRefs).toEqual(['kb-1'])
    expect(agentPackage.assistant.toolIds).toEqual(
      expect.arrayContaining(['skill-1', 'builtin-search']),
    )
    expect(agentPackage.assistant.parameters.temperature).toBe(0.5)
    expect(agentPackage.assistant.parameters.mcpServerIds).toBeUndefined()
    expect(AgentPackageSchema.parse(agentPackage)).toEqual(agentPackage)
  })
})

import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/toolman-test-userdata' },
}))

vi.mock('./skill.service', () => ({
  filterEnabledSkillIds: (ids: string[]) => ids,
}))

vi.mock('./mcp-status.service', () => ({
  getDefaultMcpServerIds: () => [],
}))
vi.mock('./workspace.service', () => ({
  getWorkspace: ({ id }: { id: string }) => ({
    id,
    settings: { folderPath: '/tmp/toolman-workspace' },
  }),
}))

import { parseAssistantRuntime } from './agent.service'
import { relayGenerationMcpServerIds } from './agent-runtime'

describe('parseAssistantRuntime', () => {
  const workspaceId = '00000000-0000-4000-8000-000000000010'

  it('derives working directory from workspace settings', () => {
    const runtime = parseAssistantRuntime(
      {
        id: '00000000-0000-4000-8000-000000000001',
        workspaceId,
        name: 'Assistant',
        systemPrompt: '',
        parametersJson: JSON.stringify({
          permissionMode: 'normal',
          skillIds: [],
          mcpServerIds: [],
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      workspaceId,
    )

    expect(runtime.toolContext.workingDirectory).toBe('/tmp/toolman-workspace')
    expect(runtime.effectivePermissionMode).toBe('normal')
  })

  it('honors assistant-level working directory override', () => {
    const runtime = parseAssistantRuntime(
      {
        id: '00000000-0000-4000-8000-000000000001',
        workspaceId,
        name: 'Assistant',
        systemPrompt: '',
        parametersJson: JSON.stringify({
          permissionMode: 'normal',
          workingDirectory: '/custom/path',
          autonomousMode: true,
          skillIds: [],
          mcpServerIds: [],
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      workspaceId,
    )

    expect(runtime.toolContext.workingDirectory).toBe('/custom/path')
    expect(runtime.autonomousMode).toBe(true)
    expect(runtime.effectivePermissionMode).toBe('auto-edit')
  })

  it('skips default MCP and skills when skipDefaultIntegrations is set', () => {
    const runtime = parseAssistantRuntime(
      {
        id: '00000000-0000-4000-8000-000000000001',
        workspaceId,
        name: 'Assistant',
        systemPrompt: '',
        parametersJson: JSON.stringify({
          permissionMode: 'normal',
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      workspaceId,
      { skipDefaultIntegrations: true },
    )

    expect(runtime.mcpServerIds).toEqual([])
    expect(runtime.skillIds).toEqual([])
  })
})

describe('relayGenerationMcpServerIds', () => {
  it('drops default MCP for plain-text group relay', () => {
    expect(
      relayGenerationMcpServerIds(
        ['filesystem', 'browser', 'github'],
        [{ type: 'text', text: '你好' }],
      ),
    ).toEqual(['github'])
  })

  it('keeps default MCP when the user attached files', () => {
    expect(
      relayGenerationMcpServerIds(
        ['filesystem', 'docx-mcp-server'],
        [{ type: 'file', name: 'a.docx', path: '/tmp/a.docx', blobHash: '', content: '' }],
      ),
    ).toEqual(['filesystem', 'docx-mcp-server'])
  })
})

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
})

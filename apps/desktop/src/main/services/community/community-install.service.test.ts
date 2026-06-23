import { beforeEach, describe, expect, it, vi } from 'vitest'

import { installCommunityResource } from './community-install.service'

const startInstall = vi.fn()
const completeInstall = vi.fn()
const getResource = vi.fn()
const upsertServer = vi.fn()
const installSkillFromMarketPackage = vi.fn()
const installWorkflowFromMarketPackage = vi.fn()

vi.mock('./community-bundle.service', () => ({
  applyCommunityPackageBundles: vi.fn(async () => ({})),
  hasCommunityPackageBundles: vi.fn(() => false),
  resolveBundleAwareLocalRef: (primaryLocalRef: string | null) => {
    if (!primaryLocalRef) throw new Error('missing local ref')
    return primaryLocalRef
  },
}))

vi.mock('./community-ipc.facade', () => ({
  startInstall: (...args: unknown[]) => startInstall(...args),
  completeInstall: (...args: unknown[]) => completeInstall(...args),
  getResource: (...args: unknown[]) => getResource(...args),
}))

vi.mock('../mcp.service', () => ({
  upsertServer: (...args: unknown[]) => upsertServer(...args),
}))

vi.mock('./adapters/skill-market.adapter', () => ({
  installSkillFromMarketPackage: (...args: unknown[]) => installSkillFromMarketPackage(...args),
}))

vi.mock('./adapters/workflow-market.adapter', () => ({
  installWorkflowFromMarketPackage: (...args: unknown[]) => installWorkflowFromMarketPackage(...args),
}))

vi.mock('./community-cid.config', () => ({
  isCommunityCidDistributionEnabled: () => false,
}))

vi.mock('./community-cid-fetch.service', () => ({
  fetchCommunityPackageViaP2p: vi.fn(async () => null),
}))

vi.mock('./community-cid-index.service', () => ({
  findLocalCommunityPackagePath: () => null,
}))

describe('community-install.service', () => {
  beforeEach(() => {
    startInstall.mockReset()
    completeInstall.mockReset()
    getResource.mockReset()
    upsertServer.mockReset()
    installSkillFromMarketPackage.mockReset()
    installWorkflowFromMarketPackage.mockReset()
  })

  it('installs MCP resources via adapter and completes hub install', async () => {
    startInstall.mockResolvedValue({
      installId: '00000000-0000-0000-0000-000000000020',
      packagePath: '/tmp/community/packages/install-mcp/1.0.0',
      manifest: {
        schemaVersion: 1,
        mcpId: 'install-mcp',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      },
      adapter: 'mcp',
      instructions: '由 Main 进程完成实际安装',
    })
    getResource.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000010',
      title: 'Filesystem MCP',
    })
    upsertServer.mockReturnValue({
      id: 'community-install-mcp',
      name: 'Filesystem MCP',
      type: 'stdio',
      enabled: true,
      command: 'npx',
    })
    completeInstall.mockResolvedValue({ id: '00000000-0000-0000-0000-000000000020' })

    const result = await installCommunityResource({
      resourceType: 'mcp',
      resourceId: '00000000-0000-0000-0000-000000000010',
    })

    expect(result.adapter).toBe('mcp')
    expect(upsertServer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'community-install-mcp',
        name: 'Filesystem MCP',
        cwd: '/tmp/community/packages/install-mcp/1.0.0',
      }),
    )
    expect(completeInstall).toHaveBeenCalledWith({
      installId: '00000000-0000-0000-0000-000000000020',
      status: 'success',
      localRef: 'community-install-mcp',
    })
  })

  it('installs skill resources via adapter and completes hub install', async () => {
    startInstall.mockResolvedValue({
      installId: '00000000-0000-0000-0000-000000000021',
      packagePath: '/tmp/community/packages/demo-skill/1.0.0/extracted',
      manifest: {
        schemaVersion: 1,
        skillId: 'demo-skill',
        name: 'demo-skill',
        description: 'Demo community skill',
        files: ['SKILL.md'],
      },
      adapter: 'skill',
      instructions: '由 Main 进程完成实际安装',
    })
    installSkillFromMarketPackage.mockReturnValue({
      id: 'demo-skill',
      name: 'demo-skill',
      description: 'Demo community skill',
      builtin: false,
      sourcePath: '/tmp/toolman/skills/demo-skill',
      hasContent: true,
    })
    completeInstall.mockResolvedValue({ id: '00000000-0000-0000-0000-000000000021' })

    const result = await installCommunityResource({
      resourceType: 'skill',
      resourceId: '00000000-0000-0000-0000-000000000011',
    })

    expect(result.adapter).toBe('skill')
    expect(installSkillFromMarketPackage).toHaveBeenCalledWith({
      manifest: expect.objectContaining({ skillId: 'demo-skill' }),
      packagePath: '/tmp/community/packages/demo-skill/1.0.0/extracted',
      resourceId: '00000000-0000-0000-0000-000000000011',
    })
    expect(completeInstall).toHaveBeenCalledWith({
      installId: '00000000-0000-0000-0000-000000000021',
      status: 'success',
      localRef: 'demo-skill',
    })
  })

  it('passes through unsupported resource installs without adapter work', async () => {
    startInstall.mockResolvedValue({
      installId: '00000000-0000-0000-0000-000000000022',
      packagePath: '/tmp/task',
      manifest: { schemaVersion: 1 },
      adapter: 'task',
      instructions: '由 Main 进程完成实际安装',
    })

    const result = await installCommunityResource({
      resourceType: 'task',
      resourceId: '00000000-0000-0000-0000-000000000012',
    })

    expect(result.adapter).toBe('task')
    expect(upsertServer).not.toHaveBeenCalled()
    expect(installSkillFromMarketPackage).not.toHaveBeenCalled()
    expect(installWorkflowFromMarketPackage).not.toHaveBeenCalled()
    expect(completeInstall).not.toHaveBeenCalled()
  })

  it('installs workflow resources via adapter and completes hub install', async () => {
    startInstall.mockResolvedValue({
      installId: '00000000-0000-0000-0000-000000000023',
      packagePath: '/tmp/community/packages/agent-flow/1.0.0/extracted',
      manifest: {
        schemaVersion: 1,
        workflowId: 'agent-flow',
        engine: 'langgraph',
        graphPath: 'workflow.json',
      },
      adapter: 'workflow',
      instructions: '由 Main 进程完成实际安装',
    })
    getResource.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000013',
      title: 'Agent Flow',
    })
    installWorkflowFromMarketPackage.mockReturnValue({
      id: 'agent-flow',
      name: 'Agent Flow',
      engine: 'langgraph',
      graphPath: 'workflow.json',
      graph: { nodes: [{ id: 'start', type: 'start' }], edges: [] },
      requiredMcpIds: [],
      requiredSkillIds: [],
      installedAt: 1,
      updatedAt: 1,
    })
    completeInstall.mockResolvedValue({ id: '00000000-0000-0000-0000-000000000023' })

    const result = await installCommunityResource({
      resourceType: 'workflow',
      resourceId: '00000000-0000-0000-0000-000000000013',
    })

    expect(result.adapter).toBe('workflow')
    expect(installWorkflowFromMarketPackage).toHaveBeenCalledWith({
      manifest: expect.objectContaining({ workflowId: 'agent-flow' }),
      packagePath: '/tmp/community/packages/agent-flow/1.0.0/extracted',
      resourceId: '00000000-0000-0000-0000-000000000013',
      resourceTitle: 'Agent Flow',
    })
    expect(completeInstall).toHaveBeenCalledWith({
      installId: '00000000-0000-0000-0000-000000000023',
      status: 'success',
      localRef: 'agent-flow',
    })
  })
})

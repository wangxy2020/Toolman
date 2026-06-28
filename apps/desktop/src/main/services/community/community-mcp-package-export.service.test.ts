import { describe, expect, it, vi } from 'vitest'

import type { McpServerConfig } from '@toolman/shared'

import {
  buildMcpMarketManifestFromServer,
  exportCommunityMcpPackage,
} from './community-mcp-package-export.service'

vi.mock('../mcp-server-config.service', () => ({
  getMcpServer: vi.fn(),
}))

vi.mock('./community-package-zip.util', () => ({
  writeCommunityZipPackage: vi.fn(({ zipFileName, files }) => ({
    packagePath: `/tmp/${zipFileName}`,
    stagingRoot: '/tmp/staging',
    files,
  })),
}))

const { getMcpServer } = await import('../mcp-server-config.service')
const { writeCommunityZipPackage } = await import('./community-package-zip.util')

describe('buildMcpMarketManifestFromServer', () => {
  it('rejects builtin servers', () => {
    expect(() =>
      buildMcpMarketManifestFromServer({
        id: 'filesystem',
        name: 'Filesystem',
        type: 'builtin',
        enabled: true,
        builtinId: 'filesystem',
      } as McpServerConfig),
    ).toThrow(/内置 MCP/)
  })

  it('builds stdio manifest with command and checksum files list', () => {
    const manifest = buildMcpMarketManifestFromServer({
      id: 'my-fetch',
      name: 'Fetch',
      type: 'stdio',
      enabled: true,
      command: 'uvx',
      args: ['mcp-server-fetch'],
      env: { FOO: 'bar' },
    })

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      mcpId: 'my-fetch',
      transport: 'stdio',
      command: 'uvx',
      args: ['mcp-server-fetch'],
      env: { FOO: 'bar' },
    })
  })
})

describe('exportCommunityMcpPackage', () => {
  it('writes manifest into community zip package', async () => {
    vi.mocked(getMcpServer).mockReturnValue({
      id: 'custom-mcp',
      name: 'Custom MCP',
      type: 'stdio',
      enabled: true,
      command: 'npx',
      args: ['-y', 'some-mcp'],
    })

    const result = await exportCommunityMcpPackage({ mcpServerId: 'custom-mcp' })
    expect(result.packagePath).toBe('/tmp/Custom_MCP.toolman-mcp')
    expect(writeCommunityZipPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        files: expect.objectContaining({
          'mcp.manifest.json': expect.stringMatching(/"files"\s*:\s*\[\s*"mcp\.manifest\.json"\s*\]/),
        }),
      }),
    )
  })
})

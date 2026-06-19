import { describe, expect, it } from 'vitest'

import {
  buildCommunityMcpServerId,
  manifestToMcpServerConfig,
} from './mcp-market.adapter'

describe('mcp-market.adapter', () => {
  it('maps stdio manifest to McpServerConfig', () => {
    const config = manifestToMcpServerConfig({
      manifest: {
        schemaVersion: 1,
        mcpId: 'install-mcp',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        env: { NODE_ENV: 'production' },
        tools: [{ name: 'ping', description: 'Ping tool' }],
      },
      packagePath: '/tmp/community/packages/install-mcp/1.0.0',
      resourceId: '00000000-0000-0000-0000-000000000010',
      resourceTitle: 'Filesystem MCP',
    })

    expect(config).toMatchObject({
      id: 'community-install-mcp',
      name: 'Filesystem MCP',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      cwd: '/tmp/community/packages/install-mcp/1.0.0',
      enabled: true,
      env: { NODE_ENV: 'production' },
      tags: ['community', '00000000-0000-0000-0000-000000000010'],
    })
  })

  it('applies default template config overrides', () => {
    const config = manifestToMcpServerConfig({
      manifest: {
        schemaVersion: 1,
        mcpId: 'remote-mcp',
        transport: 'streamableHttp',
        templates: [
          {
            name: 'default',
            config: {
              url: 'http://127.0.0.1:8080/mcp',
              timeoutSeconds: 90,
            },
          },
        ],
      },
      packagePath: '/tmp/community/packages/remote-mcp/1.0.0',
      resourceId: '00000000-0000-0000-0000-000000000011',
    })

    expect(config).toMatchObject({
      id: buildCommunityMcpServerId('remote-mcp'),
      type: 'streamableHttp',
      url: 'http://127.0.0.1:8080/mcp',
      command: 'http',
      timeoutSeconds: 90,
    })
  })

  it('rejects stdio manifest without command', () => {
    expect(() =>
      manifestToMcpServerConfig({
        manifest: {
          schemaVersion: 1,
          mcpId: 'broken-mcp',
          transport: 'stdio',
        },
        packagePath: '/tmp/pkg',
        resourceId: '00000000-0000-0000-0000-000000000012',
      }),
    ).toThrow(/missing command/i)
  })
})

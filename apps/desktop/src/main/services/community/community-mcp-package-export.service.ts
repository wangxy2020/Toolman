import { z } from 'zod'

import type { McpServerConfig } from '@toolman/shared'

import { getMcpServer } from '../mcp-server-config.service'
import { MCP_MANIFEST_FILENAME, slugifyMcpId, syncMcpManifestFiles } from './community-mcp-manifest.util'
import { writeCommunityZipPackage } from './community-package-zip.util'

const ExportInputSchema = z.object({
  mcpServerId: z.string().min(1),
})

export function buildMcpMarketManifestFromServer(server: McpServerConfig): Record<string, unknown> {
  if (server.type === 'builtin') {
    throw new Error('内置 MCP 无法发布到社区市场，请选择自定义 MCP 服务器')
  }

  const transport = server.type
  if (transport === 'stdio' && !server.command?.trim()) {
    throw new Error('stdio 类型 MCP 需要配置 command')
  }
  if ((transport === 'sse' || transport === 'streamableHttp') && !server.url?.trim()) {
    throw new Error('HTTP 类型 MCP 需要配置 url')
  }

  const templateConfig: Record<string, unknown> = {}
  if (server.cwd?.trim()) templateConfig.cwd = server.cwd.trim()
  if (server.longRunning != null) templateConfig.longRunning = server.longRunning
  if (server.timeoutSeconds != null) templateConfig.timeoutSeconds = server.timeoutSeconds
  if (transport === 'sse' || transport === 'streamableHttp') {
    templateConfig.url = server.url?.trim()
  }

  const manifest: Record<string, unknown> = {
    schemaVersion: 1,
    mcpId: slugifyMcpId(server.id),
    transport,
    templates: [{ name: 'default', config: templateConfig }],
  }

  if (server.command?.trim()) {
    manifest.command = server.command.trim()
  }
  if (server.args && server.args.length > 0) {
    manifest.args = server.args
  }
  if (server.env && Object.keys(server.env).length > 0) {
    manifest.env = server.env
  }

  return manifest
}

export async function exportCommunityMcpPackage(input: unknown): Promise<{ packagePath: string }> {
  const { mcpServerId } = ExportInputSchema.parse(input)
  const server = getMcpServer(mcpServerId)
  if (!server) {
    throw new Error('MCP 服务器不存在')
  }

  const manifest = buildMcpMarketManifestFromServer(server)
  const manifestWithFiles = syncMcpManifestFiles('', {
    ...manifest,
    files: [MCP_MANIFEST_FILENAME],
  })
  const manifestJson = `${JSON.stringify(manifestWithFiles, null, 2)}\n`
  const safeName =
    server.name.trim().replace(/[^\w\u4e00-\u9fff.-]+/g, '_').slice(0, 64) || slugifyMcpId(server.id)

  const { packagePath } = writeCommunityZipPackage({
    stagingPrefix: 'toolman-mcp-export-',
    zipFileName: `${safeName}.toolman-mcp`,
    files: {
      'mcp.manifest.json': manifestJson,
    },
  })

  return { packagePath }
}

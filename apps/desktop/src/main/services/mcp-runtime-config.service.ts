import { DOCX_MCP_SERVER_ID, EXCEL_MCP_SERVER_ID, type McpServerConfig } from '@toolman/shared'

import { resolveDocxMcpServerEntryPath } from './docx-mcp-paths'
import { resolveExcelMcpServerEntryPath } from './excel-mcp-paths'
import { resolveMcpNodeCommand } from './mcp-node-runtime'

export async function resolveMcpServerRuntimeConfig(
  config: McpServerConfig,
): Promise<McpServerConfig> {
  if (config.type !== 'stdio') {
    return config
  }

  if (config.id === EXCEL_MCP_SERVER_ID) {
    const entryPath = resolveExcelMcpServerEntryPath()
    if (!entryPath) return config
    return {
      ...config,
      command: resolveMcpNodeCommand(),
      args: [entryPath],
    }
  }

  if (config.id === DOCX_MCP_SERVER_ID) {
    const entryPath = resolveDocxMcpServerEntryPath()
    if (!entryPath) return config
    return {
      ...config,
      command: resolveMcpNodeCommand(),
      args: [entryPath],
    }
  }

  return config
}

import { EXCEL_MCP_SERVER_ID, type McpServerConfig } from '@toolman/shared'

import { resolveExcelMcpServerEntryPath } from './excel-mcp-paths'

export async function resolveMcpServerRuntimeConfig(
  config: McpServerConfig,
): Promise<McpServerConfig> {
  if (config.id !== EXCEL_MCP_SERVER_ID || config.type !== 'stdio') {
    return config
  }

  const entryPath = resolveExcelMcpServerEntryPath()
  if (!entryPath) {
    return config
  }

  return {
    ...config,
    command: 'node',
    args: [entryPath],
  }
}

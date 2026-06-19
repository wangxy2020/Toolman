const MCP_TOOL_PREFIX = 'mcp__'

export function encodeMcpToolName(serverId: string, toolName: string): string {
  return `${MCP_TOOL_PREFIX}${serverId}__${toolName}`
}

export function decodeMcpToolName(
  encodedName: string,
): { serverId: string; toolName: string } | null {
  if (!encodedName.startsWith(MCP_TOOL_PREFIX)) return null
  const rest = encodedName.slice(MCP_TOOL_PREFIX.length)
  const sep = rest.indexOf('__')
  if (sep <= 0) return null
  return {
    serverId: rest.slice(0, sep),
    toolName: rest.slice(sep + 2),
  }
}

export function isMcpToolName(toolName: string): boolean {
  return toolName.startsWith(MCP_TOOL_PREFIX)
}

import type { ToolDefinition } from '@toolman/model-gateway'

export function resolveMcpShortToolName(
  toolName: string,
  serverId: string,
  batchToolName: string,
): string {
  if (toolName === batchToolName) return toolName
  if (toolName.includes(serverId)) {
    return toolName.split('__').pop()?.toLowerCase() ?? toolName.toLowerCase()
  }
  return toolName.toLowerCase()
}

export function findMcpToolName(
  tools: ToolDefinition[],
  shortName: string,
): string | null {
  const normalized = shortName.toLowerCase()
  for (const tool of tools) {
    const name = tool.function.name
    if (name === normalized || name.endsWith(`__${normalized}`)) return name
  }
  return null
}

export function filterMcpToolDefinitions(
  tools: ToolDefinition[],
  serverId: string,
  fallbackShortNames: string[],
): ToolDefinition[] {
  const serverTools = tools.filter((tool) => tool.function.name.includes(serverId))
  if (serverTools.length > 0) return serverTools

  return tools.filter((tool) => {
    const shortName = tool.function.name.split('__').pop()?.toLowerCase() ?? ''
    return fallbackShortNames.includes(shortName)
  })
}

export function buildMcpBatchApprovalArgs(summary: string, workingPaths: string[]): string {
  return JSON.stringify({ summary, files: workingPaths }, null, 2)
}

export function buildMcpApprovalScopeKey(prefix: string, assistantMessageId: string): string {
  return `${prefix}:${assistantMessageId}`
}

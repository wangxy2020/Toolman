export type { ToolDisplayMeta } from './tool-display-meta-types'
import type { ToolDisplayMeta } from './tool-display-meta-types'
import { COMMAND_STYLE_TOOLS, TOOL_META } from './tool-display-meta-registry'

export function normalizeToolName(toolName: string): string {
  if (!toolName.startsWith('mcp__')) return toolName
  const parts = toolName.split('__')
  return parts[parts.length - 1] ?? toolName
}

export function parseToolArguments(raw?: string): Record<string, unknown> {
  if (!raw?.trim()) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export function resolveToolDisplayMeta(toolName: string): ToolDisplayMeta {
  const shortName = normalizeToolName(toolName)
  const known = TOOL_META[shortName]
  if (known) return known

  if (toolName.startsWith('mcp__')) {
    return {
      title: '执行命令',
      description: `调用 MCP 工具 ${shortName}`,
      commandStyle: true,
      buildCommand: (args) => {
        const payload = Object.keys(args).length ? ` ${JSON.stringify(args)}` : ''
        return `${shortName}${payload}`
      },
    }
  }

  return {
    title: '执行工具',
    description: `调用 ${toolName}`,
    commandStyle: COMMAND_STYLE_TOOLS.has(shortName),
    buildCommand: (args) => {
      const payload = Object.keys(args).length ? JSON.stringify(args) : toolName
      return payload
    },
  }
}

export function usesCommandStyle(toolName: string): boolean {
  return resolveToolDisplayMeta(toolName).commandStyle
}

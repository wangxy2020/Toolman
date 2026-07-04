import { isAbsolute, resolve } from 'node:path'

import { decodeMcpToolName } from '../mcp-tool-utils'

const MCP_PATH_KEYS = ['path', 'filePath', 'file_path', 'outputPath', 'output_path', 'cwd', 'directory', 'dir'] as const

export function resolveTaskToolAbsolutePath(pathArg: string, workingDirectory: string): string {
  const trimmed = pathArg.trim()
  if (!trimmed) return trimmed
  if (isAbsolute(trimmed)) return trimmed
  return resolve(workingDirectory, trimmed)
}

export function absolutizeTaskMcpToolArgs(
  toolName: string,
  argsJson: string,
  workingDirectory: string,
): string {
  const mcpTarget = decodeMcpToolName(toolName)
  if (!mcpTarget) return argsJson

  let args: Record<string, unknown>
  try {
    args = JSON.parse(argsJson) as Record<string, unknown>
  } catch {
    return argsJson
  }

  const next = { ...args }
  for (const key of MCP_PATH_KEYS) {
    const raw = next[key]
    if (typeof raw !== 'string' || !raw.trim()) continue
    next[key] = resolveTaskToolAbsolutePath(raw, workingDirectory)
  }

  return JSON.stringify(next)
}

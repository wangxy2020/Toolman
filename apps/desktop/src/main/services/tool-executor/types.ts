import { FilesystemSandbox } from '../filesystem-sandbox.service'

export interface ToolExecutionContext {
  workingDirectory?: string
  environmentVariables?: string
  workspaceId?: string
  assistantId?: string
  memoryEnabled?: boolean
  mcpServerIds?: string[]
}

export function sandboxFor(context: ToolExecutionContext): FilesystemSandbox {
  return FilesystemSandbox.fromContext(context.workingDirectory)
}

export function parseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new Error('工具参数不是合法 JSON')
  }
}

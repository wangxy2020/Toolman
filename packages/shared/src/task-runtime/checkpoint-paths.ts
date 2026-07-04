const FS_WRITE_PATH_TOOLS = new Set(['fs_write', 'fs_edit', 'fs_delete', 'edit'])

function resolveToolBaseName(toolName: string): string {
  const resolved = toolName.includes('__') ? toolName.split('__').pop() ?? toolName : toolName
  return resolved.toLowerCase()
}

function isDocMcpWriteTool(toolName: string): boolean {
  const name = toolName.toLowerCase()
  if (/(?:^|__|\/)read_/.test(name)) return false
  return /modify_excel|highlight_excel|write_excel|write_document|update_document|save_document/.test(name)
}

function parseToolArgs(argsJson: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(argsJson) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

/** Paths referenced by rollback-eligible tools (sandbox-relative or absolute). */
export function extractTaskToolTargetPaths(toolName: string, argsJson: string): string[] {
  const args = parseToolArgs(argsJson)
  if (!args) return []

  const name = resolveToolBaseName(toolName)
  if (FS_WRITE_PATH_TOOLS.has(name)) {
    const path = args.path
    return typeof path === 'string' && path.trim() ? [path.trim()] : []
  }

  if (isDocMcpWriteTool(toolName)) {
    for (const key of ['outputPath', 'output_path', 'path', 'filePath', 'file', 'target']) {
      const value = args[key]
      if (typeof value === 'string' && value.trim()) {
        return [value.trim()]
      }
    }
  }

  return []
}

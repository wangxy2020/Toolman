export const OUTPUT_FILE_PATTERN = /\.(xlsx|xls|csv|docx|doc|pdf|md|txt)$/i

const FS_WRITE_OUTPUT_RE = /已写入文件:\s*(.+)\s*$/m
const FS_EDIT_OUTPUT_RE = /已(?:更新|追加内容到)文件:\s*(.+)\s*$/m

export function resolveToolBaseName(toolName: string): string {
  return (toolName.includes('__') ? toolName.split('__').pop() : toolName)?.toLowerCase() ?? toolName.toLowerCase()
}

export function readStepOutputText(output: unknown): string {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return ''
  const text = (output as { text?: unknown }).text
  return typeof text === 'string' ? text : ''
}

export function parseToolArgs(argsJson: string): Record<string, unknown> | null {
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

export function isTaskOutputWriteTool(toolName: string): boolean {
  const base = resolveToolBaseName(toolName)
  if (base === 'fs_write' || base === 'fs_edit') return true

  const lower = toolName.toLowerCase()
  if (/(?:^|__)read_/.test(lower)) return false
  if (/modify_excel|highlight_excel|write_excel|create_excel|save_excel|export_excel/.test(lower)) {
    return true
  }
  if (/write_document|update_document|save_document/.test(lower)) return true
  return false
}

function parseJsonOutputPaths(output: string): string[] {
  const jsonStart = output.indexOf('{')
  const jsonEnd = output.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd <= jsonStart) return []

  try {
    const parsed = JSON.parse(output.slice(jsonStart, jsonEnd + 1)) as {
      targetPath?: unknown
      outputPath?: unknown
    }
    const paths: string[] = []
    if (typeof parsed.targetPath === 'string' && parsed.targetPath.trim()) {
      paths.push(parsed.targetPath.trim())
    } else if (typeof parsed.outputPath === 'string' && parsed.outputPath.trim()) {
      paths.push(parsed.outputPath.trim())
    }
    return paths
  } catch {
    return []
  }
}

export function extractPathsFromWriteToolOutput(output: string): string[] {
  const paths = new Set<string>()

  for (const pattern of [FS_WRITE_OUTPUT_RE, FS_EDIT_OUTPUT_RE]) {
    const match = output.match(pattern)
    if (match?.[1]) paths.add(match[1].trim())
  }

  for (const path of parseJsonOutputPaths(output)) {
    paths.add(path)
  }

  return [...paths]
}

export function extractTaskToolOutputPathsFromArgs(toolName: string, argsJson: string): string[] {
  const args = parseToolArgs(argsJson)
  if (!args) return []

  const lower = toolName.toLowerCase()
  if (/modify_excel|highlight_excel/.test(lower)) {
    const outputPath = args.outputPath ?? args.output_path
    if (typeof outputPath === 'string' && outputPath.trim()) {
      return [outputPath.trim()]
    }
    const filePath = args.filePath ?? args.file_path ?? args.path
    if (typeof filePath === 'string' && filePath.trim()) {
      return [filePath.trim()]
    }
    return []
  }

  const base = resolveToolBaseName(toolName)
  if (base === 'fs_write' || base === 'fs_edit') {
    const path = args.path
    return typeof path === 'string' && path.trim() ? [path.trim()] : []
  }

  for (const key of ['outputPath', 'output_path', 'path', 'filePath', 'file_path', 'target']) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) {
      return [value.trim()]
    }
  }

  return []
}

export function extractOutputPathFromBashArgs(argsJson: string): string | null {
  const args = parseToolArgs(argsJson)
  if (!args) return null
  const command = typeof args.command === 'string' ? args.command : ''
  const match = command.match(/out\s*=\s*['"]([^'"]+)['"]/)
  return match?.[1]?.trim() ?? null
}

export function extractPathsFromBashOutput(output: string): string[] {
  const paths = new Set<string>()
  for (const line of output.split('\n')) {
    for (const match of line.matchAll(/([^\s`'"，,；;]+\.(?:xlsx?|csv|docx?|pdf|txt|md))/gi)) {
      const candidate = match[1]?.trim()
      if (candidate) paths.add(candidate)
    }
  }
  return [...paths]
}

export function extractFileCandidatesFromText(text: string): string[] {
  const candidates = new Set<string>()
  const trimmed = text.trim()
  if (!trimmed) return []

  const patterns = [
    /[`'"]?([^\s`'"，,。]+\.(?:xlsx?|csv|docx?|pdf|txt|md))[`'"]?/gi,
    /(?:写入|保存|保存位置|生成|导出|创建了|输出到|written to|saved to|created)[：:\s]+[`'"]?([^\s`'"，,。]+)/gi,
    /(?:保存位置|路径)[：:\s]+([^\s`'"，,。]+)/gi,
  ]

  for (const pattern of patterns) {
    for (const match of trimmed.matchAll(pattern)) {
      const candidate = match[1]?.trim()
      if (candidate && OUTPUT_FILE_PATTERN.test(candidate)) {
        candidates.add(candidate)
      }
    }
  }

  return [...candidates]
}

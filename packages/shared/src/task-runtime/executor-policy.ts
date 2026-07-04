export type TaskToolCategory =
  | 'fs_write'
  | 'fs_read'
  | 'doc_mcp_write'
  | 'bash'
  | 'network'
  | 'readonly'
  | 'other'

export interface TaskToolExecutionPolicy {
  category: TaskToolCategory
  timeoutMs: number
  maxRetries: number
  rollbackEligible: boolean
}

const FS_WRITE_TOOLS = new Set(['fs_write', 'fs_edit', 'fs_delete', 'edit'])
const FS_READ_TOOLS = new Set(['fs_read', 'fs_glob', 'fs_grep', 'fs_list', 'glob', 'grep'])
const NETWORK_TOOLS = new Set([
  'http_fetch',
  'github_request',
  'browser_fetch',
  'browser_execute',
  'browser_open',
  'browser_screenshot',
])

export function computeRetryBackoffMs(attempt: number, baseMs = 1000, maxMs = 30_000): number {
  if (attempt <= 0) return 0
  return Math.min(baseMs * 2 ** (attempt - 1), maxMs)
}

function isDocMcpWriteTool(toolName: string): boolean {
  const name = toolName.toLowerCase()
  return /docx|excel|xlsx|spreadsheet|document.*write|write_document|update_document/.test(name)
}

export function resolveTaskToolExecutionPolicy(toolName: string): TaskToolExecutionPolicy {
  const resolved = toolName.includes('__') ? toolName.split('__').pop() ?? toolName : toolName
  const name = resolved.toLowerCase()

  if (name === 'bash') {
    return { category: 'bash', timeoutMs: 300_000, maxRetries: 2, rollbackEligible: false }
  }
  if (FS_WRITE_TOOLS.has(name)) {
    return { category: 'fs_write', timeoutMs: 120_000, maxRetries: 2, rollbackEligible: true }
  }
  if (NETWORK_TOOLS.has(name)) {
    return { category: 'network', timeoutMs: 60_000, maxRetries: 2, rollbackEligible: false }
  }
  if (FS_READ_TOOLS.has(name) || name.startsWith('fs_')) {
    return { category: 'readonly', timeoutMs: 60_000, maxRetries: 1, rollbackEligible: false }
  }
  if (isDocMcpWriteTool(toolName)) {
    return { category: 'doc_mcp_write', timeoutMs: 180_000, maxRetries: 2, rollbackEligible: true }
  }

  return { category: 'other', timeoutMs: 120_000, maxRetries: 1, rollbackEligible: false }
}
